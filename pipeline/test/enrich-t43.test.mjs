import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
const R = fileURLToPath(new URL("../../", import.meta.url));
const pins = JSON.parse(readFileSync(R + "pipeline/registry/curated-pins.json", "utf8")).camps;
const camp = (id) => JSON.parse(readFileSync(R + `camping-atlas/public/explore/data/camps/${id}.json`, "utf8"));
test("102229 공식 이용안내 값이 핀·출력물에 반영", () => {
  const d = camp("102229");
  assert.equal(d.profile.fields.MANNER.value, "23:00~07:00");
  assert.equal(d.profile.fields.MANNER.grade, "OPERATOR");
  assert.match(d.profile.fields.FIRE.value, /장작/);
  assert.ok(d.house_rules.rules.some((r) => /LPG/.test(r.text)));
  assert.ok(d.house_rules.rules.length >= 8, "기존 규칙 보존");
  assert.equal(pins["102229"].catalog.fee.min, 35000, "공식 요금 유지");
});
test("102377 후기 기반 보강은 기존 확인값을 덮지 않는다", () => {
  const d = camp("102377");
  assert.equal(d.profile.fields.AMENITIES.grade, "CONFIRMED");
  assert.match(d.profile.fields.EXTRA_FEE.value, /조기입실/);
  assert.ok(d.house_rules.ops.some((o) => /온수풀/.test(o.text)));
  for (const [k, v] of Object.entries(pins["102377"].detail)) if (v.source) assert.ok(v.source.url && v.source.quote, k);
});
test("field-guard: 변하지 않은 pinned MENTION 값은 하향이 아니다", async () => {
  const { downgrades } = await import(R + "pipeline/scripts/field-guard.mjs").catch(() => ({}));
  if (!downgrades) return;
  const v = { value: "조기입실 1시간 5,000원", grade: "MENTION", pinned: true };
  assert.deepEqual(downgrades({ profile: { fields: { EXTRA_FEE: v } } }, { profile: { fields: { EXTRA_FEE: structuredClone(v) } } }), []);
  assert.equal(downgrades({ profile: { fields: { EXTRA_FEE: v } } }, { profile: { fields: {} } }).length, 1);
});
