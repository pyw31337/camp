// 예약 오픈 이벤트 → iCalendar(RFC 5545) 구독 피드.
// 로그인·푸시 서버 없이 사용자의 캘린더 앱(구글·애플·삼성·네이버)이 알림을 보내게 하는 무료 알림 경로다.

import { createHash } from "node:crypto";

const TYPE_LABEL = {
  OPEN: "선착순 오픈",
  LOTTERY_APPLY_START: "추첨 접수 시작",
  LOTTERY_APPLY_END: "추첨 접수 마감",
  LOTTERY_RESULT: "추첨 결과 발표",
  REOPEN: "잔여분 재오픈",
};

export function escapeText(s) {
  return String(s ?? "").replace(/\\/g, "\\\\").replace(/;/g, "\\;").replace(/,/g, "\\,").replace(/\r?\n/g, "\\n");
}

/** 75옥텟 기준 줄 접기(UTF-8 문자를 쪼개지 않음) */
export function foldLine(line) {
  const out = [];
  let cur = "";
  let bytes = 0;
  for (const ch of line) {
    const b = Buffer.byteLength(ch);
    const limit = out.length === 0 ? 75 : 74; // 이어지는 줄은 앞의 공백 1옥텟을 뺀다
    if (bytes + b > limit) {
      out.push(cur);
      cur = "";
      bytes = 0;
    }
    cur += ch;
    bytes += b;
  }
  out.push(cur);
  return out.join("\r\n ");
}

const compact = (iso) => iso.slice(0, 19).replace(/[-:]/g, ""); // 2026-11-01T10:00:00 → 20261101T100000

function stayText(stay) {
  if (!stay) return null;
  if (stay.month) return `${stay.month.replace("-", "년 ")}월 이용분`;
  if (stay.from) return `${stay.from} ~ ${stay.to} 이용분`;
  return null;
}

export function eventToVevent(e, dtstamp) {
  const uid = `${createHash("sha1").update(e.id).digest("hex").slice(0, 20)}@moyeora-camping`;
  const summary = `[${TYPE_LABEL[e.type] ?? e.type}] ${e.label}`;
  const desc = [
    stayText(e.stay),
    e.note,
    e.time_known ? null : "정확한 시각은 공식 공지를 확인하세요.",
    e.needs_verification ? "확인 필요: 공식 원문 재확인 전 일정입니다." : null,
    `출처: ${e.source.title} (${e.source.checked_at} 확인, 등급 ${e.source.tier})`,
  ].filter(Boolean).join("\n");
  const lines = ["BEGIN:VEVENT", `UID:${uid}`, `DTSTAMP:${dtstamp}`];
  if (e.time_known) {
    lines.push(`DTSTART;TZID=Asia/Seoul:${compact(e.at)}`, "DURATION:PT30M");
  } else {
    lines.push(`DTSTART;VALUE=DATE:${e.date.replace(/-/g, "")}`);
  }
  lines.push(`SUMMARY:${escapeText(summary)}`, `DESCRIPTION:${escapeText(desc)}`, `URL:${e.source.url}`, "TRANSP:TRANSPARENT");
  // 하루 전 알림은 모두, 10분 전 알림은 시각이 확정된 일정에만
  lines.push("BEGIN:VALARM", "ACTION:DISPLAY", `DESCRIPTION:${escapeText(`내일 ${summary}`)}`, "TRIGGER:-P1D", "END:VALARM");
  if (e.time_known) lines.push("BEGIN:VALARM", "ACTION:DISPLAY", `DESCRIPTION:${escapeText(`10분 뒤 ${summary}`)}`, "TRIGGER:-PT10M", "END:VALARM");
  lines.push("END:VEVENT");
  return lines;
}

export function buildIcs(events, { name, description, now = new Date() }) {
  const dtstamp = now.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");
  const lines = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//Moyeora Camping//Open Calendar//KO",
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    `X-WR-CALNAME:${escapeText(name)}`,
    `X-WR-CALDESC:${escapeText(description ?? "")}`,
    "X-WR-TIMEZONE:Asia/Seoul",
    "REFRESH-INTERVAL;VALUE=DURATION:PT12H",
    "X-PUBLISHED-TTL:PT12H",
    "BEGIN:VTIMEZONE",
    "TZID:Asia/Seoul",
    "BEGIN:STANDARD",
    "DTSTART:19700101T000000",
    "TZOFFSETFROM:+0900",
    "TZOFFSETTO:+0900",
    "TZNAME:KST",
    "END:STANDARD",
    "END:VTIMEZONE",
    ...events.flatMap((e) => eventToVevent(e, dtstamp)),
    "END:VCALENDAR",
  ];
  return lines.map(foldLine).join("\r\n") + "\r\n";
}
