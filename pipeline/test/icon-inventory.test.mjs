import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
const js = readFileSync(new URL("../../camping-atlas/public/app.js", import.meta.url), "utf8");
test("장작은 어디서나 firewood 아이콘(같은 개념 = 하나의 아이콘)", () => {
  assert.doesNotMatch(js, /ic\("flame"\)\}장작/);
  assert.match(js, /fire: \{ label: "장작", icon: "firewood"/);
  assert.match(js, /NO_FIREWOOD: \["장작 불가", "firewood"\]/);
});
test("인벤토리 문서가 있다", () => { assert.match(readFileSync(new URL("../../docs/ICON_INVENTORY.md", import.meta.url), "utf8"), /같은 개념 = 하나의 아이콘/); });
