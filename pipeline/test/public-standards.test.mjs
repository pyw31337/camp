import assert from "node:assert/strict";
import test from "node:test";
import { detectPublicCampground, getPublicStandardDoc } from "../lib/public-standards.mjs";
import { buildSpecSheet } from "../lib/spec-extractor.mjs";

test("국립공원공단 야영장을 식별하고 표준 규정 문서를 생성한다", () => {
  const camp = { id: "100", name: "덕유산국립공원 덕유대야영장", op: "NATIONAL_PARK" };
  const detected = detectPublicCampground(camp);
  assert.equal(detected?.type, "KNPS");
  assert.equal(detected?.label, "국립공원공단 야영장 표준 운영규정");

  const doc = getPublicStandardDoc(camp);
  assert.equal(doc?.grade, "OFFICIAL_TEXT");
  assert.equal(doc?.source.kind, "public_standard");

  const spec = buildSpecSheet({ name: camp.name, docs: [doc] });
  assert.equal(spec.fields.CHECKIN_TIME?.values[0]?.value, "14:00부터");
  assert.equal(spec.fields.CHECKOUT_TIME?.values[0]?.value, "11:00까지");
  assert.equal(spec.fields.MANNER_TIME?.values[0]?.value, "22:00~07:00");
  assert.equal(spec.fields.POWER_W?.values[0]?.value, "600W");
  assert.equal(spec.fields.REFUND_POLICY?.values[0]?.value, "10일 전 100% 환불");
});

test("자연휴양림 야영장을 식별하고 표준 규정을 생성한다", () => {
  const camp = { id: "200", name: "유명산자연휴양림 야영장", op: "NATURAL_RECREATION_FOREST" };
  const detected = detectPublicCampground(camp);
  assert.equal(detected?.type, "FOREST");

  const doc = getPublicStandardDoc(camp);
  const spec = buildSpecSheet({ name: camp.name, docs: [doc] });
  assert.equal(spec.fields.CHECKIN_TIME?.values[0]?.value, "14:00부터");
  assert.equal(spec.fields.CHECKOUT_TIME?.values[0]?.value, "11:00까지");
  assert.equal(spec.fields.MANNER_TIME?.values[0]?.value, "22:00~07:00");
  assert.equal(spec.fields.REFUND_POLICY?.values[0]?.value, "3일 전 100% 환불");
});

test("지자체 국민여가캠핑장을 식별하고 표준 조례 규정을 생성한다", () => {
  const camp = { id: "300", name: "가평 자라섬 국민여가캠핑장", op: "LOCAL_GOVERNMENT" };
  const detected = detectPublicCampground(camp);
  assert.equal(detected?.type, "MUNICIPAL");

  const doc = getPublicStandardDoc(camp);
  const spec = buildSpecSheet({ name: camp.name, docs: [doc] });
  assert.equal(spec.fields.CHECKIN_TIME?.values[0]?.value, "14:00부터");
  assert.equal(spec.fields.CHECKOUT_TIME?.values[0]?.value, "11:00까지");
  assert.equal(spec.fields.MANNER_TIME?.values[0]?.value, "22:00~07:00");
  assert.equal(spec.fields.POWER_W?.values[0]?.value, "600W");
});
