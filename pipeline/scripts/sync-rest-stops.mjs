// 전국 휴게소·졸음쉼터 수집 → out/rest-stops.json (경로 주변 안내용, 정적 배포)
// 원천: 한국도로공사 OpenAPI(휴게소·편의시설·주유 가격), 전국졸음쉼터표준데이터 API, OpenStreetMap.
import { mkdir, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { fetchDataGoKr } from "../lib/datagokr.mjs";
import { EX_SOURCE, buildExServiceAreas, fetchExAll, normalizeBestFoods } from "../lib/ex-rest-areas.mjs";
import { overpassCached } from "../lib/overpass.mjs";
import { nowInKst, toKstIso } from "../lib/kst.mjs";
import { FACILITY_FEE, enrichWithNearby, mergeStops, normalizeDrowsyShelter, normalizeOsmStop } from "../lib/rest-stops.mjs";

// OSM 추출본에서 휴게소·쉼터와 그 500m 안 주유·충전소만 고른다(Overpass 질의와 같은 범위).
function selectRestStops(els) {
  const stops = els.filter((e) => /^(services|rest_area)$/.test(e.tags?.highway ?? ""));
  const near = (a, b) => Math.abs(a.lat - b.lat) < 0.0046 && Math.abs(a.lon - b.lon) < 0.0058;
  const fuel = els.filter((e) => /^(fuel|charging_station)$/.test(e.tags?.amenity ?? "") && stops.some((s) => near(s, e)));
  return [...stops, ...fuel];
}
const out = fileURLToPath(new URL("../out/", import.meta.url));
await mkdir(out, { recursive: true });
await mkdir(fileURLToPath(new URL("../.cache/", import.meta.url)), { recursive: true });
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

// 한국도로공사 공식 휴게소·편의시설·주유 가격. EX_API_KEY 없이는 수집하지 않아
// 예제 키나 비공식 값을 실서비스 가격으로 저장하지 않는다.
let exCount = 0;
let exFuel = 0;
let exBestFood = 0;
if (process.env.EX_API_KEY) {
  try {
    const [location, convenience, fuel, bestFoodRaw] = await Promise.all([
      fetchExAll("locationinfo/locationinfoRest", process.env.EX_API_KEY),
      fetchExAll("business/conveniServiceArea", process.env.EX_API_KEY),
      fetchExAll("business/curStateStation", process.env.EX_API_KEY),
      fetchExAll("restinfo/restBestfoodList", process.env.EX_API_KEY),
    ]);
    const bestFood = normalizeBestFoods(bestFoodRaw);
    const serviceAreas = buildExServiceAreas({ location, convenience, fuel, bestFood, checkedAt: fetchedAt });
    exCount = serviceAreas.length;
    exFuel = serviceAreas.filter((stop) => stop.fuel).length;
    exBestFood = serviceAreas.filter((stop) => stop.best_foods?.length).length;
    official.push(...serviceAreas);
    console.log(`한국도로공사 휴게소 ${exCount}곳, 주유 가격 연결 ${exFuel}곳, 대표 메뉴 연결 ${exBestFood}곳`);
  } catch (error) { warn("한국도로공사 OpenAPI 호출 실패", error.message); }
} else {
  warn("EX_API_KEY 없음", "공식 휴게소·주유 가격 수집을 건너뜁니다. OSM·졸음쉼터 데이터만 사용합니다.");
}

// 2) OpenStreetMap: 휴게소·쉼터 + 주유소·충전소(휴게소 시설 보강용)
let osm = [];
try {
  const q = `[out:json][timeout:240];area["ISO3166-1"="KR"][admin_level=2]->.kr;nwr["highway"~"^(services|rest_area)$"](area.kr)->.s;(.s;nwr(around.s:500)["amenity"~"^(fuel|charging_station)$"];);out center tags;`;
  const { elements: els, server, stale, error } = await overpassCached(
    q,
    fileURLToPath(new URL("../.cache/osm-rest-stops.json", import.meta.url)),
    { timeoutMs: 15000, attempts: 1, select: selectRestStops },
  );
  if (stale) warn("Overpass 실패 — 직전 결과 사용", `${server} · ${error}`);
  else console.log(`Overpass: ${new URL(server).host}`);
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
  notes: "fee: FREE=무료, PAID=유료, null=시설마다 다름(현장·공식 확인). 졸음쉼터는 모두 무료. 주유 가격은 fuel.checked_at 시점의 한국도로공사 공시가.",
  sources: EX_SOURCE,
  attribution: ["한국도로공사 고속도로 공공데이터 포털", "전국졸음쉼터표준데이터(한국도로공사)", "© OpenStreetMap contributors (ODbL)"],
  ex_service_areas: exCount, ex_with_fuel_price: exFuel, ex_with_best_food: exBestFood,
  count: merged.length, by_kind: byKind, stops: merged,
}));
