// 상세 화면 글 점검(2026-10-19 소유자 요청): 화면에 나오는 글이 ① 이 캠핑장 이야기인지 ② 놓인 칸(제목)에 맞는지
// 정해진 규칙(목록·정규식·이름 대조)으로만 판정한다. LLM은 쓰지 않는다. 남기는 글은 원문 문장 그대로 두고,
// 표기만 다듬는다(시각 14:00, 금액 130,000원). 빼거나 옮긴 이유는 log에 센다.
// 이 파일은 외부 모듈을 가져오지 않는다 — 화면 사본 camping-atlas/public/context/text-review.js와 똑같아야 한다(테스트가 확인).

const LEGAL = /(주식회사|유한회사|농업회사법인|영농조합법인|사회적협동조합|협동조합|\(주\)|\(유\)|㈜)/g;
const GENERIC = ["오토캠핑장", "캠핑장", "야영장", "캠핑", "캠프", "글램핑", "카라반", "오토", "펜션", "관광농원", "국민여가", "캠프펜션", "the", "더"];
const GENERIC_SUFFIX = new RegExp(`(${GENERIC.filter((g) => g.length >= 2 && g !== "the").sort((a, b) => b.length - a.length).join("|")})+$`, "i");
/** 화면/파생 데이터에서만 쓰는 안전한 문자 정제. HTML 구조 문자는 해석하지 않는다. */
export function decodeDisplayEntities(value) {
  let s = String(value ?? "");
  for (let i = 0; i < 2; i++) {
    const next = s
      .replace(/&(?:amp;)?middot;?/gi, "·")
      .replace(/&(?:amp;)?nbsp;?/gi, " ")
      .replace(/&(?:amp;)?#0*183;?/gi, "·")
      .replace(/&(?:amp;)?#x0*b7;?/gi, "·")
      .replace(/&(?:amp;)?#0*8226;?/gi, "·")
      .replace(/&(?:amp;)?#x0*2022;?/gi, "·");
    if (next === s) break;
    s = next;
  }
  return s.replace(/\u00a0/g, " ").replace(/[∙⋅•]/g, "·");
}
const compact = (s) => decodeDisplayEntities(s).replace(/<[^>]*>/g, "").toLowerCase().replace(/[\s·.,\-_()[\]'"!?~&|/:;]/g, "");
const stemOf = (sigungu) => { const s = String(sigungu ?? "").trim().split(/\s+/)[0] ?? ""; return s.length > 2 ? s.replace(/(시|군|구)$/, "") : s; };

/** 이름의 고유 토큰(일반어·지역명 제외, 소문자) */
export function nameTokens(name, sigungu) {
  const stem = stemOf(sigungu).toLowerCase();
  const out = [];
  for (let t of String(name ?? "").replace(LEGAL, " ").toLowerCase().replace(/[()[\]&·.,\-_/]/g, " ").split(/\s+/).filter(Boolean)) {
    if (GENERIC.includes(t)) continue;
    t = t.replace(GENERIC_SUFFIX, "");
    if (!t || t === stem || GENERIC.includes(t)) continue;
    if (stem && t.startsWith(stem) && t.length - stem.length >= 2) t = t.slice(stem.length).replace(/^(시|군|구)/, "") || t;
    out.push(t);
  }
  if (!out.length) { const whole = compact(String(name ?? "").replace(LEGAL, "")); if (whole) out.push(whole); }
  return out;
}
export const nameCoreOf = (name, sigungu) => nameTokens(name, sigungu).join("");

// ── 출처 분류 ─────────────────────────────────────────────────────────────
// 운영자가 아니라 여러 캠핑장 정보를 모아 둔 사이트(디렉터리·가이드·후기 모음). 이 글은 ‘운영자 안내’ 칸에 두지 않는다.
export const AGGREGATOR_HOST = /(^|\.)(visitkorea\.or\.kr|camppick\.com|campinghub\.kr|kimgoon\.kr|campweek\.co\.kr|campingdogam\.com|govpped\.com|5gcamp\.com|camplink\.co\.kr|camperest\.kr|noricamp\.com|triptokr\.com|ok114\.co\.kr|mom-mom\.net|ban-life\.com|lovable\.app|yapen\.co\.kr|campingkorea\.or\.kr|gbe\.kr|banananx\.com|tacgear\.kr|triple\.guide|waug\.com|caravanpark\.kr|mycamp\.co\.kr)$/i;
const hostOf = (u) => { try { return new URL(u).hostname.replace(/^www\./, ""); } catch { return ""; } };

// ── 문장 판정 ─────────────────────────────────────────────────────────────
const BOILERPLATE = /(약관|개인정보|법률|법령|정보통신|통계활용|이용자\s*대상|저작권|무단\s*(전재|복제)|copyright|all rights reserved|쿠키|로그인|회원가입|비밀번호|designed\s*by|상호명\s*:|대표\s*:)/i;
const PAGE_TITLE = /(\s\|\s|\s[-–—]\s[^가-힣]{0,20}$|추천\s*[-|]|^\S+\s*\|\s*\S+|#\S+\s+#\S+|캠핑장\s*정보\s*$|캠핑고고|캠퍼스토리|[>|»]|\s+>\s+|상세보기|바로가기|실시간\s*예약\s*$)/;
const TABLE_HEADER = /(번호\s*,\s*제목|작성자\s*,\s*등록일|조회수|첨부파일)/;
const QUESTION = /(\?|까요|나요|가요|인가요|있나요)\s*$/;
const GENERAL_ADVICE = /(대체로|일반적으로|보통\s|가이드|입문|초보\s*캠퍼|노하우|추천과|정리했습니다|카테고리별|지자체|소비자분쟁|캠핑\s*팁|선택법|모델은|사용자에게|좋은\s*선택|구매\s*가능|참고\s*목적)/;
const FIRST_PERSON_REVIEW = /(다녀왔|다녀온|갔었|갔다왔|좋았어요|좋았다|좋지\s*않아요|별로였|아쉬웠|재방문|또\s*가고|추천합니다|강추|가보자고|달려달려|퇴근하고|짐을\s*싣고|짐싸서|도착했|도착하니|출발했|신나|꿀잼|존맛|존예|JMT|내돈내산|솔직\s*후기|블로거|이웃|서이추|방문기|체크인하고|사진\s*찍|인생샷|포토존|힐링하고|쉬다\s*왔|좋은\s*추억|다녀온\s*후기|가족들과\s*함께\s*(다녀|갔|방문)|아이들과\s*(다녀|갔|방문)|남편과|아내와|친구들과\s*(다녀|갔)|☎️|ㅋㅋ|ㅎㅎ|ㅠㅠ|ㅜㅜ|~{2,}|\.{3,}|[!?]{2,})/;
const HEADING_TAIL = /(안내|정보|기준|기간|시간|규정|요금|사항|방법|이용|현황|목록|수량|여부|시작일|종료일|운영기간|안내사항|유의사항|이용안내|주의사항|공지사항|알림|공지)$/;
const ROOM_STRUCTURE = /^(?:거실|방|주방|원룸|투룸|침대\d|화장실\d|욕실\d)[\d\s+겸,·/]+$/;
const ROOM_CODE = /^(?:카라반|글램핑|오토캠핑|데크)_[가-힣\w]+$/;
const FLUFF = /(마음의\s*진정한\s*휴식|온가족이\s*즐기는|캠핑\s*그\s*이상|대표입니다|감사의\s*말씀|방문하여\s*주신|놀러\s*오세요|환영합니다|좋은\s*추억\s*만드|행복한\s*시간|힐링의\s*공간|즐거운\s*시간\s*되)/;
const OTHER_PLACE = /(?:^|[\s[(（"'「『])([가-힣A-Za-z][가-힣A-Za-z0-9]{1,11})\s?(오토캠핑장|캠핑장|야영장|글램핑장|캠프장)/g;
// 이름이 아니라 앞말(조사·어미)로 끝나는 말: "인한 캠핑장", "특히 캠핑장"
const PARTICLE_TAIL = /(은|는|이|가|을|를|에|의|로|과|와|서|한|된|인|할|면|고|며|여|히|게|도|만|및|후|중|내|쪽|별|용|형|들|등|께|요|다|지|던|운|본|엔|좋은|있는|없는|같은)$/;
const SIDO = /^(서울|부산|대구|인천|광주|대전|울산|세종|경기|강원|충북|충남|전북|전남|경북|경남|제주|수도권|영남|호남|충청|경상|전라|강원도|경기도|제주도)$/;
const LISTICLE = /(\d+\s*곳|BEST|TOP\s?\d|베스트|모음|리스트|총정리|몽땅\s*정리|비교|추천\s*\d|순위)/i;
const NOT_A_NAME = /^(노키즈|부티크|이곳|그곳|제\d+|신생|저렴|감성|힐링|프라이빗|럭셔리|애견동반|키즈|공공|인기|이|우리|저희|해당|본|전|모든|다른|국내|일반|타|근처|주변|무료|유료|노지|사설|국립|시립|군립|도립|구립|자연휴양림|오토|가족|반려견|애견|동반|추천|베스트|최고|새|신규|기존|각|여러|일부|많은|대부분|대표|전국|사계절|계곡|바다|해변|숲속|산속|강변|호숫가|섬|도심|근교|당일|예약|이용|캠핑|글램핑|카라반|차박|동계|하계|공영|민간|개인|단체|소규모|대규모|인근)$/;

/** 운영 안내 항목(칸): 앞의 것이 우선. 점수 = 맞은 낱말 수 */
export const OPERATOR_CATS = [
  ["입·퇴실", /(입실|퇴실(?!\s*조치)|체크인|체크아웃|얼리|레이트|입촌|퇴촌|도착)/g],
  ["인원 · 추가", /(인원\s*추가|추가\s*인원|기준\s*인원|최대\s*인원|초과\s*인원|인원|인당|명\s*까지|추가\s*요금|\d+\s*인(?![가-힣]))/g],
  ["주차", /(주차|차량\s*추가|추가\s*차량|차\s*1대|차량|견인|차박)/g],
  ["전기", /(전기|리드선|차단기|와트|\d\s*w\b|\d\s*kw|암페어)/gi],
  ["불멍 · 화로", /(화로|장작|숯|불씨|화기|모닥불|바비큐|바베큐|그릴|Campfire)/gi],
  ["반려동물", /(반려동물|반려견|애견|반려묘|마리|목줄|배변)/g],
  ["매너타임 · 소음", /(매너\s*타임|소음|조용|소등|취침|음주|고성방가|\d{1,2}\s*시\s*이후)/g],
  ["시설", /(온수|화장실|샤워|개수대|매점|휴게실|수영장|놀이터|와이파이|wi-?fi|전자레인지|편의시설|세면)/gi],
  ["이용 규칙", /(식기\s*반납|물품\s*반납|세척\s*후|금연|흡연|쓰레기|분리수거|외부인|방문객|준수|강제\s*퇴장|금지|불가|삼가|주의)/g],
  ["예약 · 성수기", /(예약|성수기|비수기|준성수기|변경|연기|오픈|선착순|대기)/g],
  ["요금 · 환불", /(요금|금액|할인|환불|취소|위약|수수료|입금|결제|\d[\d,]*\s*원|만\s*원)/g],
];
export function operatorCategory(text) {
  let best = null, score = 0;
  for (const [label, re] of OPERATOR_CATS) {
    const n = (String(text).match(re) ?? []).length;
    if (n > score) { best = label; score = n; }
  }
  return best;
}

// ── 표기 다듬기 ───────────────────────────────────────────────────────────
/** "오후 2시", "14시", "2시30분", "14:0" → "14:00". 시각이 아니면 그대로 */
export function normalizeTimes(text) {
  return String(text ?? "")
    .replace(/(?:(오전|오후|낮|밤|저녁|새벽)\s*)?(?<![\d.])(\d{1,2})\s*시(?:\s*(\d{1,2})\s*분|\s*(반))?(?!간|\d|대|즌|설|청|작|점|각|기|도|민|장|군|구)/g, (m, ap, h, mm, half) => {
      let H = Number(h);
      if (H > 24) return m;
      if ((ap === "오후" || ap === "저녁" || ap === "밤") && H < 12) H += 12;
      if ((ap === "오전" || ap === "새벽") && H === 12) H = 0;
      const M = half ? 30 : Number(mm ?? 0);
      if (M > 59) return m;
      return `${String(H).padStart(2, "0")}:${String(M).padStart(2, "0")}`;
    })
    .replace(/\b(\d{1,2}):(\d)\b(?!\d)/g, (m, h, mm) => `${String(h).padStart(2, "0")}:${mm}0`);
}
/** "130000원" → "130,000원", "13만원" → "130,000원", "2만5천원" → "25,000원" (범위·"대"는 그대로 둔다) */
export function normalizeWon(text) {
  return String(text ?? "")
    .replace(/(\d+)\s*만\s*(\d+)\s*천\s*원/g, (m, a, b) => `${(Number(a) * 10000 + Number(b) * 1000).toLocaleString("en-US")}원`)
    .replace(/(\d+(?:\.\d+)?)\s*만\s*원(?!\s*대)/g, (m, a) => `${Math.round(Number(a) * 10000).toLocaleString("en-US")}원`)
    .replace(/(\d+)\s*천\s*원/g, (m, a) => `${(Number(a) * 1000).toLocaleString("en-US")}원`)
    .replace(/(?<![\d,])(\d{4,9})\s*원/g, (m, a) => `${Number(a).toLocaleString("en-US")}원`);
}
const tidy = (s) => normalizeWon(normalizeTimes(decodeDisplayEntities(s).replace(/^[\s*#·•\-–—√✓✔※▶►▷■□●○◆◇★☆>ㅁ]+/, "").replace(/^\d{1,2}\s+(?=[가-힣])/, "").replace(/\s+/g, " ").trim()));

// 기관 공용 포털의 푸터·다른 시설 게시판은 업장 규칙이 아니다. 원문은 레지스트리의 quarantine에
// 보존하되 공개 스펙·공지에서는 격리한다. 실제 업장 주소/연락처는 별도 구조화 필드에 남긴다.
const FOOTER_OR_ADDRESS = /(\(\s*\d{5}\s*\)\s*)?(?:서울특별시|[가-힣]+(?:특별자치도|특별시|광역시|도))\s*[가-힣]+(?:시|군|구)[^.!?]{0,80}(?:로|길)\s*\d+|\b(?:tel|fax)\s*[:：]|시설관리공단\s*(?:\||$)/i;
const PORTAL_NOISE = /(?:이동식\s*화장실\s*임차|가정용\s*생활공구\s*무료대여|파크골프장\s*화장실|관광취약계층.*우선예약|이사장\s*선임절차|강습\s*회원\s*선정)/;
export function isOperatorContentNoise(value) {
  const s = decodeDisplayEntities(value).replace(/\s+/g, " ").trim();
  return FOOTER_OR_ADDRESS.test(s) || PORTAL_NOISE.test(s);
}

// ── 이 캠핑장 이야기인가 ──────────────────────────────────────────────────
// namesOnly: 운영자 글은 말투가 다양해 "○○ 캠핑장" 꼴만으로는 판정하지 않고, 같은 지역 다른 캠핑장 이름이 나올 때만 본다.
function otherPlaceIn(text, core, nameC, others, regions, { namesOnly = false } = {}) {
  if (core && core.length >= 2 && compact(text).includes(core)) return null;
  if (!namesOnly) for (const m of String(text).matchAll(OTHER_PLACE)) {
    const x = compact(m[1]);
    if (!x || x.length < 2 || NOT_A_NAME.test(m[1]) || PARTICLE_TAIL.test(m[1]) || SIDO.test(m[1]) || regions?.has(m[1].replace(/(시|군|구)$/, ""))) continue;
    if ((core && (core.includes(x) || x.includes(core))) || nameC.includes(x)) continue;
    return m[0];
  }
  const t = compact(text);
  for (const o of others) if (o && o.length >= 3 && o !== core && !core.includes(o) && t.includes(o)) return o;
  return null;
}
const AD = /(분양|매매|부동산|매물|급매|경매|임대|평당|시세|투자|중개|대출|카지노|토토|바카라|도박|성인|원나잇|코인|리딩방|부업)/;
const CAMP_CONTEXT = /(캠핑|야영|글램핑|글램|카라반|캠프|텐트|타프|차박|노지|데크|파쇄석|불멍|바베큐|바비큐|휴양림|숙박|캠퍼|camp|glamp)/i;
/** 블로그·카페·웹문서·영상: 이름이 나오고 캠핑 맥락이 있어야 이 캠핑장 이야기로 본다 */
export function aboutCamp(doc, ctx) {
  const titleRaw = String(doc?.title ?? "");
  if (AD.test(titleRaw)) return "광고·스팸";
  const title = compact(titleRaw), body = compact(doc?.snippet ?? doc?.contents), text = `${title}|${body}|${compact(doc?.src ?? doc?.author)}`;
  const toks = ctx.tokens.filter(Boolean);
  if (!toks.length) return null;
  const hit = text.includes(ctx.core) || (toks.length > 1 && toks.every((t) => t.length < 2 || text.includes(t)) && toks.some((t) => t.length >= 2));
  if (!hit) return "이름 없음(다른 곳 글)";
  if (!CAMP_CONTEXT.test(`${titleRaw} ${doc?.snippet ?? ""}`)) return "캠핑 이야기 아님";
  if (!title.includes(ctx.core) && (ctx.others ?? []).some((o) => o && o.length >= 2 && o !== ctx.core && !ctx.core.includes(o) && title.includes(o))) return "제목이 다른 캠핑장";
  return null;
}

/**
 * 여러 지역(시도 3곳 이상)의 캠핑장 8곳 이상에 똑같이 붙은 운영 안내 문장. 예약 사이트·관광 포털의 공통 틀이라
 * 그 캠핑장만의 안내가 아니다. 같은 시도 안 공공 예약 시스템 공통 규정은 남긴다.
 * @param {Iterable<{sido?: string, d: object}>} entries
 * @returns {string[]} compact 문장 키
 */
export function commonOperatorTexts(entries, { minCamps = 8, minSido = 3 } = {}) {
  const seen = new Map();
  for (const { sido, d } of entries) {
    const keys = new Set((d?.operator_snippets ?? []).map((x) => compact(typeof x === "string" ? x : x?.orig ?? x?.text ?? "")).filter(Boolean));
    for (const k of keys) { const e = seen.get(k) ?? { n: 0, s: new Set() }; e.n++; e.s.add(sido ?? ""); seen.set(k, e); }
  }
  return [...seen].filter(([, e]) => e.n >= minCamps && e.s.size >= minSido).map(([k]) => k).sort();
}

/**
 * 상세 자료(camps/{id}.json) 한 곳을 점검한다. 원본은 바꾸지 않고 새 객체를 돌려준다.
 * @param {object} d 상세 자료
 * @param {{name:string, sigungu?:string}} camp
 * @param {{others?: string[], regions?: Set<string>, common?: Set<string>}} opt others: 같은 시군구 다른 캠핑장 핵심어(compact), regions: 시군구 이름 줄기("청도", "문경"),
 *   common: commonOperatorTexts()로 구한, 여러 지역 캠핑장에 똑같이 붙은 사이트 공통 문구
 * @returns {{d: object, log: {removed: Record<string, number>, moved: Record<string, number>, normalized: number, kept: number}}}
 */
export function reviewDetailTexts(d, camp, { others = [], regions = null, common = null } = {}) {
  const log = { removed: {}, moved: {}, normalized: 0, kept: 0 };
  if (!d || typeof d !== "object") return { d, log };
  const bump = (bag, k) => { bag[k] = (bag[k] ?? 0) + 1; };
  const tokens = nameTokens(camp?.name, camp?.sigungu);
  const ctx = { tokens, core: tokens.join(""), others: others.filter((o) => o && o !== tokens.join("")), regions };
  const nameC = compact(String(camp?.name ?? "").replace(LEGAL, ""));
  const out = { ...d };

  // 1) 운영자 안내
  if (Array.isArray(d.operator_snippets)) {
    const seen = new Set(), kept = [];
    for (const raw of d.operator_snippets) {
      const x = typeof raw === "string" ? { text: raw } : { ...raw };
      const original = String(x.text ?? "");
      const text = tidy(original);
      const host = hostOf(x.url);
      let why = null;
      if (host && AGGREGATOR_HOST.test(host)) why = "운영자 안내: 정보 모음·후기 사이트 글";
      else if (common?.has(compact(x.orig ?? original))) why = "운영자 안내: 여러 캠핑장 공통 문구(사이트 틀)";
      else if (isOperatorContentNoise(text)) why = "운영자 안내: 공용 포털 푸터·다른 시설 문구";
      else if (BOILERPLATE.test(text)) why = "운영자 안내: 약관·개인정보 문구";
      else if (TABLE_HEADER.test(text)) why = "운영자 안내: 게시판 표 머리글";
      else if (PAGE_TITLE.test(text)) why = "운영자 안내: 페이지 제목·키워드";
      else if (QUESTION.test(text)) why = "운영자 안내: 질문 제목(FAQ)";
      else if (text.replace(/\s/g, "").length < 8 || (text.length <= 25 && HEADING_TAIL.test(text.replace(/[\s:：()（）]+$/, "")))) why = "운영자 안내: 항목 이름만(내용 없음)";
      else if (ROOM_STRUCTURE.test(text) || ROOM_CODE.test(text)) why = "운영자 안내: 객실 구조·단순 코드";
      else if (FLUFF.test(text) && !/(\d|입실|퇴실|환불|취소|금지|불가|기준|원|주차|전기|예약|마리)/.test(text)) why = "운영자 안내: 단순 인사말·홍보 문구";
      else if (GENERAL_ADVICE.test(text)) why = "운영자 안내: 일반 캠핑 안내(이 캠핑장 아님)";
      else if (FIRST_PERSON_REVIEW.test(text)) why = "운영자 안내: 방문 후기 문장";
      else if (otherPlaceIn(text, ctx.core, nameC, ctx.others, ctx.regions, { namesOnly: true })) why = "운영자 안내: 다른 업장 이야기";
      else if (seen.has(compact(text))) why = "운영자 안내: 같은 문장 반복";
      if (why) { bump(log.removed, why); continue; }
      seen.add(compact(text));
      const cat = operatorCategory(text);
      if (!cat) { bump(log.removed, "운영자 안내: 맞는 항목 없음(운영 정보 아님)"); continue; }
      if (text !== original.replace(/\s+/g, " ").trim()) log.normalized++;
      kept.push({ ...x, text, cat, ...(text !== original ? { orig: original } : {}) });
    }
    // 같은 카테고리 내에서 한 문장이 다른 문장의 단순 일부분(부분 중복)인 경우 긴 문장만 남긴다
    const deduped = [];
    for (let i = 0; i < kept.length; i++) {
      const a = compact(kept[i].text);
      let isSubset = false;
      for (let j = 0; j < kept.length; j++) {
        if (i === j) continue;
        const b = compact(kept[j].text);
        if (b.length > a.length && b.includes(a) && kept[i].cat === kept[j].cat) {
          isSubset = true;
          break;
        }
      }
      if (isSubset) {
        bump(log.removed, "운영자 안내: 같은 카테고리 부분 중복 문장");
      } else {
        deduped.push(kept[i]);
      }
    }
    log.kept += deduped.length;
    if (deduped.length) out.operator_snippets = deduped; else delete out.operator_snippets;
  }

  // 2) 사이트 타입: 정보 모음 사이트의 페이지 제목(“야영장 글램핑 카라반 오토캠핑장 추천”)에서 뽑은 종류는 근거가 아니다
  if (Array.isArray(d.site_types)) {
    const st = d.site_types.filter((t) => {
      const bad = t?.src === "operator_homepage" && !t.count && (AGGREGATOR_HOST.test(hostOf(t.url)) || PAGE_TITLE.test(String(t.quote ?? "")));
      if (bad) bump(log.removed, "사이트 타입: 정보 사이트 제목 키워드");
      return !bad;
    });
    if (st.length) out.site_types = st; else delete out.site_types;
  }

  // 3) 블로그·카페·웹문서·영상: 이 캠핑장 글만
  for (const [key, label] of [["reviews", "블로그 후기"], ["cafe", "카페 글"], ["web", "웹문서"], ["videos", "영상"]]) {
    if (!Array.isArray(d[key])) continue;
    const list = d[key].filter((x) => {
      const why = aboutCamp(key === "videos" ? { title: x.title, src: x.author } : x, ctx);
      if (why) bump(log.removed, `${label}: ${why}`);
      return !why;
    });
    if (list.length) out[key] = list; else delete out[key];
  }

  // 4) 요금 언급: 1박 요금으로 볼 수 없는 금액, 다른 업장 문장, 같은 글의 같은 금액, 캠핑 장비/용품 글
  const GEAR_SALE = /(출시|판매되|판매합|공동구매|구매했|구입했|체험단|내돈내산\s*리뷰|캠핑용품|에어텐트|쉘터\s*추천|텐트\s*추천|난로\s*추천|타프\s*추천|용품\s*읽기|장비\s*리뷰|제품\s*가격)/;
  if (Array.isArray(d.prices)) {
    const seen = new Set();
    const ps = d.prices.filter((p) => {
      const won = Number(p?.won);
      let why = null;
      if (!(won >= 10000 && won <= 2000000)) why = "요금 언급: 1박 요금 범위 밖";
      else if (LISTICLE.test(p.quote ?? "") || LISTICLE.test(p.src ?? "")) why = "요금 언급: 여러 캠핑장 모음 글";
      else if (GEAR_SALE.test(p.quote ?? "") || GEAR_SALE.test(p.src ?? "")) why = "요금 언급: 캠핑 장비/용품 관련 글";
      else if (otherPlaceIn(p.quote ?? "", ctx.core, nameC, ctx.others, ctx.regions)) why = "요금 언급: 다른 업장 문장";
      else if (seen.has(`${p.url}|${won}`)) why = "요금 언급: 같은 글 같은 금액";
      seen.add(`${p.url}|${won}`);
      if (why) bump(log.removed, why);
      return !why;
    });
    if (ps.length) out.prices = ps; else delete out.prices;
  }
  return { d: out, log };
}

/** 여러 곳의 log를 합친다 */
export function mergeLogs(logs) {
  const all = { removed: {}, moved: {}, normalized: 0, kept: 0, camps_changed: 0 };
  for (const l of logs) {
    let changed = false;
    for (const bag of ["removed", "moved"]) for (const [k, n] of Object.entries(l[bag] ?? {})) { all[bag][k] = (all[bag][k] ?? 0) + n; changed = true; }
    all.normalized += l.normalized ?? 0; all.kept += l.kept ?? 0;
    if (changed || l.normalized) all.camps_changed++;
  }
  return all;
}
