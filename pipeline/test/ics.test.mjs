import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { buildCalendar } from "../lib/booking-windows.mjs";
import { buildIcs, escapeText, foldLine } from "../lib/ics.mjs";
import { kstDate } from "../lib/kst.mjs";

const registry = JSON.parse(await readFile(new URL("../registry/booking-rules.json", import.meta.url), "utf8"));
const { events } = buildCalendar(registry, kstDate(2026, 10, 12), kstDate(2026, 11, 30, 23, 59));
const ics = buildIcs(events, { name: "테스트, 피드", now: new Date("2026-10-12T00:00:00Z") });
const unfolded = ics.replace(/\r\n /g, "");

test("RFC 5545 골격과 CRLF 줄바꿈", () => {
  assert.ok(ics.startsWith("BEGIN:VCALENDAR\r\nVERSION:2.0\r\n"));
  assert.ok(ics.endsWith("END:VCALENDAR\r\n"));
  assert.ok(!/[^\r]\n/.test(ics), "LF 단독 줄바꿈이 없어야 함");
  assert.equal((ics.match(/BEGIN:VEVENT/g) ?? []).length, events.length);
  assert.ok(unfolded.includes("X-WR-CALNAME:테스트\\, 피드"));
});

test("시각이 있는 일정은 KST 시각 + 알림 2개, 없는 일정은 종일 + 알림 1개", () => {
  const timed = unfolded.split("BEGIN:VEVENT").find((b) => b.includes("DTSTART;TZID=Asia/Seoul:20261014T090000"));
  assert.ok(timed, "숲나들e 10.14 09:00 이벤트");
  assert.equal((timed.match(/BEGIN:VALARM/g) ?? []).length, 2);
  const allDay = unfolded.split("BEGIN:VEVENT").find((b) => b.includes("DTSTART;VALUE=DATE:"));
  if (allDay) assert.equal((allDay.match(/BEGIN:VALARM/g) ?? []).length, 1);
  // 시각 미확정 일정이 있으면 종일 일정 + 알림 1개(국립공원은 2026-10 공식 시각 확인으로 시각 있는 일정이 됨)
});

test("UID는 같은 이벤트에 대해 매번 같다", () => {
  const again = buildIcs(events, { name: "x", now: new Date("2026-10-13T00:00:00Z") });
  const uids = (s) => s.match(/^UID:.*$/gm);
  assert.deepEqual(uids(again), uids(ics));
});

test("줄 접기는 75옥텟을 넘지 않고 한글을 쪼개지 않는다", () => {
  const long = `DESCRIPTION:${"가".repeat(60)}`;
  const folded = foldLine(long);
  for (const l of folded.split("\r\n")) assert.ok(Buffer.byteLength(l) <= 75);
  assert.equal(folded.replace(/\r\n /g, ""), long);
  for (const l of ics.split("\r\n")) assert.ok(Buffer.byteLength(l) <= 75, l);
});

test("텍스트 이스케이프", () => {
  assert.equal(escapeText("a,b;c\\d\ne"), "a\\,b\\;c\\\\d\\ne");
});
