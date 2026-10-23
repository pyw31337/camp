/**
 * 주변 공공시설(nearby.public) 원천 — 공공데이터포털 표준데이터(소유자 2026-10-22: k-data 색인 수집을 공공데이터포털로 교체).
 * registry/public-leisure.json(sync-public-leisure.mjs, 주간)의 휴양림·박물관미술관·수영장·실내 놀이 시설을
 * nearby-context가 쓰는 레코드 모양으로 바꾼다. 휴게소·졸음쉼터는 sync:rest-stops(도로공사·졸음쉼터 표준데이터)가 맡는다.
 * 값은 기관이 공개한 그대로(가공 없음) — 원천 URL·기준일을 함께 둔다.
 */
import { isKidsPlay, isPool } from "./leisure-filter.mjs";

const KINDS = [
  ["forests", "forest", "forest", () => true],
  ["museums", "museum", "museum", () => true],
  ["pools", "pool", "pool", (p) => isPool(p.name)],
  ["kids", "indoorplay", "kids", (p) => isKidsPlay(p.name)],
];

/** public-leisure.json → [{ id, category, kind, name, address, lat, lng, facts, source }] */
export function publicLeisureRecords(reg) {
  if (!reg) return [];
  const out = [];
  for (const [key, kind, srcKey, keep] of KINDS) {
    const src = reg.sources?.[srcKey] ?? reg.sources?.[key] ?? {};
    for (const p of reg[key] ?? []) {
      if (!p?.name || !Number.isFinite(Number(p.lat)) || !Number.isFinite(Number(p.lng)) || !keep(p)) continue;
      const facts = {};
      if (p.cls) facts["구분"] = `${p.cls} 휴양림`;
      if (p.kind) facts["유형"] = p.kind;
      if (p.fee) facts["입장료"] = p.fee;
      if (p.stay) facts["숙박"] = p.stay;
      if (p.facilities) facts["주요 시설"] = p.facilities;
      if (p.tel) facts["전화"] = p.tel;
      out.push({
        id: p.id ?? `${kind}:${encodeURIComponent(p.name)}:${Number(p.lat).toFixed(4)}`,
        category: kind, kind, name: p.name, address: p.addr ?? null,
        lat: Number(p.lat), lng: Number(p.lng), image: null, facts,
        homepage: p.homepage ?? null,
        source: { url: src.url ?? "https://www.data.go.kr/", checked_at: p.ref ?? reg.collected_at ?? null, tier: "OFFICIAL", label: src.label ?? "공공데이터포털 표준데이터" },
      });
    }
  }
  return out;
}

export function normalizePublicPoi(item) {
  if (!item || !Number.isFinite(Number(item.lat)) || !Number.isFinite(Number(item.lng))) return null;
  return {
    id: item.id,
    kind: item.kind ?? item.category,
    name: item.name,
    lat: Number(item.lat),
    lng: Number(item.lng),
    addr: item.address ?? null,
    image: item.image ?? null,
    facts: item.facts ?? {},
    url: item.homepage || item.source?.url || null,
    source: item.source?.label ?? "공공데이터포털 표준데이터",
  };
}

// ── 공공시설 공식 사진(소유자 2026-10-23: 주변시설 ‘관광’ 칸에 썸네일) ──
// 휴양림·박물관·수영장·실내 놀이 표준데이터에는 사진이 없다. 관광공사 TourAPI 목록(사진 포함)에서
// 400m 안이고 이름이 겹치는 같은 시설을 찾아 그 대표 사진을 쓴다. 이름이 안 겹치면 쓰지 않는다(다른 곳 사진 금지).
const coreName = (s) => String(s ?? "").replace(/\(.*?\)|\[.*?\]/g, "").replace(/\s+/g, "").replace(/(국립|공립|사립|시립|도립|군립|구립)/g, "").toLowerCase();
const distM = (a, b) => Math.hypot((a.lat - b.lat) * 111000, (a.lng - b.lng) * 88000 * Math.cos(((a.lat ?? 36) * Math.PI) / 180) / Math.cos((36 * Math.PI) / 180));
/** 같은 시설의 관광공사 항목(사진 있음) 또는 null. tour: normalizeTourPoi 결과 배열 */
export function matchTourPhoto(poi, tour, { radiusM = 400 } = {}) {
  const a = coreName(poi?.name);
  if (a.length < 3) return null;
  let best = null;
  for (const t of tour ?? []) {
    if (!t?.image || !Number.isFinite(t.lat)) continue;
    if (Math.abs(t.lat - poi.lat) > 0.01 || Math.abs(t.lng - poi.lng) > 0.012) continue;
    const d = distM(poi, t);
    if (d > radiusM) continue;
    const b = coreName(t.title);
    if (b.length < 3 || !(a.includes(b) || b.includes(a))) continue;
    if (!best || d < best.d) best = { d, t };
  }
  return best ? { img: best.t.image, contentid: best.t.id, title: best.t.title } : null;
}
