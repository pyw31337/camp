import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync, mkdtempSync, cpSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { applyFeeSanity } from "../scripts/apply-fee-sanity.mjs";
import { sanitizeFee, isPublicCamp, feeFloor } from "../lib/fee-sanity.mjs";
import { nightFees } from "../scripts/recheck-low-fees.mjs";

test("민간 1박 1만원(추가인원 요금 오인)은 숨기고 원본은 fee_raw로 보관", () => {
  const c = { id: "101354", name: "봄이오는 캠프", op: "PRIVATE", fee: { min: 10000, max: 10000, grade: "MENTION" } };
  const r = sanitizeFee(c);
  assert.equal(r.fee.hidden, true);
  assert.equal(r.fee.fee_raw.min, 10000);
});
test("범위 하단만 비현실이면 같은 출처 유효값 + 다른 후기로 다듬음", () => {
  const c = { op: "PRIVATE", name: "우니메이카", fee: { min: 10000, max: 70000, grade: "OPERATOR" } };
  const r = sanitizeFee(c, [{ won: 80000, url: "u" }]);
  assert.deepEqual([r.fee.min, r.fee.max], [70000, 80000]);
});
test("대체 후기 출처로 폴백", () => {
  const r = sanitizeFee({ op: "PRIVATE", name: "x", fee: { min: 10000, max: 10000 } }, [{ won: 10000 }, { won: 45000, url: "b", date: "2026-01-01" }]);
  assert.equal(r.fee.sanity, "fallback"); assert.equal(r.fee.min, 45000);
});
test("국립공원·휴양림·지자체·당일 이용은 실제 저가 요금이라 유지", () => {
  for (const c of [
    { name: "금대자동차야영장(치악산국립공원)", fee: { min: 15000, max: 19000, grade: "REFERENCE", basis: "국립공원공단 표준 야영장 요금" } },
    { name: "가야산오토캠핑장", op: "LOCAL_GOVERNMENT", fee: { min: 10000, max: 19000, grade: "MENTION" } },
    { name: "올라봄 캠크닉", op: "PRIVATE", fee: { min: 10000, max: 10000, grade: "MENTION" } },
  ]) { assert.equal(sanitizeFee(c).changed, false, c.name); }
  assert.ok(isPublicCamp({ name: "국립용대자연휴양림" }));
  assert.equal(feeFloor({ name: "아늑캠핑장", op: "PRIVATE" }), 20000);
});
test("공식 홈페이지 재확인: 추가인원·전기 문장은 1박 요금에서 제외", () => {
  const f = nightFees("오토사이트 1박 45,000원\n추가인원 1인 10,000원\n전기 사용 5,000원");
  assert.deepEqual(f.map((x) => x.won), [45000]);
});
test("배포 단계 적용 후 민간 1박 2만원 미만 요금이 남지 않음(원본 파일은 그대로)", () => {
  const dir = mkdtempSync(join(tmpdir(), "fee-")); cpSync(new URL("../../camping-atlas/public/explore/data/campgrounds.json", import.meta.url), join(dir, "campgrounds.json"));
  const before = JSON.parse(readFileSync(join(dir, "campgrounds.json"), "utf8"));
  const badBefore = before.filter((c) => c.fee?.min > 0 && c.fee.min < feeFloor(c)).length;
  const changed = applyFeeSanity(dir);
  // 이미 발행 단계에서 정제된 스냅샷은 0건이어도 정상이다. 아직 원본 저가 행이
  // 남아 있는 스냅샷에서는 모든 행이 한 번에 정제됐는지를 검증한다.
  assert.equal(changed, badBefore);
  const all = JSON.parse(readFileSync(join(dir, "campgrounds.json"), "utf8"));
  assert.equal(all.find((c) => c.id === "362").fee.min, 15000); // 구미시 공식 요금 유지
  const bad = all.filter((c) => c.fee?.min > 0 && c.fee.min < feeFloor(c));
  assert.deepEqual(bad.map((c) => c.id), []);
});
test("앱 표시층도 같은 하한(원본은 fee_raw)", () => {
  const s = readFileSync(new URL("../../camping-atlas/public/app.js", import.meta.url), "utf8");
  assert.match(s, /function cleanCampFee/); assert.match(s, /cleanCampTel\(c\); cleanCampFee\(c\)/);
});
