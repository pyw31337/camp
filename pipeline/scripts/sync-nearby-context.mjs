// 캠핑장 주변 맥락 수집 → out/campground-nearby.json
// - 관광지·문화시설·레포츠·쇼핑·음식점: TourAPI areaBasedList2를 유형별로 1000건씩 통째로 받아 7일 캐시(캠핑장별 호출 없음).
// - 마트·편의점·주유소·약국·병원: OpenStreetMap Overpass를 0.5° 타일로 나눠 14일 캐시(타일별로 이어 받기).
// - 휴게소·졸음쉼터: out/rest-stops.json(sync:rest-stops 결과)을 재사용.
// 키가 없거나 네트워크가 실패해도 가진 데이터(캐시)로 결과를 쓰고 exit 0 — 일일 작업을 멈추지 않는다.
import { existsSync } from "node:fs";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { fetchDataGoKr } from "../lib/datagokr.mjs";
import { nowInKst, toKstIso } from "../lib/kst.mjs";
import { OVERPASS_SERVERS, loadOsmExtract } from "../lib/overpass.mjs";
import {
  NEARBY_RULES, OSM_ATTRIBUTION, SOURCES, TOUR_TYPES, buildTiles, computeNearby, dedupeById, isStale,
  normalizeOsmShop, normalizeRestStop, normalizeTourPoi, overpassShopQuery, parseTourBody, tourListUrl,
} from "../lib/nearby-context.mjs";

const out = fileURLToPath(new URL("../out/", import.meta.url));
const cacheDir = fileURLToPath(new URL("../.cache/", import.meta.url));
const tourCachePath = `${cacheDir}tour-pois.json`;
const osmCachePath = `${cacheDir}osm-shops.json`;
await mkdir(out, { recursive: true });
await mkdir(cacheDir, { recursive: true });
const fetchedAt = toKstIso(nowInKst());
const warn = (t, m) => console.log(`::warning title=${t}::${m}`);
const readJson = async (p, fallback) => { try { return JSON.parse(await readFile(p, "utf8")); } catch { return fallback; } };

const TOUR_MAX_AGE_DAYS = Number(process.env.NEARBY_TOUR_MAX_AGE_DAYS ?? 7);
const OSM_MAX_AGE_DAYS = Number(process.env.NEARBY_OSM_MAX_AGE_DAYS ?? 14);
const TOUR_MAX_CALLS = Number(process.env.NEARBY_TOUR_MAX_CALLS ?? 150); // TourAPI 개발 키 하루 1,000건 중 이 작업 몫
const OSM_TIME_BUDGET_MS = Number(process.env.NEARBY_OSM_TIME_BUDGET_MS ?? 8 * 60 * 1000);
const OSM_TILE_TIMEOUT_MS = Number(process.env.NEARBY_OSM_TILE_TIMEOUT_MS ?? 90000);
const OSM_SERVERS = process.env.OVERPASS_URLS ? process.env.OVERPASS_URLS.split(",").map((s) => s.trim()).filter(Boolean) : OVERPASS_SERVERS;

// 0) 캠핑장
const campPath = `${out}campgrounds.json`;
if (!existsSync(campPath)) { warn("주변 맥락 건너뜀", "out/campgrounds.json 없음(sync:gocamping 먼저)"); process.exit(0); }
const { campgrounds = [] } = await readJson(campPath, {});
const points = campgrounds.map((c) => ({ lat: c?.location?.lat, lng: c?.location?.lng })).filter((p) => Number.isFinite(p.lat) && Number.isFinite(p.lng));
console.log(`캠핑장 ${campgrounds.length}곳(좌표 ${points.length}곳)`);

// 1) TourAPI 유형별 전량(7일 캐시)
const tourCache = await readJson(tourCachePath, { types: {} });
tourCache.types ??= {};
const key = process.env.DATA_GO_KR_SERVICE_KEY;
let tourCalls = 0;
if (!key) warn("TourAPI 건너뜀", "DATA_GO_KR_SERVICE_KEY 없음 — 관광·음식점은 캐시만 사용");
else {
  typeLoop: for (const type of Object.keys(TOUR_TYPES)) {
    if (!isStale(tourCache.types[type]?.fetched_at, TOUR_MAX_AGE_DAYS)) continue;
    const items = [];
    try {
      for (let page = 1; page <= 100; page++) {
        if (tourCalls >= TOUR_MAX_CALLS) { warn("TourAPI 호출 상한", `NEARBY_TOUR_MAX_CALLS=${TOUR_MAX_CALLS} 도달 — 유형 ${type}은 다음 실행에서`); break typeLoop; }
        const { res } = await fetchDataGoKr(tourListUrl(type, page), key, { timeoutMs: 60000 });
        tourCalls++;
        const { items: raw, total } = parseTourBody(await res.text(), res.status);
        items.push(...raw.map(normalizeTourPoi).filter(Boolean));
        if (page * 1000 >= total || !raw.length) break;
      }
      tourCache.types[type] = { fetched_at: fetchedAt, items };
      console.log(`TourAPI ${TOUR_TYPES[type]}(${type}) ${items.length}건`);
    } catch (e) {
      warn(`TourAPI ${TOUR_TYPES[type]} 실패 — 직전 캐시 유지`, e.message);
      if (/LIMITED_NUMBER|EXCEEDS|한도|SERVICE_KEY|UNREACHABLE/i.test(`${e.message} ${e.code ?? ""}`)) break;
    }
  }
  await writeFile(tourCachePath, JSON.stringify(tourCache));
}
const tourPois = Object.values(tourCache.types).flatMap((t) => t.items ?? []);
const tourDates = Object.values(tourCache.types).map((t) => t.fetched_at).filter(Boolean).sort();
console.log(`TourAPI 호출 ${tourCalls}건, 사용 POI ${tourPois.length}건(유형 ${Object.keys(tourCache.types).join(",") || "없음"})`);

// 2) OpenStreetMap 타일(14일 캐시, 시간 예산 안에서 오래된 타일부터)
async function overpassTile(query) {
  const errors = [];
  for (const url of OSM_SERVERS) {
    if (deadServers.has(url)) continue;
    try {
      const res = await fetch(url, { method: "POST", body: new URLSearchParams({ data: query }), headers: { "User-Agent": "moyeora-camping-pipeline (github.com/pyw31337/camp)" }, signal: AbortSignal.timeout(OSM_TILE_TIMEOUT_MS) });
      if (!res.ok) { errors.push(`${new URL(url).host} HTTP ${res.status}`); strike(url, ![429, 502, 503, 504].includes(res.status)); continue; }
      const body = await res.json();
      // 시간·메모리 초과는 HTTP 200 + remark로 온다. remark 없는 빈 결과는 정상(빈 타일).
      if (body.remark && /error|timed out|out of memory|runtime/i.test(body.remark)) { errors.push(`${new URL(url).host} ${String(body.remark).slice(0, 80)}`); strike(url); continue; }
      strikes.set(url, 0);
      return body.elements ?? [];
    } catch (e) {
      errors.push(`${new URL(url).host} ${e.message}`);
      strike(url, /ENOTFOUND|ECONNREFUSED|EAI_AGAIN|certificate/i.test(`${e.message} ${e.cause?.code ?? ""} ${e.cause?.message ?? ""}`));
    }
  }
  throw new Error(errors.join(", ") || "사용 가능한 Overpass 서버 없음");
}
// 서버가 연속 2번 실패(또는 복구 불가 오류)하면 이번 실행에서 빼서, 타일마다 시간 초과를 기다리지 않게 한다.
const deadServers = new Set();
const strikes = new Map();
function strike(url, fatal = false) {
  const n = (strikes.get(url) ?? 0) + 1;
  strikes.set(url, n);
  if (fatal || n >= 2) deadServers.add(url);
}
const extract = await loadOsmExtract();
const osmCache = await readJson(osmCachePath, { tiles: {} });
osmCache.tiles ??= {};
const tiles = buildTiles({ points });
const staleTiles = tiles.filter((t) => isStale(osmCache.tiles[t.key]?.fetched_at, OSM_MAX_AGE_DAYS))
  .sort((a, b) => (Date.parse(osmCache.tiles[a.key]?.fetched_at ?? 0) || 0) - (Date.parse(osmCache.tiles[b.key]?.fetched_at ?? 0) || 0));
const started = Date.now();
let osmOk = 0, osmFail = 0;
for (const t of extract ? [] : staleTiles) {
  if (Date.now() - started > OSM_TIME_BUDGET_MS) { warn("Overpass 시간 예산 소진", `남은 타일 ${staleTiles.length - osmOk - osmFail}개는 다음 실행에서`); break; }
  if (deadServers.size >= OSM_SERVERS.length) { warn("Overpass 서버 모두 응답 없음", "캐시만 사용"); break; }
  try {
    const els = await overpassTile(overpassShopQuery(t.bbox, Math.round(OSM_TILE_TIMEOUT_MS / 1000)));
    osmCache.tiles[t.key] = { fetched_at: fetchedAt, bbox: t.bbox, items: dedupeById(els.map(normalizeOsmShop)) };
    osmOk++;
    if (osmOk % 10 === 0) await writeFile(osmCachePath, JSON.stringify(osmCache));
  } catch (e) {
    osmFail++;
    if (osmFail <= 3) console.log(`  타일 ${t.key}: ${e.message}`);
    if (osmFail >= 5 && osmOk === 0) { warn("Overpass 연속 실패", `처음 ${osmFail}개 타일 실패 — 이번 실행은 캐시만 사용`); break; }
  }
}
if (osmOk) await writeFile(osmCachePath, JSON.stringify(osmCache));
// Geofabrik 추출본이 있으면 전국을 한 번에 쓰고, 없으면 Overpass 타일 캐시를 쓴다.
const usedTiles = extract ? [{ fetched_at: extract.fetched_at }] : tiles.map((t) => osmCache.tiles[t.key]).filter(Boolean);
const osmPois = extract ? dedupeById(extract.elements.map(normalizeOsmShop)) : dedupeById(usedTiles.flatMap((t) => t.items ?? []));
const osmDates = usedTiles.map((t) => t.fetched_at).sort();
if (extract) console.log(`OSM 추출본 사용: ${osmPois.length}곳(${extract.fetched_at})`);
console.log(`Overpass 타일 ${tiles.length}개 중 캐시 보유 ${usedTiles.length}개(이번 성공 ${osmOk}, 실패 ${osmFail}, 남은 오래된 타일 ${staleTiles.length - osmOk}) · POI ${osmPois.length}건`);

// 3) 휴게소·졸음쉼터
const restRaw = await readJson(`${out}rest-stops.json`, null);
const restPois = (restRaw?.stops ?? []).map(normalizeRestStop).filter(Boolean);
if (!restRaw) warn("휴게소 없음", "out/rest-stops.json 없음(sync:rest-stops 먼저) — rest 비움");
console.log(`휴게소·졸음쉼터 ${restPois.length}곳`);

// k-data 공개 색인: 휴양림·실내놀이터·수영장·레포츠·박물관 등은
// 별도 수집기가 원문 URL·확인 시각과 함께 누적한다. 원장이 없으면 기존 주변 결과만 유지한다.
const publicRaw = await readJson(`${fileURLToPath(new URL("../registry/kdata-public.json", import.meta.url))}`, null);
const publicPois = (publicRaw?.records ?? []).filter((x) => Number.isFinite(Number(x.lat)) && Number.isFinite(Number(x.lng)));
console.log(`공공시설 공개 색인 ${publicPois.length}곳`);

// 4) 계산·기록
const nearby = computeNearby(campgrounds, { tour: tourPois, osm: osmPois, rest: restPois, public: publicPois });
const filled = Object.fromEntries(Object.keys(NEARBY_RULES).map((k) => [k, Object.values(nearby).filter((n) => n[k]?.length).length]));
console.log(`주변 맥락 ${Object.keys(nearby).length}곳 · 분류별 1건 이상: ${JSON.stringify(filled)}`);

const sources = [
  { ...SOURCES.tour, fetched_at: tourDates.at(-1) ?? null, oldest_fetched_at: tourDates[0] ?? null, coverage: Object.fromEntries(Object.keys(TOUR_TYPES).map((t) => [t, tourCache.types[t]?.items?.length ?? null])) },
  { ...SOURCES.osm, fetched_at: osmDates.at(-1) ?? null, oldest_fetched_at: osmDates[0] ?? null, attribution: OSM_ATTRIBUTION, coverage: { tiles_total: tiles.length, tiles_cached: usedTiles.length, pois: osmPois.length } },
  { ...SOURCES.rest, fetched_at: restRaw?.generated_at ?? null, coverage: { stops: restPois.length } },
  { ...SOURCES.public, fetched_at: publicRaw?.generated_at ?? null, coverage: { records: publicPois.length, categories: [...new Set(publicPois.map((x) => x.category))] } },
];
await writeFile(`${out}campground-nearby.json`, JSON.stringify({
  generated_at: fetchedAt,
  notes: "distance_m은 직선거리(도로 거리 아님). 영업 여부·영업시간·가격은 보장하지 않으며 방문 전 확인 필요. fetched_at이 null인 원천은 미수집(빈 배열은 ‘없음’이 아니라 ‘미확인’일 수 있음).",
  rules: NEARBY_RULES,
  attribution: [SOURCES.tour.name, OSM_ATTRIBUTION, "한국도로공사 · 전국졸음쉼터표준데이터"],
  sources,
  count: Object.keys(nearby).length,
  campgrounds: nearby,
}));
console.log(`기록: out/campground-nearby.json`);
