import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { execFileSync } from "node:child_process";
// t39 #45 감사: 숏츠 증분 발행 뒤 목록 카탈로그 영상 수(soc[1])가 상세와 어긋나던 문제 — 늘리기만, 줄이지 않음
test("merge-collected --shorts: 목록 soc[1]을 상세 videos 수에 맞춘다", () => {
  const d = mkdtempSync(join(tmpdir(), "soc-")); mkdirSync(join(d, "camps")); mkdirSync(join(d, "catx"));
  writeFileSync(join(d, "camps", "1.json"), JSON.stringify({ videos: [{ yt: "aaaaaaaaaaa" }, { yt: "bbbbbbbbbbb" }] }));
  writeFileSync(join(d, "camps", "2.json"), JSON.stringify({ videos: [] }));
  writeFileSync(join(d, "campgrounds.lite.json"), JSON.stringify({ v: 1, camps: [{ id: "1", soc: [3, 0, 1] }, { id: "2", soc: [0, 5, 0] }] }));
  writeFileSync(join(d, "catx", "0.json"), JSON.stringify({ 1: { id: "1", soc: [3, 0, 1] } }));
  const sh = join(d, "s.json"); writeFileSync(sh, JSON.stringify({ campgrounds: {} }));
  execFileSync("node", [new URL("../scripts/merge-collected.mjs", import.meta.url).pathname, "--data", d, "--shorts", sh]);
  const lite = JSON.parse(readFileSync(join(d, "campgrounds.lite.json"), "utf8")).camps;
  assert.deepEqual(lite[0].soc, [3, 2, 1]);
  assert.deepEqual(lite[1].soc, [0, 5, 0]); // 줄이지 않음
  assert.deepEqual(JSON.parse(readFileSync(join(d, "catx", "0.json"), "utf8"))["1"].soc, [3, 2, 1]);
});
