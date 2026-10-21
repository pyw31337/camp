import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
const rd = (f) => readFileSync(new URL(`../../${f}`, import.meta.url), "utf8");
test("#34 홈 전환: photosOf 기억, 지연 줄 높이를 JS로 재지 않음, 화면 밖 테마 줄 content-visibility", () => {
  for (const f of ["camping-atlas/public/app.js", "design/renewal/app.js"]) {
    const s = rd(f);
    assert.match(s, /let PH_MEMO = new Map\(\)/);
    assert.doesNotMatch(s, /\$\("\.trow-rail", root\)\?\.offsetHeight/);
  }
  for (const f of ["camping-atlas/public/style.css", "design/renewal/style.css"]) {
    const s = rd(f);
    assert.match(s, /\.trow\[data-lazy-row\] \.trow-rail \{ min-height: 754px; \}/);
    assert.match(s, /\.trows > \.trow:nth-child\(n\+3\) \{ content-visibility: auto; contain-intrinsic-size: auto 774px; \}/);
  }
});
