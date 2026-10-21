import assert from "node:assert/strict";
import { test } from "node:test";
import { readFileSync } from "node:fs";
const app = readFileSync(new URL("../../camping-atlas/public/app.js", import.meta.url), "utf8");
test("모든 가로 스크롤 영역 마우스 끌기(위임)", () => {
  assert.match(app, /const hScrollOf = \(el\) =>/);
  assert.match(app, /overflowX/);
  assert.match(app, /if \(moved\) swallowNextClick\(\)/);
});
test("탭 칸 좌우 스와이프로 이웃 탭(주변시설 카테고리)", () => {
  assert.match(app, /closest\?\.\("\[role='tabpanel'\]"\)/);
  assert.match(app, /addEventListener\("touchend"/);
  assert.match(app, /addEventListener\("pointerup", \(e\) => \{ if \(e.pointerType === "mouse"\) swipeEnd\(e.clientX, e.clientY\); \}, true\)/);
  assert.match(app, /e.target.closest\?\.\("\[role='tabpanel'\]"\)\) e.preventDefault/);
  assert.match(app, /st\.panel\.parentElement\?\.closest\(/); // 칸(section) 자신이 아니라 바깥 섹션의 탭
  assert.match(app, /setTimeout\(\(\) => removeEventListener\("click", f, \{ capture: true \}\), 450\)/);
});
