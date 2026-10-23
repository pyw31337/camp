import { test } from "node:test";
import assert from "node:assert/strict";
import { HIDE_VERDICTS, isPlatformRoot, judgePage, nameIndex, signalsOf } from "../lib/booking-verify.mjs";

const camps = [
  { id: 1, name: "달빛고운 병곡캠핑장", sigungu: "거창군", addr: "경상남도 거창군 북상면 병곡길 12", tel: "055-111-2222" },
  { id: 2, name: "클라우드 글램핑", sigungu: "가평군" },
  { id: 3, name: "백두대간 오토캠핑장", sigungu: "봉화군" },
  { id: 4, name: "스테이인터뷰", sigungu: "제주시" },
];
const index = nameIndex(camps);
const judge = (camp, page, sameSiteIds) => judgePage({ camp, sig: signalsOf(camp), page, index, sameSiteIds }).v;
const c = camps[0];
const filler = "캠핑 예약 안내 ".repeat(30);

test("이 업장 이름·전화·도로명 주소가 있으면 MATCH", () => {
  assert.equal(judge(c, { url: "https://a.kr/", title: "달빛고운 병곡 캠핑장", text: filler }), "MATCH");
  assert.equal(judge(c, { url: "https://a.kr/", title: "예약", text: `${filler} 문의 055) 111-2222` }), "MATCH");
  assert.equal(judge(c, { url: "https://a.kr/", title: "예약", text: `${filler} 병곡길 12` }), "MATCH");
});

test("도메인 판매·서비스 종료·도박 사이트·오류 화면은 숨김 판정", () => {
  assert.equal(judge(c, { url: "http://fireflycamping.com/", final: "https://www.hugedomains.com/domain_profile.cfm?d=fireflycamping.com", title: "FireflyCamping.com is for sale", text: filler }), "PARKED");
  assert.equal(judge(c, { url: "https://x.modoo.at/", title: "네이버 modoo!", text: "네이버 modoo!가 2025년 6월 26일 종료되었습니다. 그동안 modoo! 서비스를 이용해주셔서 감사드립니다." }), "CLOSED");
  assert.equal(judge(c, { url: "http://anitown.com/", title: "해외 카지노 2026: 불법일까?", text: filler }), "HIJACKED");
  assert.equal(judge(c, { url: "http://ohdosan.hc.go.kr/", final: "https://www.hc.go.kr/program/error/404.html", title: "", text: "주소가 잘못 입력되었거나 원하시는 페이지를 찾을 수 없습니다." }), "ERROR_PAGE");
  for (const v of ["PARKED", "CLOSED", "HIJACKED", "ERROR_PAGE", "OTHER_PLACE", "STALE_DEEP", "LEFT_SITE"]) assert.ok(HIDE_VERDICTS.has(v), v);
});

test("봇 확인(ckattempt)·403·해외 차단은 숨기지 않는다 — 단 이름이 보이면 MATCH", () => {
  assert.equal(judge(c, { url: "http://a.kr/", final: "http://a.kr/?ckattempt=1", title: "404 Not Found", text: "" }), "BLOCKED");
  assert.equal(judge(c, { url: "http://a.kr/", final: "http://a.kr/?ckattempt=1", title: "달빛고운 병곡 캠핑장", text: "" }), "MATCH");
  assert.equal(judge(c, { url: "http://a.kr/", title: "Access blocking country info", text: "Access blocking country info" }), "GEO_BLOCK");
  assert.ok(!HIDE_VERDICTS.has("BLOCKED") && !HIDE_VERDICTS.has("GEO_BLOCK") && !HIDE_VERDICTS.has("THIN") && !HIDE_VERDICTS.has("NO_SIGNAL"));
});

test("옛 예약 엔진 주소 변경 안내는 새 주소와 함께 MOVED", () => {
  const r = judgePage({ camp: c, sig: signalsOf(c), index, page: { url: "http://r6.camperstory.com/?1917", title: "캠핑장 예약시스템", text: "예약페이지 주소가 변경되었습니다. 예약페이지 주소를 http://r.camperstory.com/?1917 변경하여 주시기 바랍니다." } });
  assert.equal(r.v, "MOVED");
  assert.equal(r.to, "http://r.camperstory.com/?1917");
});

test("다른 업장 이름은 제목에 있을 때만, 같은 사이트를 쓰는 업장이면 아니다", () => {
  assert.equal(judge(c, { url: "https://b.kr/camp/9", title: "클라우드 글램핑 예약", text: filler }), "OTHER_PLACE");
  // 본문 메뉴에만 다른 이름(국립공원 메뉴의 ‘백두대간’)은 다른 업장으로 보지 않는다
  assert.equal(judge(c, { url: "https://www.knps.or.kr/x.do?parkId=1", title: "월악산국립공원", text: `백두대간 ${filler}` }), "NO_SIGNAL");
  assert.equal(judge(c, { url: "https://stayinterview.co.kr/", title: "스테이인터뷰", text: filler }, new Set(["4"])), "NO_SIGNAL");
});

test("예약 상세 주소가 첫 화면으로 튕기거나 다른 사이트로 넘어가면 숨김, 공공 통합 창구 첫 화면은 PORTAL", () => {
  assert.equal(judge(c, { url: "http://www.allkorea.co.kr/res/realtime.html?year=2014", final: "http://www.allkorea.co.kr/", title: "", text: filler }), "STALE_DEEP");
  assert.equal(judge(c, { url: "https://www.gomsem.co.kr/blank", final: "https://dreamwas.com/plugin/search.php?s=blank", title: "blank : 검색결과 | 드림워즈", text: filler }), "LEFT_SITE");
  assert.equal(judge(c, { url: "https://reservation.knps.or.kr/", title: "국립공원공단 예약시스템", text: filler }), "PORTAL");
  // 운영자 자신의 네이버 카페로 넘어가는 홈페이지는 숨기지 않는다
  assert.equal(judge(c, { url: "https://quarkvalley.camp/", final: "https://cafe.naver.com/quarkvalley", title: "카페", text: filler }), "NO_SIGNAL");
});

test("예약 플랫폼 첫 화면은 업장 페이지가 아니다(주소만으로)", () => {
  for (const u of ["https://camfit.co.kr/", "http://www.camfit.co.kr", "https://booking.naver.com/", "https://m.thankqcamping.com/"]) assert.ok(isPlatformRoot(u), u);
  for (const u of ["https://camfit.co.kr/camp/64085297977d29001ed4701e", "https://camfit.co.kr/search/result?camp=숲에안기다", "https://www.sineosan.com/", "https://cafe.naver.com/dotoricamp"]) assert.ok(!isPlatformRoot(u), u);
  assert.ok(HIDE_VERDICTS.has("PLATFORM_ROOT"));
});
