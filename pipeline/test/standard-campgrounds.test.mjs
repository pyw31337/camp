import assert from "node:assert/strict";
import test from "node:test";
import {
  normalizeStandardCamp,
  matchStandardToCamp,
} from "../lib/standard-campgrounds.mjs";

test("표준데이터 정규화: 사이트 수·카라반·글램핑·주차대수 및 화로대 파싱", () => {
  const row = {
    "야영(캠핑)장명": "가평 자라섬 오토캠핑장",
    "소재지도로명주소": "경기도 가평군 가평읍 자라섬로 60",
    "위도": "37.818291",
    "경도": "127.525541",
    "야영사이트수": "190",
    "카라반시설수": "40",
    "글램핑시설수": "15",
    "주차대수": "250",
    "부지면적": "283000",
    "화로대사용여부": "Y",
    "편의시설명": "샤워장, 화장실, 개수대, 전기, 와이파이",
    "안전시설명": "소화기, 대피소, 방화수",
    "관리기관명": "가평군시설관리공단",
  };

  const norm = normalizeStandardCamp(row);
  assert.equal(norm.name, "가평 자라섬 오토캠핑장");
  assert.equal(norm.lat, 37.818291);
  assert.equal(norm.lng, 127.525541);
  assert.equal(norm.specs.total_sites, 190);
  assert.equal(norm.specs.caravan_sites, 40);
  assert.equal(norm.specs.glamping_sites, 15);
  assert.equal(norm.specs.parking_count, 250);
  assert.equal(norm.specs.area_m2, 283000);
  assert.equal(norm.conditions.fire_allowed, true);
  assert.equal(norm.agency, "가평군시설관리공단");
});

test("표준데이터 매칭: 이름 및 좌표 1:1 매핑", () => {
  const stdRecord = {
    name: "자라섬 오토캠핑장",
    lat: 37.818291,
    lng: 127.525541,
    road_address: "경기도 가평군 가평읍 자라섬로 60",
  };

  const campList = [
    {
      id: "1001",
      name: "가평 자라섬 캠핑장",
      address: { sido: "경기도", sigungu: "가평군" },
      location: { lat: 37.818300, lng: 127.525550 },
    },
    {
      id: "1002",
      name: "지리산 달궁야영장",
      address: { sido: "전라북도", sigungu: "남원시" },
      location: { lat: 35.3621, lng: 127.5812 },
    },
  ];

  const match = matchStandardToCamp(stdRecord, campList);
  assert.equal(match.campId, "1001");
  assert.ok(match.score >= 0.8);
});
