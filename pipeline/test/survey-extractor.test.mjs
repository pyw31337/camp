import assert from "node:assert/strict";
import test from "node:test";
import { extractCampConditions } from "../lib/survey-extractor.mjs";

test("전수조사 추출: 자동차야영장 및 텐트 옆 주차 감지", () => {
  const camp = {
    kinds: [["AUTO_PITCH", 20]],
    types: ["자동차야영장"],
    amenities: ["전기", "장작판매", "온수"],
    fire: "개별",
    toilets: 10,
    showers: 6,
  };
  const detail = {
    intro: "텐트 바로 옆에 주차가 가능한 편리한 오토캠핑장입니다. 장작 불멍이 가능합니다.",
  };
  const fact = extractCampConditions(camp, detail);
  assert.equal(fact.parking.mode, "SITE_ADJACENT");
  assert.equal(fact.parking.tent_side, true);
  assert.equal(fact.parking.cart_required, false);
  assert.equal(fact.parking.auto_camping_sites, 20);
  assert.equal(fact.power.limit_w, null); // 실제 원문 W가 없으면 limit_w는 null
  assert.equal(fact.power.regulatory_reference_w, 600); // 법정 참고치
  assert.equal(fact.firewood.allowed, true);
  assert.equal(fact.firewood.sold, true);
  assert.equal(fact.charcoal.allowed, true);
});

test("전수조사 추출: 짐수레/카트/리어카 이동 필수 캠핑장 감지", () => {
  const camp = {
    kinds: [["PITCH", 15]],
    types: ["일반야영장"],
    amenities: ["전기"],
    fire: "개별",
  };
  const detail = {
    intro: "자연 보호를 위해 차량 진입이 금지되어 있으며, 주차장에서 손수레를 이용해 짐을 옮겨야 합니다.",
  };
  const fact = extractCampConditions(camp, detail);
  assert.equal(fact.parking.mode, "CART_REQUIRED");
  assert.equal(fact.parking.tent_side, false);
  assert.equal(fact.parking.cart_required, true);
});

test("전수조사 추출: 레저 카트 체험은 짐 운반 수레로 오인하지 않는다", () => {
  const camp = {
    kinds: [["AUTO_PITCH", 10]],
    types: ["자동차야영장"],
  };
  const detail = {
    intro: "가족 단위 캠퍼를 위한 카트장 카트 경기 체험 프로그램을 운영합니다.",
  };
  const fact = extractCampConditions(camp, detail);
  assert.equal(fact.parking.cart_required, null);
  assert.notEqual(fact.parking.mode, "CART_REQUIRED");
  assert.ok(fact.features.includes("EXPERIENCE"));
});

test("전수조사 추출: 장작판매·오토캠핑장 업종만으로는 엄격 조건을 확정하지 않는다", () => {
  const camp = {
    kinds: [["AUTO_PITCH", 10]],
    types: ["자동차야영장"],
    amenities: ["전기", "장작판매"],
    fire: "개별",
  };
  const detail = {
    intro: "자연 속에서 즐거운 캠핑을 즐기세요.",
  };
  const fact = extractCampConditions(camp, detail);
  assert.equal(fact.parking.mode, "UNKNOWN");
  assert.equal(fact.parking.tent_side, null);
  assert.equal(fact.power.limit_w, null);
  assert.equal(fact.power.regulatory_reference_w, 600);
  assert.equal(fact.firewood.allowed, null);
  assert.equal(fact.firewood.sold, true);
});

test("전수조사 추출: 고전력(1kW, 2kW) 및 정확한 W 수치 추출", () => {
  const camp1 = { amenities: ["전기"] };
  const detail1 = { intro: "사이트당 전기는 2kw로 충분한 용량을 제공합니다." };
  const fact1 = extractCampConditions(camp1, detail1);
  assert.equal(fact1.power.limit_w, 2000);
  assert.equal(fact1.power.available, true);

  const camp2 = { amenities: ["전기"] };
  const detail2 = { intro: "사이트당 600w 초과 전기용품 사용을 엄격히 제한합니다." };
  const fact2 = extractCampConditions(camp2, detail2);
  assert.equal(fact2.power.limit_w, 600);
});

test("전수조사 추출: 장작 금지 및 숯만 허용 감지", () => {
  const camp = {
    fire: "개별",
    amenities: ["전기"],
  };
  const detail = {
    guide: "데크 화재 방지를 위해 장작 사용 금지이며, 숯만 사용 가능합니다.",
  };
  const fact = extractCampConditions(camp, detail);
  assert.equal(fact.firewood.allowed, false);
  assert.equal(fact.charcoal.allowed, true);
});

test("전수조사 추출: 개별 욕실 및 위생시설, 키즈 특화 놀거리 추출", () => {
  const camp = {
    toilets: 12,
    showers: 8,
    sinks: 10,
    amenities: ["수영장", "트렘폴린", "놀이터"],
    env: ["계곡"],
  };
  const detail = {
    intro: "모든 사이트에 단독 개별 화장실과 개별 샤워실을 완비했으며, 대형 에어바운스와 사계절 썰매장을 갖추고 있습니다.",
  };
  const fact = extractCampConditions(camp, detail);
  assert.equal(fact.sanitary.private_bathroom, true);
  assert.equal(fact.sanitary.toilets_count, 12);
  assert.ok(fact.features.includes("SWIMMING_POOL"));
  assert.ok(fact.features.includes("VALLEY"));
  assert.ok(fact.features.includes("TRAMPOLINE"));
  assert.ok(fact.features.includes("AIR_BOUNCE"));
  assert.ok(fact.features.includes("PLAYGROUND"));
  assert.ok(fact.features.includes("TUBE_SLED"));
});

test("전수조사 추출: 파일럿 검증 데이터는 최우선 적용된다", () => {
  const camp = { kinds: [["PITCH", 10]] };
  const pilot = {
    id: "pilot-test",
    parking_mode: "SITE_ADJACENT",
    power_max_w: 1000,
    firewood_allowed: "ALLOWED",
    charcoal_allowed: "ALLOWED",
    zones: [{ name: "A", size_w: 8, size_h: 10, surface: "GRAVEL", parking: "SITE_ADJACENT", site_count: 10 }],
    evidence: { verification_status: "VERIFIED" }
  };
  const fact = extractCampConditions(camp, null, pilot);
  assert.equal(fact.status, "VERIFIED");
  assert.equal(fact.parking.mode, "SITE_ADJACENT");
  assert.equal(fact.power.limit_w, 1000);
});

test("전수조사 추출: 소개글 신호는 SURVEYED이고, 면적으로 타프·캐노피 허용을 만들지 않는다", () => {
  const camp = { sizes: [[10, 10, 5]], floors: [["GRAVEL", 5]], amenities: ["전기"], fire: "개별" };
  const detail = { intro: "사이트 옆 주차가 가능하고 고전력 사용이 넉넉합니다. 장작 불멍 가능." };
  const fact = extractCampConditions(camp, detail);
  assert.equal(fact.status, "SURVEYED");
  assert.equal(fact.parking.state, "SURVEYED");
  assert.equal(fact.power.limit_w, null); // ‘고전력’ 표현만으로 W를 만들지 않는다
  assert.equal(fact.power.high_power_mention, true);
  assert.equal(fact.firewood.state, "SURVEYED");
  assert.equal(fact.shelter_setup.state, "UNKNOWN");
  assert.equal(fact.shelter_setup.canopy_allowed, null);
  assert.equal(fact.site_size.state, "CONFIRMED");
  assert.equal(fact.site_size.groups[0].surface, undefined); // 바닥 기본값을 만들지 않는다
});

test("전수조사 추출: 고캠핑 화로대 필드만으로 판단한 숯 허용은 CONFIRMED", () => {
  const fact = extractCampConditions({ fire: "개별" }, { intro: "조용한 캠핑장" });
  assert.equal(fact.charcoal.allowed, true);
  assert.equal(fact.charcoal.state, "CONFIRMED");
  assert.equal(fact.firewood.allowed, null);
  assert.equal(fact.status, "CONFIRMED");
});

test("파일럿 검증: 구역별 주차가 섞이면 텐트 옆 주차를 확정하지 않고, 지정 구역 화기는 규칙 코드로 남긴다", () => {
  const fact = extractCampConditions({}, null, {
    parking_mode: "SITE_ADJACENT", power_max_w: 1000, firewood_allowed: "DESIGNATED_ONLY", charcoal_allowed: "ALLOWED",
    zones: [{ name: "A", size_w: 8, size_h: 10, parking: "SITE_ADJACENT", site_count: 10 }, { name: "D", size_w: 6, size_h: 7, parking: "SHARED_NEARBY", site_count: 5 }],
    evidence: { source_url: "https://example.go.kr", observed_at: "2026-10-15", reviewer: "r1" },
  });
  assert.equal(fact.parking.tent_side, null);
  assert.deepEqual(fact.parking.tent_side_zones, { adjacent: 1, total: 2 });
  assert.equal(fact.firewood.allowed, null);
  assert.equal(fact.firewood.rule, "DESIGNATED_ONLY");
  assert.equal(fact.fire_pit.arrangement, null);
  assert.equal(fact.shelter_setup.max_tarps, null);
});
