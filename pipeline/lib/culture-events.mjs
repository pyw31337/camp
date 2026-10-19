// 주변 축제·공연·전시(포스터 카드) — 순수 함수. 네트워크·파일은 scripts/sync-culture-events.mjs.
// 원천 ① CultureFlow(소유자의 문화 일정 서비스, https://pyw31337.github.io/culture/) 공개 JSON
//      ② 한국관광공사 TourAPI 축제(여행 참고 정보 extras.json에 이미 모인 것)
import { GridIndex, haversineM } from "./geo.mjs";

export const CF_BASE = "https://pyw31337.github.io/culture";
export const EVENT_RADIUS_M = 30000;
export const EVENT_WINDOW_DAYS = 45;
export const EVENTS_PER_CAMP = 8;
export const MAX_RUN_DAYS = 120; // 이보다 긴 상설 전시·상시 체험은 ‘행사’로 보지 않는다(축제 제외)

// 캠핑 여행 중에 들를 만한 것만: 축제·국가유산 행사·공연·전시. 클래스·상품권·스포츠·영화·관광지(상시)·캠핑장은 뺀다.
const SOURCES = new Set(["festival", "heritage", "culture-portal", "seoul", "kopis", "interpark", "kintex", "bexco", "setec", "coex", "museum"]);
const GENRES = new Set(["festival", "concert", "classic_tradition", "musical", "play", "exhibition", "activity", "etc"]);
const SPORTS = /대회|리그|챌린저|오픈\s*챔피언|선수권|경기\s*(관람|티켓)|\bvs\.?\s/i;
const KIND = { festival: "축제", heritage: "국가유산 행사", exhibition: "전시", concert: "콘서트", classic_tradition: "클래식·국악", musical: "뮤지컬", play: "연극", activity: "체험", etc: "행사" };
const SOURCE_NAME = {
  festival: "한국관광공사 대한민국 구석구석", heritage: "국가유산청", "culture-portal": "문화포털(문화체육관광부)", seoul: "서울문화포털",
  kopis: "공연예술통합전산망(KOPIS)", interpark: "NOL 인터파크 티켓", kintex: "KINTEX", bexco: "BEXCO", setec: "SETEC", coex: "COEX", museum: "박물관", tour: "한국관광공사 TourAPI",
};
// 분류 우선순위(작을수록 위): 축제 → 국가유산·전통 → 전시·체험 → 공연
export const KIND_RANK = { 축제: 0, "축제·행사": 0, "국가유산 행사": 1, "클래식·국악": 3, 전시: 2, 체험: 2, 행사: 2, 콘서트: 3, 뮤지컬: 3, 연극: 3 };

const pad = (n) => String(n).padStart(2, "0");
const iso = (y, m, d) => `${y}-${pad(m)}-${pad(d)}`;
/** "2026.10.13 (화) ~ 2026.10.14 (수)" · "2026.10.15 (목)" · "2026-10-13 ~ 2026-11-02" → {s, e} */
export function parsePeriod(text) {
  const ds = [...String(text ?? "").matchAll(/(20\d{2})[.\-/년]\s*(\d{1,2})[.\-/월]\s*(\d{1,2})/g)].map(([, y, m, d]) => iso(y, m, d));
  if (!ds.length) return null;
  return { s: ds[0], e: ds[ds.length - 1] < ds[0] ? ds[0] : ds[ds.length - 1] };
}
export const addDays = (day, n) => new Date(Date.parse(`${day}T00:00:00Z`) + n * 864e5).toISOString().slice(0, 10);
const daysBetween = (a, b) => Math.round((Date.parse(`${b}T00:00:00Z`) - Date.parse(`${a}T00:00:00Z`)) / 864e5);

/** 제목 비교용: 회차·연도·괄호·기호·공백 제거 */
export function titleKey(t) {
  return String(t ?? "").toLowerCase()
    .replace(/\(.*?\)|\[.*?\]|<.*?>|「|」|『|』/g, "")
    .replace(/제?\s*\d+\s*회|20\d{2}\s*년?/g, "")
    .replace(/[^0-9a-z가-힣]/g, "");
}
// CultureFlow가 자동으로 만든 틀 문장(“…에서 열리는 특별한 연극 공연/행사입니다. 진행 일정은 …”)은 소개로 쓰지 않는다.
const TEMPLATE = /열리는 특별한|진행 일정은 .* 기준입니다|지역 명소로서|방문을 적극 고려/;
/** 소개글 첫 1~2문장(최대 max자, HTML·줄바꿈 정리) */
export function shortDesc(text, max = 110) {
  const s = String(text ?? "").replace(/<[^>]+>/g, " ").replace(/&nbsp;|&#\d+;|&[a-z]+;/g, " ").replace(/\s+/g, " ").trim();
  if (!s || TEMPLATE.test(s)) return null;
  if (s.length <= max) return s;
  const cut = s.slice(0, max);
  const end = Math.max(cut.lastIndexOf(". "), cut.lastIndexOf("다."), cut.lastIndexOf("요."));
  return end > max * 0.5 ? cut.slice(0, end + (cut[end] === "." ? 1 : 2)).trim() : `${cut.replace(/\s+\S*$/, "")}…`;
}
/** CultureFlow 상대 경로 → 절대 주소(한글 파일명은 인코딩). 외부 http 주소는 https로. */
export function cfImage(p) {
  const v = String(p ?? "").trim();
  if (!v || v.startsWith("data:")) return null;
  if (/^https?:\/\//.test(v)) return v.replace(/^http:\/\//, "https://");
  if (!v.startsWith("/")) return null;
  return `${CF_BASE}${encodeURI(decodeURI(v))}`;
}
const https = (u) => (u && /^https?:\/\//.test(u) ? String(u).replace(/^http:\/\/(tong\.visitkorea\.or\.kr|www\.kopis\.or\.kr)/, "https://$1") : null);

/**
 * CultureFlow 항목 → 행사(오늘~window 안에 걸치고, 좌표·제목이 있는 것만). 아니면 null.
 * pages: CultureFlow에 상세 화면이 실제로 있는 id 집합(sitemap)
 */
export function cultureEventOf(it, today, { windowDays = EVENT_WINDOW_DAYS, pages = new Set() } = {}) {
  if (!it || !SOURCES.has(it.source) || !GENRES.has(it.genre) || it.openRun) return null;
  const lat = Number(it.lat), lng = Number(it.lng);
  if (!Number.isFinite(lat) || !Number.isFinite(lng) || lat < 32.9 || lat > 38.7 || lng < 124.5 || lng > 132) return null;
  const title = String(it.title ?? "").trim();
  if (SPORTS.test(title)) return null;
  const per = parsePeriod(it.date);
  if (!title || !per) return null;
  const until = addDays(today, windowDays);
  if (per.e < today || per.s > until) return null;
  const kind = it.source === "festival" || /축제|페스티벌|festival/i.test(title) && it.source !== "kopis" && it.source !== "interpark" ? "축제"
    : it.source === "heritage" ? "국가유산 행사" : KIND[it.genre] ?? "행사";
  if (kind !== "축제" && daysBetween(per.s, per.e) > MAX_RUN_DAYS) return null;
  const venue = it.source === "festival" ? null : String(it.venue ?? "").trim() || null;
  const price = String(it.priceDetail || it.price || "").replace(/\s+/g, " ").trim();
  return {
    id: `cf:${it.id}`, title, s: per.s, e: per.e, kind, lat, lng,
    venue, addr: String(it.address ?? "").trim() || null,
    img: cfImage(it.posterUrl || it.poster || it.image), img2: https(cfImage(it.backupPoster)) ?? null,
    desc: shortDesc(it.description), price: price && price.length <= 40 ? price : null,
    url: https(it.link) || it.website || null,
    cf: pages.has(it.id) ? `${CF_BASE}/p/${encodeURIComponent(it.id)}/` : null,
    src: SOURCE_NAME[it.source] ?? it.source, origin: "cf",
  };
}
/** extras.json(fest + camps[].fe) → 관광공사 축제 행사 목록과 캠핑장별 거리 */
export function tourEventsOf(extras, today) {
  const ev = new Map();
  for (const [id, f] of Object.entries(extras?.fest ?? {})) {
    if (!f?.t || !f.s || (f.e ?? f.s) < today) continue;
    ev.set(`tour:${id}`, {
      id: `tour:${id}`, title: f.t, s: f.s, e: f.e ?? f.s, kind: "축제", venue: null, addr: f.a ?? null,
      img: https(f.img), img2: null, desc: null, price: null,
      url: `https://korean.visitkorea.or.kr/detail/ms_detail.do?cotid=${encodeURIComponent(id)}`, cf: null, src: SOURCE_NAME.tour, origin: "tour",
    });
  }
  const near = {};
  for (const [cid, o] of Object.entries(extras?.camps ?? {})) {
    const rows = (o.fe ?? []).filter(([fid]) => ev.has(`tour:${fid}`)).map(([fid, km]) => [`tour:${fid}`, km]);
    if (rows.length) near[cid] = rows;
  }
  return { events: [...ev.values()], near };
}
const overlaps = (a, b) => a.s <= b.e && b.s <= a.e;
/** 같은 행사인지: 제목 키가 같거나 한쪽이 다른 쪽을 품고(4자↑), 기간이 겹친다. 좌표가 둘 다 있으면 5km 안. */
export function sameEvent(a, b) {
  if (!overlaps(a, b)) return false;
  const x = titleKey(a.title), y = titleKey(b.title);
  if (!x || !y) return false;
  const titleHit = x === y || (Math.min(x.length, y.length) >= 4 && (x.includes(y) || y.includes(x)));
  if (!titleHit) return false;
  if (Number.isFinite(a.lat) && Number.isFinite(b.lat)) return haversineM(a.lat, a.lng, b.lat, b.lng) <= 5000;
  return true;
}
/** 두 원천을 합친다: CultureFlow 쪽을 기본으로(소개·포스터가 더 많음) 빈 칸만 관광공사 값으로 채운다. 반환: {events, alias(옛 id → 남긴 id)} */
export function mergeEvents(cfEvents, tourEvents) {
  const keep = [], alias = new Map();
  const byKey = new Map();
  const add = (e) => {
    const k = titleKey(e.title).slice(0, 6);
    const cands = byKey.get(k) ?? [];
    const dup = cands.find((x) => sameEvent(x, e)) ?? keep.find((x) => x.kind === e.kind && sameEvent(x, e));
    if (dup) {
      alias.set(e.id, dup.id);
      for (const f of ["img", "img2", "desc", "venue", "addr", "price", "url"]) if (!dup[f] && e[f]) dup[f] = e[f];
      if (e.origin !== dup.origin) dup.also = [...new Set([...(dup.also ?? []), e.src])];
      return;
    }
    keep.push(e);
    byKey.set(k, [...cands, e]);
  };
  // 포스터가 있는 쪽이 먼저 자리를 잡게 한다
  [...cfEvents].sort((a, b) => Number(!a.img) - Number(!b.img)).forEach(add);
  tourEvents.forEach(add);
  return { events: keep, alias };
}
/** 진행 중/예정 */
export const stateOf = (e, today) => (e.s <= today ? "ongoing" : "upcoming");
/** 캠핑장별 주변 행사 [[id, km], …] — 축제 우선, 그다음 진행 중·시작일·거리 순 */
export function eventsNear(camp, idx, { tourNear = [], alias = new Map(), byId = new Map(), today, limit = EVENTS_PER_CAMP, radiusM = EVENT_RADIUS_M } = {}) {
  const hits = new Map();
  for (const h of idx.within(camp.lat, camp.lng, radiusM)) hits.set(h.point.id, Math.round(h.distance_m / 100) / 10);
  for (const [id, km] of tourNear) {
    const k = alias.get(id) ?? id;
    if (byId.has(k) && !hits.has(k)) hits.set(k, km);
  }
  const rank = (id) => { const e = byId.get(id); return [KIND_RANK[e.kind] ?? 4, e.s <= today ? 0 : 1, e.s, hits.get(id)]; };
  const cmp = (a, b) => { const x = rank(a), y = rank(b); for (let i = 0; i < x.length; i++) if (x[i] !== y[i]) return x[i] < y[i] ? -1 : 1; return 0; };
  // 한 캠핑장에 같은 분류가 몰리지 않게: 공연은 최대 3개
  const ids = [...hits.keys()].filter((id) => byId.has(id)).sort(cmp);
  const out = [];
  let perf = 0;
  for (const id of ids) {
    if ((KIND_RANK[byId.get(id).kind] ?? 4) >= 3) { if (perf >= 3) continue; perf++; }
    out.push([id, hits.get(id)]);
    if (out.length >= limit) break;
  }
  return out;
}
/** sitemap.xml → CultureFlow 상세 화면 id 집합 */
export function sitemapIds(xml) {
  return new Set([...String(xml ?? "").matchAll(/<loc>[^<]*\/p\/([^<\/]+)\/?<\/loc>/g)].map(([, id]) => { try { return decodeURIComponent(id); } catch { return id; } }));
}
export { GridIndex };
