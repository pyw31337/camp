import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
const rd = (f) => readFileSync(new URL(`../../${f}`, import.meta.url), "utf8");
test("#36 유튜브 숏츠 세로 카드 줄·숏츠 더보기", () => {
  for (const f of ["camping-atlas/public/app.js", "design/renewal/app.js"]) {
    const s = rd(f);
    assert.match(s, /x\.kind === "short" \|\| \/youtube\\\.com\\\/shorts\\\/\/i/);
    assert.match(s, /class="rail vids-shorts" data-shorts/);
    assert.match(s, /data-shorts-more/);
    assert.match(s, /isShort\(x\) \? "hqdefault" : "hq720"/);
  }
  for (const f of ["camping-atlas/public/style.css", "design/renewal/style.css"]) assert.match(rd(f), /\.vid-wrap\.is-short \.vid img, \.vid-wrap\.is-short \.vid-noimg \{ width: 136px; aspect-ratio: 9 \/ 16; \}/);
});
