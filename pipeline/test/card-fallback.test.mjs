import assert from "node:assert/strict";
import { test } from "node:test";
import { candidateIdentity, looksLikePlace, orderCandidates, pixelStats } from "../lib/card-fallback.mjs";

const fill = (rgb) => { const a = new Uint8Array(64 * 64 * 3); for (let i = 0; i < 64 * 64; i++) a.set(rgb, i * 3); return a; };
test("흰 화면(배치도·캡처)·어두운 사진은 거른다", () => {
  assert.equal(looksLikePlace(pixelStats(fill([250, 250, 250]))), false);
  assert.equal(looksLikePlace(pixelStats(fill([10, 10, 10]))), false);
  // 자연 사진 비슷한 색 섞임
  const a = new Uint8Array(64 * 64 * 3);
  for (let i = 0; i < 64 * 64; i++) a.set([60 + (i % 7) * 12, 110 + (i % 5) * 15, 70 + (i % 3) * 20], i * 3);
  assert.equal(looksLikePlace(pixelStats(a)), true);
});
test("가로 사진을 먼저", () => {
  const o = orderCandidates([{ thumb: "a", url: "u", w: 500, h: 900 }, { thumb: "b", url: "u", w: 900, h: 500 }]);
  assert.deepEqual(o.map((x) => x.thumb), ["b", "a"]);
});
test("다른 업장명이 있는 후보는 대표 사진으로 승격하지 않는다", () => {
  assert.equal(candidateIdentity({ campName: "황정민 글램핑", title: "황정민 키즈글램핑 후기", snippet: "계곡과 사이트가 좋아요" }).ok, true);
  assert.equal(candidateIdentity({ campName: "황정민 글램핑", title: "인오 캠핑장 방문 후기", snippet: "캠핑장 사진" }).ok, false);
});
