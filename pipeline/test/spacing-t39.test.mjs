import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
const rd = (f) => readFileSync(new URL(`../../${f}`, import.meta.url), "utf8");
test("#19 운영자 바로잡기 칸 아래 여백", () => { for (const f of ["camping-atlas/public/style.css", "design/renewal/style.css"]) assert.match(rd(f), /\.d-sec\[data-opform-sec\] \{ margin-bottom: clamp\(36px, 6vw, 64px\); \}/); });
test("#20 푸터 두 문장 줄 간격 4px", () => { for (const f of ["camping-atlas/public/shell.css", "design/renewal/shell.css"]) assert.match(rd(f), /\.site-footer-meta \{ display: flex; flex-wrap: wrap; gap: 4px 16px;/); });
