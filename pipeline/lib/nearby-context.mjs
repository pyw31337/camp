// 캠핑장 주변 “캠핑에 실제로 필요한” 맥락: 관광지·음식점(TourAPI), 마트·편의점·주유소·약국·병원(OSM), 휴게소·졸음쉼터.
// 이 파일은 순수 함수만 둔다(네트워크·파일 입출력은 scripts/sync-nearby-context.mjs).
// 거리는 모두 직선거리(m)이며 도로 거리·소요 시간이 아니다. 영업 여부·영업시간은 원천에서 보장하지 않는다.

import { GridIndex, inKorea } from "./geo.mjs";
import { normalizePublicPoi } from "./kdata-public.mjs";

export const TOUR_BASE = "https://apis.data.go.kr/B551011/KorService2";
// 12 관광지, 14 문화시설, 28 레포츠, 38 쇼핑, 39 음식점
export const TOUR_TYPES = { "12": "관광지", "14": "문화시설", "28": "레포츠", "38": "쇼핑", "39": "음식점" };
export const TOUR_CAMPSITE_CAT3 = "A03021700"; // 야영장 자체는 ‘주변 관광’에서 뺀다.

export const OSM_ATTRIBUTION = "© OpenStreetMap contributors (ODbL)";

export const SOURCES = {
  tour: { id: "tourapi-kor2", name: "한국관광공사 TourAPI 4.0(KorService2) 지역기반 관광정보", url: "https://www.data.go.kr/data/15101578/openapi.do", tier: "B", license: "공공누리(한국관광공사) — 이미지 이용 조건은 항목별 cpyrhtDivCd 확인" },
  osm: { id: "osm-shops", name: "OpenStreetMap(Overpass API) 마트·편의점·주유소·약국·병원", url: "https://www.openstreetmap.org/copyright", tier: "C", license: `ODbL 1.0 — ${OSM_ATTRIBUTION}` },
  rest: { id: "rest-stops", name: "휴게소·졸음쉼터(한국도로공사·전국졸음쉼터표준데이터·OpenStreetMap)", url: "https://github.com/pyw31337/camp/blob/main/pipeline/scripts/sync-rest-stops.mjs", tier: "B", license: `공공데이터 이용 조건 · ${OSM_ATTRIBUTION}` },
  public: { id: "kdata-public", name: "알잘 공공데이터 공개 색인(공공시설 발견·원문 연결)", url: "https://k-data.aljal.kr/", tier: "C", license: "원문 공개 데이터의 링크·좌표·요약 필드만 사용" },
};

const clean = (v) => {
  const t = String(v ?? "").replace(/<[^>]+>/g, " ").replace(/&nbsp;/g, " ").replace(/&amp;/g, "&").replace(/\s+/g, " ").trim();
  return t || null;
};
const num = (v) => { const n = Number(v); return Number.isFinite(n) && n !== 0 ? n : null; };

// ─── TourAPI ───────────────────────────────────────────────────────────────

/** areaBasedList2 요청 URL(serviceKey 제외 — fetchDataGoKr가 붙인다) */
export function tourListUrl(contentTypeId, pageNo, numOfRows = 1000) {
  const q = new URLSearchParams({ MobileOS: "ETC", MobileApp: "moyeora", _type: "json", arrange: "C", contentTypeId: String(contentTypeId), numOfRows: String(numOfRows), pageNo: String(pageNo) });
  return `${TOUR_BASE}/areaBasedList2?${q}`;
}

/** TourAPI JSON 본문 → {items, total}. 오류 응답이면 throw(메시지에 한도 초과 여부가 드러나게). */
export function parseTourBody(text, status = 200) {
  let j;
  try { j = JSON.parse(text); } catch { throw new Error(`TourAPI HTTP ${status} ${String(text).slice(0, 160).replace(/\s+/g, " ")}`); }
  const body = j?.response?.body;
  if (!body) throw new Error(`TourAPI ${JSON.stringify(j?.response?.header ?? j).slice(0, 200)}`);
  const raw = body.items?.item ?? [];
  return { items: Array.isArray(raw) ? raw : [raw], total: Number(body.totalCount ?? 0) };
}

/** 목록 항목 → {id, type, title, addr, lat, lng, image, tel, cat3}. 좌표가 없거나 국외면 null. */
export function normalizeTourPoi(it) {
  const lat = num(it?.mapy), lng = num(it?.mapx);
  if (!inKorea(lat, lng)) return null;
  return {
    id: String(it.contentid),
    type: String(it.contenttypeid ?? ""),
    title: clean(it.title),
    addr: clean([it.addr1, it.addr2].filter(Boolean).join(" ")),
    lat, lng,
    image: clean(it.firstimage2) || clean(it.firstimage) || null,
    tel: clean(it.tel),
    cat3: clean(it.cat3),
  };
}

export const tourDetailUrl = (contentid) => `https://korean.visitkorea.or.kr/detail/ms_detail.do?cotid=${contentid}`;

// ─── OpenStreetMap(Overpass) ───────────────────────────────────────────────

export const OSM_SHOP_TAGS = ["supermarket", "convenience", "butcher", "greengrocer", "hardware", "outdoor"];
export const OSM_AMENITY_TAGS = ["fuel", "pharmacy", "hospital"];

/** 대한민국 대략 범위(남, 서, 북, 동) */
export const KR_BBOX = [33.0, 124.5, 38.7, 131.0];

/**
 * 범위를 step° 격자 타일로 나눈다. points가 주어지면 각 점에서 marginDeg 안에 걸치는 타일만 남긴다
 * (바다·북한 지역 타일을 건너뛰어 호출 수를 줄인다).
 * @returns {{key: string, bbox: [number, number, number, number]}[]}
 */
export function buildTiles({ bbox = KR_BBOX, step = 0.5, points = null, marginDeg = 0.25 } = {}) {
  const [s, w, n, e] = bbox;
  const r = (x) => Math.round(x * 1e6) / 1e6;
  const tiles = [];
  for (let lat = s; lat < n - 1e-9; lat += step) {
    for (let lng = w; lng < e - 1e-9; lng += step) {
      const t = [r(lat), r(lng), r(Math.min(lat + step, n)), r(Math.min(lng + step, e))];
      tiles.push({ key: `${t[0].toFixed(2)},${t[1].toFixed(2)}`, bbox: t });
    }
  }
  if (!points) return tiles;
  const pts = points.filter((p) => Number.isFinite(p?.lat) && Number.isFinite(p?.lng));
  return tiles.filter(({ bbox: [ts, tw, tn, te] }) => pts.some((p) => p.lat >= ts - marginDeg && p.lat <= tn + marginDeg && p.lng >= tw - marginDeg && p.lng <= te + marginDeg));
}

/** 타일 하나의 Overpass QL */
export function overpassShopQuery([s, w, n, e], timeoutSec = 90) {
  const b = `(${s},${w},${n},${e})`;
  return `[out:json][timeout:${timeoutSec}];(nwr["shop"~"^(${OSM_SHOP_TAGS.join("|")})$"]${b};nwr["amenity"~"^(${OSM_AMENITY_TAGS.join("|")})$"]${b};);out center tags;`;
}

/** OSM 태그 → 화면 분류 */
export function osmKind(tags = {}) {
  const shop = tags.shop, amenity = tags.amenity;
  if (amenity === "fuel") return "fuel";
  if (amenity === "pharmacy") return "pharmacy";
  if (amenity === "hospital") return "hospital";
  if (shop === "convenience") return "convenience";
  if (shop === "supermarket") return "supermarket";
  if (shop === "butcher") return "butcher";
  if (shop === "greengrocer") return "greengrocer";
  if (shop === "hardware" || shop === "outdoor") return shop;
  return null;
}

/** Overpass 요소 → 캐시용 압축 레코드 {id, kind, name, lat, lng, brand, emergency, hours}. */
export function normalizeOsmShop(el) {
  const lat = el?.lat ?? el?.center?.lat;
  const lng = el?.lon ?? el?.center?.lon;
  if (!inKorea(lat, lng)) return null;
  const t = el.tags ?? {};
  const kind = osmKind(t);
  if (!kind) return null;
  const brand = t["brand:ko"] || t.brand || t.operator || null;
  const out = {
    id: `osm-${el.type}-${el.id}`,
    kind,
    name: t["name:ko"] || t.name || brand || null,
    lat: Math.round(lat * 1e6) / 1e6,
    lng: Math.round(lng * 1e6) / 1e6,
  };
  if (brand) out.brand = brand;
  if (t.opening_hours) out.hours = t.opening_hours;
  if (kind === "hospital") out.emergency = t.emergency === "yes" ? true : t.emergency === "no" ? false : null;
  return out;
}

/** 같은 OSM id가 여러 타일에 걸쳐 나오면 하나만 남긴다. */
export function dedupeById(items) {
  const seen = new Map();
  for (const it of items) if (it && !seen.has(it.id)) seen.set(it.id, it);
  return [...seen.values()];
}

// ─── 휴게소·졸음쉼터 ──────────────────────────────────────────────────────

/** out/rest-stops.json의 stops → {id, kind, name, lat, lng, road} */
export function normalizeRestStop(s) {
  if (!s || !inKorea(s.lat, s.lng)) return null;
  const out = { id: String(s.id), kind: s.kind ?? "REST", name: s.name ?? null, lat: s.lat, lng: s.lng, road: s.road ?? null };
  if (s.address) out.address = s.address;
  if (s.facilities && typeof s.facilities === "object" && Object.keys(s.facilities).length) out.facilities = s.facilities;
  if (s.fuel) out.fuel = s.fuel;
  if (Array.isArray(s.best_foods) && s.best_foods.length) out.best_foods = s.best_foods.slice(0, 5);
  return out;
}

// ─── 주변 계산 ────────────────────────────────────────────────────────────

/** 반경·개수 규칙(직선거리). 바꾸면 기획·인수인계 문서도 갱신한다. */
export const NEARBY_RULES = {
  tour: { radius_m: 20000, limit: 5 },
  food: { radius_m: 10000, limit: 3 },
  mart: { radius_m: 15000, limit: 3 },
  conv: { radius_m: 5000, limit: 2 },
  fuel: { radius_m: 15000, limit: 2 },
  gear: { radius_m: 20000, limit: 2 },
  medical: { radius_m: 20000 },
  rest: { radius_m: 40000, limit: 3 },
  public: { radius_m: 30000, limit: 3 },
};

const toItem = ({ point: p, distance_m }, source, extra = {}) => {
  const o = { name: p.name ?? p.title ?? null, kind: p.kind, distance_m, lat: p.lat, lng: p.lng, source, source_id: p.id, ...extra };
  for (const k of Object.keys(o)) if (o[k] == null) delete o[k];
  return o;
};

/**
 * POI 목록으로 분류별 격자 색인을 만든다.
 * @param {{tour?: object[], osm?: object[], rest?: object[]}} pois 정규화된 레코드
 */
export function buildNearbyIndexes({ tour = [], osm = [], rest = [], public: publicPois = [] } = {}) {
  const sightseeing = [], shopping = [], food = [];
  for (const p of tour) {
    if (!p || p.cat3 === TOUR_CAMPSITE_CAT3) continue;
    const q = { ...p, kind: TOUR_TYPES[p.type] ?? p.type };
    if (p.type === "39") food.push(q);
    else if (p.type === "38") shopping.push(q);
    else if (p.type in TOUR_TYPES) sightseeing.push(q);
  }
  const by = (kinds) => new GridIndex(osm.filter((p) => p && kinds.includes(p.kind)));
  const publicIndex = new GridIndex(publicPois.map(normalizePublicPoi).filter(Boolean));
  return {
    sightseeing: new GridIndex(sightseeing),
    shopping: new GridIndex(shopping),
    food: new GridIndex(food),
    mart: by(["supermarket", "butcher", "greengrocer"]),
    conv: by(["convenience"]),
    fuel: by(["fuel"]),
    gear: by(["hardware", "outdoor"]),
    pharmacy: by(["pharmacy"]),
    hospital: by(["hospital"]),
    rest: new GridIndex(rest.filter(Boolean)),
    public: publicIndex,
  };
}

/**
 * 관광지 순위: 직선거리 기준, 대표 사진이 있으면 거리 20% 가산 혜택(목록 카드에 쓸 수 있어서).
 * 관광지·문화시설·레포츠가 limit보다 적으면 쇼핑으로 채운다.
 */
export function rankTour(sightHits, shopHits, limit) {
  const score = (h) => h.distance_m * (h.point.image ? 0.8 : 1);
  const main = [...sightHits].sort((a, b) => score(a) - score(b) || a.distance_m - b.distance_m).slice(0, limit);
  if (main.length >= limit) return main;
  return [...main, ...[...shopHits].sort((a, b) => score(a) - score(b)).slice(0, limit - main.length)];
}

/** 캠핑장 한 곳의 주변 맥락 */
export function nearbyFor(lat, lng, idx, rules = NEARBY_RULES) {
  const tourExtra = (p) => ({ type: p.type, addr: p.addr, image: p.image, tel: p.tel, url: tourDetailUrl(p.id) });
  const T = rules.tour;
  const tour = rankTour(idx.sightseeing.within(lat, lng, T.radius_m), idx.shopping.within(lat, lng, T.radius_m), T.limit)
    .map((h) => toItem(h, SOURCES.tour.id, tourExtra(h.point)));
  const food = idx.food.within(lat, lng, rules.food.radius_m, rules.food.limit).map((h) => toItem(h, SOURCES.tour.id, tourExtra(h.point)));
  const osmItem = (h) => toItem(h, SOURCES.osm.id, { brand: h.point.brand, hours: h.point.hours, emergency: h.point.emergency });
  const pick = (key) => idx[key].within(lat, lng, rules[key].radius_m, rules[key].limit).map(osmItem);
  // 의료: 가장 가까운 약국 1, 병원 1, 그 병원이 응급실 표시가 없으면 가장 가까운 응급실(emergency=yes) 1.
  const M = rules.medical.radius_m;
  const hospitals = idx.hospital.within(lat, lng, M);
  const medical = [...idx.pharmacy.within(lat, lng, M, 1), ...hospitals.slice(0, 1)];
  if (hospitals[0] && hospitals[0].point.emergency !== true) {
    const er = hospitals.find((h) => h.point.emergency === true);
    if (er) medical.push(er);
  }
  const rest = idx.rest.within(lat, lng, rules.rest.radius_m, rules.rest.limit).map((h) => toItem(h, SOURCES.rest.id, {
    road: h.point.road, addr: h.point.address,
    facts: h.point.best_foods?.length ? { 대표메뉴: h.point.best_foods.map((x) => `${x.menu}${x.price ? ` ${x.price.toLocaleString()}원` : ""}`).join(" · ") } : undefined,
  }));
  const publicByKind = {};
  for (const h of idx.public.within(lat, lng, rules.public.radius_m)) {
    const kind = h.point.kind || "public";
    (publicByKind[kind] ??= []).push(toItem(h, SOURCES.public.id, {
      addr: h.point.addr, image: h.point.image, facts: h.point.facts, url: h.point.url, source: h.point.source,
    }));
  }
  for (const rows of Object.values(publicByKind)) rows.sort((a, b) => a.distance_m - b.distance_m).splice(rules.public.limit);
  return {
    tour, food,
    mart: pick("mart"), conv: pick("conv"), fuel: pick("fuel"), gear: pick("gear"),
    medical: medical.sort((a, b) => a.distance_m - b.distance_m).map(osmItem),
    rest, ...(Object.keys(publicByKind).length ? { public: publicByKind } : {}),
  };
}

/**
 * 고캠핑 목록 전체 → {[id]: nearby}. 좌표 없는 캠핑장은 뺀다. 빈 분류 배열은 그대로 둔다(“없음”과 “미수집”은 sources로 구분).
 * @param {{external_id:{id}, location?:{lat,lng}}[]} campgrounds
 */
export function computeNearby(campgrounds, pois, rules = NEARBY_RULES) {
  const idx = buildNearbyIndexes(pois);
  const out = {};
  for (const c of campgrounds) {
    const lat = c?.location?.lat, lng = c?.location?.lng;
    if (!inKorea(lat, lng)) continue;
    out[String(c.external_id?.id ?? c.id)] = nearbyFor(lat, lng, idx, rules);
  }
  return out;
}

/** 캐시가 maxAgeDays보다 오래됐는지 */
export function isStale(fetchedAt, maxAgeDays, now = Date.now()) {
  const t = Date.parse(fetchedAt ?? "");
  return !Number.isFinite(t) || (now - t) / 864e5 > maxAgeDays;
}
