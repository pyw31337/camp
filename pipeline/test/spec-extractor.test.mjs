import assert from "node:assert/strict";
import test from "node:test";
import { attributable, buildSpecSheet, extractFromSentence, isRoundup, nameTokens } from "../lib/spec-extractor.mjs";

const codes = (s) => Object.fromEntries(extractFromSentence(s, { year: 2026 }).map((f) => [f.code, f.value]));

test("입·퇴실·매너타임 시간을 정규화한다", () => {
  assert.equal(codes("입실 오후 2시, 퇴실 오전 11시입니다").CHECKIN_TIME, "14:00부터");
  assert.equal(codes("체크인 15:00 / 체크아웃 11:00").CHECKIN_TIME, "15:00부터");
  assert.equal(codes("체크아웃 12시까지").CHECKOUT_TIME, "12:00까지");
  assert.equal(codes("매너타임 22시~07시 꼭 지켜주세요").MANNER_TIME, "22:00~07:00");
  assert.equal(codes("입·퇴실: 14:00 / 11:00").CHECKIN_TIME, "14:00부터");
  assert.equal(codes("입·퇴실: 14:00 / 11:00").CHECKOUT_TIME, "11:00까지");
  assert.equal(codes("15:00 입실 11:00 퇴실").CHECKIN_TIME, "15:00부터");
  assert.equal(codes("15:00 입실 11:00 퇴실").CHECKOUT_TIME, "11:00까지");
  assert.equal(codes("소등은 밤 10시 입니다").MANNER_TIME, "22:00부터");
  assert.equal(codes("매너타임은 오후 10시 ~ 익일 오전 8시까지입니다").MANNER_TIME, "22:00~08:00");
  assert.equal(codes("입실 35시").CHECKIN_TIME, undefined);
});

test("얼리·레이트 요금과 불가를 구분한다", () => {
  assert.equal(codes("얼리체크인은 시간당 5,000원입니다").EARLY_CHECKIN, "시간당 5,000원");
  assert.equal(codes("레이트 체크아웃 불가합니다").LATE_CHECKOUT, "불가");
  assert.equal(codes("레이트체크아웃 1만원").LATE_CHECKOUT, "10,000원");
});

test("연박 규칙·추가 요금·반려견·대여·행사·전기·환불", () => {
  assert.equal(codes("주말은 2박 우선 예약입니다").MIN_STAY, "2박 우선 예약");
  assert.equal(codes("인원 추가 시 1인 10,000원").EXTRA_PERSON_FEE, "1인 10,000원");
  assert.equal(codes("기준인원 초과 시 1인 10,000원").EXTRA_PERSON_FEE, "1인 10,000원");
  assert.equal(codes("차량 1대 추가 10,000원").EXTRA_CAR_FEE, "1대 10,000원");
  assert.equal(codes("※ 전열기구 600w초과 또는 전기제품에 문제 발생 시 차단기 내려갑니다").POWER_W, "600W");
  assert.equal(codes("당일 취소시 환불 불가합니다").REFUND_POLICY, "당일 취소 환불 불가");
  assert.equal(codes("이용 7일 전 100% 환불").REFUND_POLICY, "7일 전 100% 환불");
  assert.equal(codes("방문객은 받지 않습니다").VISITOR_POLICY, "방문객 불가");
  assert.equal(codes("반려견 동반 가능 (소형견 2마리)").PET_POLICY, "동반 가능 (소형견 · 2마리까지)");
  assert.equal(codes("전기장판 대여 5,000원, 화로대 대여 10,000원").RENTAL, "화로대 10,000원");
  assert.equal(extractFromSentence("전기장판 대여 5,000원, 화로대 대여 10,000원").filter((f) => f.code === "RENTAL").length, 2);
  const promo = extractFromSentence("가을맞이 10.1~11.30 평일 20% 할인 이벤트", { year: 2026 }).find((f) => f.code === "PROMOTION");
  assert.deepEqual(promo.period, { from: "2026-10-01", to: "2026-11-30" });
  assert.equal(codes("연박 할인 이벤트 진행중").MIN_STAY, undefined);
});

test("묶음 글은 후기 언급에서 제외하고, 이름 핵심어가 있어야 귀속한다", () => {
  assert.deepEqual(nameTokens("[공립] 음성 수레의산자연휴양림 국민여가캠핑장"), ["음성", "수레의산"]);
  assert.equal(isRoundup({ title: "무주 캠핑장 추천 5곳", snippet: "" }), true);
  assert.equal(isRoundup({ title: "후기", snippet: "📍 A펜션 체크인 15:00 📍 B캠핑장" }), true);
  assert.equal(attributable({ title: "수레의산 캠핑 후기", snippet: "입실 2시" }, "[공립] 음성 수레의산자연휴양림 국민여가캠핑장"), true);
  assert.equal(attributable({ title: "다른 곳 후기", snippet: "입실 2시" }, "[공립] 음성 수레의산자연휴양림 국민여가캠핑장"), false);
});

test("스펙 시트: 공식 문장이 우선, 후기는 건수·충돌만, 지난 행사는 숨김", () => {
  const sheet = buildSpecSheet({
    name: "솔바람캠핑장",
    now: "2026-10-15T00:00:00Z",
    docs: [{ text: "입실 14:00, 퇴실 12:00. 9.1~9.30 할인 이벤트.", grade: "OFFICIAL_TEXT", source: { kind: "gocamping_intro", label: "고캠핑 소개", url: "https://www.gocamping.or.kr/" } }],
    reviews: [
      { title: "솔바람 캠핑 후기", snippet: "체크인 15시라 조금 기다렸어요. 레이트 체크아웃 시간당 5,000원", url: "https://blog.example/1", date: "2026-10-01" },
      { title: "솔바람 다녀옴", snippet: "입실 14시 퇴실 12시", url: "https://blog.example/2", date: "2026-09-20" },
      { title: "강원 캠핑장 추천 7곳", snippet: "솔바람 입실 13시", url: "https://blog.example/3", date: "2026-10-02" },
    ],
  });
  assert.equal(sheet.fields.CHECKIN_TIME.grade, "OFFICIAL_TEXT");
  assert.equal(sheet.fields.CHECKIN_TIME.values[0].value, "14:00부터");
  assert.equal(sheet.fields.CHECKIN_TIME.conflict, true); // 후기: 15시 1건, 14시 1건
  assert.equal(sheet.fields.LATE_CHECKOUT.grade, "MENTION");
  assert.equal(sheet.fields.LATE_CHECKOUT.values.length, 0); // 후기 값은 확정 칸에 올리지 않는다
  assert.equal(sheet.fields.PROMOTION, undefined); // 9월 행사는 지남
  assert.equal(sheet.stats.roundups_skipped, 1);
});

test("상시 할인 대상과 기간 행사를 나누고, 일반 명사 ‘방문객’은 정책으로 보지 않는다", () => {
  assert.equal(codes("다자녀 50% 할인 혜택").DISCOUNT, "다자녀 50%");
  assert.equal(codes("김해시민이라면 20% 할인").DISCOUNT, "김해시민 20%");
  assert.equal(codes("자매도시 숙박 최대 30% 할인").DISCOUNT, "자매도시 30%");
  assert.equal(codes("평일 20% 할인 이벤트").PROMOTION, undefined); // 기간이 없으면 행사로 올리지 않는다
  assert.equal(codes("가족 단위 방문객에게 즐거운 경험을 제공합니다").VISITOR_POLICY, undefined);
  assert.equal(codes("방문객의 입장은 금지하고 있습니다").VISITOR_POLICY, "방문객 불가");
  assert.equal(codes("방문객 1인 5,000원").VISITOR_POLICY, "1인 5,000원");
});

test("입·퇴실: 날 표현(첫 날·입촌일)을 건너뛰고, 입실 시각을 퇴실로 다시 읽지 않는다", () => {
  const codes = (s) => extractFromSentence(s).map((x) => `${x.code}:${x.norm}`);
  assert.deepEqual(codes("입실시간 : 첫 날 오후 2시 퇴실시간 : 마지막 날 오후 12시"), ["CHECKIN_TIME:14:00", "CHECKOUT_TIME:12:00"]);
  assert.deepEqual(codes("⏰ 체크인 : 입촌일 14시 ~ 체크아웃 : 퇴촌일 11시"), ["CHECKIN_TIME:14:00", "CHECKOUT_TIME:11:00"]);
  assert.deepEqual(codes("입실 13시 퇴실 익일 11..."), ["CHECKIN_TIME:13:00"]);
});

test("후기 귀속: 이름에 붙은 지명(가평물의나라)을 떼고도 알아본다", () => {
  assert.deepEqual(nameTokens("가평물의나라 오토캠핑장", ["가평군", "경기도"]), ["가평물의나라", "물의나라"]);
  assert.equal(attributable({ title: "물의나라 캠핑장 후기", snippet: "입실 12:00" }, "가평물의나라 오토캠핑장", ["가평군"]), true);
  assert.equal(attributable({ title: "물의나라 캠핑장 후기", snippet: "" }, "가평물의나라 오토캠핑장"), false); // 지역을 모르면 예전처럼
  assert.deepEqual(nameTokens("경주캠핑장", ["경주시"]), ["경주"]); // 지명만 남는 이름은 늘리지 않는다
});
