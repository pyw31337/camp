import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import test from "node:test";
import { SOURCES } from "../lib/fact-store.mjs";

// 다른 에이전트가 원천 코드를 지우면 build-fact-store.mjs가 검증 실패(exit 1)로 매일 발행을 막는다(2026-10-19 두 번 발생).
test("공개된 사실 저장소(data/facts)가 쓰는 원천 코드는 모두 SOURCES에 있다", () => {
  const dir = new URL("../../data/facts/", import.meta.url);
  const used = new Set();
  for (const f of readdirSync(dir)) if (f.endsWith(".ndjson") && f !== "campgrounds.ndjson") {
    for (const line of readFileSync(new URL(f, dir), "utf8").split("\n")) if (line) { const s = JSON.parse(line).src; if (s) used.add(s); }
  }
  const missing = [...used].filter((s) => !SOURCES[s]);
  assert.deepEqual(missing, [], `SOURCES에 없는 원천: ${missing.join(", ")}`);
  for (const s of ["blog_mention", "cafe_mention", "kin", "local_gov"]) assert.ok(SOURCES[s], s);
});
