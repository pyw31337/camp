import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
const js = readFileSync(new URL("../../camping-atlas/public/app.js", import.meta.url), "utf8");
const body = (name) => { const a = js.indexOf(`function ${name}(`); let d = 0, i = js.indexOf(") {", a) + 2; for (; i < js.length; i++) { if (js[i] === "{") d++; else if (js[i] === "}" && --d === 0) break; } return js.slice(a, i + 1); };
test("지도 다시 그리기는 미리 계산한 목록(mapPool)을 쓰고, 정렬 비교 안에서 사진 목록을 만들지 않는다", () => {
  const d = body("drawMap");
  assert.match(d, /mapPool\(\)/);
  assert.doesNotMatch(d, /matches\(|photoLast\(|hasPhoto\b|mapBrowseEligible\(/);
  assert.match(d, /if \(lk === mapListKey && list\.childElementCount\) return;/);
});
test("mapPool 은 조건·사진 자료가 바뀌면 다시 계산", () => {
  const p = body("mapPool");
  for (const k of ["S.q", "S.quick", "S.feeBand", "S.find", "S.has", "S.stype", "S.theme", "S.photos", "S.cards", "DEAD.size"]) assert.ok(p.includes(k), k);
});
