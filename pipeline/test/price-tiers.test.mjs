import assert from "node:assert/strict";
import { test } from "node:test";
import { feeTiers, tierOf } from "../lib/price-tiers.mjs";

test("이름표 우선, 없으면 금액(10만 미만 사이트 · 10만~20만 글램핑·카라반 · 20만 이상 펜션)", () => {
  assert.deepEqual(tierOf(45000, "오토캠핑"), { t: "site", est: 0 });
  assert.deepEqual(tierOf(150000, "글램핑"), { t: "glamp", est: 0 });
  assert.deepEqual(tierOf(40000, "카라반"), { t: "site", est: 0 }); // 개인 카라반 사이트
  assert.deepEqual(tierOf(130000, null), { t: "gc", est: 1 });
  assert.deepEqual(tierOf(250000, null), { t: "lodge", est: 1 });
  assert.equal(tierOf(250000, "A사이트"), null); // 장박·월 요금
});

test("짐작한 형태는 캠핑장에 있는 형태로 좁힌다", () => {
  const p = [{ won: 40000 }, { won: 140000 }, { won: 260000 }];
  // 숙박동이 없으면 20만원대도 그 캠핑장에 있는 글램핑으로
  assert.deepEqual(feeTiers(p, ["AUTO", "GLAMPING"]), [["site", 40000, 40000, 1], ["glamp", 140000, 260000, 1]]);
  assert.deepEqual(feeTiers(p, ["AUTO", "CARAVAN", "HOUSE"]).map((t) => t[0]), ["site", "caravan", "lodge"]);
  // 사이트 타입만 있으면 10만원대도 사이트 요금
  assert.deepEqual(feeTiers([{ won: 40000 }, { won: 110000 }], ["AUTO"]), [["site", 40000, 110000, 1]]);
  // 이름이 ‘글램핑’인 곳의 20만원대는 글램핑
  assert.deepEqual(feeTiers([{ won: 220000 }], ["GLAMPING", "HOUSE"], "소꿉놀이 글램핑"), [["glamp", 220000, 220000, 1]]);
});

test("이름표가 있는 같은 금액이 있으면 짐작은 버린다", () => {
  const t = feeTiers([{ won: 250000, label: "글램핑" }, { won: 280000, label: "글램핑" }, { won: 250000 }, { won: 280000 }], ["GLAMPING"]);
  assert.deepEqual(t, [["glamp", 250000, 280000, 0]]);
});
