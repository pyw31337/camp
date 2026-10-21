import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
const rd = (f) => readFileSync(new URL(`../../${f}`, import.meta.url), "utf8");
for (const f of ["camping-atlas/public/app.js", "design/renewal/app.js"]) test(`비교 화면 t39 #28–31 (${f})`, () => {
  const s = rd(f);
  assert.doesNotMatch(s, /다른 점만 강조<\/span>|data-diff-only/, "#28 토글 제거");
  assert.match(s, /cmp-cards-view diff-on/, "#28 기본 강조");
  assert.doesNotMatch(s, /최대 5곳 선택\) ·/, "#29 안내 문구 제거");
  assert.match(s, />표로 비교<\/button>/); assert.match(s, />스펙 비교<\/button>/, "#31");
});
test("#30 모바일 찜 칩 줄바꿈", () => { for (const f of ["camping-atlas/public/style.css", "design/renewal/style.css"]) assert.match(rd(f), /\.cmp-page \.picks \{ flex-wrap: wrap; overflow: visible; gap: 6px; \}.*\.pick img.*display: none;/); });
test("#32 표 레이블 열 고정", () => { assert.match(rd("camping-atlas/public/style.css"), /\.cmp-table thead th, \.cmp-table tbody th\[scope="row"\] \{ position: sticky; left: 0; \}/); });
test("#30b 옛 9em 칩 규칙이 다시 끼어들지 않음(리베이스 합치기 회귀)", () => { for (const f of ["camping-atlas/public/style.css", "design/renewal/style.css"]) assert.doesNotMatch(rd(f), /\.cmp-page \.picks \.pick span \{ max-width: 9em; \}/); });
