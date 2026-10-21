import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { openingIcs } from "../../camping-atlas/public/context/open-ics.js";
const rd = (f) => readFileSync(new URL(`../../${f}`, import.meta.url), "utf8");
const now = new Date("2026-10-22T00:00:00Z");
test("#43 시각을 아는 오픈: 정확한 시각 + 10분 전·하루 전 알림", () => {
  const t = openingIcs({ id: "101520", at: "2026-10-28T09:00:00+09:00", tk: true, label: "이용일 6주 전 수요일 09:00", platform: "숲나들e", url: "https://www.foresttrip.go.kr/" }, "국립김천숲속야영장", "https://x/camp/place/101520", now);
  assert.match(t, /^BEGIN:VCALENDAR\r\n/);
  assert.match(t, /DTSTART:20261028T000000Z/);
  assert.match(t, /TRIGGER:-PT10M/); assert.match(t, /TRIGGER:-P1D/);
  assert.match(t, /SUMMARY:\[예약 오픈\] 국립김천숲속야영장/);
  for (const l of t.split("\r\n")) assert.ok(new TextEncoder().encode(l).length <= 75, l);
});
test("#43 날짜만 아는 오픈: 종일 일정(한국 날짜) + 전날 알림", () => {
  const t = openingIcs({ id: "6986", at: "2026-10-30T00:00:00+09:00", tk: false }, "무창포오토캠핑장", "https://x", now);
  assert.match(t, /DTSTART;VALUE=DATE:20261030/); assert.match(t, /DTEND;VALUE=DATE:20261031/);
  assert.match(t, /TRIGGER:-PT15H/);
  assert.equal(openingIcs({ id: "1", at: "bad" }, "x", "y"), null);
});
test("#43 상세 예약 오픈 칸에 ‘캘린더 알림’ 버튼", () => {
  for (const f of ["camping-atlas/public/app.js", "design/renewal/app.js"]) assert.match(rd(f), /data-open-ics="\$\{esc\(String\(c\.id\)\)\}">\$\{ic\("clock"\)\}캘린더 알림<\/button>/);
});
