// t39 #43 예약 오픈 캘린더 알림: 예약 오픈 일정을 .ics(iCalendar) 한 건으로 만든다. 기기 캘린더 앱이 알림을 맡는다(서버·푸시 없음).
// 시각을 아는 오픈(tk)은 그 시각 30분 일정 + 10분 전·하루 전 알림, 날짜만 아는 오픈은 종일 일정 + 전날 오전 9시 알림.
const pad = (n) => String(n).padStart(2, "0");
const utc = (d) => `${d.getUTCFullYear()}${pad(d.getUTCMonth() + 1)}${pad(d.getUTCDate())}T${pad(d.getUTCHours())}${pad(d.getUTCMinutes())}00Z`;
const icsText = (s) => String(s ?? "").replace(/\\/g, "\\\\").replace(/\n/g, "\\n").replace(/([,;])/g, "\\$1");
// 75바이트 줄 접기(RFC 5545) — 한글이 많아도 깨지지 않게 글자 단위로 자른다.
function fold(line) {
  const out = []; let cur = "", bytes = 0;
  for (const ch of line) { const b = new TextEncoder().encode(ch).length; if (bytes + b > 73) { out.push(cur); cur = " "; bytes = 1; } cur += ch; bytes += b; }
  out.push(cur); return out.join("\r\n");
}
/** @param {{id:string, at:string, tk?:boolean, label?:string, stay?:string, platform?:string, url?:string}} o @param {string} name @param {string} pageUrl */
export function openingIcs(o, name, pageUrl, now = new Date()) {
  const at = new Date(o.at);
  if (!o?.at || Number.isNaN(at.getTime())) return null;
  const kst = new Date(at.getTime() + 9 * 3600e3); // 날짜만 아는 오픈은 한국 날짜 기준
  const day = `${kst.getUTCFullYear()}${pad(kst.getUTCMonth() + 1)}${pad(kst.getUTCDate())}`;
  const next = new Date(Date.UTC(kst.getUTCFullYear(), kst.getUTCMonth(), kst.getUTCDate() + 1));
  const nextDay = `${next.getUTCFullYear()}${pad(next.getUTCMonth() + 1)}${pad(next.getUTCDate())}`;
  const desc = [o.label, o.stay && `대상: ${o.stay}`, o.platform && `예약처: ${o.platform}`, o.url, `정보: ${pageUrl}`, "오픈 시각·방식은 예약처 공지를 꼭 다시 확인하세요."].filter(Boolean).join("\n");
  const alarm = (trigger, text) => ["BEGIN:VALARM", "ACTION:DISPLAY", `TRIGGER:${trigger}`, `DESCRIPTION:${icsText(text)}`, "END:VALARM"];
  const lines = [
    "BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//moyeora-camping//open-alert//KO", "CALSCALE:GREGORIAN", "METHOD:PUBLISH",
    "BEGIN:VEVENT", `UID:open-${o.id}-${day}@pyw31337.github.io`, `DTSTAMP:${utc(now)}`,
    ...(o.tk ? [`DTSTART:${utc(at)}`, `DTEND:${utc(new Date(at.getTime() + 30 * 60e3))}`] : [`DTSTART;VALUE=DATE:${day}`, `DTEND;VALUE=DATE:${nextDay}`]),
    `SUMMARY:${icsText(`[예약 오픈] ${name}`)}`, `DESCRIPTION:${icsText(desc)}`, ...(o.url || pageUrl ? [`URL:${o.url || pageUrl}`] : []),
    ...(o.tk ? [...alarm("-PT10M", `${name} 예약 오픈 10분 전`), ...alarm("-P1D", `${name} 내일 예약 오픈`)] : alarm("-PT15H", `${name} 내일 예약 오픈`)),
    "END:VEVENT", "END:VCALENDAR",
  ];
  return lines.map(fold).join("\r\n") + "\r\n";
}
export function downloadIcs(text, file) {
  const a = document.createElement("a");
  a.href = URL.createObjectURL(new Blob([text], { type: "text/calendar;charset=utf-8" }));
  a.download = file; document.body.append(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 4000);
}
