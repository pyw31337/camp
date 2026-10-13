import assert from "node:assert/strict";
import test from "node:test";
import { findFreeCandidates } from "../lib/free-discovery.mjs";

const item = (o) => ({ contentId: "1", facltNm: "예시", doNm: "강원도", sigunguNm: "화천군", facltDivNm: "지자체", toiletCo: "2", wtrplCo: "1", ...o });

test("이용료 무료 표현만 후보로 잡는다", () => {
  const r = findFreeCandidates([
    item({ contentId: "1", intro: "군에서 운영하며 이용료는 무료입니다. 개수대와 화장실이 있습니다." }),
    item({ contentId: "2", intro: "무료 와이파이와 무료 주차를 제공합니다." }),
    item({ contentId: "3", lineIntro: "강변 무료 야영장" }),
    item({ contentId: "4", intro: "1박 40,000원" }),
    item({ contentId: "5", intro: "풀장과 히노끼탕 등 공용 시설은 무료로 이용할 수 있습니다." }),
    item({ contentId: "6", intro: "캠핑장 이용객은 낚시터를 무료로 이용할 수 있다." }),
    item({ contentId: "7", intro: "군 직영 야영장으로 연중 무료 개방한다." }),
  ]);
  assert.deepEqual(r.map((x) => x.gocamping_id).sort(), ["1", "3", "7"]);
  assert.ok(r[0].snippet.includes("무료"));
});

test("화장실·취사 단서가 있는 후보가 먼저", () => {
  const r = findFreeCandidates([
    item({ contentId: "a", toiletCo: "0", wtrplCo: "0", intro: "이용료 무료" }),
    item({ contentId: "b", intro: "이용료 무료, 취사장 있음" }),
  ]);
  assert.equal(r[0].gocamping_id, "b");
  assert.equal(r[0].cooking_hint, true);
});
