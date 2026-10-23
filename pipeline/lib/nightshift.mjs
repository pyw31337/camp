// 맥미니 야간·주말 작업(소유자 2026-10-23: “평일 18시~익일 08시, 토·일·공휴일엔 컴퓨터가 켜진 채 쉬고 있으니 잘 활용해줘”).
// 순수 함수만 둔다(시간대·바쁨 판단·다음 작업 고르기). 실행은 local/macmini/nightshift.mjs.
// 시각은 모두 한국 시간(Asia/Seoul) 기준으로 계산한다(맥 시간대 설정과 무관).

/** Date → 한국 시간의 { ymd: "2026-10-23", dow: 0(일)~6(토), hm: 분 단위(0~1439) } */
export function kst(date = new Date()) {
  const t = new Date(date.getTime() + 9 * 3600e3);
  return { ymd: t.toISOString().slice(0, 10), dow: t.getUTCDay(), hm: t.getUTCHours() * 60 + t.getUTCMinutes() };
}
const addDays = (ymd, n) => new Date(Date.parse(`${ymd}T00:00:00Z`) + n * 864e5).toISOString().slice(0, 10);

/** 그날이 쉬는 날(토·일·공휴일·소유자가 적은 휴가)인가 */
export function isDayOff(ymd, holidays = []) {
  const dow = new Date(`${ymd}T00:00:00Z`).getUTCDay();
  return dow === 0 || dow === 6 || holidays.includes(ymd);
}

/**
 * 지금 맥미니를 써도 되는 시간인가, 언제까지 쓸 수 있나.
 * - 쉬는 날: 하루 종일
 * - 일하는 날: 18:00 이후, 그리고 00:00~08:00(전날이 무슨 요일이든)
 * 끝 시각은 ‘다음 일하는 날 08:00’. 반환: { open, endsAt(Date|null), minutesLeft }
 */
export function window(now = new Date(), { holidays = [], start = 18 * 60, end = 8 * 60 } = {}) {
  const { ymd, hm } = kst(now);
  const off = isDayOff(ymd, holidays);
  const open = off || hm >= start || hm < end;
  if (!open) return { open: false, endsAt: null, minutesLeft: 0 };
  // 끝: 오늘 08시가 아직 안 지났고 오늘이 일하는 날이면 오늘 08시, 아니면 다음 일하는 날 08시
  let day = !off && hm < end ? ymd : addDays(ymd, 1);
  for (let i = 0; i < 30 && isDayOff(day, holidays); i++) day = addDays(day, 1);
  const endsAt = new Date(Date.parse(`${day}T00:00:00Z`) - 9 * 3600e3 + end * 60e3);
  return { open: true, endsAt, minutesLeft: Math.floor((endsAt - now) / 60e3) };
}

/**
 * 맥에 원래 있던 작업(launchd·cron)과 겹치는가. busy: [{ label, dow?: 0~6|null, hm: 분, minutes: 예상 시간 }]
 * 시작 10분 전부터 예상 시간까지를 피한다(예상 시간을 모르면 60분).
 */
export function clashesWith(now, busy = [], before = 10) {
  const { dow, hm } = kst(now);
  return busy.find((b) => {
    // 시작 시각에서 지금까지 몇 분 지났나(매일 작업은 하루, 요일 작업은 한 주 단위로 돌려 셈)
    const period = b.dow == null ? 1440 : 10080;
    const at = b.dow == null ? b.hm : b.dow * 1440 + b.hm, cur = b.dow == null ? hm : dow * 1440 + hm;
    const d = (((cur - at) % period) + period) % period;
    return d < (b.minutes ?? 60) || d >= period - before;
  }) ?? null;
}

/** 컴퓨터가 쉬고 있나: 1분 평균 부하가 코어당 limit 미만이고, 피할 프로세스가 돌고 있지 않을 때 */
export function idle({ load1, cpus, running = [] }, limit = 0.5) {
  if (running.length) return { ok: false, why: `다른 작업 실행 중: ${running.slice(0, 3).join(", ")}` };
  if (load1 / Math.max(1, cpus) >= limit) return { ok: false, why: `부하 ${load1.toFixed(1)} / ${cpus}코어` };
  return { ok: true };
}

/** 다음 겹침(busy 항목 시작 10분 전)까지 남은 분(일주일 안에 없으면 Infinity) */
export function minutesUntil(now, busy = [], before = 10) {
  let best = Infinity;
  for (let m = 0; m < 10080 && m < best; m += 5) if (clashesWith(new Date(now.getTime() + m * 60e3), busy, before)) best = m;
  return best;
}

/**
 * 다음에 돌릴 작업 하나. jobs: [{ id, everyHours, minMinutes, maxMinutes?, dayOffOnly?, avoid? }], state: { [id]: { last: ISO } }
 * 차례가 된 작업 중 가장 오래 안 돈 것. 남은 시간이 그 작업의 최소 시간보다 적으면 건너뛴다.
 */
// 작업마다 avoid(같은 파일을 쓰는 CI 작업 시간 등)를 피하고, 쓸 수 있는 시간 = min(창 남은 시간, maxMinutes, 다음 avoid까지).
export const budgetOf = (j, now, minutesLeft) => Math.min(minutesLeft, j.maxMinutes ?? Infinity, minutesUntil(now, j.avoid ?? []));
export function pickJob(jobs, state, { now = new Date(), minutesLeft, dayOff }) {
  const due = jobs.filter((j) => {
    if (j.dayOffOnly && !dayOff) return false;
    if (budgetOf(j, now, minutesLeft) < (j.minMinutes ?? 30)) return false;
    const last = Date.parse(state?.[j.id]?.last ?? 0) || 0;
    return now - last >= (j.everyHours ?? 24) * 3600e3;
  });
  return due.sort((a, b) => (Date.parse(state?.[a.id]?.last ?? 0) || 0) - (Date.parse(state?.[b.id]?.last ?? 0) || 0))[0] ?? null;
}
