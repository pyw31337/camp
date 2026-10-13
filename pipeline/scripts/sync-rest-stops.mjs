// 전국 휴게소·졸음쉼터 수집 → out/rest-stops.json (경로 주변 안내용, 정적 배포)
// 원천: 전국졸음쉼터표준데이터 API(키·활용신청 시), OpenStreetMap(키 불필요).
import { mkdir, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { fetchDataGoKr } from "../lib/datagokr.mjs";
import { nowInKst, toKstIso } from "../lib/kst.mjs";
import { FACILITY_FEE, enrichWithNearby, mergeStops, normalizeDrowsyShelter, normalizeOsmStop } from "../lib/rest-stops.mjs";

const out = fileURLToPath(new URL("../out/", import.meta.url));
await mkdir(out, { recursive: true });
const fetchedAt = toKstIso(nowInKst());
const warn = (title, msg) => console.log(`::warning title=${title}::${msg}`);

// 1) 전국졸음쉼터표준데이터(한국도로공사, 좌표·화장실 유무 포함)
const official = [];
const key = process.env.DATA_GO_KR_SERVICE_KEY;
if (key) {
  try {
    for (let page = 1; page <= 10; page++) {
      const { res } = await fetchDataGoKr(`https://api.data.go.kr/openapi/tn_pubr_public_drowsy_shelter_api?pageNo=${page}&numOfRows=1000&type=json`, key, { timeoutMs: 30000 });
      const text = await res.text();
      let body = null;
      try { const j = JSON.parse(text); body = j?.response?.body ?? j?.body; } catch { /* 아래 경고 */ }
      if (!body) { warn("졸음쉼터 API 응답 확인 필요", `HTTP ${res.status} ${text.slice(0, 160).replace(/\s+/g, " ")}`); break; }
      const items = Array.isArray(body.items) ? body.items : body.items?.item ? [].concat(body.items.item) : [];
      if (page === 1 && items[0]) console.log(`졸음쉼터 필드: ${Object.keys(items[0]).join(", ")}`);
      official.push(...items.map(normalizeDrowsyShelter).filter(Boolean));
      if (items.length < 1000) break;
    }
    console.log(`졸음쉼터(공식) ${official.length}곳`);
  } catch (e) { warn("졸음쉼터 API 호출 실패", e.message); }
}

// 2) OpenStreetMap: 휴게소·쉼터 + 주유소·충전소(휴게소 시설 보강용)
let osm = [];
try {
  const q = `[out:json][timeout:240];area["ISO3166-1"="KR"][admin_level=2]->.kr;(nwr["highway"~"^(services|rest_area)$"](area.kr);nwr["amenity"~"^(fuel|charging_station)$"]["highway"!~"."](area.kr););out center tags;`;
  const res = await fetch("https://overpass-api.de/api/interpreter", { method: "POST", body: new URLSearchParams({ data: q }), headers: { "User-Agent": "moyeora-camping-pipeline (github.com/pyw31337/camp)" }, signal: AbortSignal.timeout(300000) });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const els = (await res.json()).elements ?? [];
  const pois = els.filter((e) => e.tags?.amenity).map((e) => ({ lat: e.lat ?? e.center?.lat, lng: e.lon ?? e.center?.lon, kind: e.tags.amenity === "fuel" ? "fuel" : "charging" })).filter((p) => Number.isFinite(p.lat));
  osm = enrichWithNearby(els.filter((e) => e.tags?.highway).map(normalizeOsmStop).filter(Boolean), pois);
  console.log(`OpenStreetMap 휴게소 ${osm.filter((s) => s.kind === "SERVICE_AREA").length}곳, 쉼터 ${osm.filter((s) => s.kind !== "SERVICE_AREA").length}곳 (주유·충전 POI ${pois.length}곳으로 보강)`);
} catch (e) { warn("OpenStreetMap 휴게소 수집 실패", e.message); }

const { merged, osm_added, osm_duplicates } = mergeStops(official, osm);
const byKind = merged.reduce((m, s) => ({ ...m, [s.kind]: (m[s.kind] ?? 0) + 1 }), {});
console.log(`합계 ${merged.length}곳 ${JSON.stringify(byKind)} · OSM 추가 ${osm_added}, 공식과 중복 ${osm_duplicates}`);
await writeFile(`${out}rest-stops.json`, JSON.stringify({
  generated_at: fetchedAt,
  facility_fee_defaults: FACILITY_FEE,
  notes: "fee: FREE=무료, PAID=유료, null=시설마다 다름(현장·공식 확인). 졸음쉼터는 모두 무료. 주유·충전 가격은 한국도로공사 API 연동 후 표시.",
  attribution: ["전국졸음쉼터표준데이터(한국도로공사)", "© OpenStreetMap contributors (ODbL)"],
  count: merged.length, by_kind: byKind, stops: merged,
}));
