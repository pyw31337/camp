import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
const R = fileURLToPath(new URL("../../", import.meta.url));
const src = readFileSync(R + "design/renewal/app.js", "utf8");
test("EXTRA_FEE·SANITARY 상세 섹션이 있고 공개본과 같다", () => {
  assert.match(src, /id="\$\{id\}"/);
  assert.match(src, /"EXTRA_FEE", "sec-extra-fee"/);
  assert.match(src, /"SANITARY", "sec-sanitary"/);
  assert.match(src, /\$\{extraFeeSection\(d\)\}\$\{sanitarySection\(d\)\}/);
  assert.equal(src, readFileSync(R + "camping-atlas/public/app.js", "utf8"));
});
test("factPieces: 항목·값 분리, 숫자 없는 항목은 값으로", () => {
  const body = src.match(/function factPieces\(v\) \{[\s\S]*?\n\}/)[0];
  const factPieces = new Function(`${body}; return factPieces;`)();
  assert.deepEqual(factPieces("조기입실 1시간 5,000원 · 탈수기·드라이기 · C존 화장실/개수대 없음"), [["조기입실", "1시간 5,000원"], ["", "탈수기·드라이기"], ["", "C존 화장실/개수대 없음"]]);
});
test("102229 반려견: 원본 보존, 표시는 ‘반려견동반 사이트에서만 가능’", () => {
  const pin = JSON.parse(readFileSync(R + "pipeline/registry/curated-pins.json", "utf8")).camps["102229"];
  assert.equal(pin.detail["profile.fields.PET"].value, "반려견동반 사이트에서만 가능");
  assert.match(src, /\/에서만\/\.test\(PF\(d, "PET"\)/);
});
