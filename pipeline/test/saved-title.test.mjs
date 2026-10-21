import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
const rd = (f) => readFileSync(new URL(`../../${f}`, import.meta.url), "utf8");
test("#33 찜 페이지 제목 '찜한 캠핑장'", () => { for (const f of ["camping-atlas/public/app.js", "design/renewal/app.js"]) { const s = rd(f); assert.doesNotMatch(s, /내가 찜한 <em>/); assert.equal((s.match(/<h1>찜한 <em>캠핑장<\/em><\/h1>/g) || []).length, 2); } });
