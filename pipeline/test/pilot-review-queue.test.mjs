import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { validatePilotReviewQueue } from "../lib/pilot-review-queue.mjs";

test("pilot review queue keeps 11 manual-review candidates out of published facts", async () => {
  const queue = JSON.parse(await readFile(new URL("../registry/pilot-review-queue.json", import.meta.url), "utf8"));
  assert.deepEqual(validatePilotReviewQueue(queue), []);
  assert.equal(queue.candidates.length, 11);
  assert.ok(queue.candidates.every((candidate) => candidate.status === "QUEUED"));
  assert.ok(queue.candidates.every((candidate) => candidate.source.approval_status === "MANUAL_REVIEW_ONLY"));
  assert.ok(queue.candidates.every((candidate) => !Object.hasOwn(candidate, "condition_facts")));
});

test("pilot review queue rejects a candidate that embeds unreviewed facts", () => {
  const queue = {
    candidates: [{
      id: "bad",
      gocamping_id: "1",
      name: "검수 전 후보",
      region: "경기",
      status: "QUEUED",
      source: {
        approval_status: "MANUAL_REVIEW_ONLY",
        official_url: "https://example.test/official",
        catalog_url: "https://example.test/catalog"
      },
      required_field_codes: ["PARKING_MODE"],
      condition_facts: { power_max_w: 1000 }
    }]
  };
  const errors = validatePilotReviewQueue(queue);
  assert.ok(errors.some((error) => error.includes("missing core review fields")));
  assert.ok(errors.some((error) => error.includes("must not contain condition_facts")));
});
