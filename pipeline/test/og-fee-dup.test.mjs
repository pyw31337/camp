import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
// t43: 요금 문구가 이미 "1박 …"으로 시작하면 OG 설명에 "1박 1박"이 되던 문제
test("publish-explorer-pages: 요금 문구 앞에 1박을 중복으로 붙이지 않는다", () => {
  const src = readFileSync(new URL("../../scripts/publish-explorer-pages.mjs", import.meta.url), "utf8");
  const m = src.match(/fee \? \((\/[^\n]+?\/)\.test\(fee\) \? fee : `1박 \$\{fee\}`\) : ""/);
  assert.ok(m, "중복 방지 분기가 없습니다");
  const re = eval(m[1]); const lab = (fee) => (re.test(fee) ? fee : `1박 ${fee}`);
  assert.equal(lab("1박 35,000~40,000원"), "1박 35,000~40,000원");
  assert.equal(lab("35,000원"), "1박 35,000원");
  assert.equal(lab("무료"), "무료");
});
