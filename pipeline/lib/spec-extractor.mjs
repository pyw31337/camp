// 캠핑장 “스펙 시트” 추출기. 운영자 공지·공식 소개글·후기 요약의 단순 문장에서
// 입·퇴실, 얼리/레이트, 매너타임, 연박 규칙, 추가 요금, 반려동물, 대여, 행사를 같은 사전으로 꺼낸다.
// 원칙(docs/CAMPGROUND_SPEC_INTEGRATION.md):
// - 값마다 원문 문장(quote)·출처·날짜·근거 등급을 함께 둔다. 원문 없는 값은 만들지 않는다.
// - 등급: OPERATOR(운영자 확인/제출) > OFFICIAL_TEXT(고캠핑 등 공식 소개 문장) > MENTION(후기 언급).
//   후기 언급은 “단서”다. 스펙 값 칸에 확정값으로 올리지 않고, 몇 건이 무엇이라 말했는지만 보인다.
// - 여러 업장을 묶은 글(“가볼 만한 곳 5곳” 등)은 다른 업장의 값이 섞이므로 후기 언급에서 뺀다.

export const SPEC_FIELDS = {
  CHECKIN_TIME: { group: "time", label: "입실" },
  CHECKOUT_TIME: { group: "time", label: "퇴실" },
  EARLY_CHECKIN: { group: "time", label: "얼리 체크인" },
  LATE_CHECKOUT: { group: "time", label: "레이트 체크아웃" },
  MANNER_TIME: { group: "rule", label: "매너타임" },
  MIN_STAY: { group: "booking", label: "연박·최소 숙박" },
  EXTRA_PERSON_FEE: { group: "fee", label: "인원 추가" },
  EXTRA_CAR_FEE: { group: "fee", label: "차량 추가" },
  VISITOR_POLICY: { group: "fee", label: "방문객" },
  PET_POLICY: { group: "rule", label: "반려동물" },
  PARKING: { group: "rule", label: "주차" },
  POWER_W: { group: "rule", label: "전기 용량" },
  REFUND_POLICY: { group: "booking", label: "환불" },
  RENTAL: { group: "rental", label: "대여" },
  DISCOUNT: { group: "promo", label: "할인 대상" },
  PROMOTION: { group: "promo", label: "기간 행사" },
};
export const SPEC_GROUPS = [
  ["time", "이용 시간"], ["booking", "예약 규칙"], ["fee", "추가 요금"], ["rule", "현장 규칙"], ["rental", "대여"], ["promo", "행사·할인"],
];
export const GRADE_RANK = { OPERATOR: 3, OFFICIAL_TEXT: 2, MENTION: 1 };

// 반쪽 이모지(짝 잃은 서러게이트)를 지우고, 자를 때는 코드 포인트 단위로 자른다.
const LONE_SURROGATE = /[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/g;
export const clip = (s, n) => { const a = Array.from(String(s)); return a.length > n ? `${a.slice(0, n - 1).join("")}…` : a.join(""); };
const won = (s) => Number(String(s).replace(/[,\s]/g, ""));
const fmtWon = (n) => `${n.toLocaleString("ko-KR")}원`;
const p2 = (n) => String(n).padStart(2, "0");

/** 문장 단위로 자른다(마침표·줄바꿈·글머리표·이모지 구분자). 너무 긴 문장은 120자로 자른다. */
export function sentences(text) {
  return String(text ?? "")
    .replace(/<[^>]+>/g, " ")
    .split(/(?<=[.!?。])\s+|\n+|\s[·•▶※✔️✅📍🔸🔹■□◆◇]\s*|\s\/\s/)
    .map((s) => s.replace(LONE_SURROGATE, "").replace(/[\u200b\ufeff]/g, "").replace(/\s+/g, " ").trim())
    .filter((s) => s.length >= 4)
    .map((s) => clip(s, 140));
}

// "오후 2시", "14:00", "14시 30분", "2시" → 분. ampm 힌트가 없으면 입실은 12~20시, 퇴실은 8~15시로 해석.
function parseClock(ampm, h, m, kind) {
  let hour = Number(h), min = m ? Number(m) : 0;
  if (!Number.isFinite(hour) || hour > 24 || min > 59) return null;
  const a = String(ampm ?? "").trim().toLowerCase();
  if (["오후", "저녁", "밤", "pm"].includes(a) && hour < 12) hour += 12;
  if (["오전", "아침", "새벽", "am"].includes(a) && hour === 12) hour = 0;
  if (!a && kind === "in" && hour >= 1 && hour <= 8) hour += 12; // "입실 2시" = 14시
  if (!a && kind === "manner" && hour >= 8 && hour <= 12) hour += 12; // "매너타임 10시" = 22시
  const ok = kind === "in" ? hour >= 10 && hour <= 21 : kind === "out" ? hour >= 7 && hour <= 16 : hour >= 0 && hour <= 24;
  return ok ? hour * 60 + min : null;
}
const hhmm = (mins) => `${p2(Math.floor(mins / 60))}:${p2(mins % 60)}`;
const TIME_PREFIX = String.raw`(?:오전|오후|아침|새벽|저녁|밤|낮|am|pm|AM|PM)`;
const CLOCK = String.raw`(${TIME_PREFIX})?\s*(\d{1,2})\s*(?:[:：시]\s*(\d{2})?\s*분?)`;

function feeOrRule(s) {
  if (/무료|무상|추가\s*요금\s*없/.test(s)) return { text: "무료", fee: 0 };
  const per = s.match(/(?:1|한)?\s*시간\s*(?:당|에)?\s*(\d[\d,]{2,})\s*원/);
  if (per) return { text: `시간당 ${fmtWon(won(per[1]))}`, fee: won(per[1]), unit: "hour" };
  const m = s.match(/(\d[\d,]{2,})\s*원/) ?? s.match(/(\d+(?:\.\d)?)\s*만\s*원/);
  if (m) { const n = /만\s*원/.test(m[0]) ? Math.round(Number(m[1]) * 10000) : won(m[1]); if (n >= 1000 && n <= 500000) return { text: fmtWon(n), fee: n }; }
  if (/불가|안\s*됩|안됩|없습니다|받지\s*않|운영하지\s*않|금지/.test(s)) return { text: "불가", fee: null, allowed: false };
  if (/가능|운영|제공/.test(s)) return { text: "가능(요금 미기재)", fee: null, allowed: true };
  return null;
}

// 날짜 범위 “10.1~10.31”, “10월 1일 ~ 11월 30일”, “~11/30까지”
function parsePeriod(s, year) {
  const r = s.match(/(\d{1,2})\s*[./월]\s*(\d{1,2})\s*일?\s*(?:\([^)]*\))?\s*[~\-–]\s*(?:(\d{1,2})\s*[./월]\s*)?(\d{1,2})\s*일?/);
  if (r) {
    const m1 = Number(r[1]), d1 = Number(r[2]), m2 = r[3] ? Number(r[3]) : m1, d2 = Number(r[4]);
    if (m1 >= 1 && m1 <= 12 && m2 >= 1 && m2 <= 12 && d1 <= 31 && d2 <= 31) {
      const y2 = m2 < m1 ? year + 1 : year;
      return { from: `${year}-${p2(m1)}-${p2(d1)}`, to: `${y2}-${p2(m2)}-${p2(d2)}` };
    }
  }
  const u = s.match(/(\d{1,2})\s*[./월]\s*(\d{1,2})\s*일?\s*까지/);
  if (u) return { from: null, to: `${year}-${p2(Number(u[1]))}-${p2(Number(u[2]))}` };
  return null;
}

/**
 * 문장 하나에서 스펙 후보를 모두 꺼낸다. 반환: [{ code, value, norm }]
 * value는 화면용 짧은 문자열, norm은 비교·충돌 판정용 정규값.
 */
export function extractFromSentence(s, { year = new Date().getFullYear() } = {}) {
  const out = [];

  // 입·퇴실 복합 표현 (예: "입·퇴실: 14:00 / 11:00", "입실/퇴실시간 : 15:00/11:00", "체크인/체크아웃 15:00/11:00")
  const comboM = s.match(new RegExp(String.raw`(?:입(?:실)?|체크\s*인)\s*[/·~-]\s*(?:퇴실|체크\s*아웃)\s*(?:시간)?\s*(?:은|는|:|：|-)?\s*${CLOCK}\s*[/~–-]\s*(?:익일\s*)?${CLOCK}`, "i"));
  if (comboM) {
    const vIn = parseClock(comboM[1], comboM[2], comboM[3], "in");
    const vOut = parseClock(comboM[4], comboM[5], comboM[6], "out");
    if (vIn != null) out.push({ code: "CHECKIN_TIME", value: `${hhmm(vIn)}부터`, norm: hhmm(vIn) });
    if (vOut != null) out.push({ code: "CHECKOUT_TIME", value: `${hhmm(vOut)}까지`, norm: hhmm(vOut) });
  }

  // 입실 / 체크인: 역순("15:00 입실") 우선, 다음 정순("입실 14:00")
  if (!out.some((x) => x.code === "CHECKIN_TIME") && !/얼리|조기|동반\s*입실/.test(s)) {
    const rev = s.match(new RegExp(String.raw`${CLOCK}\s*(?:부터)?\s*(?:입실|체크인|check\s*-?in)(?![가-힣])`, "i"));
    const fwd = s.match(new RegExp(String.raw`(?:입실|체크인|check\s*-?in)(?:\s*\([^)]*\))?\s*(?:시간)?\s*(?:은|는|:|：|-)?\s*${CLOCK}`, "i"));
    const m = rev || fwd;
    if (m) {
      const v = parseClock(m[1], m[2], m[3], "in");
      if (v != null) out.push({ code: "CHECKIN_TIME", value: `${hhmm(v)}부터`, norm: hhmm(v) });
    }
  }

  // 퇴실 / 체크아웃: 정순("퇴실 12:00") 우선, 다음 역순("11:00 퇴실")
  if (!out.some((x) => x.code === "CHECKOUT_TIME") && !/레이트|연장|늦은/.test(s)) {
    const fwd = s.match(new RegExp(String.raw`(?:퇴실|체크아웃|check\s*-?out)(?:\s*\([^)]*\))?\s*(?:시간)?\s*(?:은|는|:|：|-)?\s*(?:익일\s*)?${CLOCK}`, "i"));
    const rev = s.match(new RegExp(String.raw`${CLOCK}\s*(?:까지)?\s*(?:퇴실|체크아웃|check\s*-?out)(?![가-힣])`, "i"));
    const m = fwd || rev;
    if (m) {
      const v = parseClock(m[1], m[2], m[3], "out");
      if (v != null) out.push({ code: "CHECKOUT_TIME", value: `${hhmm(v)}까지`, norm: hhmm(v) });
    }
  }

  if (/얼리\s*체크인|얼리\s*입실|조기\s*입실|빠른\s*입실/.test(s)) { const f = feeOrRule(s.slice(s.search(/얼리|조기|빠른/))); if (f) out.push({ code: "EARLY_CHECKIN", value: f.text, norm: f.text }); }
  if (/레이트\s*체크아웃|늦은\s*퇴실|퇴실\s*연장|연장\s*퇴실|레이트\s*퇴실/.test(s)) { const f = feeOrRule(s.slice(s.search(/레이트|늦은|연장/))); if (f) out.push({ code: "LATE_CHECKOUT", value: f.text, norm: f.text }); }

  // 매너타임 / 소등
  const mtRange = s.match(new RegExp(String.raw`(?:매너\s*타임|소등\s*(?:시간)?|정숙\s*시간|취침\s*시간)[^0-9\n]{0,20}?${CLOCK}\s*(?:부터)?\s*(?:[~\-–]\s*(?:익일\s*|다음\s*날\s*)?|(?:부터\s+)?(?:익일\s*|다음\s*날\s*))\s*${CLOCK}`, "i"));
  if (mtRange) {
    const a = parseClock(mtRange[1] ?? (Number(mtRange[2]) <= 12 && Number(mtRange[2]) >= 8 ? "오후" : null), mtRange[2], mtRange[3], "manner");
    const b = parseClock(mtRange[4] ?? "오전", mtRange[5], mtRange[6], "any");
    if (a != null && b != null) out.push({ code: "MANNER_TIME", value: `${hhmm(a)}~${hhmm(b)}`, norm: `${hhmm(a)}~${hhmm(b)}` });
  } else {
    const mtSingle = s.match(new RegExp(String.raw`(?:매너\s*타임|소등\s*(?:시간)?|정숙\s*시간)[^0-9\n]{0,16}?${CLOCK}`, "i"))
      ?? s.match(new RegExp(String.raw`${CLOCK}\s*(?:부터)?\s*(?:는|은)?\s*(?:매너\s*타임|소등)`, "i"));
    if (mtSingle && !/24시간/.test(s)) {
      const a = parseClock(mtSingle[1] ?? (Number(mtSingle[2]) <= 12 && Number(mtSingle[2]) >= 8 ? "오후" : null), mtSingle[2], mtSingle[3], "manner");
      if (a != null && a >= 18 * 60) {
        out.push({ code: "MANNER_TIME", value: `${hhmm(a)}부터`, norm: `${hhmm(a)}~07:00` });
      }
    }
  }
  if (/(2박|연박)\s*(우선|필수|이상|만)\s*(예약|가능|받)?/.test(s) && !/연박\s*할인/.test(s)) out.push({ code: "MIN_STAY", value: /필수|이상|만/.test(s.match(/(2박|연박)\s*(우선|필수|이상|만)/)[2]) ? "2박 이상만" : "2박 우선 예약", norm: /필수|이상|만/.test(s.match(/(2박|연박)\s*(우선|필수|이상|만)/)[2]) ? "2N_ONLY" : "2N_FIRST" });
  else if (/1박\s*(예약)?\s*(불가|안\s*됩)/.test(s)) out.push({ code: "MIN_STAY", value: "1박 예약 불가", norm: "2N_ONLY" });
  if (/(기준\s*인원\s*초과|인원\s*추가|추가\s*인원|1인\s*추가|추가\s*1인)/.test(s)) { const f = feeOrRule(s.slice(s.search(/기준\s*인원|인원|추가/))); if (f && f.fee != null) out.push({ code: "EXTRA_PERSON_FEE", value: `1인 ${f.text}`, norm: f.text }); }
  if (/(차량\s*추가|추가\s*차량|차량\s*1대\s*추가|추가\s*차량\s*1대|1대\s*추가)/.test(s)) { const f = feeOrRule(s.slice(s.search(/차량|1대/))); if (f) out.push({ code: "EXTRA_CAR_FEE", value: f.fee != null ? `1대 ${f.text}` : f.text, norm: f.text }); }
  // ‘방문객’은 일반 명사로도 많이 쓰이므로 입장·요금·금지 같은 정책 표현이 바로 붙을 때만 본다.
  const vis = s.match(/(?:방문객|외부\s*방문(?:객|자)?)\s*(?:의|은|는|분)?\s*(?:입장|출입|방문|요금|이용료|1인|인당|불가|금지|제한|받지)[^.]{0,30}/);
  if (vis) { const f = feeOrRule(vis[0]); if (f && f.text !== "가능(요금 미기재)") out.push({ code: "VISITOR_POLICY", value: f.fee != null ? `1인 ${f.text}` : f.text === "불가" ? "방문객 불가" : f.text, norm: f.text }); }
  const pet = s.match(/(반려견|반려동물|애견|강아지)[^.]{0,30}?(동반\s*)?(가능|불가|금지|입장\s*불가)/);
  // “반려동물 동반 가능 여부”(안내 제목·질문)는 규칙이 아니다. “A사이트 외 애완견 동반 금지”는 지정 구역만 허용이다.
  const petAsk = pet && /^\s*(여부|하나요|한가요|인가요|\?)/.test(s.slice(pet.index + pet[0].length));
  const petZone = pet && /([A-Za-z가-힣0-9]+\s*(사이트|구역|존|동)\s*(외|이외|제외)|(전용|지정)\s*(사이트|구역|존))/.test(s);
  if (pet && !petAsk && petZone) {
    out.push({ code: "PET_POLICY", value: "지정 구역만 동반", norm: "ZONE_ONLY" });
  } else if (pet && !petAsk) {
    const allowed = /가능/.test(pet[3]);
    const size = s.match(/(소형견|중형견|대형견|\d{1,2}\s*kg\s*(?:이하|미만))/);
    const limit = s.match(/(\d)\s*마리/);
    const detail = [size?.[1], limit ? `${limit[1]}마리까지` : null].filter(Boolean).join(" · ");
    out.push({ code: "PET_POLICY", value: allowed ? `동반 가능${detail ? ` (${detail})` : ""}` : "동반 불가", norm: allowed ? "ALLOWED" : "PROHIBITED" });
  }
  for (const r of s.matchAll(/([가-힣A-Za-z]{2,12}(?:\s?[가-힣A-Za-z]{1,6})?)\s*(?:대여|렌탈)\s*(?:료|비)?\s*(?:[:：]|은|는)?\s*(\d[\d,]{2,})\s*원/g)) {
    const item = r[1].replace(/^(장비|용품|캠핑)\s*/, "").trim(); const n = won(r[2]);
    if (item.length >= 2 && n >= 1000 && n <= 300000) out.push({ code: "RENTAL", value: `${item} ${fmtWon(n)}`, norm: item });
  }
  // 상시 할인 대상(다자녀·지역주민·장애인 등)과 기간 행사를 나눈다. 기간 없는 ‘할인’ 문구는 행사로 올리지 않는다.
  const elig = [...s.matchAll(/(다자녀|[가-힣]{1,6}(?:시민|군민|구민|도민|주민)|장애인|국가\s*유공자|경로|기초\s*생활\s*수급자?|자매\s*도시|교류\s*도시|군인|소방관)[^%.]{0,20}?(\d{1,2})\s*%\s*(?:할인|감면)/g)];
  for (const e of elig) out.push({ code: "DISCOUNT", value: `${e[1].replace(/\s+/g, "")} ${e[2]}%`, norm: `${e[1].replace(/\s+/g, "")}|${e[2]}` });
  if (/(이벤트|할인|프로모션|특가|행사)/.test(s) && !elig.length && !/할인\s*쿠폰\s*코드/.test(s)) {
    const period = parsePeriod(s, year);
    if (period) out.push({ code: "PROMOTION", value: clip(s, 60), norm: `${period.from ?? ""}~${period.to ?? ""}`, period });
  }
  // 주차 방식(2026-10-19): 사이트 옆 주차 / 짐수레·카트 이동 / 별도 주차장
  if (/주차/.test(s) && !/주차\s*(요금|비)|\?\s*$/.test(s)) {
    if (/(사이트|텐트|데크)\s*(바로\s*)?(옆|앞|뒤)\s*(에)?\s*(차량\s*)?주차|차를\s*(바로\s*)?(옆|앞)에|오토\s*캠핑\s*(이\s*)?가능|차\s*옆\s*에서/.test(s) && !/불가|안\s*됩|안\s*돼/.test(s)) out.push({ code: "PARKING", value: "사이트 옆 주차", norm: "SITE_ADJACENT" });
    else if (/(짐\s*수레|카트|리어카|손수레|운반차)/.test(s)) out.push({ code: "PARKING", value: "주차장에서 짐수레로 이동", norm: "CART_REQUIRED" });
    else if (/(별도|공용|전용)\s*주차장|주차장\s*(에\s*)?(주차|세우)/.test(s)) out.push({ code: "PARKING", value: "별도 주차장", norm: "SHARED_NEARBY" });
  }
  // 전기 용량: “전기 600W”, “최대 1kW”, “1,100와트” (300~3,000W만, 전기 맥락이 같은 문장에 있을 때)
  const w = s.match(/(\d(?:[\d,]{0,4}))\s*(w|와트|kw|킬로와트)(?![a-z])/i);
  if (w && /전기|전력|소비\s*전력|허용\s*용량|차단기|릴선|전열|과전력|초과|사용\s*가능|용량|사이트당|팀당/.test(s)) {
    const n = Number(w[1].replace(/,/g, "")) * (/k/i.test(w[2]) ? 1000 : 1);
    if (n >= 300 && n <= 3000) out.push({ code: "POWER_W", value: `${n.toLocaleString("ko-KR")}W`, norm: String(n) });
  }
  // 환불: “당일 취소 환불 불가”, “7일 전 100% 환불”
  const rf = s.match(/(\d{1,2})\s*일\s*전[^.]{0,15}?(\d{1,3})\s*%\s*(환불|환급)/);
  if (rf) out.push({ code: "REFUND_POLICY", value: `${rf[1]}일 전 ${rf[2]}% 환불`, norm: `${rf[1]}d${rf[2]}` });
  else if (/(\d{1,2})\s*일\s*전[^.]{0,15}?(전액\s*환불|100\s*%\s*환불)/.test(s)) {
    const m = s.match(/(\d{1,2})\s*일\s*전/);
    if (m) out.push({ code: "REFUND_POLICY", value: `${m[1]}일 전 100% 환불`, norm: `${m[1]}d100` });
  } else if (/(당일|전날|1일\s*전)[^.]{0,15}(취소|환불)[^.]{0,10}(불가|불가능|안\s*됩|없음|어렵|불가합니다)/.test(s)) {
    out.push({ code: "REFUND_POLICY", value: "당일 취소 환불 불가", norm: "SAMEDAY_NONE" });
  } else if (/(당일\s*취소\s*시|예약\s*당일\s*취소|당일\s*취소)[^.]{0,10}(환불\s*불가|환불\s*안\s*됩)/.test(s)) {
    out.push({ code: "REFUND_POLICY", value: "당일 취소 환불 불가", norm: "SAMEDAY_NONE" });
  }
  return out;
}

// ─── 후기 귀속 ───────────────────────────────────────────────────────────
const GENERIC = /(오토\s*캠핑장|캠핑장|야영장|글램핑장?|카라반|캠프닉|자연휴양림|휴양림|국민여가|오토캠핑|캠핑|펜션|리조트|\[[^\]]*\]|\([^)]*\))/g;
/** 캠핑장 이름에서 구분력 있는 핵심어(2자 이상)를 만든다. */
export function nameTokens(name) {
  const core = String(name ?? "").replace(GENERIC, " ").replace(/[^가-힣A-Za-z0-9\s]/g, " ").split(/\s+/).filter((t) => t.length >= 2);
  return [...new Set(core)];
}
/** 여러 업장을 묶은 글인가? 제목의 “N곳/추천/모음/TOP”, 본문의 여러 📍·번호 목록. */
export function isRoundup({ title, snippet } = {}) {
  title = String(title ?? ""); snippet = String(snippet ?? "");
  if (/(\d+\s*곳|\d+\s*선|TOP\s*\d*|BEST|베스트|추천\s*(?:캠핑장|리스트)|모음|총정리|리스트|가볼\s*만한|가볼만한)/i.test(title)) return true;
  const pins = (snippet.match(/📍/g) ?? []).length;
  const nums = (snippet.match(/(?:^|\s)\d\.\s/g) ?? []).length;
  return pins >= 2 || nums >= 2;
}
/** 이 후기가 이 캠핑장 이야기인가: 핵심어가 제목 또는 요약에 있고, 묶음 글이 아니어야 한다. */
export function attributable(review, name) {
  const toks = nameTokens(name);
  if (!toks.length || isRoundup(review)) return false;
  const text = `${review.title ?? ""} ${review.snippet ?? ""}`;
  return toks.some((t) => text.includes(t));
}

/**
 * 한 캠핑장의 스펙 시트를 만든다.
 * @param {object} p
 * @param {string} p.name 캠핑장 이름(귀속 판정)
 * @param {Array<{text:string, source:object, grade:string}>} p.docs 운영자 공지·공식 소개 문서
 * @param {Array} p.reviews 후기 요약(title·snippet·url·date)
 * @param {string} p.now 기준 시각(지난 행사 제외)
 */
export function buildSpecSheet({ name, docs = [], reviews = [], now = new Date().toISOString(), mentionMaxAgeDays = 1460 }) {
  const year = Number(now.slice(0, 4));
  const today = now.slice(0, 10);
  const facts = [];
  for (const doc of docs) {
    for (const s of sentences(doc.text)) {
      for (const f of extractFromSentence(s, { year })) facts.push({ ...f, quote: s, grade: doc.grade, source: doc.source });
    }
  }
  const nowMs = Date.parse(now);
  let usedReviews = 0, skippedRoundups = 0;
  for (const r of reviews) {
    if (isRoundup(r)) { skippedRoundups++; continue; }
    if (!attributable(r, name)) continue;
    const at = Date.parse(r.date ?? "");
    if (Number.isFinite(at) && nowMs - at > mentionMaxAgeDays * 864e5) continue;
    let hit = false;
    // 본문 문장(robots 허용 블로그)이 있으면 함께 읽는다. 오래된 글은 화면에서 “(YYYY.MM.DD 기준)”으로 표시한다.
    for (const s of sentences(`${r.title ?? ""}. ${r.snippet ?? ""}${r.body?.length ? `\n${r.body.join("\n")}` : ""}`)) {
      for (const f of extractFromSentence(s, { year: Number.isFinite(at) ? new Date(at).getFullYear() : year })) {
        // 후기의 행사 언급은 작성 시점 기준이라 최근 60일 글만, 기간이 이미 지난 것은 뺀다.
        if (f.code === "PROMOTION" && (!Number.isFinite(at) || nowMs - at > 60 * 864e5)) continue;
        facts.push({ ...f, quote: s, grade: "MENTION", source: { kind: "review", label: r.src ?? (/cafe/.test(r.t ?? "") ? "카페" : r.t === "web" ? "웹문서" : r.t === "kin" ? "지식iN" : "블로그"), url: r.url, date: r.date ?? null } });
        hit = true;
      }
    }
    if (hit) usedReviews++;
  }
  // 지난 행사 제외
  const live = facts.filter((f) => f.code !== "PROMOTION" || !f.period?.to || f.period.to >= today);
  const fields = {};
  for (const code of Object.keys(SPEC_FIELDS)) {
    const list = live.filter((f) => f.code === code);
    if (!list.length) continue;
    const top = Math.max(...list.map((f) => GRADE_RANK[f.grade] ?? 0));
    const best = list.filter((f) => (GRADE_RANK[f.grade] ?? 0) === top);
    const mentions = list.filter((f) => f.grade === "MENTION");
    // 후기 언급은 값별로 묶어 건수·최근 날짜를 센다. 값이 갈리면 conflict.
    const byNorm = new Map();
    for (const m of mentions) {
      const k = m.norm; const g = byNorm.get(k) ?? { value: m.value, count: 0, latest: null, samples: [] };
      g.count++; if (m.source.date && (!g.latest || m.source.date > g.latest)) g.latest = m.source.date;
      if (g.samples.length < 2) g.samples.push({ quote: m.quote, url: m.source.url, label: m.source.label, date: m.source.date });
      byNorm.set(k, g);
    }
    const official = best[0].grade === "MENTION" ? [] : dedupe(best, code);
    // RENTAL·DISCOUNT는 여러 값이 함께 성립하므로 충돌로 보지 않는다.
    fields[code] = {
      grade: best[0].grade,
      values: official.map((f) => ({ value: f.value, quote: f.quote, source: f.source, period: f.period ?? null })),
      mentions: [...byNorm.values()].sort((a, b) => b.count - a.count || String(b.latest).localeCompare(String(a.latest))).slice(0, 4),
      conflict: byNorm.size > 1 && !["RENTAL", "PROMOTION", "DISCOUNT"].includes(code),
    };
  }
  return { version: 1, generated_at: now, fields, stats: { facts: live.length, reviews_used: usedReviews, roundups_skipped: skippedRoundups } };
}
function dedupe(list, code) {
  const seen = new Set(), out = [];
  for (const f of list) { const k = `${code}|${f.norm}`; if (seen.has(k)) continue; seen.add(k); out.push(f); }
  return out.slice(0, code === "RENTAL" ? 12 : 4);
}
