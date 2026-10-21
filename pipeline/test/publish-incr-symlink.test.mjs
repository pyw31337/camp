import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
// 증분 발행: 작업 사본에 node_modules 링크가 이미 있어도(main에 추적된 링크) ln이 실패하지 않아야 한다.
test("publish-incremental: 링크 전에 기존 링크를 지운다", () => {
  const s = readFileSync(new URL("../scripts/publish-incremental.sh", import.meta.url), "utf8");
  assert.match(s, /rm -f "\$WT\/pipeline\/node_modules"\nln -s "\$SRC\/node_modules" "\$WT\/pipeline\/node_modules"/);
});
