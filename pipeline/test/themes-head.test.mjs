import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
const rd = (f) => readFileSync(new URL(`../../${f}`, import.meta.url), "utf8");
test("#25/#26 테마 페이지: EXPLORE BY MOOD 없음, 제목은 sec-head.big 규격", () => {
  for (const f of ["camping-atlas/public/app.js", "design/renewal/app.js"]) assert.doesNotMatch(rd(f), /EXPLORE BY MOOD/);
  for (const f of ["camping-atlas/public/style.css", "design/renewal/style.css"]) assert.match(rd(f), /\.themes-head h1 \{ margin: 0; font-size: clamp\(1\.8rem, 1\.2rem \+ 2\.2vw, 3rem\); font-weight: 900;/);
});
