import assert from "node:assert/strict";
import { test } from "node:test";
import { readFileSync } from "node:fs";
const app = readFileSync(new URL("../../camping-atlas/public/app.js", import.meta.url), "utf8");
const css = readFileSync(new URL("../../camping-atlas/public/style.css", import.meta.url), "utf8");
const i = app.indexOf("function serviceText(value, limit = 44)");
const serviceText = new Function(`${app.slice(i, app.indexOf("\n}\n", i) + 2)}; return serviceText;`)();
test("상세 내용은 중간에서 자르지 않는다(말줄임 없음)", () => {
  const long = "매월 1일 오전 10시에 다음 달 예약이 열립니다. 관내 주민은 하루 먼저 예약할 수 있고, 잔여 사이트는 3일부터 누구나 예약할 수 있습니다.";
  assert.equal(serviceText(long, 48), long);
  assert.ok(!serviceText(long, 48).endsWith("…"));
  assert.ok(serviceText("아주 긴 이름표 텍스트입니다 정말 긴 이름표", 10).endsWith("…"));
});
test("긴 글은 4줄 + 더보기", () => {
  assert.match(app, /function fitLongText\(root\)/);
  assert.match(app, /fitLongText\(\$\("#view"\)\)/);
  assert.match(css, /\.lt-clamp \{[^}]*-webkit-line-clamp: 4/);
});
