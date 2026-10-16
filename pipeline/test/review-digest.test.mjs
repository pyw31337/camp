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

test("후기에서 운영 이슈 및 행사 감지, 원문 샘플 추적", () => {
  const reviews = [
    { title: "솔바람캠핑장 여름 휴가", snippet: "수영장 개장해서 아이들이 너무 좋아했어요! 사장님 친절하시고 온수 펑펑 잘 나옵니다.", url: "https://blog.naver.com/test1" },
    { title: "솔바람캠핑장 가을 방문", snippet: "단풍 시즌이라 뷰가 끝내주네요. 동계 휴장 전에 꼭 가보세요.", url: "https://blog.naver.com/test2" },
  ];
  const d = digestReviews("솔바람캠핑장", reviews);
  assert.equal(d.n, 2);
  assert.ok(d.details);
  assert.ok(d.details.issues.some((x) => x.issue === "수영장·물놀이 개장" || x.issue === "동계 휴장·운영 중단" || x.issue === "단풍·벚꽃 시즌"));
  assert.ok(d.details.pros.some((x) => x.topic === "온수 펑펑" || x.topic === "아이들 놀기 좋음"));
  const hotWater = d.details.pros.find((x) => x.topic === "온수 펑펑");
  assert.ok(hotWater?.samples?.length > 0);
  assert.equal(hotWater.samples[0].url, "https://blog.naver.com/test1");
});
