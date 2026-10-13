// 캠핑장 ↔ 공중화장실 연계: 캠핑장마다 반경 안의 화장실을 거리순으로 붙인다.

import { GridIndex } from "./geo.mjs";

export const NEARBY_RADIUS_M = 2000;
export const NEARBY_LIMIT = 5;

/**
 * @param {{id:string, lat:number, lng:number}[]} campgrounds
 * @param {object[]} toilets lat/lng가 있는 정규화 화장실
 */
export function linkNearbyToilets(campgrounds, toilets, { radiusM = NEARBY_RADIUS_M, limit = NEARBY_LIMIT } = {}) {
  const index = new GridIndex(toilets.filter((t) => Number.isFinite(t.lat) && Number.isFinite(t.lng)));
  const result = {};
  let withAny = 0, within300 = 0;
  for (const c of campgrounds) {
    if (!Number.isFinite(c.lat) || !Number.isFinite(c.lng)) continue;
    const near = index.within(c.lat, c.lng, radiusM);
    if (near.length) withAny++;
    if (near[0]?.distance_m <= 300) within300++;
    result[c.id] = {
      count_500m: near.filter((n) => n.distance_m <= 500).length,
      count_2km: near.length,
      nearest: near.slice(0, limit).map(({ point: t, distance_m }) => ({
        toilet_id: t.id,
        name: t.name,
        distance_m,
        distance_note: t.source === "osm" ? "OpenStreetMap 좌표 기준 직선거리" : "주소 지오코딩 기준 직선거리(실제 동선·위치와 다를 수 있음)",
        open_hours: t.open_hours,
        open_24h: t.open_24h,
        disabled_stalls: t.disabled_stalls,
        diaper_table: t.diaper_table,
        emergency_bell: t.emergency_bell,
        address: t.road_address || t.jibun_address,
        geocode_precision: t.precision ?? null,
        source: t.source ?? "mois",
      })),
    };
  }
  return { byCampground: result, stats: { campgrounds: campgrounds.length, with_toilet_2km: withAny, with_toilet_300m: within300 } };
}
