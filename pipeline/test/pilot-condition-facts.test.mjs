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
  assert.ok(first.zones.length > 0);
  assert.ok(first.zones[0].size_w > 0);
  assert.ok(first.zones[0].size_h > 0);
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
