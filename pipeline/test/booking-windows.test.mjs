import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { buildCalendar, expandRule, validateRegistry } from "../lib/booking-windows.mjs";
import { kstDate } from "../lib/kst.mjs";

const registry = JSON.parse(await readFile(new URL("../registry/booking-rules.json", import.meta.url), "utf8"));
const rule = (id) => registry.rules.find((r) => r.id === id);
const from = kstDate(2026, 10, 12);
const to = kstDate(2026, 12, 31, 23, 59);

test("등록된 예약 규칙은 검증을 통과한다", () => {
  assert.deepEqual(validateRegistry(registry), []);
});

test("국립공원 추첨: 매월 1일 접수, 5일 발표, 2개월 뒤 이용분", () => {
  const ev = expandRule(rule("knps-campground-lottery"), from, to);
  const starts = ev.filter((e) => e.type === "LOTTERY_APPLY_START");
  assert.deepEqual(starts.map((e) => e.date), ["2026-11-01", "2026-12-01"]);
  assert.equal(starts[0].stay.month, "2027-01");
  assert.equal(starts[0].time_known, false);
  const result = ev.find((e) => e.type === "LOTTERY_RESULT" && e.date === "2026-11-05");
  assert.equal(result.note, "오후 발표");
  // C 등급 근거는 확인 필요로 표시된다.
  assert.equal(result.needs_verification, true);
  assert.equal(result.source.tier, "C");
});

test("숲나들e 주중 선착순: 매주 수요일 09:00, 6주 뒤 주를 연다", () => {
  const ev = expandRule(rule("foresttrip-national-weekday-fcfs"), from, kstDate(2026, 10, 31));
  assert.deepEqual(ev.map((e) => e.at), ["2026-10-14T09:00:00+09:00", "2026-10-21T09:00:00+09:00", "2026-10-28T09:00:00+09:00"]);
  assert.deepEqual(ev[0].stay, { from: "2026-11-23", to: "2026-11-29", day_types: ["SUN", "MON", "TUE", "WED", "THU"] });
  assert.equal(ev[0].needs_verification, false);
});

test("범위 경계: 시작 시각 이전 이벤트는 제외한다", () => {
  const ev = expandRule(rule("foresttrip-national-weekend-reopen"), kstDate(2026, 10, 15, 9, 1), kstDate(2026, 11, 30));
  assert.deepEqual(ev.map((e) => e.date), ["2026-11-15"]);
});

test("말일 보정: 31일 규칙은 2월에 말일로 계산된다", () => {
  const r = { ...rule("foresttrip-national-weekend-reopen"), id: "t", schedule: { kind: "MONTHLY_OPEN", day: 31, time: "10:00", stay_month_offset: 1 } };
  const ev = expandRule(r, kstDate(2027, 2, 1), kstDate(2027, 2, 28, 23, 59));
  assert.deepEqual(ev.map((e) => e.at), ["2027-02-28T10:00:00+09:00"]);
});

test("API_WINDOW 규칙은 반복 이벤트 대신 recurring 목록으로 나온다", () => {
  const cal = buildCalendar(registry, from, to);
  assert.ok(cal.recurring.some((r) => r.rule_id === "seoul-yeyak-camping-window"));
  assert.ok(cal.events.every((e) => e.rule_id !== "seoul-yeyak-camping-window"));
  const sorted = [...cal.events].sort((a, b) => a.at.localeCompare(b.at));
  assert.deepEqual(cal.events.map((e) => e.id), sorted.map((e) => e.id));
});

test("검증기는 출처 없는 규칙과 E 등급 근거를 거부한다", () => {
  const bad = structuredClone(registry);
  bad.rules[0].source.url = "http://example.com";
  bad.rules[1].source.tier = "E";
  bad.rules[2].provider_id = "nope";
  const errors = validateRegistry(bad);
  assert.ok(errors.some((e) => e.includes("https")));
  assert.ok(errors.some((e) => e.includes("E 등급")));
  assert.ok(errors.some((e) => e.includes("provider_id")));
});
