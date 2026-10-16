// 행정안전부 LOCALDATA 인허가(키 불필요 공개 파일)로 캠핑장마다 가장 가까운 생활 인프라를 찾는다.
// 편의점·상비약·마트·정육점·주유소·약국·동물병원 — “장보기·비상 대비” 정보. 거리는 직선(m)이며 화면은 ‘직선’으로 표시한다.
import { epsg5174ToWgs84 } from "./crs.mjs";
import { GridIndex, inKorea } from "./geo.mjs";
import { statusOf } from "./localdata-campgrounds.mjs";

// 편의점 상호(체인) — 담배소매인·상비약 판매업소 중 이 이름이면 편의점으로 본다.
export const CONVENIENCE_BRAND = /(^|\s|\()(CU|씨유|GS\s?25|지에스\s?25|세븐\s?일레븐|7-?eleven|이마트\s?24|emart\s?24|미니스톱|ministop|스토리웨이|C-?SPACE|씨스페이스|365\s?플러스|위드미|바이더웨이|홈플러스\s?365)(?![A-Za-z])/i;
const MART_NAME = /마트|슈퍼|수퍼|하나로|농협|식자재|상회|연쇄점|할인점/;
const FUEL_NAME = /주유소|셀프|에너지|오일|SK|GS칼텍스|S-?OIL|현대오일뱅크|알뜰|NH-?OIL/i;

/**
 * 범주 정의. slug = LOCALDATA 업종 페이지, keep(row) = 이 범주로 셀 행.
 * attr는 사실 저장소 속성 코드(registry/attribute-dictionary.json).
 */
export const CATEGORIES = [
  { code: "CONVENIENCE", label: "편의점", attr: "NEARBY_CONVENIENCE_M", from: ["over_the_counter_medicine_stores", "tobacco_retailers"], keep: (n) => CONVENIENCE_BRAND.test(n) },
  { code: "OTC_MEDICINE", label: "상비약 판매(24시간 편의점 등)", attr: "NEARBY_OTC_MEDICINE_M", from: ["over_the_counter_medicine_stores"], keep: () => true },
  { code: "MART", label: "마트·슈퍼·하나로", attr: "NEARBY_MART_M", from: ["large_scale_retail_stores", "tobacco_retailers"], keep: (n, slug) => slug === "large_scale_retail_stores" || (MART_NAME.test(n) && !CONVENIENCE_BRAND.test(n)) },
  { code: "BUTCHER", label: "정육점·축산물 판매", attr: "NEARBY_BUTCHER_M", from: ["livestock_retail"], keep: () => true },
  { code: "FUEL", label: "주유소", attr: "NEARBY_FUEL_M", from: ["oil_retailers"], keep: (n) => FUEL_NAME.test(n) },
  { code: "PHARMACY", label: "약국", attr: "NEARBY_PHARMACY_M", from: ["pharmacies"], keep: () => true },
  { code: "VET", label: "동물병원", attr: "NEARBY_VET_M", from: ["animal_hospitals"], keep: () => true },
];
export const SLUGS = [...new Set(CATEGORIES.flatMap((c) => c.from))];
export const RADIUS_M = 20000;   // 이보다 멀면 “20km 안 없음”
export const COUNT_RADIUS_M = 5000; // 반경 5km 안 개수(선택지가 많은지)

const pick = (row, res) => { for (const re of res) for (const [k, v] of Object.entries(row)) if (re.test(k.replace(/\s+/g, "")) && String(v ?? "").trim()) return String(v).trim(); return null; };

/** LOCALDATA 한 행 → { name, lat, lng, addr } (영업 중이고 좌표가 있을 때만) */
export function placeOf(row) {
  const status = statusOf([pick(row, [/^영업상태명$/]), pick(row, [/^상세영업상태명$/])].filter(Boolean).join(" "));
  if (status !== "OPERATING") return null;
  const name = pick(row, [/^사업장명$/]);
  const x = Number(pick(row, [/좌표정보\(?x/i, /^X좌표$/i]));
  const y = Number(pick(row, [/좌표정보\(?y/i, /^Y좌표$/i]));
  if (!name || !(x > 0 && y > 0)) return null;
  const [lat, lng] = epsg5174ToWgs84(x, y);
  if (!inKorea(lat, lng)) return null;
  return { name, lat: Math.round(lat * 1e5) / 1e5, lng: Math.round(lng * 1e5) / 1e5, addr: pick(row, [/^도로명(전체)?주소$/, /^소재지전체주소$/, /^지번주소$/]) };
}

/** 업종별 장소 목록({slug: place[]}) → 범주별 격자 색인 */
export function buildIndexes(placesBySlug) {
  const out = {};
  for (const cat of CATEGORIES) {
    const seen = new Set();
    const pts = [];
    for (const slug of cat.from) for (const p of placesBySlug[slug] ?? []) {
      if (!cat.keep(p.name, slug)) continue;
      const k = `${p.name}|${p.lat}|${p.lng}`; // 상비약·담배 양쪽에 있는 같은 편의점은 한 번만
      if (seen.has(k)) continue;
      seen.add(k); pts.push(p);
    }
    out[cat.code] = { index: new GridIndex(pts, 0.02), size: pts.length };
  }
  return out;
}

/** 캠핑장 좌표 → 범주별 { m, name, addr, lat, lng, n5 } (20km 안에 없으면 { m: null, none_within_m: 20000 }) */
export function nearestFor(lat, lng, indexes) {
  const res = {};
  for (const cat of CATEGORIES) {
    const ix = indexes[cat.code]?.index;
    if (!ix) continue;
    const near = ix.within(lat, lng, RADIUS_M);
    if (!near.length) { res[cat.code] = { m: null, none_within_m: RADIUS_M }; continue; }
    const { point: p, distance_m } = near[0];
    res[cat.code] = { m: distance_m, name: p.name, addr: p.addr ?? null, lat: p.lat, lng: p.lng, n5: near.filter((x) => x.distance_m <= COUNT_RADIUS_M).length };
  }
  return res;
}

/** 화면·요약용 거리 문구 */
export const distText = (m) => (m == null ? "20km 안 없음" : m < 1000 ? `${Math.round(m / 10) * 10}m` : `${(m / 1000).toFixed(m < 10000 ? 1 : 0)}km`);
