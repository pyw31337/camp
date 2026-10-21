import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
const js = readFileSync(new URL("../../camping-atlas/public/app.js", import.meta.url), "utf8");
const body = (name) => { const a = js.indexOf(`function ${name}(`); let d = 0, i = js.indexOf(") {", a) + 2; for (; i < js.length; i++) { if (js[i] === "{") d++; else if (js[i] === "}" && --d === 0) break; } return js.slice(a, i + 1); };
test("지도 카드: 덮는 링크 없음, 이름만 상세 링크", () => {
  const m = body("mapItem");
  assert.doesNotMatch(m, /card-hit/);
  assert.match(m, /<h3><a class="mi-name" href="\$\{APP_BASE\}place\//);
});
test("지도 카드를 누르면 모든 화면 폭에서 지도 확대·초점(selectPin)", () => {
  const b = body("bindMap");
  assert.match(b, /closest\("\.map-list \.mi, \.map-peek \.mi"\)/);
  assert.doesNotMatch(b, /innerWidth >= 900/);
  assert.match(b, /MAP\?\.setView\(c\.lat, c\.lng, Math\.max\(MAP\.zoom\(\), 14\)\); selectPin\(c\);/);
});
