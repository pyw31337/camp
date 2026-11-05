import test from "node:test";
import assert from "node:assert/strict";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(fileURLToPath(new URL("..", import.meta.url)), "..");
const dataRoot = join(root, "camping-atlas/public/explore/data");
const files = [
  join(dataRoot, "campgrounds.json"),
  ...readdirSync(join(dataRoot, "camps")).filter((f) => f.endsWith(".json")).map((f) => join(dataRoot, "camps", f)),
  join(root, "data/gocamping-detail.ndjson"),
  ...readdirSync(join(root, "data/facts")).filter((f) => f.endsWith(".ndjson")).map((f) => join(root, "data/facts", f)),
].filter(existsSync);

test("배포 데이터에 HTML 따옴표 엔티티가 남지 않는다", () => {
  const hits = files.flatMap((f) => {
    const n = (readFileSync(f, "utf8").match(/&quot;/g) ?? []).length;
    return n ? [`${f}: ${n}`] : [];
  });
  assert.deepEqual(hits, [], `sanitize-quote-entities.mjs를 실행하세요: ${hits.join(", ")}`);
});
