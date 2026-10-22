import assert from "node:assert/strict";
import test from "node:test";
import { decide } from "../lib/text-judge.mjs";

const s = (o) => ({ camp: 0.84, travel: 0.82, food: 0.8, ad: 0.8, estate: 0.79, other: 0.79, ...o });

test("캠핑장 이름이 있는 글은 무관 분류가 1위여도 남긴다", () => {
  assert.equal(decide(s({ food: 0.9 }), { nameHit: true }).ok, true);
});
test("이름·캠핑 낱말이 없고 무관 분류가 1위면 숨긴다(식당·광고·부동산·무관 주제)", () => {
  const r = decide(s({ food: 0.86 }), {});
  assert.equal(r.ok, false);
  assert.equal(r.why, "식당·음식 글");
  assert.equal(decide(s({ other: 0.85 }), {}).why, "캠핑과 무관한 글");
});
test("캠핑 낱말이 있으면 무관 분류가 0.03 이상 앞설 때만 숨긴다", () => {
  assert.equal(decide(s({ ad: 0.85 }), { campWords: true }).ok, true);
  assert.equal(decide(s({ ad: 0.88 }), { campWords: true }).ok, false);
});
test("협찬·수수료 고지 + 캠핑 낱말 없음은 광고", () => {
  assert.equal(decide(s({}), { sponsored: true }).why, "광고·판매 글");
});
test("관련 분류가 1위면 남긴다", () => {
  assert.equal(decide(s({ camp: 0.9 }), {}).ok, true);
});
test("이름 일치는 대소문자·띄어쓰기·법인 표기·지점명을 무시한다", async () => {
  const { nameHit } = await import("../lib/text-judge.mjs");
  assert.equal(nameHit("(주)드윌레저캠프 양촌지점", "[경남] 드윌레저캠프 마산 양촌지점 나태지옥 수영장"), true);
  assert.equal(nameHit("강촌IC 힐링캠프", "일반 |강원 펜션| 강촌ic힐링캠프 (강원 춘천) - G마켓"), true);
  assert.equal(nameHit("DS Camp 캠핑장", "내가 지금까지 작성한 태그 Donors camp, door chain"), false);
  assert.equal(nameHit("캠프여주", "여주제일고등학교 진로캠프"), false);
});
