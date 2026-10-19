// 캠핑장 ↔ 기상청 격자(nx,ny)·중기 구역·에어코리아 측정소·조석 예보지점 대응표(1회성, 측정소가 바뀔 때만 다시).
// 사용: node scripts/build-condition-mapping.mjs  (DATA_GO_KR_SERVICE_KEY가 있으면 측정소·조석 지점 좌표를 API로 받아 함께 맞춘다)
// 키가 없거나 활용신청 전이면 격자·중기 구역만 채우고, 이전에 받아 둔 측정소 목록이 있으면 그대로 쓴다.
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { fetchDataGoKr } from "../lib/datagokr.mjs";
import { apiProblem, itemsOf, mapCampground, ymdOf } from "../lib/conditions.mjs";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const catalogPath = join(root, "camping-atlas/public/explore/data/campgrounds.json");
const outPath = join(root, "pipeline/registry/condition-mapping.json");
const prev = existsSync(outPath) ? JSON.parse(readFileSync(outPath, "utf8")) : null;
const key = process.env.DATA_GO_KR_SERVICE_KEY;
const status = {};

async function get(url) {
  const { res } = await fetchDataGoKr(url, key);
  const text = await res.text();
  const problem = apiProblem(res.status, text);
  return { problem, json: problem ? null : JSON.parse(text) };
}
const coord = (a, b) => { const x = Number(a), y = Number(b); if (!Number.isFinite(x) || !Number.isFinite(y)) return null; return x > 30 && x < 40 ? { lat: x, lng: y } : y > 30 && y < 40 ? { lat: y, lng: x } : null; };

async function airStations() {
  if (!key) return (status.air = "NO_KEY"), null;
  try {
    const { problem, json } = await get("https://apis.data.go.kr/B552584/MsrstnInfoInqireSvc/getMsrstnList?returnType=json&numOfRows=1000&pageNo=1");
    if (problem) return (status.air = problem), null;
    const rows = itemsOf(json).map((it) => ({ name: it.stationName, addr: it.addr ?? null, ...coord(it.dmX, it.dmY) })).filter((s) => s.name && s.lat);
    status.air = `OK ${rows.length}`;
    return rows;
  } catch (e) { status.air = `ERROR ${e.message}`; return null; }
}
// 조석 예보지점은 코드표가 활용가이드(HWP)에만 있어, 공개된 조위관측소 코드(DT_0001~DT_0070)를 한 번씩 조회해 응답의 위경도로 확인된 곳만 쓴다.
async function tideStations() {
  if (!key) return (status.tide = "NO_KEY"), null;
  const reqDate = ymdOf(new Date(Date.now() + 9 * 3600e3));
  const found = [];
  for (let i = 1; i <= 70; i++) {
    const code = `DT_${String(i).padStart(4, "0")}`;
    try {
      const { problem, json } = await get(`https://apis.data.go.kr/1192136/tideFcstHghLw/GetTideFcstHghLwApiService?obsCode=${code}&reqDate=${reqDate}&type=json&numOfRows=10&pageNo=1`);
      if (problem === "NOT_REGISTERED" || problem === "UNAUTHORIZED" || problem === "NOT_FOUND") { status.tide = problem; return null; }
      const it = itemsOf(json)[0];
      if (!it) continue;
      const nameKey = Object.keys(it).find((k) => /Nm$|name/i.test(k));
      const c = coord(it.lat ?? it.obsLat, it.lot ?? it.lon ?? it.obsLon);
      if (c) found.push({ code, name: nameKey ? it[nameKey] : code, ...c });
    } catch { /* 지점 없음·일시 오류는 건너뜀 */ }
  }
  status.tide = `OK ${found.length}`;
  return found;
}

const catalog = JSON.parse(readFileSync(catalogPath, "utf8"));
const air = (await airStations()) ?? prev?.stations?.air ?? [];
const tide = (await tideStations()) ?? prev?.stations?.tide ?? [];
const camps = {};
let skipped = 0;
for (const c of catalog) {
  const m = mapCampground(c, { airStations: air, tideStations: tide });
  if (!m) { skipped++; continue; }
  camps[c.id] = m;
}
const grids = new Set(Object.values(camps).map((m) => `${m.nx},${m.ny}`));
const out = {
  generated_at: new Date().toISOString(),
  note: "캠핑장 id → 기상청 단기예보 격자(nx,ny)·중기육상 구역(land)·중기기온 도시(ta)·에어코리아 측정소(air, 40km 이내)·조석 예보지점(tide, 25km 이내). build-condition-mapping.mjs가 만든다.",
  sources: { grid: "기상청 단기예보 격자 변환식(LCC)", air: "에어코리아 측정소정보 getMsrstnList", tide: "국립해양조사원 조석예보(고·저조) 응답 위경도" },
  stats: { campgrounds: Object.keys(camps).length, no_coordinate: skipped, unique_grids: grids.size, with_air: Object.values(camps).filter((m) => m.air).length, with_tide: Object.values(camps).filter((m) => m.tide).length, status },
  stations: { air, tide },
  camps,
};
writeFileSync(outPath, `${JSON.stringify(out, null, 0).replace(/\},"/g, '},\n"')}\n`);
console.log(`대응표: ${JSON.stringify(out.stats)}`);
