import test from "node:test";
import assert from "node:assert/strict";
import { campgroundQuality, isCampingOperator, photoContextScore } from "../lib/place-quality.mjs";

test("명백한 비캠핑 업체는 기본 탐색에서 격리한다", () => {
  assert.equal(campgroundQuality({ name: "스마트락(주)", types: ["자동차야영장"] }).status, "REJECTED");
  assert.equal(isCampingOperator({ name: "천왕산 가족캠핑장", types: ["일반야영장"] }), true);
});

test("후기 대표사진은 업체 맥락이 있어야 승격한다", () => {
  assert.equal(photoContextScore({ campName: "여우하우야영장", title: "여우하우야영장 데크 후기", snippet: "캠핑장 사이트와 개별 화장실" }).status, "ACCEPTED");
  assert.equal(photoContextScore({ campName: "여우하우야영장", title: "서울 근교 대게 맛집", snippet: "대게를 먹고 왔어요" }).status, "REVIEW");
});
