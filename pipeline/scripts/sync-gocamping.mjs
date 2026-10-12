// 고캠핑 전체 목록을 받아 정규화한 JSON을 pipeline/out/에 쓴다.
// 사용: DATA_GO_KR_SERVICE_KEY=... node scripts/sync-gocamping.mjs
import { mkdir, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
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
