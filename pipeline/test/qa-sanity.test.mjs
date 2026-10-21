import test from "node:test";
import assert from "node:assert/strict";
import { badCoord, sidoStd } from "../lib/geo-sanity.mjs";
import { dropPlatformSites, isOperatorHost } from "../lib/operator-site.mjs";
import { detectPublicCampground } from "../lib/public-standards.mjs";

test("좌표: 시·도 범위 밖·한국 밖은 오류(QA 2026-10-20)", () => {
  assert.equal(badCoord({ sido: "경상남도", lat: 33.491549, lng: 126.907117 }), true); // 의령 연화동권역 — 제주 좌표
  assert.equal(badCoord({ sido: "충청북도", lat: 36.3742, lng: 137.20266 }), true); // 청주 만수공원 — 경도 오타
  assert.equal(badCoord({ sido: "경상남도", lat: 35.32, lng: 128.26 }), false);
  assert.equal(badCoord({ sido: "광주", lat: 35.16, lng: 126.85 }), false);
});
test("시·도: 화면과 같은 짧은 이름, 전남광주통합특별시는 광주 5개 구만 광주", () => {
  assert.equal(sidoStd({ sido: "강원특별자치도" }), "강원");
  assert.equal(sidoStd({ sido: "전라북도" }), "전북");
  assert.equal(sidoStd({ sido: "서울특별시" }), "서울");
  assert.equal(sidoStd({ sido: "인천광역시연수구" }), "인천");
  assert.equal(sidoStd({ sido: "전남광주통합특별시", sigungu: "광산구" }), "광주");
  assert.equal(sidoStd({ sido: "전남광주통합특별시", sigungu: "여수시" }), "전남");
  assert.equal(sidoStd({ sido: "경기" }), "경기");
});
test("관광공사·캠핑허브 페이지는 운영자 홈페이지가 아니다", () => {
  assert.equal(isOperatorHost("https://korean.visitkorea.or.kr/detail/ms_detail.do?cotid=x"), false);
  const cs = { a: { name: "A", status: "OK", url: "https://campinghub.kr/camping/1.html", snippets: [{ text: "x" }] }, b: { name: "B", status: "OK", url: "https://b-camp.co.kr", snippets: [{ text: "18.5만원", url: "https://korean.visitkorea.or.kr/x" }, { text: "ok", url: "https://b-camp.co.kr/1" }] } };
  assert.equal(dropPlatformSites(cs), 2);
  assert.equal(cs.a.status, "PLATFORM_PAGE");
  assert.deepEqual(cs.b.snippets.map((x) => x.text), ["ok"]);
  assert.equal(dropPlatformSites(cs), 0); // 멱등
});
test("당일 장소(공원)에는 야영장 표준 규정을 붙이지 않는다", () => {
  assert.equal(detectPublicCampground({ name: "근린공원", du: "park", op: "LOCAL_GOVERNMENT" }), null);
});
