import test from "node:test";
import assert from "node:assert/strict";
import { buildWebCatalog } from "../lib/web-catalog.mjs";

const calendar = { generated_at: "2026-10-13T00:00:00.000Z", registry_version: 1, events: [{ id: "open-1" }] };
const campgroundsPayload = {
  fetched_at: "2026-10-13T00:00:00+09:00",
  campgrounds: [{
    external_id: { id: "42" }, name: "검증 캠핑장",
    address: { sido: "경기", sigungu: "가평" },
    legal_business_types: ["자동차야영장"], operator_type: "LOCAL_GOVERNMENT",
    products: [{ kind: "AUTO_PITCH", site_count: 12, confirmed: true }],
    site_sizes: [{ width_m: 6, depth_m: 8, area_m2: 48, count: 12, measurement_source: "GOCAMPING" }],
    reservation: { methods: ["온라인"], url: "https://example.com/reservation" },
    hero_image_url: "https://example.com/photo.jpg",
    source: { provider: "gocamping", tier: "A", fetched_at: "2026-10-13T00:00:00+09:00" },
  }],
};

test("does not expose GoCamping records until persistence review is approved", () => {
  const catalog = buildWebCatalog({ calendar, campgroundsPayload, publishGoCamping: false, generatedAt: "2026-10-13T00:00:00.000Z" });
  assert.equal(catalog.sources.gocamping.state, "PENDING_PERSISTENCE_REVIEW");
  assert.equal(catalog.counts.gocamping_records, null);
  assert.deepEqual(catalog.campgrounds, []);
});

test("exports a provenance-preserving, media-free discovery record after approval", () => {
  const catalog = buildWebCatalog({ calendar, campgroundsPayload, publishGoCamping: true, generatedAt: "2026-10-13T00:00:00.000Z" });
  assert.equal(catalog.sources.gocamping.state, "PUBLISHED");
  assert.equal(catalog.counts.gocamping_records, 1);
  assert.equal(catalog.campgrounds[0].name, "검증 캠핑장");
  assert.equal(catalog.campgrounds[0].reservation.has_official_url, true);
  assert.equal("hero_image_url" in catalog.campgrounds[0], false);
});
