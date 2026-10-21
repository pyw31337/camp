import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
const css = readFileSync(new URL("../../camping-atlas/public/style.css", import.meta.url), "utf8");
test("모바일 상세는 로고 머리 줄을 숨기고 d-bar 가 맨 위", () => {
  const m = css.match(/@media \(max-width: 759px\) \{\s*body\[data-view="detail"\] \.top \{ display: none; \}/);
  assert.ok(m, "모바일 상세 .top 숨김 규칙");
  assert.match(css, /body\[data-view="detail"\] \.d-bar \{ padding-top: calc\(10px \+ env\(safe-area-inset-top\)\); \}/);
});
