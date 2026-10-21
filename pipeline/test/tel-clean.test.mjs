import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
const rd = (f) => readFileSync(new URL(`../../${f}`, import.meta.url), "utf8");
test("#45 전화번호 표시 정리(원본 유지)", () => {
  for (const f of ["camping-atlas/public/app.js", "design/renewal/app.js"]) {
    const s = rd(f); const m = s.match(/function telClean\(raw\) \{[\s\S]*?\n\}/); assert.ok(m);
    const T = new Function(`${m[0]}; return telClean;`)();
    const cases = { "1577-2324-": "1577-2324", "507-1482-1094": "0507-1482-1094", "55-755-3205": "055-755-3205", "010-72544579-": "010-7254-4579",
      "0507-14722-3670": null, "0505-007-1055": "0505-007-1055", "033-560-": null, "507-1494-419": null, "010-2011-314": null, "031-677-8267~8": "031-677-8267~8", "02-123-4567": "02-123-4567", "055-650-1422": "055-650-1422" };
    for (const [k, v] of Object.entries(cases)) assert.equal(T(k), v, k);
    assert.match(s, /c\.tel_raw = c\.tel; c\.tel = t;/); assert.match(s, /Object\.assign\(c, rec\);\n    cleanCampTel\(c\);/);
  }
});
