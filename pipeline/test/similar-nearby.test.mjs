import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
const rd = (f) => readFileSync(new URL(`../../${f}`, import.meta.url), "utf8");
test("#37 상세 주변 비슷한 캠핑장 3곳", () => {
  for (const f of ["camping-atlas/public/app.js", "design/renewal/app.js"]) {
    const s = rd(f);
    assert.match(s, /function similarNearby\(c, n = 3\)/);
    assert.match(s, /\.filter\(\(r\) => r\.km <= 40 && r\.share > 0\)/);
    assert.match(s, /\$\{nearbyHubHtml\(c, d\)\}\n\s+\$\{similarHtml\(c\)\}/);
  }
  for (const f of ["camping-atlas/public/style.css", "design/renewal/style.css"]) assert.match(rd(f), /\.sim-rail \{ display: grid; grid-template-columns: repeat\(3, minmax\(0, 1fr\)\)/);
});
