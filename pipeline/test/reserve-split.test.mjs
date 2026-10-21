import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
const src = readFileSync(new URL("../../camping-atlas/public/app.js", import.meta.url), "utf8");
const grab = (name) => { const a = src.indexOf(`function ${name}(`); let d = 0, i = src.indexOf(") {", a) + 2; for (; i < src.length; i++) { if (src[i] === "{") d++; else if (src[i] === "}" && --d === 0) break; } return src.slice(a, i + 1); };
const reserveSplit = new Function("getAllBookingChannels", "esc", "ic", `${grab("reserveSplit")}; return reserveSplit;`)(
  () => [{ platform: "naver", name: "네이버", title: "네이버에서 예약하기", url: "https://n", kind: "online" }, { platform: "phone", title: "전화로 예약 010", tel: "010", telFmt: "010", kind: "phone" }],
  (s) => String(s ?? ""), (id) => `<svg data-i="${id}"></svg>`);
test("예약 버튼은 ‘예약하기’ + 오른쪽 화살표 목록(모든 예약처와 전화)", () => {
  const h = reserveSplit({ id: 1 }, { inline: true });
  assert.match(h, /dock-reserve-label">예약하기</);
  assert.doesNotMatch(h, /에서 예약</);
  assert.match(h, /href="https:\/\/n"/);
  assert.match(h, /dock-reserve-toggle/);
  assert.match(h, /is-tel" data-tel="010"/);
  assert.match(h, /rsv-inline/);
});
test("예약 버튼이 쓰이는 모든 곳(하단바·카드·예약 칸·비교 표)이 같은 버튼을 쓴다", () => {
  assert.ok((src.match(/reserveSplit\(c/g) ?? []).length >= 4);
  assert.doesNotMatch(src, /\)\}에서 예약<\/(a|span)>/);
});
