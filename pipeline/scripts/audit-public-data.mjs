// 공공 원천 연결·커버리지 감사. 네트워크를 호출하지 않고 현재 발행 캐시를 점검한다.
// 실제 수집은 sync:extras / sync:rest-stops / sync:public-leisure가 담당하며,
// 키가 없는 환경에서도 “연결됨/캐시 없음/키 필요”를 구분해 보고한다.
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("../..", import.meta.url));
const read = (p) => { try { return JSON.parse(readFileSync(resolve(root, p), "utf8")); } catch { return null; } };
const datasets = read("pipeline/registry/public-datasets.json")?.datasets ?? [];
const extras = read("camping-atlas/public/context/extras.json");
const leisure = read("pipeline/registry/public-leisure.json");
const leisureN = ["forests", "museums", "pools", "kids"].reduce((n, k) => n + (leisure?.[k]?.length ?? 0), 0);
const licensed = read("pipeline/registry/nearby-licensed.json");
const rest = read("pipeline/out/rest-stops.json");
const rows = [
  { id: "15076352", key: "ev", label: "전기차 충전소", status: extras?.sources?.ev?.grade === "PUBLIC_DATA" ? "connected" : "fallback", count: Object.values(extras?.camps ?? {}).filter((x) => x.ev?.length).length },
  { id: "15000563", key: "er", label: "응급실", status: extras?.sources?.er?.grade === "PUBLIC_DATA" ? "connected" : "fallback", count: Object.values(extras?.camps ?? {}).filter((x) => x.er).length },
  { id: "15135102", key: "pet", label: "반려동물 동반 여행지", status: extras?.sources?.pet?.grade === "PUBLIC_DATA" ? "connected" : "fallback", count: Object.values(extras?.camps ?? {}).filter((x) => x.pet).length },
  { id: "15101897", key: "bf", label: "무장애 여행지", status: extras?.sources?.bf?.grade === "PUBLIC_DATA" ? "connected" : "fallback", count: Object.values(extras?.camps ?? {}).filter((x) => x.bf).length },
  { id: "15101974", key: "tr", label: "걷기·자전거 코스", status: extras?.sources?.tr?.grade === "PUBLIC_DATA" ? "connected" : "fallback", count: Object.values(extras?.camps ?? {}).filter((x) => x.tr?.length).length },
  { id: "15128555", key: "cr", label: "관광지 혼잡도", status: extras?.sources?.cr?.grade === "FORECAST" ? "connected" : "fallback", count: Object.values(extras?.camps ?? {}).filter((x) => x.cr && Object.keys(x.cr).length).length },
  { id: "datagokr-public", key: "public", label: "휴양림·박물관·수영장·실내 놀이(공공데이터포털 표준데이터)", status: leisureN ? "connected" : "empty", count: leisureN },
  { id: "LOCALDATA-nearby", key: "licensed", label: "생활 인허가 시설", status: licensed?.campgrounds ? "connected" : "empty", count: Object.keys(licensed?.campgrounds ?? {}).length },
  { id: "ex-openapi", key: "rest", label: "도로공사 휴게소·편의시설", status: rest?.ex_service_areas ? "connected" : "fallback", count: rest?.ex_service_areas ?? 0 },
];
const inUse = new Set(datasets.filter((x) => x.status === "in_use" || x.status === "module_in_main").map((x) => String(x.id)));
for (const row of rows) row.registry = inUse.has(row.id) ? "in_use" : "missing_registry_entry";
const report = {
  generated_at: new Date().toISOString(),
  counts: { registry_datasets: datasets.length, connected_sources: rows.filter((x) => x.status === "connected").length, fallback_sources: rows.filter((x) => x.status === "fallback").length },
  sources: rows,
  next: [
    "DATA_GO_KR_SERVICE_KEY가 없는 실행에서는 공식 API 대신 직전 캐시·OSM을 유지한다.",
    "EX_API_KEY가 있으면 도로공사 대표 메뉴 API(restinfo/restBestfoodList)도 휴게소에 연결한다.",
    "새로운 값은 기존 사실을 삭제하지 않고 원문 URL·확인 시각과 함께 병합한다.",
  ],
};
const out = resolve(root, "pipeline/out/public-data-audit.json");
writeFileSync(out, JSON.stringify(report, null, 2));
for (const x of rows) console.log(`${x.label}: ${x.status} · ${x.count} · registry=${x.registry}`);
console.log(`공공 데이터 감사: ${out}`);
