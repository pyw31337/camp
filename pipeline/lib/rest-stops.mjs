// 휴게소(SERVICE_AREA)·졸음쉼터(DROWSY_SHELTER)·간이쉼터(REST_AREA) 정규화와 시설별 유·무료 구분.
// 원천: OpenStreetMap(highway=services/rest_area), 전국졸음쉼터표준데이터 API, (키 등록 후) 한국도로공사 휴게소 API.

import { createHash } from "node:crypto";
import { GridIndex, inKorea } from "./geo.mjs";

/** 시설 → 기본 요금 성격. 원천에 fee 정보가 있으면 그 값을 쓰고, 없으면 이 기본값을 ‘일반적으로’ 표시한다. */
export const FACILITY_FEE = {
  toilet: "FREE",
  nursing: "FREE",      // 수유실
  water: "FREE",        // 급수대
  wifi: "FREE",
  parking: "FREE",
  fuel: "PAID",
  ev_charging: "PAID",
  food: "PAID",
  convenience: "PAID",  // 편의점·매점
  pharmacy: "PAID",
  laundry: "PAID",
  shower: null,         // 휴게소마다 무료/유료가 달라 원천 확인 필요
  sleep: null,          // 수면실
};
export const FACILITY_LABEL = {
  toilet: "화장실", nursing: "수유실", water: "급수대", wifi: "와이파이", parking: "주차", fuel: "주유", ev_charging: "전기차 충전",
  food: "식당", convenience: "편의점", pharmacy: "약국", laundry: "세탁실", shower: "샤워실", sleep: "수면실",
};

const yesNo = (v) => (v == null ? null : /^(yes|y|유|있음|o|1|true)$/i.test(String(v).trim()) ? true : /^(no|n|무|없음|x|0|false)$/i.test(String(v).trim()) ? false : null);
const facility = (available, feeOverride) => ({ available, fee: available === false ? null : feeOverride ?? null });

export function normalizeOsmStop(el) {
  const lat = el.lat ?? el.center?.lat;
  const lng = el.lon ?? el.center?.lon;
  if (!inKorea(lat, lng)) return null;
  const t = el.tags ?? {};
  const name = t["name:ko"] || t.name || null;
  const isService = t.highway === "services";
  const kind = isService ? "SERVICE_AREA" : /졸음/.test(name ?? "") ? "DROWSY_SHELTER" : "REST_AREA";
  const fee = (k) => (t[`${k}:fee`] === "yes" ? "PAID" : t[`${k}:fee`] === "no" ? "FREE" : FACILITY_FEE[k]);
  return {
    id: `osm-${el.type}-${el.id}`,
    kind,
    name: name ?? (kind === "SERVICE_AREA" ? "휴게소" : "쉼터"),
    lat, lng,
    road: t.ref || t["road:name"] || null,
    direction: t.direction || (name?.match(/\(([^)]*(방향|행))\)/)?.[1] ?? null),
    facilities: {
      toilet: facility(yesNo(t.toilets) ?? (isService ? true : null), fee("toilet")),
      fuel: facility(yesNo(t.fuel), FACILITY_FEE.fuel),
      ev_charging: facility(yesNo(t.charging_station ?? (t["socket:type2"] ? "yes" : null)), FACILITY_FEE.ev_charging),
      food: facility(isService ? (yesNo(t.restaurant ?? t.food) ?? true) : yesNo(t.restaurant), FACILITY_FEE.food),
      convenience: facility(yesNo(t.shop ? "yes" : null), FACILITY_FEE.convenience),
      shower: facility(yesNo(t.shower), fee("shower")),
      wifi: facility(yesNo(t.internet_access && t.internet_access !== "no" ? "yes" : t.internet_access), FACILITY_FEE.wifi),
      parking: facility(true, "FREE"),
    },
    source: { id: "osm", tier: "B", attribution: "© OpenStreetMap contributors (ODbL)" },
  };
}

/** 같은 휴게소 안의 주유소·충전소(OSM 별도 객체)를 300m 안에서 찾아 시설 정보를 채운다. */
export function enrichWithNearby(stops, pois, radiusM = 300) {
  const idx = new GridIndex(pois);
  for (const s of stops) {
    if (s.kind !== "SERVICE_AREA") continue;
    const near = idx.within(s.lat, s.lng, radiusM);
    if (near.some((n) => n.point.kind === "fuel")) s.facilities.fuel = facility(true, "PAID");
    if (near.some((n) => n.point.kind === "charging")) s.facilities.ev_charging = facility(true, "PAID");
  }
  return stops;
}

/** 전국졸음쉼터표준데이터 행(한글 또는 영문 키) → 정규화. 모든 졸음쉼터는 이용 무료. */
export function normalizeDrowsyShelter(row) {
  const get = (...names) => { for (const n of names) { const k = Object.keys(row).find((key) => key.toLowerCase() === n.toLowerCase()); if (k && row[k] !== "" && row[k] != null) return row[k]; } return null; };
  const lat = Number(get("위도", "latitude", "lat"));
  const lng = Number(get("경도", "longitude", "lng", "lot"));
  const name = get("졸음쉼터명", "drowsyShelterNm", "shltrNm", "fcltyNm");
  if (!name || !inKorea(lat, lng)) return null;
  const toilet = yesNo(get("화장실유무", "toiletYn", "toiletPosblYn"));
  const etc = get("기타편의시설", "etcCnvnncFclty", "etcFclty") ?? "";
  return {
    id: `drowsy-${createHash("sha1").update(`${name}|${lat.toFixed(5)}|${lng.toFixed(5)}`).digest("hex").slice(0, 12)}`,
    kind: "DROWSY_SHELTER",
    name,
    lat, lng,
    road: [get("도로노선명", "roadRouteNm"), get("도로노선번호", "roadRouteNo")].filter(Boolean).join(" ") || null,
    direction: get("도로노선방향", "roadRouteDrc"),
    parking_spaces: Number(get("주차면수", "prkplceCo", "parkingCo")) || null,
    facilities: {
      toilet: facility(toilet, "FREE"),
      parking: facility(true, "FREE"),
      water: facility(/급수|음수/.test(etc) ? true : null, "FREE"),
      convenience: facility(/매점|편의점|자판기/.test(etc) ? true : null, "PAID"),
    },
    etc: etc || null,
    source: { id: "drowsy-standard", tier: "A", title: "전국졸음쉼터표준데이터(한국도로공사)" },
  };
}

/** 원천 우선순위: 공식(A) > OSM(B). 같은 종류가 150m 안에서 겹치면 공식 항목을 남긴다. */
export function mergeStops(official, osm, dedupeM = 150) {
  const idx = new GridIndex(official);
  const extra = osm.filter((o) => !idx.within(o.lat, o.lng, dedupeM).some((n) => n.point.kind === o.kind || o.kind === "REST_AREA"));
  return { merged: [...official, ...extra], osm_added: extra.length, osm_duplicates: osm.length - extra.length };
}
