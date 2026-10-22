import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { execFileSync, spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { trustRank } from "../lib/merge-policy.mjs";

// URL.pathname은 한글 경로에서 %EC… 인코딩 문자열이 된다. 로컬 경로·CI 모두에서 실행되게 파일 경로로 변환한다.
const FG = fileURLToPath(new URL("../scripts/field-guard.mjs", import.meta.url));
const D = "camping-atlas/public/explore/data";
function tree(cat, det) {
  const r = mkdtempSync(join(tmpdir(), "fg-"));
  mkdirSync(join(r, D, "camps"), { recursive: true }); mkdirSync(join(r, "pipeline/registry"), { recursive: true });
  writeFileSync(join(r, D, "campgrounds.json"), JSON.stringify(cat));
  writeFileSync(join(r, D, "camps/102229.json"), JSON.stringify(det));
  return r;
}
const OFF = { min: 35000, max: 50000, text: "공식", grade: "OFFICIAL", url: "https://hsecofarm.hscity.go.kr/reservation/info/price.do", checked_at: "2026-10-21" };
const MEN = { min: 25000, max: 50000, text: "2.5만~5만원대", grade: "MENTION", url: "https://blog", checked_at: "2026-09-30" };
const REF = { value: "5일 전 100% · 2일 전 80%", grade: "OPERATOR", pinned: true, source: { url: "u" } };

test("OFFICIAL은 OPERATOR 급(예전엔 0점이라 후기가 덮음)", () => { assert.equal(trustRank({ grade: "OFFICIAL" }), 3); assert.ok(trustRank({ grade: "MENTION" }) < 3); });
test("공식 요금·확정 환불이 후기·‘규정 있음’으로 내려가면 PR 검사 실패", () => {
  const b = tree([{ id: "102229", fee: OFF }], { profile: { fields: { REFUND: REF } } });
  const n = tree([{ id: "102229", fee: MEN }], { profile: { fields: { REFUND: { value: "규정 있음", grade: "OPERATOR" } } } });
  const r = spawnSync("node", [FG, b, n], { encoding: "utf8" });
  assert.equal(r.status, 1, r.stdout);
  assert.match(r.stdout, /fee/); assert.match(r.stdout, /profile\.fields\.REFUND/);
});
test("--heal이면 공식 값으로 되살림", () => {
  const b = tree([{ id: "102229", fee: OFF }], { profile: { fields: { REFUND: REF } } });
  const n = tree([{ id: "102229", fee: MEN }], { profile: { fields: { REFUND: { value: "규정 있음", grade: "OPERATOR" } } } });
  execFileSync("node", [FG, b, n, "--heal"], { encoding: "utf8" });
  assert.equal(JSON.parse(readFileSync(join(n, D, "campgrounds.json"), "utf8"))[0].fee.grade, "OFFICIAL");
  assert.match(JSON.parse(readFileSync(join(n, D, "camps/102229.json"), "utf8")).profile.fields.REFUND.value, /^5일 전 100%/);
});
test("후기끼리의 교체·일반 등급 교체는 막지 않음", () => {
  const b = tree([{ id: "1", fee: { ...MEN, checked_at: "2026-01-01" } }], {});
  const n = tree([{ id: "1", fee: { ...MEN, min: 30000, checked_at: "2026-10-01" } }], {});
  assert.equal(spawnSync("node", [FG, b, n], { encoding: "utf8" }).status, 0);
});
test("확정 값은 registry/curated-pins.json에 있고 재계산 뒤 다시 얹는다", () => {
  const pins = JSON.parse(readFileSync(new URL("../registry/curated-pins.json", import.meta.url), "utf8")).camps["102229"];
  assert.equal(pins.catalog.fee.grade, "OFFICIAL");
  const sh = readFileSync(new URL("../scripts/publish-incremental.sh", import.meta.url), "utf8");
  const yml = readFileSync(new URL("../../.github/workflows/data-sync.yml", import.meta.url), "utf8");
  for (const s of [sh, yml]) assert.ok(s.indexOf("apply-pins.mjs") > 0 && s.indexOf("apply-pins.mjs") < s.indexOf("field-guard.mjs"));
});
