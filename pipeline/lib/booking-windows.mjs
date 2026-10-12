// 예약 규칙(registry) → 예약 오픈 캘린더 이벤트 계산기.
// 규칙은 사람이 공식 원문을 보고 등록하며, 계산 결과는 항상 규칙의 출처·확인일·신뢰 등급을 그대로 가진다.

import { addDays, clampDay, kstDate, mondayOf, parseTime, toKstDay, toKstIso, toYearMonth } from "./kst.mjs";

export const EVENT_TYPES = Object.freeze({
  OPEN: "OPEN", // 선착순 판매 시작
  LOTTERY_APPLY_START: "LOTTERY_APPLY_START",
  LOTTERY_APPLY_END: "LOTTERY_APPLY_END",
  LOTTERY_RESULT: "LOTTERY_RESULT",
  REOPEN: "REOPEN", // 미결제·취소분 재판매
});

export const RULE_KINDS = ["MONTHLY_OPEN", "MONTHLY_LOTTERY", "MONTHLY_REOPEN", "WEEKLY_OPEN", "DAILY_ROLLING", "API_WINDOW"];
export const TIERS = ["A", "B", "C", "D", "E"];
/** 이 등급 이상만 '확인된 일정'으로 표시한다. 나머지는 확인 필요 배지와 함께 노출한다. */
const VERIFIED_TIERS = new Set(["A", "B"]);

function monthsBetween(from, to) {
  const out = [];
  let y = from.getUTCFullYear();
  let m = from.getUTCMonth() + 1;
  // 시작 달 이전 달부터 훑어 범위 경계의 이벤트를 놓치지 않는다.
  m -= 1;
  if (m < 1) { m = 12; y -= 1; }
  while (kstDate(y, m, 1) <= to) {
    out.push([y, m]);
    m += 1;
    if (m > 12) { m = 1; y += 1; }
  }
  return out;
}

function stayMonth(y, m, offset) {
  return toYearMonth(kstDate(y, m + offset, 1));
}

function at(y, m, day, time) {
  const [h, mi] = parseTime(time);
  return kstDate(y, m, clampDay(y, m, day), h, mi);
}

function baseEvent(rule, type, when, extra = {}) {
  return {
    id: `${rule.id}:${type}:${toKstIso(when)}`,
    rule_id: rule.id,
    provider_id: rule.provider_id,
    campground_ids: rule.campground_ids ?? [],
    type,
    at: toKstIso(when),
    date: toKstDay(when),
    time_known: extra.time_known ?? true,
    label: extra.label ?? rule.label,
    stay: extra.stay ?? null,
    note: extra.note ?? null,
    source: { url: rule.source.url, title: rule.source.title, checked_at: rule.source.checked_at, tier: rule.source.tier },
    needs_verification: !VERIFIED_TIERS.has(rule.source.tier),
  };
}

/**
 * @param {object} rule registry 규칙
 * @param {Date} from KST 벽시계 시작(포함)
 * @param {Date} to KST 벽시계 끝(포함)
 * @returns {object[]} 시간순 이벤트
 */
export function expandRule(rule, from, to) {
  const s = rule.schedule;
  const events = [];
  const push = (e) => { const t = new Date(e.at.slice(0, 16) + ":00Z"); if (t >= from && t <= to) events.push(e); };

  switch (s.kind) {
    case "MONTHLY_OPEN":
    case "MONTHLY_REOPEN": {
      const type = s.kind === "MONTHLY_OPEN" ? EVENT_TYPES.OPEN : EVENT_TYPES.REOPEN;
      for (const [y, m] of monthsBetween(from, to)) {
        push(baseEvent(rule, type, at(y, m, s.day, s.time), {
          time_known: s.time != null,
          stay: { month: stayMonth(y, m, s.stay_month_offset ?? 1) },
        }));
      }
      break;
    }
    case "MONTHLY_LOTTERY": {
      for (const [y, m] of monthsBetween(from, to)) {
        const stay = { month: stayMonth(y, m, s.stay_month_offset ?? 1) };
        push(baseEvent(rule, EVENT_TYPES.LOTTERY_APPLY_START, at(y, m, s.apply_start_day, s.apply_start_time), { stay, time_known: s.apply_start_time != null }));
        push(baseEvent(rule, EVENT_TYPES.LOTTERY_APPLY_END, at(y, m, s.apply_end_day, s.apply_end_time), { stay, time_known: s.apply_end_time != null, note: s.apply_end_note ?? null }));
        if (s.result_day != null) {
          push(baseEvent(rule, EVENT_TYPES.LOTTERY_RESULT, at(y, m, s.result_day, s.result_time), { stay, time_known: s.result_time != null, note: s.result_note ?? null }));
        }
      }
      break;
    }
    case "WEEKLY_OPEN": {
      const [h, mi] = parseTime(s.time);
      let d = kstDate(from.getUTCFullYear(), from.getUTCMonth() + 1, from.getUTCDate(), h, mi);
      while (d.getUTCDay() !== s.weekday) d = addDays(d, 1);
      for (; d <= to; d = addDays(d, 7)) {
        const weekStart = addDays(mondayOf(d), (s.lead_weeks ?? 0) * 7);
        push(baseEvent(rule, EVENT_TYPES.OPEN, d, {
          stay: { from: toKstDay(weekStart), to: toKstDay(addDays(weekStart, 6)), day_types: s.stay_day_types ?? null },
        }));
      }
      break;
    }
    case "DAILY_ROLLING":
    case "API_WINDOW":
      // 날마다 열리거나(롤링) 공공 API가 접수 기간을 직접 주는 경우: 캘린더에 반복 이벤트를 찍지 않는다.
      break;
    default:
      throw new Error(`알 수 없는 규칙 종류: ${s.kind} (${rule.id})`);
  }
  return events.sort((a, b) => a.at.localeCompare(b.at));
}

export function buildCalendar(registry, from, to) {
  const events = registry.rules.flatMap((r) => expandRule(r, from, to));
  events.sort((a, b) => a.at.localeCompare(b.at) || a.rule_id.localeCompare(b.rule_id));
  const recurring = registry.rules
    .filter((r) => ["DAILY_ROLLING", "API_WINDOW"].includes(r.schedule.kind))
    .map((r) => ({ rule_id: r.id, provider_id: r.provider_id, label: r.label, kind: r.schedule.kind, summary: r.summary, source: r.source }));
  return { range: { from: toKstIso(from), to: toKstIso(to) }, events, recurring };
}

/** registry 무결성 검사. 오류 문자열 배열을 돌려준다(빈 배열이면 통과). */
export function validateRegistry(registry) {
  const errors = [];
  const providers = new Set();
  for (const p of registry.providers ?? []) {
    if (!p.id) errors.push("provider id 누락");
    if (providers.has(p.id)) errors.push(`provider id 중복: ${p.id}`);
    providers.add(p.id);
    if (!/^https:\/\//.test(p.official_url ?? "")) errors.push(`${p.id}: official_url은 https URL이어야 함`);
  }
  const ruleIds = new Set();
  for (const r of registry.rules ?? []) {
    const where = r.id ?? "(id 없음)";
    if (!r.id) errors.push("rule id 누락");
    if (ruleIds.has(r.id)) errors.push(`rule id 중복: ${r.id}`);
    ruleIds.add(r.id);
    if (!providers.has(r.provider_id)) errors.push(`${where}: 등록되지 않은 provider_id ${r.provider_id}`);
    if (!r.label) errors.push(`${where}: label 누락`);
    if (!r.summary) errors.push(`${where}: summary 누락`);
    if (!RULE_KINDS.includes(r.schedule?.kind)) errors.push(`${where}: schedule.kind가 올바르지 않음`);
    const src = r.source ?? {};
    if (!/^https:\/\//.test(src.url ?? "")) errors.push(`${where}: source.url은 https URL이어야 함`);
    if (!src.title) errors.push(`${where}: source.title 누락`);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(src.checked_at ?? "")) errors.push(`${where}: source.checked_at은 YYYY-MM-DD`);
    if (!TIERS.includes(src.tier)) errors.push(`${where}: source.tier는 A~E`);
    if (src.tier === "E") errors.push(`${where}: E 등급(제보·블로그)은 일정 규칙의 근거로 등록할 수 없음`);
    const s = r.schedule ?? {};
    const dayOk = (d) => Number.isInteger(d) && d >= 1 && d <= 31;
    if (["MONTHLY_OPEN", "MONTHLY_REOPEN"].includes(s.kind) && !dayOk(s.day)) errors.push(`${where}: day는 1~31`);
    if (s.kind === "MONTHLY_LOTTERY" && !(dayOk(s.apply_start_day) && dayOk(s.apply_end_day))) errors.push(`${where}: 추첨 접수일 누락`);
    if (s.kind === "WEEKLY_OPEN" && !(Number.isInteger(s.weekday) && s.weekday >= 0 && s.weekday <= 6)) errors.push(`${where}: weekday는 0(일)~6(토)`);
    for (const k of ["time", "apply_start_time", "apply_end_time", "result_time"]) {
      if (s[k] != null) { try { parseTime(s[k]); } catch { errors.push(`${where}: ${k} 형식은 HH:MM`); } }
    }
  }
  return errors;
}
