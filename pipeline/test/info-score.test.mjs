import assert from "node:assert/strict";
import test from "node:test";
import { RAW_MAX, byInfoScore, scoreCamp } from "../lib/info-score.mjs";

const defs = { PRICE_NIGHT: { code: "PRICE_NIGHT", type: "krw", multi: true }, PET_POLICY: { code: "PET_POLICY", type: "enum" }, CHECKIN_TIME: { code: "CHECKIN_TIME", type: "time" }, AMENITY_WIFI: { code: "AMENITY_WIFI", group: "amenity", type: "bool" } };
const f = (attr, value, grade = "OPERATOR", extra = {}) => ({ cid: "1", attr, value, grade, src: "operator_homepage", url: "https://x", at: new Date().toISOString(), ...extra });

test("정보가 많은 곳이 점수가 높다(0~100)", () => {
  const empty = scoreCamp({ facts: [], defs });
  const rich = scoreCamp({ facts: [f("PRICE_NIGHT", 50000), f("PET_POLICY", "ALLOWED"), f("CHECKIN_TIME", "14:00"), f("AMENITY_WIFI", true)], defs, photos: 5, reviews: 30 });
  assert.equal(empty.score, 0);
  assert.ok(rich.score > 20 && rich.score <= 100, String(rich.score));
  assert.ok(RAW_MAX > 100);
});
test("표준 조례 기본값(REFERENCE)·숙박형 한정 값(scope)은 세지 않는다", () => {
  const ref = scoreCamp({ facts: [f("CHECKIN_TIME", "14:00", "REFERENCE", { src: "public_standard" })], defs });
  const scoped = scoreCamp({ facts: [f("CHECKIN_TIME", "15:00", "OPERATOR", { scope: "숙박형" })], defs });
  assert.equal(ref.score, 0);
  assert.equal(scoped.score, 0);
});
test("후기 언급(MENTION)은 운영자 원문보다 적게 센다", () => {
  const op = scoreCamp({ facts: [f("PET_POLICY", "ALLOWED")], defs }).raw;
  const mention = scoreCamp({ facts: [f("PET_POLICY", "ALLOWED", "MENTION", { src: "review_search" })], defs }).raw;
  assert.ok(op > mention && mention > 0);
});
test("비어 있는 중요 항목을 다음 수집 우선순위로 알려 준다", () => {
  const s = scoreCamp({ facts: [f("PET_POLICY", "ALLOWED")], defs });
  assert.equal(s.missing[0], "PRICE_NIGHT");
  assert.ok(!s.missing.includes("PET_POLICY"));
});
test("byInfoScore: 점수 높은 순", () => {
  assert.deepEqual([{ iq: 3 }, { iq: 70 }, {}].sort(byInfoScore).map((x) => x.iq), [70, 3, undefined]);
});
