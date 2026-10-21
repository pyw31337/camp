import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
const rd = (f) => readFileSync(new URL(`../../${f}`, import.meta.url), "utf8");
test("#35 상세 섹션 간격 확대", () => { for (const f of ["camping-atlas/public/style.css", "design/renewal/style.css"]) { const s = rd(f); assert.match(s, /body\[data-view="detail"\] \.d-main \{ gap: clamp\(48px, 5vw, 64px\); \}/); assert.match(s, /@media \(max-width: 759px\) \{ body\[data-view="detail"\] \.d-main \{ gap: 54px; \} \}/); } });
