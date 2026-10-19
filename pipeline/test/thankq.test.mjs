import { test } from "node:test";
import assert from "node:assert/strict";
import { linkedCseq, nextSaturdays, normName, parseSiteList, pickMatch, queryOf, summarizeSites } from "../lib/thankq.mjs";

// 응답 구조만 본뜬 합성 조각(같은 사이트가 주석 처리된 옛 배치로 한 번 더 들어 있다).
const site = (name, tip, { pet = false, hidePark = false } = {}) => `
<li style="order:1;"><div class="site_div type2${tip.includes("og") ? "" : " disabled"}" onClick="x();">
 <div class="top"><div class="pic_div"><span class="q_tip${tip}</span></div>
 <div class="txt_div"><div><p class="na">${name}</p><p class="time">입실 14시ㆍ퇴실 12시</p><p class="time">규격 : 10.0m × 8.5m</p></div>
 <div class="num_div"><p class="pri">90,000원</p></div></div></div>
 <ul class="ico_div">
  <li class="item w100" style="display:none;"><i class="fa-regular fa-comment fa-"></i><span>숨은 설명</span></li>
  <li class="item"><i class="fa-regular fa-campground fa-"></i><span>오토캠핑</span></li>
  <li class="item"${hidePark ? ' style="display:none;"' : ""}><i class="fa-regular fa-circle-parking fa-"></i><span>텐트옆주차</span></li>
  <li class="item"><i class="fa-regular fa-arrows-maximize fa-"></i><span>파쇄석 [10mX8.5m]</span></li>
  <li class="item"${pet ? "" : ' style="display:none;"'}><i class="fa-regular fa-paw-simple fa-"></i><span>반려동물동반</span></li>
 </ul></div></li>
<!--li><div class="site_div disabled"><span class="q_tip">예약완료</span><p class="na">${name}</p></div></li-->`;

test("사이트 목록: 주석 속 옛 배치는 세지 않고, 상태·규격·바닥·요금·입퇴실·숨은 항목을 구분한다", () => {
  const html = site("A1", '">예약완료') + site("A2", ' og">예약가능 <em>1</em>', { pet: true }) + site("B1", ' red">예약불가', { hidePark: true });
  const s = parseSiteList(html);
  assert.equal(s.length, 3);
  assert.deepEqual(s.map((x) => x.status), ["BOOKED", "OPEN", "CLOSED"]);
  assert.deepEqual(s[0].size, [10, 8.5]);
  assert.equal(s[0].floor, "파쇄석");
  assert.equal(s[0].price, 90000);
  assert.equal(s[0].checkIn, "14:00");
  assert.equal(s[0].checkOut, "12:00");
  assert.equal(s[0].pet, false);
  assert.equal(s[1].pet, true);
  assert.equal(s[2].parking, null);
  assert.deepEqual(summarizeSites(s), { total: 3, open: 1, known: 3, minPrice: 90000, maxPrice: 90000 });
});

test("이름 정규화·검색어·매칭: 시군구가 같고 핵심 이름이 같은 한 곳만 고른다", () => {
  assert.equal(normName("워터사이드 캠핑장"), normName("워터사이드캠핑장"));
  assert.equal(queryOf("해담구룡령 야영장"), "해담구룡령");
  const camp = { name: "워터사이드 캠핑장", sigungu: "진천군" };
  assert.deepEqual(pickMatch(camp, [{ campSeq: 20980, campName: "워터사이드캠핑장", shortAddress: "충북 진천군" }]), { cseq: 20980, name: "워터사이드캠핑장", addr: "충북 진천군" });
  // 다른 지역의 같은 이름은 고르지 않는다
  assert.equal(pickMatch(camp, [{ campSeq: 1, campName: "워터사이드캠핑장", shortAddress: "경기 가평군" }]), null);
  // 같은 지역에 후보가 둘이면(정확히 같은 이름이 없으면) 고르지 않는다
  assert.equal(pickMatch({ name: "숲속 캠핑장", sigungu: "가평군" }, [{ campSeq: 1, campName: "숲속캠핑장A", shortAddress: "경기 가평군" }, { campSeq: 2, campName: "숲속캠핑장B", shortAddress: "경기 가평군" }]), null);
});

test("링크 번호와 관측 날짜", () => {
  assert.equal(linkedCseq('{"url":"https://m.thankqcamping.com/resv/view.hbb?cseq=149"}'), 149);
  assert.equal(linkedCseq("http://r.camperstory.com/?1872"), 1872);
  assert.equal(linkedCseq("https://example.com"), null);
  assert.deepEqual(nextSaturdays(new Date("2026-10-19T06:00:00Z")), ["2026-10-24", "2026-10-31"]);
  // 토요일(KST) 당일은 그날부터
  assert.deepEqual(nextSaturdays(new Date("2026-10-23T16:00:00Z"), 1), ["2026-10-24"]);
});
