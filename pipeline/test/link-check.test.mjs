import assert from "node:assert/strict";
import { test } from "node:test";
import { isNaverBookingDeep, judge, merge, noCheck } from "../lib/link-check.mjs";

test("자동 확인이 막힌 플랫폼은 열지 않는다", () => {
  assert.equal(noCheck("https://m.booking.naver.com/booking/5/bizes/654085"), true);
  assert.equal(noCheck("https://www.camfit.co.kr/camp/1"), true);
  assert.equal(noCheck("https://www.instagram.com/x"), true);
  assert.equal(noCheck("http://www.geumwonsan.or.kr/"), false);
});

test("판정: 주소 없음·404·없는 페이지 안내는 DEAD, 일시 오류는 두 번 연속일 때만", () => {
  assert.equal(judge({ error: "ENOTFOUND" }).s, "DEAD");
  assert.equal(judge({ status: 404, html: "" }).s, "DEAD");
  assert.equal(judge({ status: 200, html: "<p>존재하지 않는 페이지입니다</p>" }).s, "DEAD");
  assert.equal(judge({ status: 200, html: "<p>캠핑장 안내</p>" }).s, "OK");
  assert.equal(judge({ error: "timeout" }).s, "FLAKY");
  assert.equal(merge({ s: "FLAKY" }, judge({ error: "timeout" })).s, "DEAD");
  assert.equal(merge({ s: "FLAKY" }, judge({ status: 200, html: "ok" })).s, "OK");
  // 긴 정상 페이지 본문의 ‘폐업’ 같은 낱말은 오판하지 않는다
  assert.equal(judge({ status: 200, html: `<p>${"캠핑장 소개 ".repeat(400)} 주변 식당 폐업</p>` }).s, "OK");
});

test("네이버 예약 상세 주소", () => {
  assert.equal(isNaverBookingDeep("https://m.booking.naver.com/booking/5/bizes/654085?theme=place"), true);
  assert.equal(isNaverBookingDeep("https://naver.me/abc"), false);
});
