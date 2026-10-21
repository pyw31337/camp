// 배포는 design/renewal/style.css 를 원본으로 public/style.css 를 다시 만든다(scripts/publish-explorer-pages.mjs).
// public 쪽만 고치면 라이브에 안 나간다(2026-10-21 #199·#203 CSS 누락 원인) — 두 파일이 같아야 한다(이미지 경로만 다름).
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
const rd = (f) => readFileSync(new URL(`../../${f}`, import.meta.url), "utf8");
test("design/renewal/style.css 와 camping-atlas/public/style.css 가 같다(이미지 경로 제외)", () => {
  assert.equal(rd("design/renewal/style.css").replaceAll('url("../images/', 'url("./images/'), rd("camping-atlas/public/style.css"));
});
