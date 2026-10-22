import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { aboutCamp, commonOperatorTexts, decodeDisplayEntities, isOperatorContentNoise, nameTokens, normalizeTimes, normalizeWon, operatorCategory, reviewDetailTexts } from "../lib/detail-text-review.mjs";

test("화면 사본이 같다", () => {
  assert.equal(readFileSync(new URL("../lib/detail-text-review.mjs", import.meta.url), "utf8"), readFileSync(new URL("../../camping-atlas/public/context/text-review.js", import.meta.url), "utf8"), "화면 사본(public/context/text-review.js)을 같이 고치세요");
});

test("표기: 시각 14:00, 금액 130,000원", () => {
  assert.equal(normalizeTimes("입실 오후 2시 퇴실 11시, 매너타임 22시 이후, 2시간, 12시반, 춘천시"), "입실 14:00 퇴실 11:00, 매너타임 22:00 이후, 2시간, 12:30, 춘천시");
  assert.equal(normalizeWon("13만원 2만5천원 130000원 13만원대 5천원"), "130,000원 25,000원 130,000원 13만원대 5,000원");
});

test("표기: HTML 목록 기호를 정제하고 공용 포털 푸터를 격리한다", () => {
  assert.equal(decodeDisplayEntities("입&middot;퇴실&nbsp;안내"), "입·퇴실 안내");
  assert.equal(isOperatorContentNoise("(12416) 경기도 가평군 가평읍 문화로 153 가평군시설관리공단"), true);
  assert.equal(isOperatorContentNoise("대관행사 기간에는 사이트 주변 차량 통행이 제한될 수 있습니다."), false);
});

test("운영 안내 항목: 낱말이 가장 많이 맞는 칸", () => {
  assert.equal(operatorCategory("텐트 내 600W 이상의 고출력 전기용품은 사용하실 수 없습니다."), "전기");
  assert.equal(operatorCategory("애견은 예방접종, 배변훈련 된 5kg 이하의 소형견만 가능합니다(1마리)."), "반려동물");
  assert.equal(operatorCategory("최대인원 : 카라반 1대당 최대 3인/차량 2대"), "인원 · 추가");
  assert.equal(operatorCategory("저희 캠핑장을 찾아 주셔서 감사합니다"), null);
});

test("운영 안내: 정보 모음 사이트·제목·약관·질문·항목 이름만은 빼고, 남긴 글은 항목을 붙인다", () => {
  const d = { operator_snippets: [
    { text: "춘천 (주)아웃오브파크 | 야영장 글램핑 카라반 오토캠핑장 추천 - 캠퍼스토리", url: "https://camping.govpped.com/detail?camp=10" },
    { text: "개별화장실, 샤워실 컨디션이 좋지 않아요.", url: "https://www.camppick.com/x" },
    { text: "운영기간", url: "https://outofpark.com/" },
    { text: "일찍 도착하면 얼리 체크인 가능한가요?", url: "https://outofpark.com/" },
    { text: "개인정보 처리방침에 따라 서비스 제공 목적으로 처리합니다.", url: "https://outofpark.com/" },
    { text: "입실은 오후 2시, 퇴실은 오전 11시입니다.", url: "https://outofpark.com/" },
    { text: "입실은 오후 2시, 퇴실은 오전 11시입니다.", url: "https://outofpark.com/a" },
  ], site_types: [
    { code: "AUTO", src: "operator_homepage", url: "https://camping.govpped.com/detail?camp=10", quote: "춘천 (주)아웃오브파크 | 야영장 글램핑 카라반 오토캠핑장 추천 - 캠퍼스토리" },
    { code: "CARAVAN", count: 40, src: "gocamping" },
  ] };
  const { d: r, log } = reviewDetailTexts(d, { name: "(주)아웃오브파크", sigungu: "춘천시" });
  assert.deepEqual(r.operator_snippets.map((x) => [x.cat, x.text]), [["입·퇴실", "입실은 14:00, 퇴실은 11:00입니다."]]);
  assert.equal(r.operator_snippets[0].orig, "입실은 오후 2시, 퇴실은 오전 11시입니다.");
  assert.deepEqual(r.site_types.map((x) => x.code), ["CARAVAN"]);
  assert.equal(log.removed["운영자 안내: 정보 모음·후기 사이트 글"], 2);
  assert.equal(log.removed["운영자 안내: 항목 이름만(내용 없음)"], 1);
  assert.equal(log.removed["운영자 안내: 질문 제목(FAQ)"], 1);
  assert.equal(log.removed["운영자 안내: 약관·개인정보 문구"], 1);
  assert.equal(log.removed["운영자 안내: 같은 문장 반복"], 1);
  assert.equal(log.removed["사이트 타입: 정보 사이트 제목 키워드"], 1);
  assert.equal(d.operator_snippets.length, 7, "원본은 그대로");
});

test("요금 언급·후기: 다른 업장·모음 글·범위 밖 금액·광고는 뺀다", () => {
  const camp = { name: "우드로더 캠핑장", sigungu: "군위군" };
  const { d: r, log } = reviewDetailTexts({ prices: [
    { won: 50000, quote: "군위 우드로더(신생 캠핑장) 📌요금: 5만원", url: "a" },
    { won: 20000, quote: "[웅포 곰개나루 캠핑장] 2만 원에 이 강변 뷰 실화?", url: "b" },
    { won: 30000, quote: "문경 캠핑장 31곳, 평일 1박 3만원인 곳은 7곳입니다", url: "c" },
    { won: 3000, quote: "쓰레기봉투 3,000원", url: "d" },
    { won: 50000, quote: "군위 우드로더 5만원", url: "a" },
  ], reviews: [
    { title: "우드로더 캠핑장 1박 후기", snippet: "데크 넓고 좋아요", url: "r1" },
    { title: "군위 토지 매매 급매", snippet: "우드로더 캠핑장 근처", url: "r2" },
  ] }, camp);
  assert.deepEqual(r.prices.map((p) => p.url), ["a"]);
  assert.deepEqual(r.reviews.map((p) => p.url), ["r1"]);
  assert.equal(log.removed["요금 언급: 다른 업장 문장"], 1);
  assert.equal(log.removed["요금 언급: 여러 캠핑장 모음 글"], 1);
  assert.equal(log.removed["요금 언급: 1박 요금 범위 밖"], 1);
  assert.equal(log.removed["요금 언급: 같은 글 같은 금액"], 1);
  assert.equal(log.removed["블로그 후기: 광고·스팸"], 1);
  assert.deepEqual(nameTokens("(주)아웃오브파크", "춘천시"), ["아웃오브파크"]);
  assert.equal(aboutCamp({ title: "가평 맛집 투어", snippet: "국수 맛집" }, { tokens: ["아웃오브파크"], core: "아웃오브파크", others: [] }), "이름 없음(다른 곳 글)");
});

test("여러 지역 캠핑장 8곳 이상에 똑같은 문장은 사이트 공통 문구로 뺀다", () => {
  const junk = "대한민국 여행지 4곳 방문하고 할인 쿠폰 받아가세요.", local = "사용예정일 7일 전까지 취소하면 전액 환불합니다.";
  const entries = [...Array(9)].map((_, i) => ({ sido: ["강원", "경기", "전북"][i % 3], d: { operator_snippets: [{ text: junk }] } }));
  entries.push(...[...Array(9)].map(() => ({ sido: "서울", d: { operator_snippets: [{ text: local }] } })));
  const common = new Set(commonOperatorTexts(entries));
  assert.equal(common.size, 1, "같은 시도 안 공통 규정은 남긴다");
  const { d, log } = reviewDetailTexts({ operator_snippets: [{ text: junk }, { text: local }] }, { name: "가나캠핑장" }, { common });
  assert.deepEqual(d.operator_snippets.map((x) => x.text), [local]);
  assert.equal(log.removed["운영자 안내: 여러 캠핑장 공통 문구(사이트 틀)"], 1);
});
