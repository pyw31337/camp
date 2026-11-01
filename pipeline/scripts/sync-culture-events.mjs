// 캠핑장 상세 ‘주변 축제·행사’ 포스터 카드 → camping-atlas/public/context/events.json
// 원천 ① CultureFlow 공개 JSON(https://pyw31337.github.io/culture/data/performances.json, 소유자의 문화 일정 서비스)
//      ② 한국관광공사 TourAPI 축제(같은 폴더 extras.json — Trip extras가 모은 것)
// 30km 안, 오늘~45일 사이에 걸치는 행사를 캠핑장마다 최대 8개. 같은 행사는 하나로 합친다.
// 포스터는 저장하지 않고 원래 주소(CultureFlow Pages·관광공사·KOPIS)를 그대로 보여 준다(AGENTS.md 4).
// ③ 포스터가 없는 행사(국가유산청 행사는 CultureFlow가 공통 대체 그림만 준다)에는 행사 장소의 관광공사 공식 사진을 붙인다
//    (lib/event-venue-photo.mjs, 키 DATA_GO_KR_SERVICE_KEY — 없으면 지난 기록만 쓴다. 장소별 기록 registry/event-venue-photos.json).
// 실패해도 exit 0 — 이전 결과를 그대로 둔다.
// 로컬: CULTURE_DATA_FILE=…/performances.json CULTURE_SITEMAP_FILE=…/sitemap.xml node scripts/sync-culture-events.mjs
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { CF_BASE, EVENT_WINDOW_DAYS, GridIndex, cultureEventOf, eventsNear, mergeEvents, sitemapIds, tourEventsOf } from "../lib/culture-events.mjs";
import { fetchDataGoKr } from "../lib/datagokr.mjs";
import { isRegionOnly, isTemplateImg, pickVenuePhoto, venueDue, venueKey, venueSearchUrl } from "../lib/event-venue-photo.mjs";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const outDir = join(root, "camping-atlas/public/context");
const outPath = join(outDir, "events.json");
const UA = "moyeora-camping-bot/1.0 (+https://github.com/pyw31337/camp)";
const now = Date.now();
const today = new Date(now + 9 * 3600e3).toISOString().slice(0, 10);

async function text(file, url, timeoutMs = 120000) {
  if (file) return readFileSync(file, "utf8");
  const res = await fetch(url, { headers: { "user-agent": UA }, signal: AbortSignal.timeout(timeoutMs) });
  if (!res.ok) throw new Error(`${url} HTTP ${res.status}`);
  return res.text();
}
const status = {};
let items = [], pages = new Set(), build = null;
try {
  items = JSON.parse(await text(process.env.CULTURE_DATA_FILE, `${CF_BASE}/data/performances.json`));
  status.culture = `OK ${items.length}건`;
} catch (e) { status.culture = `ERROR ${String(e.message).slice(0, 120)}`; }
try { pages = sitemapIds(await text(process.env.CULTURE_SITEMAP_FILE, `${CF_BASE}/sitemap.xml`, 30000)); status.culture_pages = `OK ${pages.size}`; } catch (e) { status.culture_pages = `ERROR ${String(e.message).slice(0, 80)}`; }
try { build = JSON.parse(await text(process.env.CULTURE_BUILD_FILE, `${CF_BASE}/data/build-info.json`, 30000)); } catch { /* 기준일만 비게 둔다 */ }

if (!items.length) {
  console.log(`::warning title=주변 행사 갱신 건너뜀::CultureFlow 자료를 못 읽었습니다(${status.culture}). 이전 events.json을 그대로 둡니다.`);
  process.exit(0);
}
const catalog = JSON.parse(readFileSync(join(root, "camping-atlas/public/explore/data/campgrounds.json"), "utf8"))
  .map((c) => ({ id: String(c.id), lat: Number(c.lat), lng: Number(c.lng) })).filter((c) => Number.isFinite(c.lat) && Number.isFinite(c.lng) && c.lat !== 0 && c.lng !== 0); // 좌표 없음(null→0)은 빼기(QA 2026-10-21)
const extrasPath = join(outDir, "extras.json");
const extras = existsSync(extrasPath) ? JSON.parse(readFileSync(extrasPath, "utf8")) : null;

const cf = items.map((it) => cultureEventOf(it, today, { pages })).filter(Boolean);
const tour = tourEventsOf(extras, today);
const { events, alias } = mergeEvents(cf, tour.events);
const byId = new Map(events.map((e) => [e.id, e]));
const idx = new GridIndex(events.filter((e) => Number.isFinite(e.lat)), 0.1);

 // 화면용 짧은 id(e1, e2…) — 원래 id는 원천 링크에 남아 있다
const camps = {}, short = new Map();
for (const c of catalog) {
  const rows = eventsNear(c, idx, { tourNear: tour.near[c.id] ?? [], alias, byId, today });
  if (!rows.length) continue;
  camps[c.id] = rows.map(([id, km]) => { if (!short.has(id)) short.set(id, `e${short.size + 1}`); return [short.get(id), km]; });
}
const ev = {};
for (const [id, sid] of short) {
  const e = byId.get(id);
  ev[sid] = Object.fromEntries(Object.entries({ t: e.title, s: e.s, e: e.e, k: e.kind, v: e.venue, a: e.addr, img: e.img, img2: e.img2, d: e.desc, p: e.price, u: e.url, tel: e.tel, cf: e.cf, src: e.src, also: e.also }).filter(([, v]) => v != null && v !== ""));
}
// 포스터 없는 행사 → 장소 공식 사진(관광공사). 기록에 없거나 오래된 장소만 묻는다(하루 VENUE_MAX_CALLS건).
const vpPath = join(root, "pipeline/registry/event-venue-photos.json");
const vp = existsSync(vpPath) ? JSON.parse(readFileSync(vpPath, "utf8")) : { venues: {} };
vp.venues ??= {};
const tourKey = process.env.DATA_GO_KR_SERVICE_KEY;
const VENUE_MAX_CALLS = Number(process.env.VENUE_MAX_CALLS ?? 400);
let vCalls = 0, vHit = 0, vStop = tourKey ? "" : "DATA_GO_KR_SERVICE_KEY 없음 — 지난 기록만 사용";
for (const [id, sid] of short) {
  const e = byId.get(id), row = ev[sid];
  if (!e?.venue || (row.img && !isTemplateImg(row.img)) || isRegionOnly(e.venue)) continue;
  const at = Number.isFinite(e.lat) ? { lat: e.lat, lng: e.lng } : null;
  const k = venueKey(e.venue, at);
  if (!vStop && venueDue(vp.venues[k]) && vCalls < VENUE_MAX_CALLS) {
    try {
      const { res } = await fetchDataGoKr(venueSearchUrl(e.venue), tourKey, { timeoutMs: 20000 });
      vCalls++;
      const body = await res.text();
      let j = null; try { j = JSON.parse(body); } catch { /* XML 오류 응답 */ }
      const items = j?.response?.body?.items?.item;
      if (!j?.response?.body) { if (/LIMITED|EXCEED|SERVICE_KEY|한도/i.test(body)) vStop = `TourAPI 중단: ${body.slice(0, 120).replace(/\s+/g, " ")}`; }
      else {
        const hit = pickVenuePhoto(Array.isArray(items) ? items : items ? [items] : [], e.venue, at);
        // 지우지 않는다: 이번에 못 찾아도 예전에 찾은 사진은 그대로 둔다
        vp.venues[k] = hit ? { ...hit, venue: e.venue, at: new Date().toISOString() } : { ...(vp.venues[k]?.img ? vp.venues[k] : { venue: e.venue }), at: new Date().toISOString(), ...(vp.venues[k]?.img ? {} : { none: true }) };
      }
    } catch (err) { vStop = `TourAPI 실패: ${String(err.message).slice(0, 100)}`; }
  }
  const p = vp.venues[k];
  if (p?.img) {
    if (row.img) row.img2 = row.img; // 사진이 깨지면 원래 대체 그림으로
    row.img = p.img; row.iv = 1; vHit++; // iv: 포스터가 아니라 장소 사진(화면에 출처 표기)
  }
}
if (vCalls || !existsSync(vpPath)) writeFileSync(vpPath, `${JSON.stringify({ src: "한국관광공사 TourAPI searchKeyword2(장소 이름·3km)", rule: "lib/event-venue-photo.mjs", venues: Object.fromEntries(Object.entries(vp.venues).sort()) }, null, 1)}\n`);
status.venue_photo = `${vStop || "OK"} · 이번 ${vCalls}건 · 장소 사진 ${vHit}건`;

const out = {
  generated_at: new Date(now).toISOString(), today, window_days: EVENT_WINDOW_DAYS, radius_km: 30, status,
  sources: {
    cf: { name: "CultureFlow", url: `${CF_BASE}/`, data_at: build?.generatedAt ?? null, note: "공연·전시·축제 일정 모음(포스터는 CultureFlow와 각 원출처 이미지)" },
    tour: { name: "한국관광공사 TourAPI 행사정보", url: "https://api.visitkorea.or.kr", grade: "PUBLIC_DATA" },
    venue_photo: { name: "한국관광공사 TourAPI 관광지 사진(행사 장소)", url: "https://api.visitkorea.or.kr", grade: "PUBLIC_DATA", note: "포스터가 없는 행사에 장소 사진(iv=1)" },
  },
  ev, camps,
};
writeFileSync(outPath, JSON.stringify(out));
const withImg = Object.values(camps).filter((rows) => rows.some(([id]) => ev[id]?.img)).length;
const kinds = {};
for (const e of Object.values(ev)) kinds[e.k] = (kinds[e.k] ?? 0) + 1;
console.log(`주변 행사: 캠핑장 ${Object.keys(camps).length}곳(포스터 있는 곳 ${withImg}) · 행사 ${Object.keys(ev).length}건(CultureFlow 후보 ${cf.length} · 관광공사 ${tour.events.length} · 합친 중복 ${alias.size}) ${JSON.stringify(kinds)}`);
console.log(JSON.stringify({ status, culture_data_at: build?.generatedAt ?? null }));
