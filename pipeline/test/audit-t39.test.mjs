import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
const rd = (f) => readFileSync(new URL(`../../${f}`, import.meta.url), "utf8");
// t39 #45 최종 감사에서 나온 결함
test("#45 지역 주소: 301 깨진 한글(ê²½ê¸°)을 되돌리고, 링크는 끝 ‘/’", () => {
  for (const f of ["camping-atlas/public/app.js", "design/renewal/app.js"]) {
    const s = rd(f);
    const m = s.match(/function fixMojibake\(x\) \{[\s\S]*?\n\}/);
    assert.ok(m);
    const fix = new Function(`${m[0]}; return fixMojibake;`)();
    assert.equal(fix("ê²½ê¸°"), "경기");
    assert.equal(fix("ê°íêµ°".length ? decodeURIComponent(escape(unescape(encodeURIComponent("가평군")))) : ""), "가평군");
    assert.equal(fix(unescape(encodeURIComponent("가평군"))), "가평군");
    assert.equal(fix("경기"), "경기");
    assert.equal(fix("Seoul"), "Seoul");
    assert.match(s, /const regionHref = \(sido, sgg\) => `\$\{APP_BASE\}region\/\$\{encodeURIComponent\(sido\)\}\/\$\{sgg \? `\$\{encodeURIComponent\(sgg\)\}\/` : ""\}`;/);
  }
});
test("#45 320px 사이트 타입 카드 긴 글자 줄바꿈(가로 넘침 방지)", () => {
  for (const f of ["camping-atlas/public/style.css", "design/renewal/style.css"]) assert.match(rd(f), /\.stype-b b, \.stype-b i \{ overflow-wrap: anywhere; \}/);
});
