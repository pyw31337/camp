// ‘여행 참고 정보’(Phase 2) 공통 로직 — 순수 함수. 네트워크·파일은 scripts/sync-trip-extras.mjs.
import { GridIndex, haversineM } from "./geo.mjs";
import { sidoShort } from "./conditions.mjs";

export const FEST_RADIUS_M = 30000;
export const FEST_WINDOW_DAYS = 45;
export const EV_RADIUS_M = 10000;
export const MATCH_RADIUS_M = 300; // 관광공사 목록의 야영장 좌표 ↔ 고캠핑 좌표

const ymd = (s) => (/^\d{8}$/.test(String(s ?? "")) ? `${s.slice(0, 4)}-${s.slice(4, 6)}-${s.slice(6, 8)}` : null);
const num = (v) => (v === "" || v == null ? NaN : Number(v));
/** TourAPI 목록 항목 → {id, title, lat, lng, ...} (좌표 없으면 null) */
export function tourPoint(it) {
  const lat = num(it?.mapy), lng = num(it?.mapx);
  if (!Number.isFinite(lat) || !Number.isFinite(lng) || lat < 32 || lat > 39.5) return null;
  return { id: String(it.contentid), title: String(it.title ?? "").trim(), lat, lng, cat3: it.cat3 ?? null, addr: it.addr1 || null, img: it.firstimage || null };
}
/** searchFestival2 항목 → 축제 (기간이 오늘~window 안에 걸치는 것만) */
export function festivalOf(it, today, windowDays = FEST_WINDOW_DAYS) {
  const p = tourPoint(it);
  const s = ymd(it?.eventstartdate), e = ymd(it?.eventenddate) ?? s;
  if (!p || !s) return null;
  const until = new Date(Date.parse(`${today}T00:00:00Z`) + windowDays * 864e5).toISOString().slice(0, 10);
  if (e < today || s > until) return null;
  return { ...p, s, e };
}
/** 캠핑장별 반경 안 축제 id(시작일 순, 최대 limit) */
export function festivalsNear(camp, festIdx, limit = 3, radiusM = FEST_RADIUS_M) {
  return festIdx.within(camp.lat, camp.lng, radiusM)
    .sort((a, b) => a.point.s.localeCompare(b.point.s) || a.distance_m - b.distance_m)
    .slice(0, limit).map((h) => [h.point.id, Math.round(h.distance_m / 100) / 10]);
}
/** OSM 추출본 요소 → 충전소 점 */
export function chargersOf(elements = []) {
  // access=private·customers·residents(입주민 전용 등)는 외부인이 못 쓴다
  return elements.filter((e) => e?.tags?.amenity === "charging_station" && Number.isFinite(e.lat) && Number.isFinite(e.lon) && !/^(private|customers|residents|no|permit)$/.test(e.tags.access ?? ""))
    .map((e) => ({ lat: e.lat, lng: e.lon, name: e.tags.name || e.tags.operator || e.tags.brand || null, fast: osmFast(e.tags) }));
}
/** OSM 태그로 본 급속 여부: DC 커넥터(CCS·차데모·테슬라)가 있으면 true, 완속 커넥터만 있으면 false, 모르면 null */
function osmFast(t = {}) {
  const has = (k) => Object.keys(t).some((x) => x.startsWith(`socket:${k}`) && t[x] !== "no" && t[x] !== "0");
  if (has("type2_combo") || has("chademo") || has("tesla_supercharger") || has("type1_combo")) return true;
  if (has("type2") || has("type1") || has("schuko")) return false;
  return null;
}
export const EV_NEAREST = 3;
/**
 * 가까운 충전소 [5km 안 개수, [[이름|null, km, 급속(1/0/null), 위도, 경도], ...최대 3곳]]
 * 같은 충전소가 겹쳐 올라온 경우(30m 안, 이름 같음)는 하나로 센다.
 */
export function nearestCharger(camp, evIdx) {
  const hits = evIdx.within(camp.lat, camp.lng, EV_RADIUS_M).sort((a, b) => a.distance_m - b.distance_m);
  if (!hits.length) return null;
  const picked = [];
  for (const h of hits) {
    if (picked.some((x) => x.point.name === h.point.name && haversineM(x.point.lat, x.point.lng, h.point.lat, h.point.lng) < 30)) continue;
    picked.push(h);
    if (picked.length >= EV_NEAREST) break;
  }
  const r5 = (v) => Math.round(v * 1e5) / 1e5;
  return [hits.filter((h) => h.distance_m <= 5000).length,
    picked.map(({ point: p, distance_m }) => [p.name ?? null, Math.round(distance_m / 100) / 10, p.fast == null ? null : p.fast ? 1 : 0, r5(p.lat), r5(p.lng)])];
}
const norm = (s) => String(s ?? "").replace(/\(.*?\)|\[.*?\]|\s|오토|캠핑장|야영장|캠프|글램핑|카라반/g, "").toLowerCase();
/** 관광공사 목록(반려동물·무장애)에서 같은 캠핑장으로 보이는 항목: 300m 안이고 이름이 겹치거나 50m 안 */
export function matchTourList(camp, idx) {
  const n = norm(camp.name);
  for (const h of idx.within(camp.lat, camp.lng, MATCH_RADIUS_M).sort((a, b) => a.distance_m - b.distance_m)) {
    const m = norm(h.point.title);
    if (h.distance_m <= 50 || (n && m && (n.includes(m) || m.includes(n)))) return h.point;
  }
  return null;
}
/** 반려동물 동반 상세(detailPetTour2)에서 화면에 쓸 문장만 */
export const PET_FIELDS = { acmpyTypeCd: "동반 구분", acmpyPsblCpam: "동반 가능 동물", acmpyNeedMtr: "동반 시 필요 사항", etcAcmpyInfo: "기타 동반 정보", relaPosesFclty: "관련 구비 시설" };
export function petDetail(item) {
  const out = {};
  for (const [k, label] of Object.entries(PET_FIELDS)) {
    const v = String(item?.[k] ?? "").replace(/<br\s*\/?>/gi, " ").replace(/<[^>]+>/g, "").replace(/\s+/g, " ").trim();
    if (v) out[label] = v.slice(0, 200);
  }
  return Object.keys(out).length ? out : null;
}
/** 법정동 시군구 목록(ldongCode2 lDongListYn=Y) → "시도키|시군구" → 5자리 코드 */
export function ldongIndex(items = []) {
  const m = new Map();
  for (const it of items) {
    const sido = sidoShort(it.lDongRegnNm), sgg = String(it.lDongSignguNm ?? "").trim();
    if (!sido || !sgg || !it.lDongRegnCd || !it.lDongSignguCd) continue;
    const code = `${it.lDongRegnCd}${String(it.lDongSignguCd).padStart(3, "0")}`;
    m.set(`${sido}|${sgg}`, code);
    m.set(`${sido}|${sgg.split(/\s+/)[0]}`, m.get(`${sido}|${sgg.split(/\s+/)[0]}`) ?? code); // “청주시 상당구” → “청주시”
  }
  return m;
}
export function sigunguCode(camp, idx) {
  const sido = sidoShort(camp.sido), sgg = String(camp.sigungu ?? "").trim();
  return idx.get(`${sido}|${sgg}`) ?? idx.get(`${sido}|${sgg.split(/\s+/)[0]}`) ?? null;
}
/** 집중률 응답 → {date: 평균 집중률(관광지 평균, 0~100)} */
export function concentrationByDay(items = []) {
  const acc = {};
  for (const it of items) {
    const d = ymd(it?.baseYmd), r = num(it?.cnctrRate);
    if (!d || !Number.isFinite(r)) continue;
    (acc[d] ??= []).push(r);
  }
  return Object.fromEntries(Object.entries(acc).sort().map(([d, v]) => [d, Math.round(v.reduce((a, b) => a + b, 0) / v.length)]));
}
/** 산사태 예측(predictionInfoList) → 시군구명 → 가장 최근 단계(분석 시각이 maxAgeH 안인 것만) */
export function landslideBySgg(items = [], nowMs = Date.now(), maxAgeH = 12) {
  const out = {};
  for (const it of items) {
    const sgg = String(it?.sgg ?? "").trim(), lv = String(it?.lndslFrcstNm ?? "").replace(/\s+/g, "");
    const at = Date.parse(String(it?.prctnInfoAnlssDt ?? "").replace(" ", "T") + "+09:00");
    if (!sgg || !lv || !Number.isFinite(at) || nowMs - at > maxAgeH * 3600e3) continue;
    if (!out[sgg] || at > out[sgg].at) out[sgg] = { level: lv, at };
  }
  return out;
}
/** 산사태 시군구 키("경상북도 안동시") ↔ 캠핑장(sidoShort, sigungu) */
export function landslideFor(bySgg, sido, sigungu) {
  if (!sigungu) return null;
  const sg = String(sigungu).split(/\s+/)[0];
  for (const [k, v] of Object.entries(bySgg)) {
    const [s0, ...rest] = k.split(/\s+/);
    if (sidoShort(s0) === sido && (rest.join(" ") === sigungu || rest[0] === sg)) return v;
  }
  return null;
}
export { GridIndex, haversineM };
