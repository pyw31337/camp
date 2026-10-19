import { test } from "node:test";
import assert from "node:assert/strict";
import { compactTimes, openMonthsOf } from "../lib/campground-profile.mjs";

const months = (bits) => [...Array(12).keys()].filter((i) => bits & (1 << i)).map((i) => i + 1);

test("운영 달: 계절·사계절·휴장 문장", () => {
  assert.deepEqual(months(openMonthsOf({ value: "사계절 운영" })), [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12]);
  assert.deepEqual(months(openMonthsOf({ value: "봄·여름·가을 운영" })), [3, 4, 5, 6, 7, 8, 9, 10, 11]);
  assert.deepEqual(months(openMonthsOf({ value: "기간 휴장 있음", source: { quote: "매년 12월부터 이듬해 3월까지 휴장이다." } })), [4, 5, 6, 7, 8, 9, 10, 11]);
  // “11월 말경부터 이듬해 3월 말까지” → 11월은 일부 운영이라 운영으로, 3월은 휴장
  assert.deepEqual(months(openMonthsOf({ value: "기간 휴장 있음", source: { quote: "매년 11월 말경부터 이듬해 3월 말까지 휴장에 돌입한다." } })), [4, 5, 6, 7, 8, 9, 10, 11]);
  assert.equal(openMonthsOf({ value: "기간 휴장 있음", source: { quote: "휴장기간.휴무기간 시작일" } }), null); // 모르면 거르지 않는다
  assert.equal(openMonthsOf(null), null);
});

test("입·퇴실·매너타임 압축", () => {
  assert.deepEqual(compactTimes({ CHECKIN: { value: "14:00부터", grade: "CONFIRMED" }, CHECKOUT: { value: "11:00까지", grade: "MENTION" }, MANNER: { value: "22:00~07:00", grade: "OPERATOR" } }), { i: ["14:00", "c"], o: ["11:00", "m"], m: ["22:00", "c"] });
  assert.equal(compactTimes({}), null);
});
