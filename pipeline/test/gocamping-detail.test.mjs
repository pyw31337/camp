import test from "node:test";
import assert from "node:assert/strict";
import { parseGocampingDetail } from "../lib/gocamping-detail.mjs";

const html = `<div class="camp-info"><dl><dt>주소</dt><dd>경기 남양주시</dd><dt>운영기간</dt><dd>봄 · 여름</dd><dt>홈페이지</dt><dd>홈페이지 바로가기</dd></dl></div>
<h2>캠핑장 소개</h2><p>이곳은 계곡 옆 대형 캠핑장으로 글램핑과 오토캠핑 사이트를 함께 갖추고 있다.</p><p>최종 정보 수정일 : 2025-09-12</p>
<h2 class="t">캠핑장 시설정보</h2><dl><dt>글램핑 내부시설</dt><dd>침대 · TV · 에어컨</dd><dt>사이트 간격</dt><dd>0 M</dd><dt>화로대</dt><dd>개별</dd></dl>
<h2 class="t">시설 사진</h2><img src="/upload/camp/1/thumb/thumb_1000_abc.jpg">
<div class="camp-use-info"><h2>이용안내</h2><h3 class="camp-title">일반캠핑</h3><table><tr><th rowspan="2">구분</th><th colspan="2">평상시</th><th colspan="2">성수기</th></tr><tr><th>주중</th><th>주말</th><th>주중</th><th>주말</th></tr><tr><td>일반</td><td>50,000</td><td>60,000</td><td>60,000</td><td>70,000</td></tr></table></div>
<div class="camp-use-info"><h2>안전 및 시설 배치도</h2><img src="/upload/camp/1/map.jpg"></div><div class="camp-map"><h2>위치/주변정보</h2></div>`;

test("고캠핑 상세: 요금표·시설정보·배치도·사진·수정일", () => {
  const d = parseGocampingDetail(html, 1);
  assert.equal(d.info["운영기간"], "봄 · 여름");
  assert.equal(d.info["홈페이지"], undefined);
  assert.equal(d.updated, "2025-09-12");
  assert.deepEqual(d.facilities.find((f) => f.k === "글램핑 내부시설").items, ["침대", "TV", "에어컨"]);
  assert.ok(!d.facilities.some((f) => f.k === "사이트 간격"), "0 M은 값 없음");
  assert.deepEqual(d.photos, ["https://www.gocamping.or.kr/upload/camp/1/abc.jpg"]);
  assert.deepEqual(d.layout, ["https://www.gocamping.or.kr/upload/camp/1/map.jpg"]);
  assert.deepEqual(d.guide[0].table.cols, ["평상시 주중", "평상시 주말", "성수기 주중", "성수기 주말"]);
  assert.equal(d.fees.length, 4);
  assert.deepEqual(d.fees[3], { won: 70000, label: "일반캠핑 · 일반", period: "성수기 주말" });
});
