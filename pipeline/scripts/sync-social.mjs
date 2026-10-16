// 캠핑장별 블로그·카페·이미지·동영상 검색 결과 → out/campground-social.json
// - 카카오(Daum) 검색 REST API. 지오코딩과 같은 KAKAO_REST_API_KEY를 쓴다(헤더 Authorization: KakaoAK <key>).
// - 캠핑장 1곳당 4회(blog·cafe·image·vclip). 캐시가 없거나 SOCIAL_MAX_AGE_DAYS(기본 14일)보다 오래된 곳부터 돌아가며 갱신.
// - 실행당 호출 상한 SOCIAL_MAX_CALLS(기본 4000, 0이면 호출 없이 캐시만으로 출력). 한도·인증 오류면 즉시 멈추고 오류는 캐시하지 않는다.
// - 메타데이터·URL만 저장하고 이미지는 내려받지 않는다(AGENTS.md 4번, docs/SOCIAL_SEARCH.md).
// 키가 없거나 네트워크가 실패해도 캐시로 결과를 쓰고 exit 0.
import { existsSync } from "node:fs";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { nowInKst, toKstIso } from "../lib/kst.mjs";
import {
  EXTRA_SEARCHES, SOCIAL_CACHE_VERSION, buildLayout, extractPriceMentions, normalizeDoc, isRelevant, distinctiveTokens, regionStem,
  REQUEST_PLAN, SEARCH_TYPES, SOURCE, buildQuery, buildSocialRecord, isStale, kakaoSearch, nameCore, pickDue, summarize,
} from "../lib/social-search.mjs";

const out = fileURLToPath(new URL("../out/", import.meta.url));
const cacheDir = fileURLToPath(new URL("../.cache/", import.meta.url));
const cachePath = `${cacheDir}social-search.json`;
const warn = (t, m) => console.log(`::warning title=${t}::${m}`);
const readJson = async (p, fallback) => { try { return JSON.parse(await readFile(p, "utf8")); } catch { return fallback; } };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const envNum = (k, d) => { const n = Number(process.env[k] ?? d); return Number.isFinite(n) ? n : d; };

const MAX_AGE_DAYS = envNum("SOCIAL_MAX_AGE_DAYS", 14);
const DROP_AGE_DAYS = envNum("SOCIAL_DROP_AGE_DAYS", 45); // 이보다 오래 갱신 못 한 항목은 출력에서 뺀다(오래된 캐시를 계속 내보내지 않기).
const MAX_CALLS = envNum("SOCIAL_MAX_CALLS", 4000);
const CONCURRENCY = Math.max(1, envNum("SOCIAL_CONCURRENCY", 4));
const DELAY_MS = envNum("SOCIAL_DELAY_MS", 120);
const CALLS_PER_CAMP = SEARCH_TYPES.length + EXTRA_SEARCHES.length;

try {
  await mkdir(out, { recursive: true });
  await mkdir(cacheDir, { recursive: true });
  await main();
} catch (e) {
  warn("소셜 검색 실패", e?.stack ?? String(e));
}
process.exit(0);

async function main() {
  const fetchedAt = toKstIso(nowInKst());
  const campPath = `${out}campgrounds.json`;
  let camps = [];
  if (existsSync(campPath)) {
    const { campgrounds = [] } = await readJson(campPath, {});
    camps = campgrounds
      .map((c) => ({ id: String(c?.external_id?.id ?? ""), name: c?.name, address: c?.address ?? {} }))
      .filter((c) => c.id && c.name);
  } else {
    const fallbackPath = fileURLToPath(new URL("../../camping-atlas/public/explore/data/campgrounds.json", import.meta.url));
    if (existsSync(fallbackPath)) {
      const raw = await readJson(fallbackPath, []);
      const list = Array.isArray(raw) ? raw : (raw.campgrounds ?? []);
      camps = list.map((c) => ({
        id: String(c?.id ?? ""),
        name: c?.name,
        address: { sido: c?.sido, sigungu: c?.sigungu }
      })).filter((c) => c.id && c.name);
    }
  }
  if (!camps.length) { warn("소셜 검색 건너뜀", "캠핑장 카탈로그 없음(sync:gocamping 또는 explore 데이터 필요)"); return; }

  // 같은 시군구 다른 캠핑장 핵심어(제목이 다른 곳을 가리키는 글 거르기)
  const coresBySigungu = new Map();
  for (const c of camps) {
    const k = `${c.address.sido ?? ""} ${c.address.sigungu ?? ""}`;
    if (!coresBySigungu.has(k)) coresBySigungu.set(k, []);
    coresBySigungu.get(k).push(nameCore(c.name, c.address.sigungu));
  }
  const othersOf = (c) => coresBySigungu.get(`${c.address.sido ?? ""} ${c.address.sigungu ?? ""}`) ?? [];

  const cache = await readJson(cachePath, { campgrounds: {} });
  cache.campgrounds ??= {};
  const key = process.env.KAKAO_REST_API_KEY;
  const due = pickDue(camps, cache.campgrounds, MAX_AGE_DAYS);
  console.log(`캠핑장 ${camps.length}곳 · 갱신 대상 ${due.length}곳(캐시 ${Object.keys(cache.campgrounds).length}곳, 기준 ${MAX_AGE_DAYS}일)`);

  let calls = 0, ok = 0, failed = 0, streak = 0, stopped = null, firstError = null;
  if (!key) warn("소셜 검색 호출 건너뜀", "KAKAO_REST_API_KEY 없음 — 캐시만 사용");
  else if (MAX_CALLS <= 0) console.log("SOCIAL_MAX_CALLS=0 — 호출 없이 캐시만 사용");
  else {
    const budgetCamps = Math.floor(MAX_CALLS / CALLS_PER_CAMP);
    const batch = due.slice(0, budgetCamps);
    let i = 0, sinceSave = 0;
    const search = (type, q) => kakaoSearch(type, q, REQUEST_PLAN[type], { key });
    const worker = async () => {
      while (i < batch.length && !stopped) {
        const c = batch[i++];
        const query = buildQuery(c);
        if (!query) continue;
        const raw = {};
        try {
          for (const type of SEARCH_TYPES) {
            if (stopped) throw stopped;
            calls++;
            raw[type] = await search(type, query);
            if (DELAY_MS) await sleep(DELAY_MS);
          }
          for (const x of EXTRA_SEARCHES) {
            if (stopped) throw stopped;
            calls++;
            raw[x.key] = await kakaoSearch(x.type, `${query} ${x.suffix}`, x.params, { key });
            if (DELAY_MS) await sleep(DELAY_MS);
          }
          const rec = buildSocialRecord(c, raw, { others: othersOf(c) });
          const layout = buildLayout(c, raw, { others: othersOf(c) });
          // 요금 언급: ‘가격 요금’ 검색 결과 중 이름 관련도를 통과한 글 + 일반 후기·카페 글
          const ctx = { tokens: distinctiveTokens(c.name, c.address?.sigungu), stem: regionStem(c.address?.sigungu), others: othersOf(c) };
          const priceDocs = (raw.price_blog ?? []).filter((d) => isRelevant({ title: d?.title, contents: d?.contents, src: d?.blogname }, ctx)).map((d) => normalizeDoc(d, "blog")).filter(Boolean);
          const prices = extractPriceMentions([...priceDocs, ...rec.blog, ...rec.cafe]);
          cache.campgrounds[c.id] = { v: SOCIAL_CACHE_VERSION, fetched_at: fetchedAt, query, ...rec, layout, prices };
          ok++; streak = 0;
          if (++sinceSave >= 100) { sinceSave = 0; await writeFile(cachePath, JSON.stringify(cache)); }
        } catch (e) {
          // 4종을 다 받지 못한 캠핑장은 캐시하지 않는다(다음 실행에서 다시).
          if (e === stopped) break;
          failed++; streak++; firstError ??= e.message;
          if (e.code === "RATE_LIMIT" || e.code === "AUTH" || streak >= 10) stopped = e;
        }
      }
    };
    await Promise.all(Array.from({ length: Math.min(CONCURRENCY, batch.length) }, worker));
    await writeFile(cachePath, JSON.stringify(cache));
    if (stopped) warn(stopped.code === "AUTH" ? "카카오 인증 실패 — 중단" : stopped.code === "RATE_LIMIT" ? "카카오 호출 한도 — 중단" : "카카오 연속 오류 — 중단", stopped.message);
    else if (firstError) warn("일부 캠핑장 검색 실패", `${failed}곳 · 첫 오류: ${firstError}`);
    if (due.length > batch.length) console.log(`호출 상한(SOCIAL_MAX_CALLS=${MAX_CALLS})으로 ${due.length - batch.length}곳은 다음 실행에서`);
  }
  console.log(`카카오 검색 호출 ${calls}건 · 갱신 ${ok}곳 · 실패 ${failed}곳`);

  // 출력: 현재 캠핑장 목록에 있고 DROP_AGE_DAYS 안에 갱신된 항목만
  const records = {};
  for (const c of camps) {
    const r = cache.campgrounds[c.id];
    if (!r || isStale(r.fetched_at, DROP_AGE_DAYS)) continue;
    const { fetched_at, blog = [], cafe = [], image = [], vclip = [], layout = null, prices = [] } = r;
    records[c.id] = { fetched_at, blog, cafe, image, vclip, ...(layout?.images?.length || layout?.posts?.length ? { layout } : {}), ...(prices.length ? { prices } : {}) };
  }
  const stats = summarize(records);
  console.log(`출력 ${stats.camps}곳(${camps.length ? Math.round((stats.camps / camps.length) * 1000) / 10 : 0}%) · 평균 이미지 ${stats.avg_images}장 · 동영상 보유 ${stats.with_video_pct}% · 글 보유 ${stats.with_posts_pct}%`);

  await writeFile(`${out}campground-social.json`, JSON.stringify({
    generated_at: fetchedAt,
    source: { name: SOURCE.name, url: SOURCE.url, tier: SOURCE.tier, terms_note: SOURCE.terms_note },
    notes: "사용자 게시물 검색 결과(후기·분위기 참고). 운영 여부·가격·예약 정보의 근거가 아니다. 썸네일·이미지 URL은 원 출처 호스팅이며 저장·재호스팅하지 않는다. 표시할 때는 원문 링크와 출처(src)를 함께 보인다.",
    stats,
    campgrounds: records,
  }));
  console.log("기록: out/campground-social.json");
}
