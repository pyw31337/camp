import { test } from "node:test";
import assert from "node:assert/strict";
import { coverageDrops, mergeWebMentions } from "../lib/merge-collected.mjs";

test("웹 언급 병합은 덧붙이기만 한다: 기존 글·요금은 남기고 새 글만 더한다", () => {
  const d = { reviews: [{ url: "k1" }], web: [{ url: "w1", date: "2025-01-01", title: "old" }], prices: [{ url: "w1", won: 40000 }] };
  const w = {
    fetched_at: "2026-10-19T04:00:00Z",
    docs: [{ url: "k1", title: "카카오와 겹침" }, { url: "w1", date: "2025-01-01", title: "갱신" }, { url: "w2", date: "2026-05-01", title: "새 글" }],
    prices: [{ url: "w1", won: 40000 }, { url: "w2", won: 50000 }],
  };
  const a = mergeWebMentions(d, w, { w2: ["입실은 14시입니다."], k1: ["퇴실 11시"] });
  assert.deepEqual(a, { docs: 1, prices: 1, bodies: 2 });
  assert.deepEqual(d.web.map((x) => x.url), ["w2", "w1"]); // 최신 글 먼저, 카카오 후기와 겹치는 글은 빼고
  assert.equal(d.web[1].title, "갱신");
  assert.equal(d.prices.length, 2);
  assert.equal(d.reviews[0].body[0], "퇴실 11시");
  assert.equal(d.web_checked_at, "2026-10-19T04:00:00Z");
  // 다시 병합해도 늘지 않는다(멱등)
  assert.deepEqual(mergeWebMentions(d, w, {}), { docs: 0, prices: 0, bodies: 0 });
});

test("커버리지 회귀 검사: max(20곳, 2%) 넘게 줄면 실패", () => {
  const base = { fields: { reviews: { any: 2686 }, price: { any: 1865 }, manner: { any: 30 } } };
  assert.deepEqual(coverageDrops(base, { fields: { reviews: { any: 2680 }, price: { any: 1870 }, manner: { any: 15 } } }), []);
  const drops = coverageDrops(base, { fields: { reviews: { any: 1272 }, price: { any: 1243 }, manner: { any: 30 } } });
  assert.deepEqual(drops.map((x) => x.field), ["reviews", "price"]);
});

test("커버리지 회귀 검사: 검토 기록(coverage_acks)이 있는 감소만 기록 값까지 14일 동안 통과", () => {
  const base = { fields: { refund: { any: 887 }, power_w: { any: 673 } } };
  const next = { fields: { refund: { any: 839 }, power_w: { any: 626 } } };
  const now = Date.parse("2026-10-23T15:00:00Z");
  const acks = [{ field: "refund", after: 839, reason: "잘못된 출처 정리", at: "2026-10-23" }];
  assert.deepEqual(coverageDrops(base, next, acks, now).map((x) => x.field), ["power_w"]);
  // 기록보다 더 줄면 다시 막는다
  assert.deepEqual(coverageDrops(base, { fields: { refund: { any: 700 }, power_w: { any: 673 } } }, acks, now).map((x) => x.field), ["refund"]);
  // 14일이 지나면 기록은 효력이 없다
  assert.deepEqual(coverageDrops(base, next, acks, Date.parse("2026-11-10T00:00:00Z")).map((x) => x.field), ["refund", "power_w"]);
  // 이유 없는 기록은 무시
  assert.deepEqual(coverageDrops(base, next, [{ field: "refund", after: 839, at: "2026-10-23" }], now).map((x) => x.field), ["refund", "power_w"]);
});

test("mergeSocial: 소셜이 없던 장소에 영상·글·사진을 채우고, 고캠핑 빌드 결과는 건드리지 않는다", async () => {
  const { mergeSocial } = await import("../lib/merge-collected.mjs");
  const so = {
    fetched_at: "2026-10-23T10:00:00+09:00",
    vclip: [{ url: "https://www.youtube.com/watch?v=AAAAAAAAAAA", title: "휴양림 캠핑 브이로그" }, { url: "https://youtu.be/AAAAAAAAAAA", title: "같은 영상" }],
    blog: [{ url: "https://blog.example/1", title: "후기" }],
    image: [{ thumb: "https://t/1.jpg", url: "https://blog.example/1" }, { thumb: "https://t/shared.jpg", url: "x" }],
  };
  const d = { web: [{ url: "https://blog.example/1", title: "이미 있는 글" }] };
  const a = mergeSocial(d, so, { sharedThumb: (t) => t.endsWith("shared.jpg") });
  assert.deepEqual(a, { videos: 1, posts: 0, images: 1 });
  assert.equal(d.videos.length, 1);
  assert.equal(d.social_merged, true);
  assert.deepEqual(mergeSocial(d, so, { sharedThumb: (t) => t.endsWith("shared.jpg") }), { videos: 0, posts: 0, images: 0 }); // 멱등
  const gc = { social_checked_at: "2026-10-19T00:00:00+09:00", videos: [] }; // build-explore-data가 붙인 고캠핑 상세
  assert.deepEqual(mergeSocial(gc, so), { videos: 0, posts: 0, images: 0 });
  assert.equal(gc.videos.length, 0);
});
