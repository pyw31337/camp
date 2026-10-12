// 고캠핑 전체 목록을 받아 정규화한 JSON을 pipeline/out/에 쓴다.
// 사용: DATA_GO_KR_SERVICE_KEY=... node scripts/sync-gocamping.mjs
import { mkdir, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { findFreeCandidates } from "../lib/free-discovery.mjs";
import { fetchAllCampgrounds, normalizeCampground, summarize } from "../lib/gocamping.mjs";
import { nowInKst, toKstIso } from "../lib/kst.mjs";

const serviceKey = process.env.DATA_GO_KR_SERVICE_KEY;
if (!serviceKey) {
  console.log("DATA_GO_KR_SERVICE_KEY가 없어 고캠핑 동기화를 건너뜁니다.");
  process.exit(0);
}

const outDir = fileURLToPath(new URL("../out/", import.meta.url));
const fetchedAt = toKstIso(nowInKst());
let items;
try {
  items = await fetchAllCampgrounds({ serviceKey });
} catch (e) {
  if (e.code === "DATA_GO_KR_UNREACHABLE") {
    // 키 문제가 아니라 망 문제(해외 IP 차단 등). 작업 전체를 실패시키지 않고 경고로 남긴다.
    console.log(`::warning title=data.go.kr 연결 불가::${e.message}`);
    process.exit(0);
  }
  throw e;
}
const campgrounds = items.map((it) => normalizeCampground(it, fetchedAt));
const ids = new Set();
for (const c of campgrounds) {
  if (ids.has(c.external_id.id)) throw new Error(`contentId 중복: ${c.external_id.id}`);
  ids.add(c.external_id.id);
}
await mkdir(outDir, { recursive: true });
await writeFile(`${outDir}campgrounds.json`, JSON.stringify({ fetched_at: fetchedAt, campgrounds }, null, 0));
const summary = summarize(campgrounds);
await writeFile(`${outDir}campgrounds-summary.json`, JSON.stringify({ fetched_at: fetchedAt, ...summary }, null, 2));
console.log(JSON.stringify(summary, null, 2));

// 무료 운영 후보(공식 확인 전). 로그에 상위 후보를 남겨 사람이 확인 작업을 시작할 수 있게 한다.
const free = findFreeCandidates(items);
await writeFile(`${outDir}free-site-candidates.json`, JSON.stringify({ fetched_at: fetchedAt, count: free.length, candidates: free }, null, 2));
console.log(`무료 운영 후보 ${free.length}곳 (화장실 있음 ${free.filter((c) => c.toilets > 0).length}, 취사 단서 ${free.filter((c) => c.cooking_hint).length})`);
for (const c of free.slice(0, 60)) {
  console.log(`- [${c.priority}] ${c.region} · ${c.name} (${c.operator ?? "운영주체 미상"}) 화장실 ${c.toilets} 개수대 ${c.sinks} 화로 ${c.brazier ?? "-"} · id ${c.gocamping_id} · “${c.snippet}”`);
}
