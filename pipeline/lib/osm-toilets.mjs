// OpenStreetMap 공중화장실(amenity=toilets) — 좌표가 있는 보조 원천.
// 라이선스: ODbL. 화면에 “© OpenStreetMap contributors” 표기가 필요하다.
// 행정안전부 데이터와 30m 안에서 겹치면 행안부 값을 우선하고 OSM 항목은 버린다.

import { GridIndex, inKorea } from "./geo.mjs";

export const OVERPASS_URL = "https://overpass-api.de/api/interpreter";
export const OVERPASS_QUERY = `[out:json][timeout:180];area["ISO3166-1"="KR"][admin_level=2]->.kr;(node["amenity"="toilets"](area.kr);way["amenity"="toilets"](area.kr););out center tags;`;

export function normalizeOsmToilet(el) {
  const lat = el.lat ?? el.center?.lat;
  const lng = el.lon ?? el.center?.lon;
  if (!inKorea(lat, lng)) return null;
  const t = el.tags ?? {};
  const hours = t.opening_hours ?? null;
  return {
    id: `osm-${el.type}-${el.id}`,
    name: t["name:ko"] || t.name || "공중화장실",
    road_address: t["addr:full"] || [t["addr:city"], t["addr:street"], t["addr:housenumber"]].filter(Boolean).join(" ") || null,
    jibun_address: null,
    open_hours: hours,
    open_24h: hours ? /^24\/7$/.test(hours.trim()) : null,
    disabled_stalls: t.wheelchair === "yes" ? 1 : 0,
    child_stalls: 0,
    emergency_bell: null,
    cctv: null,
    diaper_table: t.changing_table === "yes" ? true : t.changing_table === "no" ? false : null,
    fee: t.fee === "yes" ? true : t.fee === "no" ? false : null,
    lat, lng,
    precision: "OSM",
    source: "osm",
  };
}

/** 행안부(gov) 화장실과 30m 이내로 겹치는 OSM 항목을 빼고 합친다. */
export function mergeToiletSources(gov, osm, dedupeM = 30) {
  const located = gov.filter((t) => Number.isFinite(t.lat));
  const idx = new GridIndex(located);
  const extra = osm.filter((o) => idx.within(o.lat, o.lng, dedupeM, 1).length === 0);
  return { merged: [...gov.map((t) => ({ ...t, source: t.source ?? "mois" })), ...extra], osm_added: extra.length, osm_duplicates: osm.length - extra.length };
}
