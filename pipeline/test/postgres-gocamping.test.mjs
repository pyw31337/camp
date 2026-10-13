import assert from "node:assert/strict";
import test from "node:test";
import { gocampingFacilityUrl, mapGoCampingCampground } from "../lib/postgres-gocamping.mjs";

const sample = {
  external_id: { provider: "gocamping", id: "7096" },
  name: "향남 오토캠핑장",
  legal_business_types: ["일반야영장", "자동차야영장"],
  operator_type: "LOCAL_GOVERNMENT",
  management: "화성시",
  status_text: "운영",
  address: { sido: "경기도", sigungu: "화성시", line1: "경기도 화성시 테스트로 1", line2: null },
  location: { lat: 37.1234567, lng: 126.1234567 },
  contact: { tel: "031-000-0000", homepage: "https://example.com" },
  products: [{ kind: "AUTO_PITCH", site_count: 12, confirmed: true }],
  site_sizes: [{ width_m: 5, depth_m: 8, area_m2: 40, count: 12, measurement_source: "GOCAMPING" }],
  reservation: { methods: ["온라인실시간예약"], url: "https://booking.example.com" },
  source: { modified_at: "2026-10-12T00:00:00+09:00", fetched_at: "2026-10-13T13:08:00+09:00" },
};

test("고캠핑 시설을 가격·재고 추정 없이 PostgreSQL 적재 행으로 매핑한다", () => {
  const result = mapGoCampingCampground(sample);
  assert.equal(result.externalUrl, "https://www.gocamping.or.kr/bsite/camp/info/read.do?c_no=7096");
  assert.deepEqual(result.facility, {
    canonical_name: "향남 오토캠핑장", legal_business_type: "BOTH", operator_type: "LOCAL_GOVERNMENT",
    operator_name: "화성시", status: "OPERATING", road_address: "경기도 화성시 테스트로 1", parcel_address: null,
    province: "경기도", city_county_district: "화성시", latitude: 37.1234567, longitude: 126.1234567,
    official_homepage_url: "https://example.com", official_phone: "031-000-0000", is_public: true,
    last_verified_at: "2026-10-13T13:08:00+09:00",
  });
  assert.equal(result.productRows[0].product_kind, "AUTO_PITCH");
  assert.equal(result.siteSizes[0].area_m2, 40);
  assert.equal(result.reservation.booking_url, "https://booking.example.com");
  assert.equal(result.snapshot.hero_image_url, undefined);
  assert.match(result.responseHash, /^[a-f0-9]{64}$/);
});

test("시설 상세 원문 URL은 고캠핑 contentId에서 결정적으로 생성한다", () => {
  assert.equal(gocampingFacilityUrl("a b"), "https://www.gocamping.or.kr/bsite/camp/info/read.do?c_no=a%20b");
});
