import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
const rd = (f) => readFileSync(new URL(`../../${f}`, import.meta.url), "utf8");
// t39 #41: 조건 시트의 계절·풍경(봄꽃·여름 물놀이·단풍·일출)·덤프스테이션 조건
test("#41 조건 시트에 계절·풍경·덤프 조건이 있고 URL로 오간다", () => {
  for (const f of ["camping-atlas/public/app.js", "design/renewal/app.js"]) {
    const s = rd(f);
    const m = s.match(/const COND_BOOL = \{([\s\S]*?)\n\};/);
    assert.ok(m, "COND_BOOL");
    const B = new Function(`return {${m[1]}}`)();
    assert.deepEqual(Object.keys(B), ["dump", "sun", "leaf", "spring", "summer"]);
    assert.equal(B.sun[1]({ th: ["sunrise"] }), "y");
    assert.equal(B.sun[1]({ th: ["kids"] }), "n");
    assert.equal(B.leaf[1]({}), "?"); // 정보 없으면 빼지 않는다
    assert.equal(B.dump[1]({ amenities: ["덤프스테이션"] }), "y");
    assert.equal(B.dump[1]({ amenities: ["전기"] }), "?");
    assert.match(s, /<h3>계절·풍경<\/h3>/);
    assert.match(s, /for \(const b of Object\.keys\(COND_BOOL\)\) k\[b\] = q\.get\(b\) === "1";/);
  }
});
