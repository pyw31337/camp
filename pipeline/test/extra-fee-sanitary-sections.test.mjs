import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
const R = fileURLToPath(new URL("../../", import.meta.url));
const src = readFileSync(R + "design/renewal/app.js", "utf8");
test("EXTRA_FEE는 이용 정보에 합치고 SANITARY 중복 섹션은 만들지 않는다", () => {
  assert.match(src, /function profileUsageRows\(d, key, other = "기타"\)/);
  assert.match(src, /const extraFeeSection = \(\) => ""/);
  assert.match(src, /const sanitarySection = \(\) => ""/);
  assert.doesNotMatch(src, /id="\$\{id\}"[^>]*sec-(?:extra-fee|sanitary)/);
  assert.match(src, /profileUsageRows\(d, "EXTRA_FEE", "기타"\)/);
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
