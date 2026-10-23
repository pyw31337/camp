import { test } from "node:test";
import assert from "node:assert/strict";
import { isDueWithPriority, prioritize } from "../lib/priority.mjs";

test("prioritize: 찜한 업장을 맨 앞으로, 나머지 순서는 그대로", () => {
  const list = [{ id: 1 }, { id: 2 }, { id: 3 }, { id: 4 }];
  assert.deepEqual(prioritize(list, (x) => x.id, new Set(["3", "1"])).map((x) => x.id), [1, 3, 2, 4]);
  assert.equal(prioritize(list, (x) => x.id, new Set()), list);
});

test("isDueWithPriority: 찜한 업장은 짧은 주기로 다시 확인", () => {
  const now = Date.parse("2026-10-23T12:00:00Z");
  const twoDaysAgo = "2026-10-21T12:00:00Z";
  const ids = new Set(["7"]);
  assert.equal(isDueWithPriority("7", twoDaysAgo, 30, ids, now), true);
  assert.equal(isDueWithPriority("8", twoDaysAgo, 30, ids, now), false);
  assert.equal(isDueWithPriority("8", undefined, 30, ids, now), true);
});
