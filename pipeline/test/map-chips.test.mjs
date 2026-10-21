import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
for (const f of ["camping-atlas/public/style.css", "design/renewal/style.css"]) test(`${f}: 지도 빠른 조건 칩은 흰 바탕(캡슐 토큰을 지도 칸에서만 덮음)`, () => {
  assert.match(readFileSync(new URL(`../../${f}`, import.meta.url), "utf8"), /\.map-panel \{ --cap-bg: var\(--paper\); --cap-ink: var\(--ink\);/);
});
