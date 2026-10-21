import assert from "node:assert/strict";
import { test } from "node:test";
import { readFileSync } from "node:fs";

// 영우 님 2026-10-21: 공지·이용규칙에 캠핑과 상관없는 문구(약관·결제 화면·아이콘 이름)가 보이던 문제
const app = readFileSync(new URL("../../camping-atlas/public/app.js", import.meta.url), "utf8");
const start = app.indexOf("const OPERATOR_NOISE = [");
const end = app.indexOf("// 운영자 원문은 말투·질문·반복이 섞여 있으므로");
const { operatorNoise, textFragUrl } = new Function(`${app.slice(start, end)}; return { operatorNoise, textFragUrl };`)();

test("상관없는 문구는 거른다", () => {
  for (const t of ["취소일 : 2024-06-12 17:52", "local_parking 주차장", "전기통신사업법에 규정된 기간통신사업자의 전기통신 서비스 중지", "국가비상사태, 정전, 천재지변 등 불가항력", "8,000원 (취소)", "취소된 예약입니다.", "회원은 본 약관, 공지사항, 운영정책 및 관계 법령을 준수하여야 하며", "순환형 바다노선/인천레트로 노선은 하루 3회"]) assert.ok(operatorNoise(t), t);
});
test("캠핑 규정은 남긴다", () => {
  for (const t of ["캠핑장 입실은 14:00, 퇴실은 다음날 11:00입니다", "이용일 3일 전 취소 시 50% 환불", "전기는 사이트당 600W까지 사용 가능합니다", "주차는 사이트당 1대", "매너타임 22:00~07:00", "반려동물 동반 불가"]) assert.ok(!operatorNoise(t), t);
});
test("원문 보기는 그 문장으로 바로 가는 링크", () => {
  const u = textFragUrl("https://a.kr/r/", "캠핑장 입실은 14:00, 퇴실은 다음날 11:00입니다");
  assert.match(u, /^https:\/\/a\.kr\/r\/#:~:text=/);
  assert.equal(textFragUrl("https://a.kr/r/#x", "긴 문장입니다 정말로"), "https://a.kr/r/#x");
});
test("공지·요금·규칙 모두 같은 필터를 쓴다", () => {
  assert.ok(!/for \(const (x|raw) of d\?\.operator_snippets/.test(app));
  assert.match(app, /clean\(h\.rules\)/);
});
