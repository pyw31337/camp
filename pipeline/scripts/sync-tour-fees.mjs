// TourAPI 야영장 소개 정보(공식 안내 요금·예약 안내) 수집 → 고캠핑 매칭 → out/tour-fees.json
// 하루 호출 한도(개발 키)를 넘지 않도록 소개 정보는 캐시하고(14일 재확인), 실행마다 TOUR_DAILY_CAP건까지만 새로 부른다.
import { existsSync } from "node:fs";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { fetchDataGoKr } from "../lib/datagokr.mjs";
import { nowInKst, toKstIso } from "../lib/kst.mjs";
import { CAMPSITE_CAT, TOUR_BASE, feeRange, matchTour, normalizeTourIntro, normalizeTourItem } from "../lib/tour-fees.mjs";

const key = process.env.DATA_GO_KR_SERVICE_KEY;
const out = fileURLToPath(new URL("../out/", import.meta.url));
const cacheDir = fileURLToPath(new URL("../.cache/", import.meta.url));
const cachePath = `${cacheDir}tour-intro.json`;
await mkdir(out, { recursive: true });
await mkdir(cacheDir, { recursive: true });
const fetchedAt = toKstIso(nowInKst());
const CAP = Number(process.env.TOUR_DAILY_CAP ?? 800);
const warn = (t, m) => console.log(`::warning title=${t}::${m}`);
if (!key) { warn("TourAPI 건너뜀", "DATA_GO_KR_SERVICE_KEY 없음"); process.exit(0); }

const common = "MobileOS=ETC&MobileApp=moyeora&_type=json";
async function call(path, params) {
  const { res } = await fetchDataGoKr(`${TOUR_BASE}/${path}?${common}&${new URLSearchParams(params)}`, key, { timeoutMs: 30000 });
  const text = await res.text();
  let j; try { j = JSON.parse(text); } catch { throw new Error(`${path} HTTP ${res.status} ${text.slice(0, 160).replace(/\s+/g, " ")}`); }
  const body = j?.response?.body;
  if (!body) throw new Error(`${path} ${JSON.stringify(j?.response?.header ?? j).slice(0, 200)}`);
  const items = body.items?.item ?? [];
  return { items: Array.isArray(items) ? items : [items], total: Number(body.totalCount ?? 0) };
}

// 1) 야영장 목록(전국)
const list = [];
for (let page = 1; page <= 20; page++) {
  const { items, total } = await call("areaBasedList2", { numOfRows: "1000", pageNo: String(page), arrange: "C", ...CAMPSITE_CAT });
  list.push(...items.map(normalizeTourItem));
  if (page * 1000 >= total || !items.length) break;
}
console.log(`TourAPI 야영장 ${list.length}곳`);

// 2) 고캠핑과 매칭
const campPath = `${out}campgrounds.json`;
if (!existsSync(campPath)) { warn("매칭 건너뜀", "out/campgrounds.json 없음"); process.exit(0); }
const { campgrounds } = JSON.parse(await readFile(campPath, "utf8"));
const gc = campgrounds.filter((c) => c.location).map((c) => ({ id: String(c.external_id.id), name: c.name, lat: c.location.lat, lng: c.location.lng }));
const matches = matchTour(gc, list);
console.log(`고캠핑 ${gc.length}곳 중 TourAPI와 연결 ${matches.size}곳`);

// 3) 소개 정보(캐시 우선, 14일 지난 것과 처음 보는 것만 호출)
const cache = existsSync(cachePath) ? JSON.parse(await readFile(cachePath, "utf8")) : {};
const stale = (v) => !v || (Date.now() - Date.parse(v.fetched_at)) / 864e5 > 14;
const todo = [...matches.values()].filter((m) => stale(cache[m.contentid]));
let calls = 0, failed = 0, firstKeys = null;
for (const m of todo.slice(0, CAP)) {
  try {
    const { items } = await call("detailIntro2", { contentId: m.contentid, contentTypeId: CAMPSITE_CAT.contentTypeId });
    calls++;
    if (!firstKeys && items[0]) { firstKeys = Object.keys(items[0]); console.log(`소개 정보 필드: ${firstKeys.join(", ")}`); }
    cache[m.contentid] = { fetched_at: fetchedAt, ...normalizeTourIntro(items[0] ?? {}) };
  } catch (e) {
    failed++;
    if (/LIMITED_NUMBER|EXCEEDS|한도/.test(e.message)) { warn("TourAPI 일일 한도", e.message); break; }
    if (failed <= 3) console.log(`  ${m.contentid}: ${e.message}`);
  }
}
await writeFile(cachePath, JSON.stringify(cache));
console.log(`소개 정보: 새로 ${calls}건(실패 ${failed}), 남은 ${Math.max(0, todo.length - calls)}건, 캐시 ${Object.keys(cache).length}건`);

const records = {};
for (const [gid, m] of matches) {
  const intro = cache[m.contentid];
  if (!intro) continue;
  records[gid] = {
    tour_contentid: m.contentid, match: { distance_m: m.distance_m, name_similarity: m.name_similarity },
    fee_text: intro.fee_text, fee_range: feeRange(intro.fee_text), reservation_text: intro.reservation_text, hours_text: intro.hours_text,
    parking_fee_text: intro.parking_fee_text, rest_days_text: intro.rest_days_text, open_period_text: intro.open_period_text,
    checked_at: intro.fetched_at,
    source_url: `https://korean.visitkorea.or.kr/detail/ms_detail.do?cotid=${m.contentid}`,
  };
}
const withFee = Object.values(records).filter((r) => r.fee_text).length;
// 진단: 소개 정보 칸별로 값이 있는 시설 수(관광공사 원천에 요금 칸이 비어 있는지 확인용)
const filled = Object.fromEntries(["fee_text", "reservation_text", "hours_text", "parking_fee_text", "rest_days_text", "open_period_text"].map((k) => [k, Object.values(records).filter((r) => r[k]).length]));
console.log(`소개 정보 칸별 값 있는 시설: ${JSON.stringify(filled)}`);
console.log(`요금 안내 문구 있는 시설 ${withFee}곳(숫자 범위 추출 ${Object.values(records).filter((r) => r.fee_range).length}곳)`);
await writeFile(`${out}tour-fees.json`, JSON.stringify({ generated_at: fetchedAt, source: "한국관광공사 TourAPI 4.0(KorService2) 소개정보", tier: "B", notes: "운영자가 등록한 안내 문구. 실제 판매가는 예약처에서 확인.", count: Object.keys(records).length, with_fee_text: withFee, records }));
