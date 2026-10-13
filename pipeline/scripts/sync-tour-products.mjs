// TourAPI 숙박(32)·야영장(28) → 고캠핑 매칭 → 상품(객실·사이트)·안내 정보·공식 사진 → out/campground-products.json
// - 목록(areaBasedList2)은 유형별 1000건씩 통째로 받아 7일 캐시(.cache/tour-stay.json).
// - 상세(detailInfo2·detailImage2)는 시설당 2건, 14일 캐시(.cache/tour-products.json). 오류는 캐시하지 않는다.
// - 하루 호출 상한 PRODUCT_MAX_CALLS(기본 600, 목록 호출 포함). 한도 초과 오류가 나면 즉시 멈추고 지금까지 받은 것만 저장.
// - 어떤 경우에도 exit 0(데이터 동기화 워크플로를 깨지 않는다).
import { existsSync } from "node:fs";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { fetchDataGoKr } from "../lib/datagokr.mjs";
import { nowInKst, toKstIso } from "../lib/kst.mjs";
import {
  DEFAULTS, SOURCE, STAY_TYPE, buildRecord, campsiteListUrl, coverage, detailImageUrl, detailInfoUrl, isQuotaError, isStale,
  matchProducts, normalizeDetailInfo, normalizeImages, normalizeListItem, onlyCampsites, parseTourBody, planDetailCalls, stayListUrl,
} from "../lib/tour-products.mjs";

const out = fileURLToPath(new URL("../out/", import.meta.url));
const cacheDir = fileURLToPath(new URL("../.cache/", import.meta.url));
const listCachePath = `${cacheDir}tour-stay.json`;
const detailCachePath = `${cacheDir}tour-products.json`;
const warn = (t, m) => console.log(`::warning title=${t}::${String(m).replace(/serviceKey=[^&\s]+/gi, "serviceKey=***")}`);
const readJson = async (p, fallback) => { try { return JSON.parse(await readFile(p, "utf8")); } catch { return fallback; } };

const MAX_CALLS = Number(process.env.PRODUCT_MAX_CALLS ?? DEFAULTS.maxCalls);
const LIST_TTL = Number(process.env.PRODUCT_LIST_TTL_DAYS ?? DEFAULTS.listTtlDays);
const DETAIL_TTL = Number(process.env.PRODUCT_DETAIL_TTL_DAYS ?? DEFAULTS.detailTtlDays);
const key = process.env.DATA_GO_KR_SERVICE_KEY;

async function main() {
  await mkdir(out, { recursive: true });
  await mkdir(cacheDir, { recursive: true });
  const fetchedAt = toKstIso(nowInKst());
  let calls = 0, stopped = null;

  async function call(url) {
    if (calls >= MAX_CALLS) throw Object.assign(new Error(`PRODUCT_MAX_CALLS=${MAX_CALLS} 도달`), { code: "CAP" });
    calls++;
    const { res } = await fetchDataGoKr(url, key, { timeoutMs: 60000 });
    return parseTourBody(await res.text(), res.status);
  }

  // 0) 고캠핑
  const campPath = `${out}campgrounds.json`;
  if (!existsSync(campPath)) { warn("상품 수집 건너뜀", "out/campgrounds.json 없음(sync:gocamping 먼저)"); return; }
  const { campgrounds = [] } = await readJson(campPath, {});
  const gc = campgrounds
    .filter((c) => Number.isFinite(c?.location?.lat) && Number.isFinite(c?.location?.lng) && c?.external_id?.id != null)
    .map((c) => ({ id: String(c.external_id.id), name: c.name, lat: c.location.lat, lng: c.location.lng }));
  console.log(`고캠핑 ${campgrounds.length}곳(좌표 ${gc.length}곳)`);

  if (!key) warn("TourAPI 건너뜀", "DATA_GO_KR_SERVICE_KEY 없음 — 캐시만으로 출력");

  // 1) 목록(7일 캐시)
  const listCache = await readJson(listCachePath, {});
  const lists = { stay: { url: stayListUrl, type: STAY_TYPE }, campsite: { url: campsiteListUrl, type: "28" } };
  if (key) {
    for (const [name, def] of Object.entries(lists)) {
      if (stopped || !isStale(listCache[name]?.fetched_at, LIST_TTL)) continue;
      const items = [];
      try {
        for (let page = 1; page <= 50; page++) {
          const { items: raw, total } = await call(def.url(page));
          items.push(...raw.map((it) => normalizeListItem(it, def.type)).filter(Boolean));
          if (page * 1000 >= total || !raw.length) break;
        }
        listCache[name] = { fetched_at: fetchedAt, items: name === "campsite" ? onlyCampsites(items) : items };
        console.log(`TourAPI 목록 ${name}: ${listCache[name].items.length}건`);
      } catch (e) {
        warn(`TourAPI 목록 ${name} 실패 — 직전 캐시 유지`, e.message);
        if (e.code === "CAP" || isQuotaError(`${e.message} ${e.code ?? ""}`)) stopped = e.message;
      }
    }
    await writeFile(listCachePath, JSON.stringify(listCache));
  }
  const tourItems = [...(listCache.stay?.items ?? []), ...(listCache.campsite?.items ?? [])];
  console.log(`TourAPI 후보: 숙박 ${listCache.stay?.items?.length ?? 0}건 · 야영장 ${listCache.campsite?.items?.length ?? 0}건`);

  // 2) 매칭
  const matches = matchProducts(gc, tourItems);
  const byType = [...matches.values()].reduce((a, m) => ({ ...a, [m.type]: (a[m.type] ?? 0) + 1 }), {});
  console.log(`매칭 ${matches.size}곳 ${JSON.stringify(byType)}`);

  // 3) 상세(14일 캐시, 오류는 캐시하지 않음)
  const cache = await readJson(detailCachePath, {});
  let ok = 0, failed = 0, firstRoomKeys = null;
  if (key && !stopped) {
    const plan = planDetailCalls([...matches.values()], cache, { ttlDays: DETAIL_TTL, maxCalls: Math.max(0, MAX_CALLS - calls) });
    const pending = [...matches.values()].length;
    console.log(`상세 호출 계획: ${plan.length}곳 ${plan.reduce((n, p) => n + p.ops.length, 0)}건(남은 상한 ${MAX_CALLS - calls})`);
    outer: for (const p of plan) {
      for (const op of p.ops) {
        try {
          if (op === "info") {
            const { items } = await call(detailInfoUrl(p.contentid, p.type));
            if (!firstRoomKeys && items.some((x) => x.roomtitle != null)) { firstRoomKeys = Object.keys(items.find((x) => x.roomtitle != null)); console.log(`객실 필드: ${firstRoomKeys.join(", ")}`); }
            const { products, info } = normalizeDetailInfo(items);
            cache[p.contentid] = { ...cache[p.contentid], type: p.type, info_fetched_at: fetchedAt, products, info };
          } else {
            const { items } = await call(detailImageUrl(p.contentid));
            cache[p.contentid] = { ...cache[p.contentid], type: p.type, image_fetched_at: fetchedAt, photos: normalizeImages(items) };
          }
          ok++;
        } catch (e) {
          failed++;
          if (e.code === "CAP" || isQuotaError(`${e.message} ${e.code ?? ""}`)) { stopped = e.message; warn("TourAPI 일일 한도/상한", e.message); break outer; }
          if (failed <= 5) console.log(`  ${p.contentid} ${op}: ${e.message}`);
        }
      }
    }
    await writeFile(detailCachePath, JSON.stringify(cache));
    console.log(`상세: 성공 ${ok}건 · 실패 ${failed}건 · 총 호출 ${calls}건 · 매칭 ${pending}곳 중 캐시 ${[...matches.values()].filter((m) => cache[m.contentid]).length}곳`);
  }

  // 4) 출력
  const records = {};
  for (const [gid, m] of matches) {
    const r = buildRecord(m, cache[m.contentid]);
    if (r) records[gid] = r;
  }
  const cov = coverage(records);
  console.log(`커버리지: 연결 ${cov.matched}곳 · 상품 있음 ${cov.with_products}곳(상품 ${cov.products}개) · 가격 있음 ${cov.with_prices}곳 · 상품 사진 ${cov.with_product_photos}곳 · 공식 사진 ${cov.with_photos}곳(${cov.photos}장) · 요금 안내 ${cov.with_fee_info}곳`);
  if (stopped) console.log(`중단 사유: ${stopped}`);
  await writeFile(`${out}campground-products.json`, JSON.stringify({
    generated_at: fetchedAt,
    source: SOURCE,
    notes: "가격은 운영자가 관광공사에 등록한 공식 등록 기준가(비수기/성수기 × 주중/주말 최소 요금). 실제 판매가·예약 가능 여부는 예약처에서 확인.",
    coverage: { gocamping: gc.length, tour_candidates: tourItems.length, ...cov },
    campgrounds: records,
  }));
}

try { await main(); } catch (e) { warn("상품 수집 실패(무시)", e?.stack ?? e?.message ?? e); }
process.exit(0);
