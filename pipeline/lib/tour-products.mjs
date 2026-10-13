// 한국관광공사 TourAPI 4.0(KorService2)에서 캠핑장별 “상품(사이트·객실)” 목록과 공식 사진을 만든다(순수 함수만).
// - 숙박(contentTypeId 32) 항목 중 글램핑·카라반·캠핑 숙소와 야영장(28 · A03021700)을 고캠핑 시설과 이름·거리로 1:1 연결한다.
// - detailInfo2(32) 객실 행 → 상품(이름·크기·수량·기준/최대 인원·비수기/성수기 주중/주말 최소 요금·편의시설·객실 사진)
//   detailInfo2(28) 일반 행(infoname/infotext) → 안내 정보(이용요금 등), detailImage2 → 공식 사진.
// 요금은 운영자가 관광공사에 등록한 “공식 등록 기준가”(최소 요금)이며 실시간 판매가·예약 가능 여부가 아니다.
// 화면에는 항상 출처(관광공사)·확인 시각·신뢰 등급 B와 함께 원문(raw)을 같이 보여 준다. 네트워크·파일 입출력은 scripts/sync-tour-products.mjs.

import { haversineM, inKorea } from "./geo.mjs";
import { isOfficialImageUrl } from "./images.mjs";
import { nameSimilarity } from "./localdata-campgrounds.mjs";

export const TOUR_BASE = "https://apis.data.go.kr/B551011/KorService2";
export const STAY_TYPE = "32";
export const CAMPSITE = { contentTypeId: "28", cat1: "A03", cat2: "A0302", cat3: "A03021700" };

export const SOURCE = {
  name: "한국관광공사 TourAPI 4.0(KorService2) 숙박·야영장 상세정보(detailInfo2)·이미지(detailImage2)",
  url: "https://www.data.go.kr/data/15101578/openapi.do",
  tier: "B",
  license_note:
    "공공누리(한국관광공사). 사진은 항목별 저작권 유형(cpyrhtDivCd: Type1=출처표시, Type3=출처표시+변경금지)을 지켜 출처 ‘한국관광공사’를 표시하고, " +
    "Type3는 자르기·합성 등 변경 없이 사용한다. 요금은 운영자가 등록한 공식 등록 기준가(최소 요금)로 실시간 판매가·잔여 재고가 아니다.",
};

export const DEFAULTS = Object.freeze({ listTtlDays: 7, detailTtlDays: 14, maxCalls: 600 });

/** 글램핑·카라반·캠핑형 숙소(느슨한 150m 규칙을 적용할 대상) */
export const CAMPLIKE_RE = /글램핑|카라반|캠핑|캠프|야영|오토|트레일러|텐트|camp|glamp/i;

const clean = (v) => {
  const t = String(v ?? "")
    .replace(/<br\s*\/?>/gi, "\n").replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&amp;/g, "&")
    .replace(/[ \t]+/g, " ").replace(/\n\s*/g, "\n").trim();
  return t || null;
};
const num = (v) => { const n = Number(v); return Number.isFinite(n) && n !== 0 ? n : null; };
const isStaleAt = (iso, days, now) => !iso || !Number.isFinite(Date.parse(iso)) || (now - Date.parse(iso)) / 864e5 > days;
export const isStale = (iso, days, now = Date.now()) => isStaleAt(iso, days, now);

export const tourDetailUrl = (contentid) => `https://korean.visitkorea.or.kr/detail/ms_detail.do?cotid=${contentid}`;

/** 요청 URL(serviceKey 제외 — fetchDataGoKr가 붙인다) */
export function tourUrl(op, params) {
  const q = new URLSearchParams({ MobileOS: "ETC", MobileApp: "moyeora", _type: "json", ...Object.fromEntries(Object.entries(params).map(([k, v]) => [k, String(v)])) });
  return `${TOUR_BASE}/${op}?${q}`;
}
export const stayListUrl = (pageNo, numOfRows = 1000) => tourUrl("areaBasedList2", { numOfRows, pageNo, arrange: "C", contentTypeId: STAY_TYPE });
export const campsiteListUrl = (pageNo, numOfRows = 1000) => tourUrl("areaBasedList2", { numOfRows, pageNo, arrange: "C", ...CAMPSITE });
export const detailInfoUrl = (contentid, contentTypeId) => tourUrl("detailInfo2", { contentId: contentid, contentTypeId, numOfRows: 100, pageNo: 1 });
export const detailImageUrl = (contentid) => tourUrl("detailImage2", { contentId: contentid, imageYN: "Y", numOfRows: 100, pageNo: 1 });

/** 일일 한도·인증 오류처럼 더 부르면 안 되는 오류 */
export const isQuotaError = (msg) => /LIMITED_NUMBER_OF_SERVICE_REQUESTS|EXCEEDS|한도|SERVICE_KEY|UNREACHABLE/i.test(String(msg ?? ""));

/** TourAPI JSON 본문 → {items, total}. XML 오류 응답·헤더 오류는 throw(메시지에 원인 코드 포함). */
export function parseTourBody(text, status = 200) {
  let j;
  try { j = JSON.parse(text); } catch { throw new Error(`TourAPI HTTP ${status} ${String(text).slice(0, 200).replace(/\s+/g, " ")}`); }
  const header = j?.response?.header;
  if (header?.resultCode && !/^0+$/.test(String(header.resultCode))) throw new Error(`TourAPI ${header.resultCode} ${header.resultMsg ?? ""}`.trim());
  const body = j?.response?.body;
  if (!body) throw new Error(`TourAPI ${JSON.stringify(header ?? j).slice(0, 200)}`);
  const raw = body.items?.item ?? [];
  return { items: (Array.isArray(raw) ? raw : [raw]).filter((x) => x && typeof x === "object"), total: Number(body.totalCount ?? 0) };
}

/** 목록 항목 → {contentid, type, title, addr, lat, lng, cat3}. 좌표가 없거나 국외면 null. */
export function normalizeListItem(it, fallbackType = null) {
  const lat = num(it?.mapy), lng = num(it?.mapx);
  if (!it?.contentid || !inKorea(lat, lng)) return null;
  return {
    contentid: String(it.contentid),
    type: String(it.contenttypeid ?? fallbackType ?? ""),
    title: clean(it.title),
    addr: clean([it.addr1, it.addr2].filter(Boolean).join(" ")),
    lat, lng,
    cat3: clean(it.cat3),
  };
}

/** 야영장 목록에서 야영장(cat3 A03021700)만 남긴다(cat 파라미터가 무시되는 경우 대비). */
export const onlyCampsites = (items) => items.filter((t) => t && t.type === CAMPSITE.contentTypeId && (!t.cat3 || t.cat3 === CAMPSITE.cat3));

/**
 * 고캠핑 ↔ TourAPI(숙박 32 + 야영장 28) 1:1 매칭.
 * 후보: (1km 이내 & 이름 유사도 ≥ 0.6) 또는 (캠핑형 숙소·야영장이고 150m 이내 & 유사도 ≥ 0.4).
 * 단, 캠핑형이 아닌 숙박(호텔·펜션 등)은 이름이 정규화 후 완전히 같을 때(유사도 1)만 — “강변호텔”이 “강변야영장”에 포함 관계(0.9)로 붙는 오연결 방지.
 * 점수 = 유사도 − 거리/5000(1km당 −0.2), 야영장(28)·캠핑형 숙소는 +0.05. 전체 후보를 점수순으로 탐욕 배정해 양쪽 모두 1:1.
 * @param {{id:string,name:string,lat:number,lng:number}[]} gocamping
 * @param {{contentid:string,type:string,title:string,lat:number,lng:number}[]} tourItems
 * @returns {Map<string, {gocamping_id, contentid, type, title, score, distance_m, name_similarity}>}
 */
export function matchProducts(gocamping, tourItems, { maxM = 1000, minSim = 0.6, nearM = 150, nearSim = 0.4 } = {}) {
  const cells = new Map();
  const cellKey = (lat, lng) => `${Math.floor(lat / 0.02)}:${Math.floor(lng / 0.02)}`;
  for (const g of gocamping) {
    if (!Number.isFinite(g.lat) || !Number.isFinite(g.lng)) continue;
    const k = cellKey(g.lat, g.lng);
    if (!cells.has(k)) cells.set(k, []);
    cells.get(k).push(g);
  }
  const pairs = [];
  for (const t of tourItems) {
    if (!t || !Number.isFinite(t.lat) || !Number.isFinite(t.lng)) continue;
    const campLike = t.type === CAMPSITE.contentTypeId || CAMPLIKE_RE.test(t.title ?? "");
    const ci = Math.floor(t.lat / 0.02), cj = Math.floor(t.lng / 0.02);
    for (let di = -1; di <= 1; di++) for (let dj = -1; dj <= 1; dj++) {
      for (const g of cells.get(`${ci + di}:${cj + dj}`) ?? []) {
        const d = haversineM(g.lat, g.lng, t.lat, t.lng);
        if (d > maxM) continue;
        const s = nameSimilarity(g.name, t.title);
        if (!campLike && s < 1) continue;
        if (!((s >= minSim && d <= maxM) || (campLike && s >= nearSim && d <= nearM))) continue;
        const score = s - d / 5000 + (campLike ? 0.05 : 0);
        pairs.push({ gocamping_id: String(g.id), contentid: t.contentid, type: t.type, title: t.title, score: Math.round(score * 1000) / 1000, distance_m: Math.round(d), name_similarity: Math.round(s * 100) / 100 });
      }
    }
  }
  pairs.sort((a, b) => b.score - a.score || a.distance_m - b.distance_m || a.contentid.localeCompare(b.contentid));
  const byCamp = new Map(), usedTour = new Set();
  for (const p of pairs) {
    if (byCamp.has(p.gocamping_id) || usedTour.has(p.contentid)) continue;
    byCamp.set(p.gocamping_id, p);
    usedTour.add(p.contentid);
  }
  return byCamp;
}

/** 요금 문자열 → 원 단위 숫자(0·빈값·이상치는 null). “50,000”, “50000원”, “5만원”, “5.5만” 지원. */
export function parsePrice(v) {
  const s = String(v ?? "").replace(/\s/g, "");
  if (!s) return null;
  const man = s.match(/^(\d+(?:\.\d+)?)만(\d{1,4})?원?$/);
  let n;
  if (man) n = Math.round(Number(man[1]) * 10000) + (man[2] ? Number(man[2]) : 0);
  else {
    const m = s.match(/^(\d{1,3}(?:,\d{3})+|\d+)원?$/);
    if (!m) return null;
    n = Number(m[1].replace(/,/g, ""));
  }
  return Number.isFinite(n) && n >= 1000 && n <= 5_000_000 ? n : null;
}

/** 객실 편의시설 플래그(Y/N) → 한국어 라벨 */
export const ROOM_AMENITIES = {
  roombathfacility: "목욕시설", roombath: "욕조", roomhometheater: "홈시어터", roomaircondition: "에어컨", roomtv: "TV",
  roompc: "PC", roomcable: "케이블TV", roominternet: "인터넷", roomrefrigerator: "냉장고", roomtoiletries: "세면도구",
  roomsofa: "소파", roomcook: "취사용품", roomtable: "테이블", roomhairdryer: "드라이기",
};
const yes = (v) => /^(y|yes|1|true|있음|가능|o)$/i.test(String(v ?? "").trim());
const intOrNull = (v) => { const n = parseInt(String(v ?? "").replace(/[^\d]/g, ""), 10); return Number.isFinite(n) && n > 0 ? n : null; };

/** 사진 URL 정규화: 공식 호스트(visitkorea·gocamping)만, http→https. */
export function officialPhotoUrl(url) {
  const s = String(url ?? "").trim();
  if (!s || !isOfficialImageUrl(s)) return null;
  return s.replace(/^http:\/\//i, "https://");
}

/** 크기: roomsize1(평)·roomsize2(㎡) → “10평 · 33㎡” */
function roomSize(it) {
  const p = num(String(it.roomsize1 ?? "").replace(/[^\d.]/g, "")), m = num(String(it.roomsize2 ?? "").replace(/[^\d.]/g, ""));
  return { text: [p ? `${p}평` : null, m ? `${m}㎡` : null].filter(Boolean).join(" · ") || null, pyeong: p, m2: m };
}

/** detailInfo2(32) 객실 행 → 상품 */
export function normalizeRoom(it) {
  const name = clean(it.roomtitle);
  if (!name) return null;
  const rawPrice = {
    off_weekday: clean(it.roomoffseasonminfee1), off_weekend: clean(it.roomoffseasonminfee2),
    peak_weekday: clean(it.roompeakseasonminfee1), peak_weekend: clean(it.roompeakseasonminfee2),
  };
  const price = Object.fromEntries(Object.entries(rawPrice).map(([k, v]) => [k, parsePrice(v)]));
  const photos = [], photo_meta = [];
  for (let i = 1; i <= 5; i++) {
    const url = officialPhotoUrl(it[`roomimg${i}`]);
    if (!url || photos.includes(url)) continue;
    photos.push(url);
    photo_meta.push({ url, alt: clean(it[`roomimg${i}alt`]), license: clean(it[`cpyrhtDivCd${i}`]) });
  }
  const size = roomSize(it);
  return {
    name,
    code: clean(it.roomcode),
    size: size.text, size_pyeong: size.pyeong, size_m2: size.m2,
    count: intOrNull(it.roomcount), base: intOrNull(it.roombasecount), max: intOrNull(it.roommaxcount),
    price, price_raw: rawPrice, price_basis: "공식 등록 기준가(최소 요금)",
    intro: clean(it.roomintro),
    amenities: Object.entries(ROOM_AMENITIES).filter(([k]) => yes(it[k])).map(([, label]) => label),
    photos, photo_meta,
  };
}

/** detailInfo2(28 등) 일반 행 → {name, text} */
export function normalizeInfoRow(it) {
  const name = clean(it.infoname), text = clean(it.infotext);
  return name && text ? { name, text } : null;
}

/** detailInfo2 응답 항목들 → {products, info}. 객실 행과 일반 행이 섞여도 각자 분류. 같은 상품명·코드 중복 제거. */
export function normalizeDetailInfo(items) {
  const products = [], info = [], seen = new Set();
  const rows = [...(items ?? [])].sort((a, b) => Number(a?.serialnum ?? a?.roomcode ?? 0) - Number(b?.serialnum ?? b?.roomcode ?? 0));
  for (const it of rows) {
    if (!it || typeof it !== "object") continue;
    if (it.roomtitle != null && clean(it.roomtitle)) {
      const p = normalizeRoom(it);
      const k = `${p.code ?? ""}|${p.name}`;
      if (!seen.has(k)) { seen.add(k); products.push(p); }
    } else {
      const r = normalizeInfoRow(it);
      if (r && !info.some((x) => x.name === r.name && x.text === r.text)) info.push(r);
    }
  }
  return { products, info };
}

/** detailImage2 → [{url, thumb, title, license}] (공식 호스트만, 중복 제거) */
export function normalizeImages(items) {
  const out = [], seen = new Set();
  const rows = [...(items ?? [])].sort((a, b) => Number(a?.serialnum ?? 0) - Number(b?.serialnum ?? 0));
  for (const it of rows) {
    const url = officialPhotoUrl(it?.originimgurl);
    if (!url || seen.has(url)) continue;
    seen.add(url);
    out.push({ url, thumb: officialPhotoUrl(it.smallimageurl), title: clean(it.imgname), license: clean(it.cpyrhtDivCd) });
  }
  return out;
}

/**
 * 이번 실행에서 부를 상세 호출 목록. 처음 보는 것 → 오래된 것 순. 한 시설에 2건(detailInfo2·detailImage2).
 * @returns {{contentid:string,type:string,ops:("info"|"image")[]}[]} 총 호출 수가 maxCalls를 넘지 않게 자른다.
 */
export function planDetailCalls(matches, cache, { now = Date.now(), ttlDays = DEFAULTS.detailTtlDays, maxCalls = DEFAULTS.maxCalls } = {}) {
  const todo = [];
  for (const m of matches) {
    const c = cache?.[m.contentid];
    const ops = [];
    if (isStaleAt(c?.info_fetched_at, ttlDays, now)) ops.push("info");
    if (isStaleAt(c?.image_fetched_at, ttlDays, now)) ops.push("image");
    if (ops.length) todo.push({ contentid: m.contentid, type: m.type, ops, age: Math.min(...ops.map((o) => Date.parse(c?.[`${o}_fetched_at`] ?? "") || 0)) });
  }
  todo.sort((a, b) => a.age - b.age || a.contentid.localeCompare(b.contentid));
  const out = [];
  let used = 0;
  for (const t of todo) {
    if (used + t.ops.length > maxCalls) { if (used < maxCalls) { out.push({ contentid: t.contentid, type: t.type, ops: t.ops.slice(0, maxCalls - used) }); used = maxCalls; } break; }
    out.push({ contentid: t.contentid, type: t.type, ops: t.ops });
    used += t.ops.length;
  }
  return out;
}

/** 매칭 + 상세 캐시 → 출력 레코드(상세가 하나도 없으면 생략) */
export function buildRecord(match, cached) {
  if (!cached || (!cached.info_fetched_at && !cached.image_fetched_at)) return null;
  const checked = [cached.info_fetched_at, cached.image_fetched_at].filter(Boolean).sort()[0];
  return {
    tour_id: match.contentid,
    tour_type: match.type,
    tour_title: match.title ?? null,
    matched: { score: match.score, distance_m: match.distance_m, name_similarity: match.name_similarity },
    checked_at: checked,
    source_url: tourDetailUrl(match.contentid),
    products: cached.products ?? [],
    info: cached.info ?? [],
    photos: cached.photos ?? [],
  };
}

/** 커버리지 요약 */
export function coverage(records) {
  const rs = Object.values(records);
  const hasPrice = (p) => Object.values(p.price ?? {}).some((v) => v != null);
  return {
    matched: rs.length,
    with_products: rs.filter((r) => r.products.length).length,
    with_prices: rs.filter((r) => r.products.some(hasPrice)).length,
    with_product_photos: rs.filter((r) => r.products.some((p) => p.photos.length)).length,
    with_photos: rs.filter((r) => r.photos.length).length,
    with_fee_info: rs.filter((r) => r.info.some((i) => /요금/.test(i.name))).length,
    products: rs.reduce((n, r) => n + r.products.length, 0),
    photos: rs.reduce((n, r) => n + r.photos.length, 0),
  };
}
