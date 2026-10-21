import assert from "node:assert/strict";
import { test } from "node:test";
import { readFileSync } from "node:fs";
const html = readFileSync(new URL("../../camping-atlas/public/index.html", import.meta.url), "utf8");
const css = readFileSync(new URL("../../camping-atlas/public/style.css", import.meta.url), "utf8");
test("아이콘 묶음에 가는 선(stroke) 아이콘이 없다(작은 크기에서 뭉개짐)", () => {
  const sprite = html.slice(html.indexOf("<symbol"), html.lastIndexOf("</symbol>"));
  assert.ok(!/stroke=/.test(sprite));
});
test("아이콘 크기는 정수 픽셀로 반올림", () => {
  assert.match(css, /\.ic \{ width: round\(1\.15em, 1px\)/);
  for (const m of css.matchAll(/([^{}]*\.ic[^{}]*)\{([^{}]*)\}/g)) assert.ok(!/(?:width|height): [0-9.]+em(?:;| !)/.test(m[2]), m[1].trim().slice(0, 60));
});
test("섹션 제목 아이콘은 면으로만 그린다(선 덧그림 없음)", () => {
  assert.match(css, /\.sec-title \.ic\.line \{[^}]*fill: currentColor; stroke: none;/);
});
