// 캠핑장별 예약 안내: 예약 채널 분류 + 운영자 문구에서 오픈 일정 추출 + 다가오는 오픈 시각 + 단계별 예약 매뉴얼.
// 원칙: 추측을 사실처럼 내보내지 않는다. 모든 규칙은 출처 URL·확인일·신뢰 등급(tier)·confidence를 갖고,
// 운영자 문구(tier C)나 확인되지 않은 플랫폼 정보는 needs_verification:true로 표시한다.
// 모든 함수는 순수 함수다(파일·네트워크 접근 없음). 기본 플랫폼 목록은 registry/booking-platforms.json.

import DEFAULT_REGISTRY from "../registry/booking-platforms.json" with { type: "json" };
import DEAD_HOSTS from "../registry/dead-booking-hosts.json" with { type: "json" };
import { addDays, clampDay, kstDate, mondayOf, nowInKst, toKstDay, toKstIso, toYearMonth } from "./kst.mjs";

export { DEFAULT_REGISTRY };

const WEEKDAY = { 일: 0, 월: 1, 화: 2, 수: 3, 목: 4, 금: 5, 토: 6 };
const WEEKDAY_KO = ["일", "월", "화", "수", "목", "금", "토"];
const VERIFIED_TIERS = new Set(["A"]);

// ───────────────────────── URL·플랫폼 분류 ─────────────────────────

const compiled = new WeakMap();
function compile(registry) {
  if (compiled.has(registry)) return compiled.get(registry);
  const list = (registry?.platforms ?? []).filter((p) => p.hosts?.length).map((p) => ({ p, res: p.hosts.map((h) => new RegExp(h, "i")) }));
  compiled.set(registry, list);
  return list;
}

const BAD_HOST = /(^|\.)(example\.(com|org|net)|localhost|test|invalid)$/i;
// 연결이 끊긴 예약 호스트(2026-10-19 전수 조사). ticketplay.zone 등.
const DEAD_SUFFIX = /(^|\.)ticketplay\.zone$/i;
const DEAD_HOST_SET = new Set((DEAD_HOSTS.hosts ?? []).map((h) => h.toLowerCase()));
const deadHost = (hostname) => {
  const h = String(hostname ?? "").toLowerCase();
  if (DEAD_SUFFIX.test(h) || DEAD_HOST_SET.has(h)) return true;
  return (DEAD_HOSTS.suffixes ?? []).some((s) => h === s || h.endsWith(`.${s}`));
};

/** 문자열 → 정규화한 http(s) URL. 형식이 틀리거나 예시 도메인이면 null */
export function normalizeUrl(u) {
  const s = String(u ?? "").trim();
  if (!s || /^(tel|mailto|javascript):/i.test(s)) return null;
  // 등록값에 프로토콜이 겹치거나 깨진 경우(“http://https////host”, “https//host”, “http:/host”)를 바로잡는다(2026-10-20 링크 전수 점검).
  const pm = s.match(/^(?:https?:?\/*)+/i);
  const v = pm ? `${/https/i.test(pm[0]) ? "https" : "http"}://${s.slice(pm[0].length).replace(/^\/+/, "")}` : `http://${s.replace(/^\/+/, "")}`;
  try {
    const url = new URL(v);
    if (!url.hostname.includes(".") || BAD_HOST.test(url.hostname) || deadHost(url.hostname)) return null;
    return url.toString();
  } catch { return null; }
}

const urlKey = (u) => u.replace(/^https?:\/\//i, "").replace(/^www\./i, "").replace(/\/+$/, "").toLowerCase();

/** URL → 플랫폼 id(목록 순서대로 첫 일치). 일치가 없으면 'homepage'. URL이 아니면 null */
export function platformOfUrl(url, registry = DEFAULT_REGISTRY) {
  const n = normalizeUrl(url);
  if (!n) return null;
  const host = new URL(n).hostname.toLowerCase();
  return compile(registry).find(({ res }) => res.some((re) => re.test(host)))?.p.id ?? "homepage";
}

const platformById = (registry, id) => (registry?.platforms ?? []).find((p) => p.id === id) ?? null;
const SELF_IDS = new Set(["homepage", "public-site", "phone", "onsite"]);

// 이 서비스의 예약 전환 원칙. 채널을 새로 만들거나 일반 검색 결과로 보내지 않고,
// 해당 업장에 실제 등록된 URL 중 하나만 고른다. 예약 플랫폼의 상품·가격·재고를
// 읽는 규칙과는 독립적인, 사용자 이동용 우선순위다.
export const BOOKING_CHANNEL_PRIORITY = Object.freeze({
  camfit: 0,
  naver: 10,
  thankqcamping: 20,
});

/** 예약 채널의 화면 노출·CTA 우선순위. 숫자가 작을수록 먼저 선택한다. */
export function bookingChannelPriority(channel) {
  const ch = channel ?? {};
  if (ch.kind === "online") return BOOKING_CHANNEL_PRIORITY[ch.platform_id] ?? 30;
  if (ch.kind === "homepage") return 40;
  if (ch.kind === "phone") return 50;
  if (ch.kind === "onsite") return 60;
  return 70;
}

/** 같은 우선순위에서는 원천에 먼저 등록된 순서를 보존한다. */
export function sortBookingChannels(channels = []) {
  return [...channels]
    .map((channel, index) => ({ channel, index }))
    .sort((a, b) => bookingChannelPriority(a.channel) - bookingChannelPriority(b.channel) || a.index - b.index)
    .map(({ channel }) => channel);
}

/** 실제 URL이 있는 최우선 예약/문의 경로. URL 없는 플랫폼 언급은 선택하지 않는다. */
export function selectBookingChannel(channels = []) {
  return sortBookingChannels(channels).find((channel) => channel?.url) ?? null;
}

/** 네이버 지도·플레이스 링크는 예약 화면이 아닐 수 있다 → confidence를 낮춘다 */
function urlConfidence(platformId, url) {
  if (platformId === "naver") return /booking/i.test(url) ? 0.9 : 0.6;
  if (platformId === "homepage" || platformId === "public-site") return 0.6;
  return 0.9;
}

/**
 * 캠핑장 → 예약 채널 목록(우선순위순).
 * 고캠핑 정규화 레코드(reservation, contact)와 탐색 레코드(booking, homepage, tel) 모두 받는다.
 * @returns {{platform_id:string|null, platform_name:string|null, url:string|null, kind:'online'|'homepage'|'phone'|'onsite', evidence:string[], confidence:number}[]}
 */
export function classifyChannels(campground, registry = DEFAULT_REGISTRY) {
  const c = campground ?? {};
  const resv = c.reservation ?? c.booking ?? {};
  const methods = (Array.isArray(resv.methods) ? resv.methods : String(resv.methods ?? "").split(",")).map((m) => String(m).trim()).filter(Boolean);
  const homepage = c.contact?.homepage ?? c.homepage ?? null;
  const tel = String(c.contact?.tel ?? c.tel ?? "").trim() || null;
  const out = [];
  const seen = new Map();
  const push = (ch, rank) => {
    const key = ch.url ? urlKey(ch.url) : `${ch.kind}:${ch.platform_id ?? ""}`;
    if (seen.has(key)) { const prev = seen.get(key); prev.evidence.push(...ch.evidence); prev.confidence = Math.max(prev.confidence, ch.confidence); return prev; }
    const row = { ...ch, platform_name: platformById(registry, ch.platform_id)?.name ?? null, rank };
    seen.set(key, row); out.push(row); return row;
  };

  const resvUrl = normalizeUrl(resv.url);
  if (resvUrl) {
    const pid = platformOfUrl(resvUrl, registry);
    push({ platform_id: pid, url: resvUrl, kind: "online", evidence: ["reservation.url"], confidence: urlConfidence(pid, resvUrl) }, 0);
  }
  const homeUrl = normalizeUrl(homepage);
  if (homeUrl) {
    const pid = platformOfUrl(homeUrl, registry);
    const isPlatform = !SELF_IDS.has(pid);
    push({ platform_id: pid, url: homeUrl, kind: isPlatform ? "online" : "homepage", evidence: ["contact.homepage"], confidence: isPlatform ? urlConfidence(pid, homeUrl) * 0.9 : 0.6 }, isPlatform ? 1 : 3);
  }

  const online = methods.filter((m) => /온라인|인터넷|실시간/.test(m));
  if (online.length) {
    const onl = out.filter((ch) => ch.kind === "online");
    if (onl.length) onl.forEach((ch) => ch.evidence.push(...online.map((m) => `methods:${m}`)));
    else {
      // 온라인 예약이라고 했지만 예약 URL이 없다 → 홈페이지가 있으면 그쪽이 예약처일 가능성이 높다(확정 아님)
      const home = out.find((ch) => ch.kind === "homepage");
      if (home) home.evidence.push(...online.map((m) => `methods:${m}`));
      else push({ platform_id: null, url: null, kind: "online", evidence: online.map((m) => `methods:${m}`), confidence: 0.3 }, 2);
    }
  }
  if (methods.some((m) => /전화/.test(m))) push({ platform_id: "phone", url: tel ? `tel:${tel.replace(/[^\d+]/g, "")}` : null, kind: "phone", evidence: ["methods:전화", ...(tel ? ["contact.tel"] : [])], confidence: tel ? 0.9 : 0.5 }, 4);
  if (methods.some((m) => /현장/.test(m))) push({ platform_id: "onsite", url: null, kind: "onsite", evidence: ["methods:현장"], confidence: 0.8 }, 6);
  if (tel && !out.some((ch) => ch.kind === "phone")) push({ platform_id: "phone", url: `tel:${tel.replace(/[^\d+]/g, "")}`, kind: "phone", evidence: ["contact.tel(문의)"], confidence: 0.5 }, 5);

  // 원천에 나온 순서는 보존하되, 사용자가 누를 첫 경로는 전환 우선순위로 정렬한다.
  // 예: 고캠핑 예약 URL이 네이버이고 홈페이지가 캠핏이어도 캠핏을 먼저 쓴다.
  return sortBookingChannels(out.sort((a, b) => a.rank - b.rank).map(({ rank, ...ch }) => ch));
}

// ───────────────────────── 문구 정규화·분할 ─────────────────────────

const toHalfWidth = (s) => s.replace(/[０-９]/g, (d) => String.fromCharCode(d.charCodeAt(0) - 0xfee0)).replace(/：/g, ":").replace(/～|〜/g, "~");

/** texts: (string | {text, field?, source?})[] → [{text, field, source}] */
function normalizeTexts(texts) {
  return (texts ?? []).map((t) => (typeof t === "string" ? { text: t } : t)).filter((t) => t && t.text && String(t.text).trim())
    .map((t) => ({ text: toHalfWidth(String(t.text)), field: t.field ?? null, source: t.source ?? null }));
}

/** 문장 단위로 자른다. '화·목'처럼 단어 안의 가운뎃점은 자르지 않는다. */
export function splitSentences(text) {
  return String(text ?? "")
    .replace(/<br\s*\/?>/gi, "\n")
    .split(/\n+|※|•|▶|■|□|○|◆|◇|★|☆|(?<=[.!?。])\s+|(?<=다\.)|(?<=요\.)/)
    .map((s) => s.replace(/\s+/g, " ").trim())
    .filter((s) => s.length >= 4);
}

// ───────────────────────── 시각·기간 파서 ─────────────────────────

const OPEN_KW = /(예약|오픈|open|접수|신청|개시|열립|열림|열려|열어|판매|티켓팅)/i;
const STRONG_OPEN_KW = /(오픈|open|예약\s*(?:을\s*)?(?:개시|시작|가능|받|진행|접수|오픈)|접수\s*(?:시작|개시)|열립|열림|열려|개시|티켓팅|신청\s*(?:가능|받|접수))/i;
const CLOSE_KW = /(휴무|휴장|휴관|휴일|정기\s*점검|점검일|소독|방역|쉽니다|쉬는\s*날|청소|운영\s*(?:하지\s*않|안\s*함|중단))/;
const CANCEL_KW = /(취소|환불|위약|공제|환급|변경\s*시|노쇼)/;
const PROMO_KW = /(증정|무료\s*제공|이벤트|사은품|할인|쿠폰|선물|드립니다)/;

/** "오후 2시", "14:00", "09시 30분", "정오", "오전 10시 반" → "HH:MM". 범위 밖이면 null */
export function parseKoreanTime(str) {
  const s = String(str ?? "");
  if (/정오/.test(s)) return "12:00";
  if (/자정/.test(s)) return "00:00";
  const re = /(오전|오후|낮|밤|저녁|아침|새벽|AM|PM)?\s*(\d{1,2})\s*(?::\s*(\d{2})|시(?!간)\s*(?:(\d{1,2})\s*분|(반))?)/gi;
  for (const m of s.matchAll(re)) {
    const before = s.slice(Math.max(0, m.index - 7), m.index);
    if (/(체크\s*인|체크\s*아웃|입실|퇴실|매너\s*타임|소등)\s*[:\s]*$/i.test(before)) continue;
    let h = Number(m[2]);
    const min = m[3] != null ? Number(m[3]) : m[4] != null ? Number(m[4]) : m[5] ? 30 : 0;
    const ap = (m[1] ?? "").toUpperCase();
    if (/오후|저녁|밤|PM/.test(ap) && h < 12) h += 12;
    if (/새벽|오전|AM|아침/.test(ap) && h === 12) h = 0;
    if (h > 23 || min > 59) continue;
    return `${String(h).padStart(2, "0")}:${String(min).padStart(2, "0")}`;
  }
  return null;
}

/** 대상 기간: "다음달", "익월", "다다음달", "2개월치" 등 */
export function parseTargetPeriod(str) {
  const s = String(str ?? "");
  if (/다다음\s*달|다다음\s*월/.test(s)) return "MONTH_PLUS_2";
  if (/(다음\s*달|익월|차월|다음\s*월|내달)/.test(s)) return "NEXT_MONTH";
  if (/(당월|이번\s*달)/.test(s)) return "THIS_MONTH";
  const m = /(\d{1,2})\s*개월\s*(치|분)/.exec(s);
  if (m) return `MONTHS_${m[1]}`;
  const w = /(\d{1,2})\s*주\s*(치|분)/.exec(s);
  if (w) return `WEEKS_${w[1]}`;
  return null;
}

const KOREAN_SPAN = [[/일주일/, 7], [/보름/, 15], [/(한|1)\s*달/, 30], [/(두|2)\s*달/, 60], [/(세|3)\s*달/, 90]];

const clip = (s, n = 140) => (s.length > n ? `${s.slice(0, n - 1)}…` : s);

// ───────────────────────── 오픈 규칙 추출 ─────────────────────────

/** 일치 위치 주변(같은 문장, 일치 앞 12자~뒤 45자)만 본다 */
const around = (s, idx, len, before = 12, after = 45) => s.slice(Math.max(0, idx - before), Math.min(s.length, idx + len + after));
const after = (s, idx, len, n = 45) => s.slice(idx + len, Math.min(s.length, idx + len + n));

function baseConfidence(rule) {
  let c = rule.type === "LOTTERY" || rule.type === "FIRST_COME" || rule.type === "QUARTERLY" ? 0.5 : 0.65;
  if (rule.time) c += 0.15;
  if (rule.target_period) c += 0.1;
  if (rule.strong) c += 0.05;
  return Math.min(0.95, Math.round(c * 100) / 100);
}

function extractFromSentence(s) {
  const rules = [];
  const timeIn = (txt) => parseKoreanTime(txt);
  const hasLottery = /추첨/.test(s) && !/추첨\s*(?:제\s*)?(?:없음|없이|안\s*함|폐지|아님)/.test(s);

  // 1) 매월 N일 (여러 날·범위·말일)
  for (const m of s.matchAll(/(?:매월|매달|매\s+월)\s*((?:\d{1,2}\s*일?\s*(?:[,、및와과]|부터|~|-)\s*)*\d{1,2}\s*일|말일|마지막\s*날)/g)) {
    const local = around(s, m.index, m[0].length, 0, 45);
    const tail = after(s, m.index, m[0].length);
    if (CLOSE_KW.test(local) || !OPEN_KW.test(tail) || (CANCEL_KW.test(local) && !STRONG_OPEN_KW.test(local))) continue;
    const isLast = /말일|마지막/.test(m[1]);
    const nums = isLast ? ["last"] : [...m[1].matchAll(/(\d{1,2})/g)].map((x) => Number(x[1])).filter((d) => d >= 1 && d <= 31);
    if (!nums.length) continue;
    const isRange = !isLast && nums.length >= 2 && /~|-|부터/.test(m[1]);
    const time = timeIn(tail) ?? timeIn(local);
    const target = parseTargetPeriod(s);
    const priority = /(우선|주민|군민|도민|시민|구민)/.test(local);
    const strong = STRONG_OPEN_KW.test(local);
    if (hasLottery && /추첨/.test(around(s, m.index, m[0].length, 15, 45))) {
      rules.push({ type: "LOTTERY", day_of_month: nums[0], ...(isRange ? { apply_end_day: nums[nums.length - 1] } : {}), time, target_period: target, strong });
      continue;
    }
    const days = isRange ? [nums[0]] : nums;
    for (const d of days) rules.push({ type: "MONTHLY", day_of_month: d, ...(isRange ? { window_end_day: nums[nums.length - 1] } : {}), time, target_period: target, ...(priority ? { mode: "LOCAL_PRIORITY" } : {}), strong });
  }

  // 2) 매주 X요일 (여러 요일), 또는 "N주 전 X요일"
  for (const m of s.matchAll(/매주\s*([월화수목금토일](?:요일)?(?:\s*[,·、및와과/]\s*[월화수목금토일](?:요일)?)*)/g)) {
    const local = around(s, m.index, m[0].length, 0, 45);
    const tail = after(s, m.index, m[0].length);
    if (CLOSE_KW.test(local) || !OPEN_KW.test(tail) || CANCEL_KW.test(local)) continue;
    const days = [...m[1].replace(/요일/g, "").matchAll(/[월화수목금토일]/g)].map((x) => WEEKDAY[x[0]]);
    const lead = /(\d{1,2})\s*주\s*(?:전|후|뒤)/.exec(s);
    const time = timeIn(tail) ?? timeIn(local);
    for (const w of [...new Set(days)]) rules.push({ type: "WEEKLY", weekday: w, time, ...(lead ? { lead_weeks: Number(lead[1]) } : {}), target_period: parseTargetPeriod(s), strong: STRONG_OPEN_KW.test(local) });
  }
  if (!rules.some((r) => r.type === "WEEKLY")) {
    const m = /(\d{1,2})\s*주\s*전\s*(?:의\s*)?([월화수목금토일])요일/.exec(s);
    if (m && OPEN_KW.test(s) && !CANCEL_KW.test(s) && !CLOSE_KW.test(s)) {
      rules.push({ type: "WEEKLY", weekday: WEEKDAY[m[2]], lead_weeks: Number(m[1]), time: timeIn(s.slice(m.index)), target_period: null, strong: STRONG_OPEN_KW.test(s) });
    }
  }

  // 3) 롤링: "이용일 30일 전부터", "2주 전부터 예약 가능", "2개월 전 오픈", "이용일로부터 60일 이내 예약 가능", "한 달 전부터"
  if (!rules.some((r) => r.type === "WEEKLY" && r.lead_weeks)) {
    const rolling = [];
    for (const m of s.matchAll(/(\d{1,3})\s*(일|주|개월|달)\s*전\s*(부터|에|까지)?/g)) rolling.push({ m, n: Number(m[1]), unit: m[2], suffix: m[3] ?? "" });
    for (const [re, days] of KOREAN_SPAN) {
      const m = new RegExp(`${re.source}\\s*전\\s*(부터|에|까지)?`).exec(s);
      if (m && !rolling.some((r) => r.m.index === m.index)) rolling.push({ m, n: days, unit: "일", suffix: m[m.length - 1] ?? "" });
    }
    for (const m of s.matchAll(/(?:이용일|입실일|사용일|숙박일|오늘)\s*(?:기준|로부터|부터)?\s*(\d{1,3})\s*일\s*(?:이내|까지|후까지)/g)) rolling.push({ m, n: Number(m[1]), unit: "일", suffix: "부터", within: true });
    for (const r of rolling) {
      const local = around(s, r.m.index, r.m[0].length, 15, 30);
      if (r.suffix === "까지" && !r.within) continue; // "이용 2일 전까지 예약" = 마감, 오픈 아님
      if (CANCEL_KW.test(local) || CLOSE_KW.test(local)) continue;
      if (!OPEN_KW.test(after(s, r.m.index, r.m[0].length, 25)) && !(r.within && OPEN_KW.test(local))) continue;
      const rule = { type: "ROLLING", time: timeIn(after(s, r.m.index, r.m[0].length)) ?? timeIn(local), target_period: null, strong: STRONG_OPEN_KW.test(local) };
      if (r.unit === "일") rule.days_before = r.n;
      else if (r.unit === "주") rule.days_before = r.n * 7;
      else rule.months_before = r.n;
      if (r.within) rule.window = "WITHIN";
      rules.push(rule);
      break;
    }
  }

  // 4) 분기별(일자 없으면 일정 계산 안 함)
  if (/(분기\s*별|매\s*분기|분기마다)/.test(s) && OPEN_KW.test(s) && !CANCEL_KW.test(s) && !CLOSE_KW.test(s) && !rules.length) {
    rules.push({ type: "QUARTERLY", time: timeIn(s), target_period: null, strong: STRONG_OPEN_KW.test(s) });
  }

  // 5) 추첨·선착순(일정 없이 방식만 밝힌 경우)
  if (hasLottery && !rules.some((r) => r.type === "LOTTERY") && /(추첨\s*(?:제|방식|으로|을\s*통해|신청|접수|예약))|(?:예약|접수|신청).{0,12}추첨/.test(s) && !PROMO_KW.test(s)) {
    rules.push({ type: "LOTTERY", time: null, target_period: parseTargetPeriod(s), strong: false });
  }
  if (/선착순/.test(s) && !PROMO_KW.test(s) && /(선착순\s*(?:예약|접수|마감|으로|제|방식|진행|오픈))|(?:예약|접수).{0,12}선착순/.test(s)) {
    if (!rules.length || rules.every((r) => r.type === "LOTTERY")) rules.push({ type: "FIRST_COME", time: null, target_period: null, strong: false });
    else rules.filter((r) => r.type !== "LOTTERY").forEach((r) => { r.mode ??= "FIRST_COME"; });
  }
  return rules;
}

const ruleKey = (r) => [r.type, r.day_of_month, r.weekday, r.time, r.days_before, r.months_before, r.lead_weeks].join("|");

/**
 * 운영자·관광공사 문구에서 예약 오픈 일정을 뽑는다. 명시적인 표현만 인정한다(보수적).
 * @param {(string|{text:string, field?:string, source?:{url?:string, checked_at?:string, tier?:string, label?:string}})[]} texts
 * @returns {{type:'MONTHLY'|'WEEKLY'|'ROLLING'|'LOTTERY'|'FIRST_COME'|'QUARTERLY', day_of_month?:number|'last', weekday?:number, time?:string|null, days_before?:number, months_before?:number, lead_weeks?:number, target_period?:string|null, mode?:string, snippet:string, field:string|null, source:object|null, confidence:number}[]}
 */
export function extractOpenRules(texts) {
  const out = [];
  const seen = new Set();
  for (const t of normalizeTexts(texts)) {
    for (const s of splitSentences(t.text)) {
      for (const r of extractFromSentence(s)) {
        const key = ruleKey(r);
        if (seen.has(key)) continue;
        seen.add(key);
        const { strong, ...rest } = r;
        const rule = Object.fromEntries(Object.entries(rest).filter(([, v]) => v !== undefined));
        if (rule.time === undefined) rule.time = null;
        out.push({ ...rule, snippet: clip(s), field: t.field, source: t.source, confidence: baseConfidence(r) });
      }
    }
  }
  return out;
}

/** 텍스트 속 예약처 언급(“네이버 예약 오픈”, “숲나들e에서 예약”) → 플랫폼 id */
const MENTIONS = [
  [/네이버\s*(?:예약|booking|플레이스\s*예약)/i, "naver"],
  [/숲나들\s*(?:e|이)/i, "foresttrip"],
  [/국립공원\s*(?:공단\s*)?예약\s*시스템/, "knps"],
  [/서울시?\s*공공\s*서비스\s*예약/, "seoul-yeyak"],
  [/땡큐\s*캠핑/, "thankqcamping"],
  [/캠핏/, "camfit"],
  [/캠핑톡/, "campingtalk"],
  [/인터파크/, "interpark"],
  [/야놀자/, "yanolja"],
  [/여기\s*어때/, "yeogi"],
  [/(?:네이버\s*)?카페(?:를\s*통해|에서|\s*가입|\s*공지).{0,10}예약|예약.{0,10}(?:네이버\s*)?카페(?:에서|를|\s*공지)/, "naver-cafe"],
  [/카카오\s*톡?\s*채널|카톡\s*채널|플러스\s*친구/, "kakao-channel"],
];

export function extractPlatformMentions(texts, registry = DEFAULT_REGISTRY) {
  const out = [];
  const seen = new Set();
  for (const t of normalizeTexts(texts)) {
    for (const s of splitSentences(t.text)) {
      for (const [re, id] of MENTIONS) {
        if (!re.test(s) || seen.has(id)) continue;
        if (id !== "naver-cafe" && !/(예약|오픈|접수|신청|결제)/.test(s)) continue;
        seen.add(id); out.push({ platform_id: id, snippet: clip(s), field: t.field, source: t.source });
      }
      for (const m of s.matchAll(/https?:\/\/[^\s)"'<>]+|(?:www\.)[^\s)"'<>]+/gi)) {
        const pid = platformOfUrl(m[0], registry);
        if (pid && !SELF_IDS.has(pid) && !seen.has(pid)) { seen.add(pid); out.push({ platform_id: pid, url: normalizeUrl(m[0]), snippet: clip(s), field: t.field, source: t.source }); }
      }
    }
  }
  return out;
}

// ───────────────────────── 다가오는 오픈 시각 ─────────────────────────

const lastDay = (y, m) => new Date(Date.UTC(y, m, 0)).getUTCDate();
const parseHm = (t) => (t ? t.split(":").map(Number) : [0, 0]);

function stayForMonthly(rule, y, m) {
  const tp = rule.target_period;
  if (tp === "NEXT_MONTH") return { month: toYearMonth(kstDate(y, m + 1, 1)) };
  if (tp === "MONTH_PLUS_2") return { month: toYearMonth(kstDate(y, m + 2, 1)) };
  if (tp === "THIS_MONTH") return { month: toYearMonth(kstDate(y, m, 1)) };
  if (tp === "NEXT_TWO_MONTHS") return { from_month: toYearMonth(kstDate(y, m + 1, 1)), to_month: toYearMonth(kstDate(y, m + 2, 1)) };
  const span = /^MONTHS_(\d+)$/.exec(tp ?? "");
  if (span) return { from_month: toYearMonth(kstDate(y, m + 1, 1)), to_month: toYearMonth(kstDate(y, m + Number(span[1]), 1)), assumed_start: "NEXT_MONTH" };
  return null;
}

/**
 * 규칙 → 다가오는 오픈 시각(KST). MONTHLY·WEEKLY·ROLLING과 일자가 있는 LOTTERY만 계산한다.
 * 시각을 모르면 time_known:false이고 그날 00:00으로 둔다(그날 전체를 후보로 본다).
 * @returns {{at:string, date:string, time_known:boolean, stay?:object, apply_end?:string}[]}
 */
export function nextOpenings(rule, now = new Date(), count = 3) {
  if (!rule || count <= 0) return [];
  const wallNow = nowInKst(now.getTime());
  const today = kstDate(wallNow.getUTCFullYear(), wallNow.getUTCMonth() + 1, wallNow.getUTCDate());
  const [h, mi] = parseHm(rule.time);
  const timeKnown = !!rule.time;
  const upcoming = (d) => (timeKnown ? d > wallNow : d >= today);
  const ev = (d, extra = {}) => ({ at: toKstIso(d), date: toKstDay(d), time_known: timeKnown, ...extra });
  const out = [];

  if ((rule.type === "MONTHLY" || rule.type === "LOTTERY") && rule.day_of_month != null) {
    const interval = Math.max(1, rule.interval_months ?? 1);
    let y = wallNow.getUTCFullYear(), m = wallNow.getUTCMonth() + 1;
    for (let i = 0; i < 48 && out.length < count; i++, m++) {
      if (m > 12) { m = 1; y++; }
      if (rule.month_parity === "EVEN" && m % 2 !== 0) continue;
      if (rule.month_parity === "ODD" && m % 2 !== 1) continue;
      if (!rule.month_parity && interval > 1 && rule.anchor_month && (m - rule.anchor_month + 120) % interval !== 0) continue;
      const day = rule.day_of_month === "last" ? lastDay(y, m) : clampDay(y, m, rule.day_of_month);
      const d = kstDate(y, m, day, h, mi);
      if (!upcoming(d)) continue;
      const extra = {};
      const stay = stayForMonthly(rule, y, m);
      if (stay) extra.stay = stay;
      if (rule.day_of_month !== "last" && day !== rule.day_of_month) extra.clamped_from_day = rule.day_of_month;
      if (rule.apply_end_day) extra.apply_end = toKstDay(kstDate(y, m, clampDay(y, m, rule.apply_end_day)));
      out.push(ev(d, extra));
    }
    return out;
  }
  if (rule.type === "WEEKLY" && rule.weekday != null) {
    let d = kstDate(wallNow.getUTCFullYear(), wallNow.getUTCMonth() + 1, wallNow.getUTCDate(), h, mi);
    while (d.getUTCDay() !== rule.weekday || !upcoming(d)) d = addDays(d, 1);
    for (; out.length < count; d = addDays(d, 7)) {
      const extra = {};
      if (rule.lead_weeks != null) {
        const ws = addDays(mondayOf(d), rule.lead_weeks * 7);
        extra.stay = { from: toKstDay(ws), to: toKstDay(addDays(ws, 6)) };
      }
      out.push(ev(d, extra));
    }
    return out;
  }
  if (rule.type === "ROLLING" && (rule.days_before != null || rule.months_before != null)) {
    let d = kstDate(wallNow.getUTCFullYear(), wallNow.getUTCMonth() + 1, wallNow.getUTCDate(), h, mi);
    if (!upcoming(d)) d = addDays(d, 1);
    for (; out.length < count; d = addDays(d, 1)) {
      const stayDate = rule.days_before != null ? addDays(d, rule.days_before)
        : kstDate(d.getUTCFullYear(), d.getUTCMonth() + 1 + rule.months_before, clampDay(d.getUTCFullYear(), d.getUTCMonth() + 1 + rule.months_before, d.getUTCDate()));
      out.push(ev(d, { stay: { date: toKstDay(stayDate) } }));
    }
    return out;
  }
  return [];
}

// ───────────────────────── 안내 조립 ─────────────────────────

function describeRule(r) {
  const t = r.time ? ` ${r.time}` : "";
  const target = { NEXT_MONTH: " 다음 달분", MONTH_PLUS_2: " 다다음 달분", THIS_MONTH: " 이번 달분", NEXT_TWO_MONTHS: " 다음 두 달분" }[r.target_period] ?? (r.target_period?.startsWith("MONTHS_") ? ` ${r.target_period.slice(7)}개월치` : "");
  switch (r.type) {
    case "MONTHLY": return `매월 ${r.day_of_month === "last" ? "말일" : `${r.day_of_month}일`}${r.window_end_day ? `~${r.window_end_day}일` : ""}${t}${target} 오픈${r.mode === "LOCAL_PRIORITY" ? "(지역주민 우선)" : ""}`;
    case "WEEKLY": return `매주 ${WEEKDAY_KO[r.weekday]}요일${t}${r.lead_weeks != null ? ` ${r.lead_weeks}주 뒤 주` : ""} 오픈`;
    case "ROLLING": return r.days_before != null ? `이용일 ${r.days_before}일 전${r.window === "WITHIN" ? " 이내" : "부터"} 예약${t}` : `이용일 ${r.months_before}개월 전부터 예약${t}`;
    case "LOTTERY": return r.day_of_month != null ? `추첨: 매월 ${r.day_of_month}일${r.apply_end_day ? `~${r.apply_end_day}일` : ""}${t} 신청${target}` : "추첨제";
    case "FIRST_COME": return "선착순";
    case "QUARTERLY": return "분기별 오픈(일자 미상)";
    default: return r.type;
  }
}

const SCHEDULED = new Set(["MONTHLY", "WEEKLY", "ROLLING", "LOTTERY"]);

/** 숲나들e 휴양림이 국립인지 공립·사립인지(이름·운영 주체 단서). 모르면 UNKNOWN */
export function forestScope(c) {
  const name = String(c?.name ?? "");
  if (/국립/.test(name)) return "NATIONAL_FOREST";
  if (/(공립|도립|시립|군립|구립)/.test(name) || c?.operator_type === "LOCAL_GOVERNMENT" || c?.op === "LOCAL_GOVERNMENT") return "PUBLIC_OR_PRIVATE_FOREST";
  return "UNKNOWN";
}

function campgroundTexts(c, opts) {
  const src = { url: c.gocamping_url ?? c.gc_url ?? null, checked_at: c.source?.fetched_at ?? opts.checked_at ?? null, tier: "C", label: "고캠핑 운영자 등록 문구" };
  const intro = c.intro ?? {};
  return [
    { text: intro.line ?? c.line, field: "gocamping.intro.line", source: src },
    { text: intro.text, field: "gocamping.intro.text", source: src },
    { text: intro.feature, field: "gocamping.intro.feature", source: src },
  ];
}

const pickPlatform = (p) => p && ({
  id: p.id, name: p.name, kind: p.kind, official_url: p.official_url ?? null, help_urls: p.help_urls ?? [],
  account: p.account ?? null, opening_summary: p.opening?.summary ?? null, payment_deadline: p.payment_deadline ?? null,
  cancel_policy_location: p.cancel_policy_location ?? null, waitlist: p.waitlist ?? null, tips: p.tips ?? [],
  facts: p.facts ?? [], needs_verification: !!p.needs_verification,
});

/**
 * 캠핑장 1곳의 예약 안내.
 * @param {object} campground 고캠핑 정규화 레코드(또는 탐색 레코드)
 * @param {object} [platformsRegistry] registry/booking-platforms.json
 * @param {(string|{text, field?, source?})[]} [extraTexts] 예: TourAPI reservation_text {text, field:'tourapi.reservation', source:{url, checked_at, tier:'C'}}
 * @param {{now?:Date, checked_at?:string, max_openings?:number}} [opts]
 */
export function buildBookingGuide(campground, platformsRegistry = DEFAULT_REGISTRY, extraTexts = [], opts = {}) {
  const c = campground ?? {};
  const reg = platformsRegistry ?? DEFAULT_REGISTRY;
  const now = opts.now ?? new Date();
  const warnings = [];
  const warn = (code, message) => { if (!warnings.some((w) => w.code === code)) warnings.push({ code, message }); };

  const texts = [...campgroundTexts(c, opts), ...normalizeTexts(extraTexts).map((t) => ({ ...t, source: t.source ?? { url: null, checked_at: opts.checked_at ?? null, tier: "C" } }))];

  // 채널
  const channels = classifyChannels(c, reg);
  const declaredOnline = channels.find((ch) => ch.kind === "online" && ch.url);
  for (const men of extractPlatformMentions(texts, reg)) {
    const hit = channels.find((ch) => ch.platform_id === men.platform_id);
    if (hit) { hit.evidence.push(`text:${men.field ?? "extra"}`); continue; }
    if (declaredOnline && !SELF_IDS.has(declaredOnline.platform_id)) warn("TEXT_PLATFORM_MISMATCH", `소개 문구는 ${platformById(reg, men.platform_id)?.name ?? men.platform_id}를 언급하지만 등록된 예약 URL은 ${declaredOnline.platform_name ?? declaredOnline.platform_id}입니다. 캠핑장에 확인하세요.`);
    channels.push({ platform_id: men.platform_id, platform_name: platformById(reg, men.platform_id)?.name ?? null, url: men.url ?? null, kind: "online", evidence: [`text:${men.field ?? "extra"}`], confidence: 0.4, snippet: men.snippet });
  }

  const primary = selectBookingChannel(channels)
    ?? sortBookingChannels(channels).find((ch) => ch.kind === "online" && ch.platform_id)
    ?? sortBookingChannels(channels)[0] ?? null;
  const platformId = primary ? (primary.platform_id ?? (primary.kind === "homepage" ? "homepage" : null)) : null;
  const platform = platformById(reg, platformId);

  if (!channels.length) warn("NO_CHANNEL", "등록된 예약 채널이 없습니다. 캠핑장에 직접 문의하세요.");
  if (channels.some((ch) => ch.kind === "online" && !ch.url && ch.evidence.some((e) => e.startsWith("methods:")))) warn("ONLINE_WITHOUT_URL", "온라인 예약으로 등록돼 있지만 예약 주소가 없습니다.");
  if (channels.some((ch) => ch.evidence.some((e) => /예약대기/.test(e)))) warn("ONLINE_PENDING_METHOD", "예약 방식이 '온라인예약대기'로 등록돼 있습니다. 실제 예약 가능 여부를 확인하세요.");
  if (channels.length && channels.every((ch) => ch.kind === "phone" || ch.kind === "onsite")) warn("PHONE_ONLY", "전화·현장 예약만 등록돼 있습니다.");
  if (platform?.needs_verification) warn("PLATFORM_UNVERIFIED", `${platform.name} 이용 절차 일부는 공식 원문으로 확인되지 않았습니다.`);

  // 단계별 매뉴얼
  const steps = [];
  if (platform) {
    if (primary?.url && primary.kind !== "phone") steps.push({ n: 1, text: `예약 페이지를 연다: ${primary.url}`, verified: true });
    for (const text of platform.steps ?? []) steps.push({ n: steps.length + 1, text, verified: !platform.needs_verification });
    if (primary?.kind === "phone" && primary.url) steps[0] = { ...steps[0], text: `${steps[0].text} (${primary.url.replace(/^tel:/, "")})` };
  }

  // 오픈 규칙: 운영자 문구(tier C) + 플랫폼 템플릿(tier A/B)
  const open_rules = extractOpenRules(texts).map((r, i) => {
    const source = { url: r.source?.url ?? null, checked_at: r.source?.checked_at ?? null, tier: r.source?.tier ?? "C", label: r.source?.label ?? null, field: r.field };
    if (!source.url || !source.checked_at) warn("SOURCE_MISSING", "일부 운영자 문구에 원문 주소나 확인일이 없습니다.");
    const { source: _s, field: _f, ...rule } = r;
    return { id: `op-${i + 1}`, origin: "operator_text", label: describeRule(rule), ...rule, source, needs_verification: true };
  });
  if (open_rules.length) warn("OPERATOR_TEXT_UNVERIFIED", "오픈 일정은 운영자 소개 문구에서 읽은 것입니다(확인 필요). 예약 전에 캠핑장 공지를 확인하세요.");
  const scheduledOp = open_rules.filter((r) => SCHEDULED.has(r.type) && (r.day_of_month != null || r.weekday != null || r.days_before != null || r.months_before != null));
  if (new Set(scheduledOp.map((r) => r.type)).size > 1 || new Set(scheduledOp.filter((r) => r.type === "MONTHLY").map((r) => r.day_of_month)).size > 2) warn("RULE_CONFLICT", "소개 문구에 서로 다른 오픈 일정이 함께 있습니다. 시설·시즌별로 다를 수 있으니 확인하세요.");

  let scope = null;
  if (platformId === "foresttrip") {
    scope = forestScope(c);
    if (scope === "UNKNOWN") warn("FOREST_SCOPE_UNKNOWN", "국립·공립·사립 휴양림 구분을 확인하지 못했습니다. 국립 48곳 공통 일정은 국립일 때만 맞습니다.");
    if (scope === "PUBLIC_OR_PRIVATE_FOREST") warn("FOREST_LOCAL_RULES", "공립·사립 휴양림은 휴양림별로 오픈 일정·지역주민 우선·위약금이 다릅니다. 휴양림 공지를 확인하세요.");
  }
  for (const tpl of reg.rule_templates ?? []) {
    if (tpl.platform_id !== platformId) continue;
    let applies = "CONFIRMED";
    if (tpl.scope === "NATIONAL_FOREST") applies = scope === "NATIONAL_FOREST" ? "CONFIRMED" : scope === "UNKNOWN" ? "IF_NATIONAL" : null;
    else if (tpl.scope === "PUBLIC_OR_PRIVATE_FOREST") applies = scope === "NATIONAL_FOREST" ? null : "VARIANT";
    if (!applies) continue;
    const needs = !!tpl.needs_verification || !VERIFIED_TIERS.has(tpl.source?.tier) || applies !== "CONFIRMED";
    open_rules.push({ id: tpl.id, origin: "platform_template", applies, label: tpl.label, applies_to: tpl.applies_to, ...tpl.rule, source: tpl.source, confidence: tpl.confidence, needs_verification: needs, ...(tpl.note ? { note: tpl.note } : {}) });
  }

  // 다가오는 오픈: confidence 0.6 이상이고 일정 계산이 가능한 규칙만. 변형 템플릿(VARIANT)은 계산하지 않는다.
  const next_openings = [];
  for (const r of open_rules) {
    if (!SCHEDULED.has(r.type) || r.applies === "VARIANT" || (r.confidence ?? 0) < 0.6) continue;
    for (const e of nextOpenings(r, now, 3)) next_openings.push({ ...e, rule_id: r.id, label: r.label, origin: r.origin, ...(r.applies ? { applies: r.applies } : {}), needs_verification: r.needs_verification, source: r.source });
  }
  next_openings.sort((a, b) => a.at.localeCompare(b.at));

  return {
    version: 1,
    generated_at: toKstIso(nowInKst(now.getTime())),
    channels,
    primary_channel: primary,
    platform: pickPlatform(platform),
    steps,
    open_rules,
    next_openings: next_openings.slice(0, opts.max_openings ?? 6),
    warnings,
  };
}
