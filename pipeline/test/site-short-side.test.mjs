import assert from "node:assert/strict";
import test from "node:test";
import { bestShortSide, shortSideOf, siteFitsTent, visibleSizeGroups } from "../../design/renewal/site-fit.mjs";

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

test("tq.mx만 있으면 그 짧은 쪽이 필터·레일 규격이다", () => {
  const c = { tq: { mx: [12, 7] } };
  assert.equal(bestShortSide(c), 7);
  const { tent, extras, visible } = visibleSizeGroups(c);
  assert.equal(tent, null);
  assert.equal(extras.length, 1);
  assert.equal(shortSideOf(visible[0].w, visible[0].d), 7);
});

test("SE클럽형: 레일 tentSize(7×12)보다 여유인 tq.mx 10×10은 레일·필터에 같이 올린다", () => {
  const c = { sizes: [[7, 12], [3, 7]], tq: { mx: [10, 10] } };
  assert.equal(bestShortSide(c), 10);
  const { tent, extras } = visibleSizeGroups(c);
  assert.deepEqual([tent.w, tent.d], [7, 12]);
  assert.equal(extras.length, 1);
  assert.deepEqual([extras[0].w, extras[0].d], [10, 10]);
  assert.equal(siteFitsTent(extras[0], 8), "ok");
  assert.equal(siteFitsTent(tent, 8), "tight");
});

test("이미 레일에 있는 규격보다 짧은 쪽이 작은 tq.mx는 필터에 넣지 않는다", () => {
  const c = { sizes: [[8, 10]], tq: { mx: [6, 11] } };
  assert.equal(bestShortSide(c), 8);
  assert.equal(visibleSizeGroups(c).extras.length, 0);
});

test("레일에 이미 같은 짝이 있으면 tq.mx를 중복하지 않는다", () => {
  const c = { sizes: [[6, 11]], tq: { mx: [11, 6] } };
  assert.equal(bestShortSide(c), 6);
  assert.equal(visibleSizeGroups(c).extras.length, 0);
});

test("이름 없는 구역 중 레일에 안 나오던 더 여유한 규격도 같이 올린다", () => {
  const c = { sizes: [[4, 8, 40], [5, 8, 7]] };
  assert.equal(bestShortSide(c), 5);
  const { tent, extras } = visibleSizeGroups(c);
  // 긴 쪽이 같으면 짧은 쪽이 큰 쪽을 tentSize로 쓴다.
  assert.deepEqual([tent.w, tent.d], [5, 8]);
  assert.equal(extras.length, 0);
});

test("긴 쪽은 더 커도 짧은 쪽이 더 작은 숨은 구역은 필터에 넣지 않는다", () => {
  const c = { sizes: [[7, 12], [3, 7]] };
  assert.equal(bestShortSide(c), 7);
  const { tent, extras } = visibleSizeGroups(c);
  assert.deepEqual([tent.w, tent.d], [7, 12]);
  assert.equal(extras.length, 0);
});
