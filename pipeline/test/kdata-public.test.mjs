import test from "node:test";
import assert from "node:assert/strict";
import { mergePublicRecords, parseDetailFacts, parseKDataDetail, parseSitemap } from "../lib/kdata-public.mjs";

test("k-data 사이트맵은 지정한 범주의 상세 URL만 추출한다", () => {
  const xml = "<urlset><url><loc>https://k-data.aljal.kr/foresttrip/미천골자연휴양림</loc></url><url><loc>https://k-data.aljal.kr/reststop/죽전-서울</loc></url></urlset>";
  assert.deepEqual(parseSitemap(xml, "foresttrip"), ["https://k-data.aljal.kr/foresttrip/미천골자연휴양림"]);
});

test("상세 표·좌표·원문 링크를 정규화한다", () => {
  const html = `<h1>미천골자연휴양림 예약</h1><dl><dt>주소</dt><dd>강원 양양군 서면 미천골길 115</dd><dt>휴무</dt><dd>매주 화요일</dd></dl><div data-lat="37.9489" data-lng="128.5119"></div><a href="https://www.foresttrip.go.kr/indvz/main.do?hmpgId=0112">예약</a>`;
  const row = parseKDataDetail(html, { url: "https://k-data.aljal.kr/foresttrip/미천골자연휴양림", category: "foresttrip" });
  assert.equal(row.name, "미천골자연휴양림");
  assert.equal(row.address, "강원 양양군 서면 미천골길 115");
  assert.equal(row.facts["휴무"], "매주 화요일");
  assert.equal(row.external_urls[0], "https://www.foresttrip.go.kr/indvz/main.do?hmpgId=0112");
});

test("누적 병합은 기존 사실과 목록을 보존한다", () => {
  const old = [{ id: "pool:a", name: "A", address: "서울", facts: { 요금: "무료" }, external_urls: ["https://a.example"] }];
  const next = [{ id: "pool:a", name: "A", facts: { 운영: "09:00" }, external_urls: ["https://b.example"] }, { id: "pool:b", name: "B" }];
  const merged = mergePublicRecords(old, next);
  assert.equal(merged.length, 2);
  assert.equal(merged[0].address, "서울");
  assert.equal(merged[0].facts.요금, "무료");
  assert.equal(merged[0].facts.운영, "09:00");
  assert.deepEqual(merged[0].external_urls, ["https://a.example", "https://b.example"]);
});
