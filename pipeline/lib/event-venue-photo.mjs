// 포스터가 없는 행사(국가유산청 행사 등 — CultureFlow가 공통 대체 그림만 준다)에 행사 ‘장소’의 관광공사 공식 사진을 붙인다.
// - 원천: 한국관광공사 TourAPI(KorService2 searchKeyword2), 장소 이름으로 검색. 공공데이터 키(DATA_GO_KR_SERVICE_KEY).
// - 같은 장소인지: 이름이 같거나(괄호 제거) ‘지역명 + 장소 이름’이고, 좌표가 있으면 3km 안. 비슷한 다른 시설(○○썰매장 등)은 붙이지 않는다.
// - 결과는 registry/event-venue-photos.json에 장소별로 남긴다(지우지 않는다 — DATA_MERGE_POLICY ①). 못 찾은 장소는 30일 뒤 다시 묻는다.
import { haversineM } from "./geo.mjs";
import { TOUR_BASE } from "./nearby-context.mjs";

export const VENUE_RECHECK_MISS_DAYS = 30;
export const VENUE_RECHECK_HIT_DAYS = 120;
export const VENUE_MAX_M = 3000;

/** CultureFlow 공통 대체 그림(실제 포스터 아님)인지 */
export const isTemplateImg = (u) => /\/images\/fallbacks\//.test(String(u ?? ""));
/** 비교용 이름: 괄호·공백·기호 제거 */
export const venueCore = (s) => String(s ?? "").replace(/\([^)]*\)|\[[^\]]*\]/g, "").replace(/[\s·.,\-_'"]/g, "").trim();
/** 행정구역 이름만 있는 장소(‘충청북도 음성군’)는 사진을 찾지 않는다 */
export const isRegionOnly = (v) => /^[가-힣]+(특별시|광역시|특별자치시|특별자치도|도)?(\s*[가-힣]+(시|군|구))*$/.test(String(v ?? "").trim()) && /(시|군|구|도)$/.test(String(v ?? "").trim());

export function venueSearchUrl(venue) {
  const q = new URLSearchParams({ MobileOS: "ETC", MobileApp: "moyeora", _type: "json", arrange: "A", numOfRows: "20", pageNo: "1", keyword: String(venue).trim() });
  return `${TOUR_BASE}/searchKeyword2?${q}`;
}

/**
 * TourAPI 검색 결과(원본 item 배열) → 같은 장소의 공식 사진 {img, contentid, title} 또는 null.
 * at: 행사 좌표 {lat, lng}(없으면 이름만 본다)
 */
export function pickVenuePhoto(items, venue, at = null) {
  const v = venueCore(venue);
  if (v.length < 2) return null;
  let best = null;
  for (const it of items ?? []) {
    const img = String(it?.firstimage || it?.firstimage2 || "").replace(/^http:\/\//, "https://");
    if (!/^https:\/\//.test(img)) continue;
    const t = venueCore(it.title);
    // 같은 이름, 또는 앞에 지역명만 붙은 이름(‘포항 분옥정’). ‘수승대 썰매장’처럼 뒤에 다른 말이 붙으면 다른 시설.
    const same = t === v ? 0 : t.endsWith(v) && t.length - v.length <= 4 ? 1 : -1;
    if (same < 0) continue;
    const lat = Number(it.mapy), lng = Number(it.mapx);
    const d = at && Number.isFinite(at.lat) && Number.isFinite(lat) && lat ? haversineM(at.lat, at.lng, lat, lng) : null;
    if (d != null && d > VENUE_MAX_M) continue;
    if (d == null && at && Number.isFinite(at.lat)) continue; // 행사 좌표는 있는데 장소 좌표가 없으면 확인 불가
    const score = same * 10000 + (d ?? 0);
    if (!best || score < best.score) best = { score, img, contentid: String(it.contentid ?? ""), title: String(it.title ?? "").trim() };
  }
  return best ? { img: best.img, contentid: best.contentid, title: best.title } : null;
}

/** 장소 기록이 다시 물을 때가 됐는지 */
export function venueDue(rec, now = Date.now()) {
  if (!rec?.at) return true;
  const age = (now - Date.parse(rec.at)) / 864e5;
  return rec.img ? age > VENUE_RECHECK_HIT_DAYS : age > VENUE_RECHECK_MISS_DAYS;
}

/** 장소별 기록 키: 장소 이름 + 대략 위치(같은 이름의 향교·서원이 여러 지역에 있다) */
export const venueKey = (venue, at) => `${venueCore(venue)}@${Number.isFinite(at?.lat) ? `${at.lat.toFixed(2)},${at.lng.toFixed(2)}` : "-"}`;
