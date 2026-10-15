import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { validatePilotConditionFacts } from "../lib/pilot-condition-facts.mjs";

test("pilot condition facts validation", async () => {
  const json = JSON.parse(
    await readFile(new URL("../registry/pilot-condition-facts.json", import.meta.url), "utf8")
  );
  const errors = validatePilotConditionFacts(json);
  assert.deepEqual(errors, [], `pilot-condition-facts validation failed: ${errors.join(", ")}`);
  assert.ok(json.pilot_campgrounds.length >= 10, "pilot dataset must contain at least 10 campgrounds");

  // Spot-check first campground fields
  const first = json.pilot_campgrounds[0];
  assert.equal(first.parking_mode, "SITE_ADJACENT");
  assert.equal(first.firewood_allowed, "ALLOWED");
  assert.equal(first.evidence.verification_status, "VERIFIED");
  assert.equal(first.evidence.source_type, "MANUAL_PRIMARY_PAGE_REVIEW");
  assert.ok(first.evidence.reviewed_field_codes.includes("POWER_MAX_W"));
  assert.ok(first.evidence.next_review_due_at);
  assert.ok(first.zones.length > 0);
  assert.ok(first.zones[0].size_w > 0);
  assert.ok(first.zones[0].size_h > 0);
});

test("VERIFIED pilot entries require reviewer, covered fields, and a recheck date", () => {
  const incomplete = {
    pilot_campgrounds: [{
      id: "missing-evidence",
      name: "근거가 모자란 캠핑장",
      region: "경기",
      parking_mode: "SITE_ADJACENT",
      power_max_w: 1000,
      firewood_allowed: "ALLOWED",
      charcoal_allowed: "ALLOWED",
      zones: [{ name: "A", size_w: 8, size_h: 8, surface: "GRAVEL", parking: "SITE_ADJACENT", site_count: 1 }],
      evidence: {
        source_url: "https://example.test/notice",
        observed_at: "2026-10-15T09:00:00+09:00",
        verification_status: "VERIFIED",
        reviewer: "",
        reviewed_field_codes: ["PARKING_MODE"],
        next_review_due_at: "2026-10-14T09:00:00+09:00"
      }
    }]
  };
  const errors = validatePilotConditionFacts(incomplete);
  assert.ok(errors.some((e) => e.includes("invalid source_type")));
  assert.ok(errors.some((e) => e.includes("missing reviewer")));
  assert.ok(errors.some((e) => e.includes("missing core field coverage")));
  assert.ok(errors.some((e) => e.includes("must be after observed_at")));
});

test("detects invalid parking and dimensions", () => {
  const bad = {
    pilot_campgrounds: [
      {
        id: "bad-1",
        name: "잘못된캠핑장",
        region: "경기",
        parking_mode: "INVALID_PARKING",
        power_max_w: -10,
        firewood_allowed: "MAYBE",
        charcoal_allowed: "ALLOWED",
        zones: [{ name: "A", size_w: 0, size_h: -5, surface: "UNKNOWN_SURF", parking: "BAD" }],
        evidence: { source_url: "", observed_at: "", verification_status: "PENDING" }
      }
    ]
  };
  const errors = validatePilotConditionFacts(bad);
  assert.ok(errors.length >= 5);
  assert.ok(errors.some((e) => e.includes("invalid parking_mode")));
  assert.ok(errors.some((e) => e.includes("power_max_w must be a positive integer")));
  assert.ok(errors.some((e) => e.includes("size_w must be > 0")));
});
