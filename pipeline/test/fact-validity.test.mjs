import assert from "node:assert/strict";
import { test } from "node:test";
import { readFileSync } from "node:fs";
const app = readFileSync(new URL("../../camping-atlas/public/app.js", import.meta.url), "utf8");
const { validFact, firstValid } = new Function(`${app.slice(app.indexOf("const FACT_RULES = {"), app.indexOf("// 상세 프로필·후기 값이 없으면"))}; return { validFact, firstValid };`)();
test("말이 안 되는 시각·내용 없는 값은 거르고 다음 출처를 쓴다", () => {
  assert.equal(validFact("입실", { v: "01:00부터" }), null);
  assert.equal(validFact("퇴실", { v: "00:00까지" }), null);
  assert.equal(validFact("매너타임", { v: "07:00~22:00" }), null);
  assert.equal(validFact("환불", { v: "규정 있음" }), null);
  assert.equal(firstValid("입실", { v: "01:00부터" }, { v: "14:00" }).v, "14:00");
  assert.ok(validFact("입실", { v: "14:00부터" }));
  assert.ok(validFact("매너타임", { v: "22:00~07:00" }));
  assert.ok(validFact("환불", { v: "3일 전 50%" }));
});
test("이용 정보가 검증을 거친다", () => { assert.match(app, /\["입실", firstValid\("입실"/); assert.match(app, /tiFact\(c, "o", "checkout"\)/); });
