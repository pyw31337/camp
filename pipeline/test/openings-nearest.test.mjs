import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
test("#45 캠핑장별 가장 가까운 앞으로의 예약 오픈을 쓴다", () => {
  for (const f of ["camping-atlas/public/app.js", "design/renewal/app.js"]) {
    const s = readFileSync(new URL(`../../${f}`, import.meta.url), "utf8");
    assert.match(s, /return fut\(o\) \? Date\.parse\(o\.at\) < Date\.parse\(cur\.at\) : false;/);
    assert.doesNotMatch(s, /if \(!S\.openings\.has\(String\(o\.id\)\) \|\| o\.kind !== "접수 마감"\) S\.openings\.set/);
  }
});
