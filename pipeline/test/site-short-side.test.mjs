import assert from "node:assert/strict";
import test from "node:test";
import { bestShortSide, shortSideOf, siteFitsTent } from "../../design/renewal/site-fit.mjs";

test("짧은 쪽: 6×11은 6, 8×10은 8", () => {
  assert.equal(shortSideOf(6, 11), 6);
  assert.equal(shortSideOf(8, 10), 8);
});

test("캠핑장 필터는 가장 여유 있는 사이트의 짧은 쪽을 쓴다", () => {
  const c = { field_conditions: { site_size: { groups: [
    { width_m: 6, depth_m: 11 },
    { width_m: 10, depth_m: 12 },
  ] } } };
  assert.equal(bestShortSide(c), 10); // 10×12는 여유, 6×11은 협소
  assert.equal(bestShortSide(c) >= 8, true);
});

test("긴 쪽만 큰 사이트(6×11)는 8m 텐트에 협소·필터 탈락", () => {
  const c = { sizes: [[6, 11]] };
  assert.equal(bestShortSide(c), 6);
  assert.equal(bestShortSide(c) >= 8, false);
  assert.equal(siteFitsTent({ w: 6, d: 11 }, 8), "tight");
  assert.equal(siteFitsTent({ w: 8, d: 10 }, 8), "ok");
});

test("규격이 없으면 0 (기존처럼 내 취향 규격 필터에서 제외)", () => {
  assert.equal(bestShortSide({}), 0);
});

test("tq.mx([가로, 세로])도 짧은 쪽으로 본다", () => {
  assert.equal(bestShortSide({ tq: { mx: [12, 7] } }), 7);
});
