import test from "node:test";
import assert from "node:assert/strict";
import { enrichmentGapScore, prioritizeEnrichment } from "../lib/enrichment-priority.mjs";

test("대표 썸네일이 없는 캠크닉을 사진 있는 일반 업장보다 먼저 보강한다", () => {
  const sparse = { id: "a", name: "어메이징빌리지", du: "private", fee: { text: "입장료" }, booking: { url: "https://example.com" } };
  const rich = { id: "b", name: "일반캠핑장", ph: "https://img.example/x.webp", fee: { text: "5만원" }, ti: { i: "14:00", o: "11:00" }, booking: { url: "https://example.com" }, soc: [4, 2, 3] };
  const out = prioritizeEnrichment([rich, sparse], (c) => c.id === "a" ? { sns_images: [{ thumb: "https://img.example/review.jpg" }] } : {});
  assert.equal(out[0].id, "a");
  assert.ok(enrichmentGapScore(sparse, {}).gaps.includes("photo"));
});

test("카드 대표사진과 상세 SNS 사진은 별도 공백으로 취급할 수 있다", () => {
  const score = enrichmentGapScore({ id: "a", name: "캠프", soc: [3, 0, 2] }, { sns_images: [{ thumb: "https://img.example/review.jpg" }] });
  assert.ok(score.gaps.includes("photo"));
  assert.ok(score.gaps.includes("video"));
});
