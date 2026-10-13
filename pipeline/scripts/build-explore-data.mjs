// 웹 탐색 화면 데이터 → out/explore/{campgrounds.json, meta.json}
import { existsSync } from "node:fs";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { buildExploreRecords, buildExploreTexts, buildProviders } from "../lib/explore-data.mjs";
import { SEOUL_DATASET_URL, matchSeoulToCampgrounds } from "../lib/seoul-yeyak.mjs";

const p = (rel) => fileURLToPath(new URL(rel, import.meta.url));
const read = async (rel) => (existsSync(p(rel)) ? JSON.parse(await readFile(p(rel), "utf8")) : null);
const camps = await read("../out/campgrounds.json");
if (!camps) { console.log("::warning title=탐색 데이터 건너뜀::out/campgrounds.json이 없습니다(고캠핑 동기화 먼저)."); process.exit(0); }
const toilets = await read("../out/campground-toilets.json");
const fees = await read("../out/tour-fees.json");
const registry = await read("../registry/booking-rules.json");
const calendar = await read("../out/open-calendar.json");

const seoulRaw = await read("../out/seoul-yeyak.json");
const seoul = seoulRaw ? matchSeoulToCampgrounds(seoulRaw.services ?? [], camps.campgrounds ?? []) : new Map();
const records = buildExploreRecords(camps, toilets, fees, seoul);
const meta = {
  generated_at: new Date().toISOString(),
  count: records.length,
  sources: [
    { id: "gocamping", name: "한국관광공사 고캠핑", url: "https://www.data.go.kr/data/15101933/openapi.do", tier: "A", fetched_at: camps.fetched_at ?? null },
    toilets && { id: "toilets", name: "행정안전부 공중화장실정보 · OpenStreetMap", url: "https://file.localdata.go.kr/file/public_restroom_info/info", tier: "A", fetched_at: toilets.generated_at ?? null },
    fees && { id: "tour-fees", name: "한국관광공사 TourAPI 소개정보(안내 요금 문구)", url: "https://www.data.go.kr/data/15101578/openapi.do", tier: "B", fetched_at: fees.generated_at ?? null },
    seoulRaw && { id: "seoul-yeyak", name: "서울시 공공서비스예약 정보(접수 상태)", url: SEOUL_DATASET_URL, tier: "A", fetched_at: seoulRaw.generated_at ?? null },
    calendar && { id: "calendar", name: "모여라 캠핑 예약 규칙 레지스트리", url: "https://github.com/pyw31337/camp/blob/main/pipeline/registry/booking-rules.json", tier: "B", fetched_at: calendar.generated_at ?? null },
  ].filter(Boolean),
  providers: buildProviders(registry, calendar),
  stats: {
    with_booking_url: records.filter((r) => r.booking.url).length,
    online_realtime: records.filter((r) => r.booking.methods.some((m) => /실시간/.test(m))).length,
    with_fee_text: records.filter((r) => r.fee).length,
    with_nearby_toilet: records.filter((r) => r.nearby_toilets?.within_2km).length,
    with_image: records.filter((r) => r.img).length,
    with_intro: records.filter((r) => r.line).length,
    with_seoul_status: records.filter((r) => r.seoul.length).length,
    seoul_services: seoulRaw?.services?.length ?? 0,
  },
};
await mkdir(p("../out/explore/"), { recursive: true });
// 빈 값(null·빈 배열·빈 문자열)은 빼서 전송량을 줄인다. 화면이 기본값을 채운다.
const compact = (v) => {
  if (Array.isArray(v)) return v.map(compact);
  if (v && typeof v === "object") return Object.fromEntries(Object.entries(v).map(([k, x]) => [k, compact(x)]).filter(([, x]) => !(x == null || x === "" || (Array.isArray(x) && !x.length))));
  return v;
};
await writeFile(p("../out/explore/campgrounds.json"), JSON.stringify(records.map(compact)));
await writeFile(p("../out/explore/meta.json"), JSON.stringify(meta));
await writeFile(p("../out/explore/texts.json"), JSON.stringify(buildExploreTexts(camps)));
console.log(`탐색 데이터 ${records.length}곳 ${JSON.stringify(meta.stats)}`);
