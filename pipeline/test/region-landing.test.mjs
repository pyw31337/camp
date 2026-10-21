import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
const rd = (f) => readFileSync(new URL(`../../${f}`, import.meta.url), "utf8");
test("#40 시·도/시·군·구 랜딩: 앱 화면·주소·상세 링크·정적 미리보기", () => {
  for (const f of ["camping-atlas/public/app.js", "design/renewal/app.js"]) {
    const s = rd(f);
    assert.match(s, /h\.startsWith\("#\/region\/"\) \? "region"/);
    assert.match(s, /theme\\\/\|region\\\/\|/);
    assert.match(s, /function regionView\(sido, sgg\)/);
    assert.match(s, /sidoShort\(c\.sido\) === sd/);
    assert.match(s, /class="d-region-link" href="\$\{regionHref\(sidoShort\(c\.sido\), c\.sigungu\)\}"/);
  }
  const pub = rd("scripts/publish-explorer-pages.mjs");
  assert.match(pub, /region\/\$\{encodeURIComponent\(sd\)\}/);
  assert.match(pub, /<link rel="canonical"/);
});
