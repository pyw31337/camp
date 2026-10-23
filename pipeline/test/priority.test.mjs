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

test("prioritize·isDueWithPriority를 쓰는 수집기는 import가 있다(2026-10-23 런타임 ReferenceError 재발 방지)", async () => {
  const { readdirSync, readFileSync } = await import("node:fs");
  const dir = new URL("../scripts/", import.meta.url);
  for (const f of readdirSync(dir).filter((x) => x.endsWith(".mjs"))) {
    const src = readFileSync(new URL(f, dir), "utf8");
    for (const fn of ["prioritize", "isDueWithPriority", "priorityIds"]) {
      if (new RegExp(`\\b${fn}\\(`).test(src)) assert.match(src, new RegExp(`^import \\{[^}]*\\b${fn}\\b[^}]*\\} from "\\.\\./lib/priority\\.mjs";`, "m"), `${f}: ${fn} import 없음`);
    }
  }
});
