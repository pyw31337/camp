import assert from "node:assert/strict";
import test from "node:test";
import { digestReviews, topicsOf } from "../lib/review-digest.mjs";

test("장점·단점 주제를 문장에서 찾고, 부정은 세지 않는다", () => {
  assert.deepEqual(topicsOf("화장실이 정말 깨끗하고 사장님이 친절하셨어요").pros.sort(), ["사장님 친절", "화장실·샤워장 깨끗"]);
  assert.deepEqual(topicsOf("뷰가 별로 안 좋았어요").pros, []);
  assert.deepEqual(topicsOf("벌레가 많아서 힘들었어요").cons, ["벌레 많음"]);
  assert.deepEqual(topicsOf("시끄럽지 않고 조용했어요").cons, []);
});

test("이 캠핑장 글만 세고, 이름 속 단어는 후기 표현으로 보지 않는다", () => {
  const reviews = [
    { title: "솔바람캠핑장 후기", snippet: "솔바람캠핑장 사이트가 넓고 조용해서 좋았어요" },
    { title: "솔바람캠핑장 1박", snippet: "그늘이 없어서 한낮엔 더웠어요. 사이트가 넓어요" },
    { title: "가평 캠핑장 5곳 추천", snippet: "벌레가 많아요" },
    { title: "다른 캠핑장", snippet: "화장실이 깨끗해요" },
  ];
  const d = digestReviews("솔바람캠핑장", reviews);
  assert.equal(d.n, 2);
  assert.deepEqual(d.pros[0], ["사이트 넓음", 2]);
  assert.ok(d.cons.some(([t]) => t === "그늘 부족"));
  assert.ok(!d.cons.some(([t]) => t === "바람 셈" || t === "벌레 많음"));
});
