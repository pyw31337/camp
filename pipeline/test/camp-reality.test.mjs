import assert from "node:assert/strict";
import { test } from "node:test";
import { paperRegistration } from "../lib/camp-reality.mjs";

test("서류상 등록: 도심 사무실 주소·근거 없음·회사명만 → 캠핑장 아님(2026-10-22 스마트락(주))", () => {
  const c = { id: "101213", name: "스마트락(주)", addr: "서울 구로구 디지털로33길 55 (구로동)", types: ["자동차야영장"] };
  assert.ok(paperRegistration(c, { n5: 1714 }));
  assert.ok(paperRegistration({ ...c, addr: "서울 구로구 디지털로 55, 벤처타워 1203호" }, { n5: 10 }));
});

test("법인 운영 진짜 캠핑장·근거 있는 곳·지도에 잡힌 곳은 남긴다", () => {
  assert.equal(paperRegistration({ id: "1920", name: "(주)신어산 자연숲캠핑장" }, { n5: 2000 }), null); // 캠핑장 이름
  assert.equal(paperRegistration({ id: "7751", name: "(주)화원684", tel: "061-000-0000" }, { n5: 2000 }), null); // 업장 근거
  assert.equal(paperRegistration({ id: "9", name: "솔바람(주)" }, { n5: 2000, kakao: { place: { id: "1", category: "여행 > 숙박 > 야영,캠핑장" } } }), null); // 지도 장소(캠핑 분류)
  assert.equal(paperRegistration({ id: "102190", name: "주식회사에이투젯", addr: "인천광역시 영종구 하나개로 121 (무의동)" }, { n5: 30 }), null); // 도심 아님
  assert.equal(paperRegistration({ id: "p1", name: "스마트락(주)", du: "park" }, { n5: 2000 }), null); // 당일 장소는 대상 아님
});

test("캠핑과 무관한 업종 이름(샷시·건설 등)이나 무관한 지도 분류는 근거가 없으면 캠핑장 아님", () => {
  assert.ok(paperRegistration({ id: "9001", name: "한빛샷시", addr: "경기 여주시 가남읍 1" }, { n5: 5 }));
  assert.ok(paperRegistration({ id: "9002", name: "대성건설(주)", addr: "강원 홍천군 1", tel: "033-000-0000" }, { n5: 5 }));
  assert.ok(paperRegistration({ id: "9003", name: "솔밭", addr: "충북 괴산군 1" }, { n5: 5, kakao: { place: { category: "가정,생활 > 인테리어 > 창호" } } }));
  // 캠핑장 이름이면 업종 낱말이 있어도 남긴다
  assert.equal(paperRegistration({ id: "9004", name: "한빛산업 오토캠핑장" }, { n5: 5 }), null);
  // 근거가 충분하면 남긴다
  assert.equal(paperRegistration({ id: "9005", name: "대성산업", tel: "1", img: "x", line: "소개" }, { n5: 5 }), null);
});
