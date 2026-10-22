import assert from "node:assert/strict";
import { test } from "node:test";
import { NEG, POS, decide } from "../lib/photo-judge.mjs";

// 분류 결과 흉내: 지정한 라벨에 점수를 주고 나머지는 0
const r = (scores) => [...POS, ...NEG].map((label) => ({ label, score: scores[label] ?? 0 }));
const L = (s) => [...POS, ...NEG].find((x) => x.includes(s));

test("음식·해산물·인물·차 안은 거른다(2026-10-22 여우하우 대게 사진)", () => {
  assert.equal(decide(r({ [L("seafood")]: 1 })).ok, false);
  assert.equal(decide(r({ [L("seafood")]: 1 })).why, "해산물");
  assert.equal(decide(r({ [L("food on a plate")]: 0.55, [L("camping deck")]: 0.3 })).ok, false);
  assert.equal(decide(r({ [L("portrait")]: 0.88 })).ok, false);
  assert.equal(decide(r({ [L("car interior")]: 0.91 })).ok, false);
  // 캠핑장다운 장면이 약한데 행사 인물이 보이면 거른다
  assert.equal(decide(r({ [L("resort, pension")]: 0.3, [L("event or a speech")]: 0.27 })).ok, false);
});

test("캠핑장 장면·간판·펜션 객실·건물은 남긴다", () => {
  assert.equal(decide(r({ [L("glamping tent")]: 0.9 })).ok, true);
  assert.equal(decide(r({ [L("entrance sign")]: 0.87, [L("restaurant")]: 0.1 })).ok, true);
  assert.equal(decide(r({ [L("hotel room")]: 0.8, [L("restaurant")]: 0.15 })).ok, true);
  // 식당·카페 실내는 약한 신호: 0.6 정도면 남기고, 0.8 이상이면 거른다
  assert.equal(decide(r({ [L("restaurant")]: 0.6, [L("building, cabin")]: 0.4 })).ok, true);
  assert.equal(decide(r({ [L("restaurant")]: 0.96 })).ok, false);
});
