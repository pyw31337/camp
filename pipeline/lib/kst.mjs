// 한국 표준시(UTC+9, 서머타임 없음) 벽시계 계산 도우미.
// 실행 환경의 TZ와 무관하게 동작하도록 내부적으로 UTC Date에 KST 벽시계 값을 담는다.

const pad = (n) => String(n).padStart(2, "0");

/** KST 벽시계 날짜(월은 1~12). 범위를 넘는 일·월은 Date.UTC 규칙대로 이월된다. */
export function kstDate(year, month, day, hour = 0, minute = 0) {
  return new Date(Date.UTC(year, month - 1, day, hour, minute));
}

export function parseTime(hhmm) {
  if (hhmm == null) return [0, 0];
  const m = /^(\d{1,2}):(\d{2})$/.exec(hhmm);
  if (!m) throw new Error(`시각 형식 오류: ${hhmm}`);
  return [Number(m[1]), Number(m[2])];
}

export function toKstIso(d) {
  return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}T${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}:00+09:00`;
}

export function toKstDay(d) {
  return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`;
}

export function toYearMonth(d) {
  return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}`;
}

/** 실제 시각(epoch) → KST 벽시계 Date */
export function nowInKst(epochMs = Date.now()) {
  return new Date(epochMs + 9 * 3600 * 1000);
}

export function addDays(d, n) {
  return new Date(d.getTime() + n * 86400000);
}

/** 같은 주 월요일 00:00 */
export function mondayOf(d) {
  const dow = d.getUTCDay();
  const back = (dow + 6) % 7;
  return kstDate(d.getUTCFullYear(), d.getUTCMonth() + 1, d.getUTCDate() - back);
}

/** 그 달에 존재하지 않는 일(예: 2월 30일)은 말일로 맞춘다. */
export function clampDay(year, month, day) {
  const last = new Date(Date.UTC(year, month, 0)).getUTCDate();
  return Math.min(day, last);
}
