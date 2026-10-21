import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
const rd = (f) => readFileSync(new URL(`../../${f}`, import.meta.url), "utf8");
test("#27 운영종료 뱃지가 .theme-card span(left/bottom) 규칙에 늘어나지 않음", () => {
  for (const f of ["camping-atlas/public/style.css", "design/renewal/style.css"]) assert.match(rd(f), /\.theme-card \.theme-closed-badge \{ left: auto; bottom: auto; display: inline-flex;/);
});
