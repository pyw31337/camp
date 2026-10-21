import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
const js = readFileSync(new URL("../../camping-atlas/public/app.js", import.meta.url), "utf8");
test("지도 검색칸 오른쪽에 아이콘형 조건 버튼(공통 조건 창 열기)", () => {
  assert.match(js, /placeholder="지역 · 캠핑장"[^\n]*<button type="button" class="msearch-cond[^\n]*data-open-cond aria-label="조건으로 거르기">\$\{ic\("list"\)\}/);
});
test("지도는 조건 창 조건(condEval)을 거르고 적용하면 결과로 맞춘다", () => {
  assert.match(js, /curHash\(\)\.startsWith\("#\/map"\)\)[\s\S]{0,400}condEval\(c\)[\s\S]{0,200}MAP\.fit/);
  assert.ok((js.match(/matches\(c, \{ useArea: false \}\) && condEval\(c\) && mapBrowseEligible\(c\)/g) ?? []).length >= 2);
});
