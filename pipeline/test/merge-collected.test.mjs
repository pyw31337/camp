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
