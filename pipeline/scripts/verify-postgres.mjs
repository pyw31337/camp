import assert from "node:assert/strict";
import pg from "pg";
import { importContextData } from "../lib/postgres-context.mjs";
import { importGoCampingSnapshot } from "../lib/postgres-gocamping.mjs";

const connectionString = process.env.DATABASE_URL;
if (!connectionString) throw new Error("DATABASE_URL이 필요합니다. 이 검사는 비어 있는 CI PostgreSQL에서 실행하세요.");

const fixtureCampground = {
  external_id: { provider: "gocamping", id: "fixture-7096" },
  name: "DB 검증 캠핑장", legal_business_types: ["자동차야영장"], operator_type: "LOCAL_GOVERNMENT", management: "검증시",
  status_text: "운영", address: { sido: "경기도", sigungu: "검증시", line1: "경기도 검증시 테스트로 1", line2: null },
  location: { lat: 37.123456, lng: 126.123456 }, contact: { tel: "031-000-0000", homepage: "https://example.test" },
  products: [{ kind: "AUTO_PITCH", site_count: 12, confirmed: true }], site_sizes: [], reservation: { methods: [], url: "https://booking.example.test" },
  source: { modified_at: "2026-10-13T00:00:00+09:00", fetched_at: "2026-10-13T03:17:00+09:00" },
};

const toiletFixtures = Array.from({ length: 100 }, (_, index) => ({
  id: `fixture-toilet-${index + 1}`, name: `검증 화장실 ${index + 1}`, road_address: `경기도 검증시 테스트로 ${index + 1}`,
  lat: 37.123 + index / 100000, lng: 126.123 + index / 100000, precision: "ROAD", open_hours: "24시간", open_24h: true,
  disabled_stalls: 1, child_stalls: 0, emergency_bell: true, cctv: true, diaper_table: false, data_date: "2026-10-01",
}));

const contextFixture = {
  toilets: {
    source: { url: "https://source.example.test/toilets", fetched_at: "2026-10-13T03:17:00+09:00" },
    sources: { mois: 100, osm: { added: 0 } }, toilets: toiletFixtures,
  },
  campgroundToilets: {
    campgrounds: { "fixture-7096": { nearest: [{ toilet_id: "fixture-toilet-1", distance_m: 120 }] } },
  },
  restStops: {
    generated_at: "2026-10-13T03:17:00+09:00",
    stops: [{
      id: "fixture-drowsy-1", kind: "DROWSY_SHELTER", name: "검증 졸음쉼터", lat: 37.2, lng: 126.2, road: "테스트고속도로",
      direction: "서울방향", parking_spaces: 10, facilities: { toilet: { available: true, fee: "FREE" } },
      source: { id: "drowsy-standard", tier: "A", checked_at: "2026-10-13" },
    }],
  },
  freeRegistry: {
    criteria: { fee: "official", cooking: "official", toilet: "official" },
    sites: [{
      id: "fixture-free-site", name: "검증 무료 캠프 후보", address: "경기도 검증시", status: "NEEDS_REVIEW",
      fee: { free: true, free_from: "2026-10-01", free_until: "2026-10-31" }, cooking: { allowed: null }, toilet: { onsite: null },
      evidence: [{ field: "fee", url: "https://source.example.test/free", title: "검증 근거", checked_at: "2026-10-13", tier: "C" }],
    }],
    candidates: [{ name: "검증 제보 후보", region: "경기", found_in: "https://source.example.test/community", tier: "E" }],
  },
  publicFreeCandidates: { source: "https://source.example.test/public-free", candidates: [] },
  bookingRegistry: {
    version: 1,
    rules: [{
      id: "fixture-forest-rule", provider_id: "foresttrip", label: "검증 예약 규칙", summary: "공식 안내 기반 검증 규칙", applies_to: "검증 대상",
      schedule: { kind: "WEEKLY_OPEN", weekday: 3, time: "09:00", lead_weeks: 6 },
      source: { url: "https://source.example.test/booking", title: "검증 예약 안내", checked_at: "2026-10-13", tier: "B" },
    }],
  },
  calendar: {
    generated_at: "2026-10-13T03:17:00+09:00",
    events: [{
      id: "fixture-forest-rule:OPEN:2026-10-14T09:00:00+09:00", rule_id: "fixture-forest-rule", provider_id: "foresttrip",
      type: "OPEN", at: "2026-10-14T09:00:00+09:00", time_known: true, label: "검증 예약 규칙",
      stay: { from: "2026-11-23", to: "2026-11-29" }, note: null,
      source: { url: "https://source.example.test/booking", tier: "B" }, needs_verification: false,
    }],
  },
};

const { Pool } = pg;
const pool = new Pool({ connectionString, ssl: process.env.DATABASE_SSL === "true" ? { rejectUnauthorized: false } : undefined });
try {
  await importGoCampingSnapshot(pool, [fixtureCampground]);
  const first = await importContextData(pool, contextFixture);
  await importGoCampingSnapshot(pool, [fixtureCampground]);
  const second = await importContextData(pool, contextFixture);
  assert.equal(first.toilets, 100);
  assert.equal(first.toilet_links_replaced, true);
  assert.equal(first.toilet_links, 1);
  assert.equal(first.road_stops, 1);
  assert.equal(first.free_assessments, 1);
  assert.equal(first.booking_rule_templates, 1);
  assert.equal(first.booking_rule_events, 1);
  assert.deepEqual(second, first);

  const counts = await pool.query(`SELECT
    (SELECT count(*)::int FROM campground) AS campgrounds,
    (SELECT count(*)::int FROM public_toilet) AS toilets,
    (SELECT count(*)::int FROM campground_nearby_toilet) AS toilet_links,
    (SELECT count(*)::int FROM road_stop) AS road_stops,
    (SELECT count(*)::int FROM free_camp_assessment) AS free_assessments,
    (SELECT count(*)::int FROM provider_policy_template) AS booking_rules,
    (SELECT count(*)::int FROM booking_rule_event) AS booking_events,
    (SELECT count(*)::int FROM current_source_fact WHERE fact_state = 'CONFIRMED') AS confirmed_facts`);
  assert.deepEqual(counts.rows[0], {
    campgrounds: 1, toilets: 100, toilet_links: 1, road_stops: 1, free_assessments: 1, booking_rules: 1, booking_events: 1, confirmed_facts: 1,
  });
  console.log(JSON.stringify({ verified: true, ...counts.rows[0] }, null, 2));
} finally {
  await pool.end();
}
