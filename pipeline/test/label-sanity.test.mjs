import assert from "node:assert/strict";
import test from "node:test";
import { sanitizeDigest } from "../lib/label-sanity.mjs";
import { topicsOf } from "../lib/review-digest.mjs";

const stats = { p25: 25000, p50: 40000, p75: 65000, p90: 185000 };

test("1박 4만원(중간값)인 곳의 ‘가격 부담’은 뺀다 — 단양 남천 야영장 사례", () => {
  const r = sanitizeDigest({ pros: [["계곡·물놀이 좋음", 1]], cons: [["가격 부담", 1]] }, { fee: { min: 40000, max: 40000 } }, stats);
  assert.deepEqual(r.cons, []);
  assert.equal(r.dropped[0][0], "가격 부담");
});

test("비싼 곳의 ‘가격 부담’은 남기고, 요금을 모르면 그대로 둔다", () => {
  assert.equal(sanitizeDigest({ pros: [], cons: [["가격 부담", 2]] }, { fee: { min: 90000 } }, stats).cons.length, 1);
  assert.equal(sanitizeDigest({ pros: [], cons: [["가격 부담", 2]] }, {}, stats).cons.length, 1);
});

test("상위 10% 요금의 ‘가성비 좋음’, 반려동물 불가인 곳의 ‘반려견 동반 편함’은 뺀다", () => {
  const r = sanitizeDigest({ pros: [["가성비 좋음", 3], ["반려견 동반 편함", 1]], cons: [] }, { fee: { min: 200000 }, pets: "불가능" }, stats);
  assert.deepEqual(r.pros, []);
});

test("반대 라벨은 건수가 많은 쪽만, 같으면 둘 다 뺀다", () => {
  assert.deepEqual(sanitizeDigest({ pros: [["그늘 많음", 3]], cons: [["그늘 부족", 1]] }, {}, stats), { pros: [["그늘 많음", 3]], cons: [], dropped: [["그늘 부족", "반대 후기 ‘그늘 많음’ 3건 ≥ 1건"]] });
  const r = sanitizeDigest({ pros: [["조용·한적", 1]], cons: [["소음·매너", 1]] }, {}, stats);
  assert.deepEqual([r.pros, r.cons], [[], []]);
});

test("다른 곳 요금과 견주며 싸다고 한 글은 ‘가격 부담’으로 세지 않는다", () => {
  const t = "치솟는 물가 속에 1박에 5만 원에서 8만 원을 훌쩍 넘는. 사설 캠핑장 요금이 부담스러운 분들이 많습니다.. 1박 1~2만 원대 의 착한 요금으로.";
  assert.ok(!topicsOf(t).cons.includes("가격 부담"));
  assert.ok(topicsOf("여기 요금이 너무 비싸요").cons.includes("가격 부담"));
});
