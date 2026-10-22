// 업장 이용 규칙(금지·이용제한·이용수칙)·운영 안내·공지를 문장에서 꺼낸다(2026-10-19 소유자 요청).
// 원칙(AGENTS.md 3·데이터 수집 원칙): 업장이 공개한 문장만, 값마다 근거 문장·원문 URL·확인 시각을 붙인다.
// 등급: c = 운영자 홈페이지·고캠핑 등록(업장 공개) · m = 블로그·웹 후기 언급(화면에서 ‘후기’로 구분, 카드 배지에는 안 씀).
// 불가 태그는 보수적으로: 시설 전체에 대한 단정문만 받는다(수영장·객실·텐트 안 같은 부분 금지, 질문, 후기 감상은 버린다).

// HTML 전문을 저장하지는 않지만 운영자 사이트에서 남은 안전한 문자 엔티티는 화면 전에 정제한다.
const SQUASH = (value) => {
  let s = String(value ?? "");
  for (let i = 0; i < 2; i++) {
    const next = s.replace(/&(?:amp;)?middot;?/gi, "·").replace(/&(?:amp;)?nbsp;?/gi, " ")
      .replace(/&(?:amp;)?#0*183;?/gi, "·").replace(/&(?:amp;)?#x0*b7;?/gi, "·")
      .replace(/&(?:amp;)?#0*8226;?/gi, "·").replace(/&(?:amp;)?#x0*2022;?/gi, "·");
    if (next === s) break;
    s = next;
  }
  return s.replace(/\u00a0/g, " ").replace(/[∙⋅•]/g, "·").replace(/\s+/g, " ").trim();
};

/** 불가 태그 사전: 화면은 같은 아이콘에 빨간 공통 배지로 하나씩 나열한다. */
export const NO_TAGS = {
  NO_POWER: { label: "전기 불가", icon: "bolt" },
  HIGH_POWER: { label: "고출력 전열기구 금지", icon: "bolt" },
  NO_FIRE: { label: "화기 불가", icon: "flame" },
  NO_FIREWOOD: { label: "장작 불가", icon: "flame" },
  NO_CHARCOAL: { label: "숯 불가", icon: "flame" },
  BYO_FUEL: { label: "개인 장작·숯 반입 금지", icon: "flame" },
  BYO_PIT: { label: "개인 화로대 금지", icon: "flame" },
  NO_HOT_WATER: { label: "온수 불가", icon: "drop" },
  NO_PET: { label: "반려견 불가", icon: "paw" },
  BIG_DOG: { label: "반려견 제한", icon: "paw" },
  NO_CARAVAN: { label: "개인 카라반·트레일러 불가", icon: "caravan" },
  NO_EXTRA_TENT: { label: "추가 텐트 불가", icon: "tent" },
  NO_FIREWORKS: { label: "폭죽 금지", icon: "spark" },
  NO_LOUD: { label: "음향기기 금지", icon: "broadcast" },
  NO_MINOR: { label: "미성년자 단독 불가", icon: "alert" },
  NO_VISITOR: { label: "방문객 불가", icon: "door" },
  NO_WINTER: { label: "동계 휴장", icon: "calendar" },
};
// 화면 순서(이용에 큰 영향 먼저)
export const NO_ORDER = ["NO_PET", "BIG_DOG", "NO_FIRE", "NO_FIREWOOD", "NO_CHARCOAL", "BYO_FUEL", "BYO_PIT", "NO_POWER", "HIGH_POWER", "NO_HOT_WATER", "NO_CARAVAN", "NO_EXTRA_TENT", "NO_WINTER", "NO_FIREWORKS", "NO_LOUD", "NO_MINOR", "NO_VISITOR"];

const NEG = "(?:절대\\s*)?(?:금지|불가(?!격)|사절|안\\s*됩|안\\s*돼|할\\s*수\\s*없|하실\\s*수\\s*없|못\\s*합)";
const re = (s) => new RegExp(s, "i");
// 부분 금지(그 시설 전체 규칙이 아님): 특정 공간·시간·조건에서만
const PARTIAL = /수영장|물놀이장|객실|실내|건물|카페|매점|관리동|샤워장|화장실|개수대|방갈로|글램핑\s*(동|에서|은|는)?|카라반\s*(안|내|에서|은|는|사용)|텐트\s*(안|내)|데크\s*(위|및|에서)|잔디밭?\s*(위|에서)|일부|구역|존\b|사이트\s*내|성수기|주말에는|우천|강풍|바람|날씨|산불\s*(경보|기간)|건조\s*(주의보|경보)|\d+\s*월/;
// 조건부 문장(“…한 경우”, “…시에는”)은 규칙 전체가 아니다. “어떤 경우에도”는 단정문.
const COND = /경우(?!에도)|시에는|때에?는|날은|날에는|라면/;
const QUESTION = /\?\s*$|[가-힣]나요\s*\??$|까요\s*\??$/;
// 후기 감상·광고·다른 곳 이야기
const REVIEWISH = /좋아요|좋았|좋네요|좋습니다|친절|힐링|추천|ㅎㅎ|ㅋㅋ|다녀|왔어요|왔습니다|했어요|했네요|했습니다만|었어요|았어요|였어요|우리는|우리\s*가족|저희는|캠지기님|사장님|너무|최고|대부분의\s*캠핑장|다른\s*캠핑장|캠핑장마다|후기|리뷰|별점|여행\s*정보|펫트립|\{\{/;
// 홈페이지 이용약관·개인정보 문구(캠핑장 이용 규칙이 아님)와 게시판 제목(‘…안내’)
const LEGAL = /약관|제\s*\d+\s*조|회원|웹\s*사이트|웹고객|홈페이지|이용자는|당사|개인\s*정보|저작권|법령|민법|게시물|게시판|서비스\s*(운영|이용)|탈퇴|계약\s*해지|로그인|아이디|비밀번호/;
const TITLEISH = /(안내|공지|알림|공지사항|안내문)\s*[)\]]?\s*$/;
const MONEY = /\d[\d,]*\s*원|\d+(?:\.\d)?\s*만\s*원/;
const REFUND = /환불|취소|위약|수수료|결제|결재|입금|예약금|송금|계좌/;

/** 태그 판정: [키, 정규식, (문장)→건너뛸지] */
const TAG_RULES = [
  ["BIG_DOG", re(`(대형견|중형견|\\d+\\s*kg\\s*이상|\\d+\\s*키로\\s*이상)[^.]{0,10}${NEG}`), (s) => !/견|강아지|반려|애견|애완/.test(s)],
  ["NO_PET", re(`(반려\\s*(동물|견)|애견|애완\\s*(동물|견)?|강아지|펫)\\s*(은|는|의|및)?\\s*(동반|출입|입장|입실|이용|동행)?\\s*(이|은|는)?\\s*${NEG}`), (s) => /대형견|중형견|kg\s*이상|키로\s*이상|소형견\s*(만|까지)|동반\s*가능/.test(s)],
  ["BYO_FUEL", re(`(개인|외부)[^.]{0,12}(장작|숯|땔감)[^.]{0,14}(반입|사용|이용)?\\s*(은|는|이)?\\s*${NEG}|(장작|숯|땔감)[^.]{0,8}반입\\s*${NEG}`)],
  ["BYO_PIT", re(`개인\\s*(화로|화로대|그릴|바베큐\\s*그릴)[^.]{0,8}(사용|반입)?\\s*${NEG}`)],
  ["NO_FIREWOOD", re(`장작\\s*(사용|이용|불멍|화로)?\\s*(은|는|이)?\\s*(전면\\s*)?${NEG}`), (s) => /반입|개인|외부|제공(된|하는)|이외/.test(s)],
  ["NO_CHARCOAL", re(`(?<![가-힣])숯\\s*(불|사용|이용)?\\s*(은|는|이)?\\s*(전면\\s*)?${NEG}`), (s) => /반입|개인|외부|제공(된|하는)|이외|가격/.test(s)],
  ["NO_FIRE", re(`(화기|불멍|모닥불|캠프\\s*파이어)\\s*(사용|이용)?\\s*(은|는|이)?\\s*(전면\\s*)?${NEG}`), (s) => /개인\s*(화로|그릴|화기)|직화|바닥|화로\s*없이/.test(s)],
  ["HIGH_POWER", re(`(전기\\s*(난로|히터|장판|매트|그릴|포트|밥솥|요리|레인지)|전열\\s*기구|고용량|고출력|과도한\\s*출력|에어컨|온풍기|인덕션|하이라이트)[^.]{0,24}${NEG}`)],
  ["NO_POWER", re(`전기\\s*((사용|공급|시설|이용)\\s*(은|는|이|가)?|은|는|가)\\s*(불가|없|미제공|제공\\s*(하지|안|되지)|${NEG})`), (s) => /\d\s*(w|kw|와트|a\b|암페어)|전기\s*(차|자전거|그릴|장판|난로|요금)|초과|사이트는|사이트라면|외\s*전기|이외의|손님은|출력|과도|고용량/i.test(s)],
  ["NO_HOT_WATER", re(`온수\\s*(는|가|이)?\\s*(없|불가|미제공|제공\\s*(하지|안|되지)|안\\s*나)|(냉수|찬물)\\s*만`)],
  ["NO_CARAVAN", re(`(개인\\s*)?(카라반|트레일러|캠핑\\s*카|모터\\s*홈)[^.]{0,16}(진입|입장|입차|출입|동반|주차|견인)\\s*${NEG}`), (s) => /반려|애견|애완/.test(s)],
  ["NO_EXTRA_TENT", re(`(추가\\s*텐트|텐트\\s*추가|추가\\s*타프|타프\\s*추가|텐트\\s*\\d?\\s*동\\s*이상)[^.]{0,10}${NEG}|1\\s*사이트\\s*1\\s*텐트|텐트\\s*1\\s*동\\s*만`)],
  ["NO_FIREWORKS", re(`(폭죽|불꽃\\s*놀이|풍등)[^.]{0,16}(${NEG}|삼가|자제)`)],
  ["NO_LOUD", re(`(음향\\s*기기|스피커|앰프|노래방\\s*기기|악기|고성\\s*방가)[^.]{0,16}(${NEG}|삼가|자제)`)],
  ["NO_MINOR", re(`미성년자?[^.]{0,30}(${NEG}|보호자\\s*(미\\s*)?동반|동의서)`)],
  ["NO_VISITOR", re(`(방문객|외부인|외부\\s*방문|지인\\s*방문|방문\\s*차량)[^.]{0,16}(${NEG}|제한)`), (s, m) => /초과|포함|사전/.test(s.slice(Math.max(0, m.index - 12), m.index + m[0].length))],
  ["NO_WINTER", re(`(동계|겨울)\\s*(시즌|기간|철)?\\s*(에는\\s*)?(운영\\s*(하지|안|중단)|휴장|캠핑\\s*${NEG})`)],
];

/** 한 문장에서 불가 태그 키 목록 */
export function noTagsOf(text, { official = true } = {}) {
  const s = SQUASH(text);
  if (!s || QUESTION.test(s) || LEGAL.test(s) || (official && REVIEWISH.test(s))) return [];
  const out = [];
  for (const [k, rx, skip] of TAG_RULES) {
    const m = s.match(rx);
    if (!m || skip?.(s, m)) continue;
    // 부분 금지는 맞은 자리 앞 24자 안의 공간·조건 단어로 본다(“수영장은 애견 이용 불가”)
    const before = s.slice(Math.max(0, m.index - 24), m.index + m[0].length);
    const after = s.slice(m.index, m.index + m[0].length + 10);
    if (k !== "NO_MINOR" && (PARTIAL.test(before) || COND.test(before) || COND.test(after))) continue;
    out.push(k);
  }
  // 장작·숯이 모두 불가면 ‘화기 불가’ 하나로
  if (out.includes("NO_FIREWOOD") && out.includes("NO_CHARCOAL")) return [...new Set(out.filter((k) => k !== "NO_FIREWOOD" && k !== "NO_CHARCOAL").concat("NO_FIRE"))];
  return out;
}

const CAT_BAN = /금지|불가|사절|안\s*됩|안\s*돼|할\s*수\s*없|하실\s*수\s*없|못\s*합|삼가/;
const CAT_LIMIT = /제한|초과|최대|이하|이내|미성년|보호자|인원|1\s*사이트|차량\s*\d|\d\s*대|\d\s*동|\d\s*명/;
const CAT_RULE = /준수|지켜|부탁|바랍니다|해\s*주세요|해주십시오|하셔야|필수|반드시|주의|유의|정숙|매너\s*타임|소등|분리\s*수거|쓰레기|철수|원상\s*복구|청소|퇴실\s*시|입실\s*시/;
const VERBISH = /(다|요|음|함|것|금지|불가|필수|바람|부탁|주세요|\))\.?\s*$/;

/** 이용 규칙 문장 분류: "ban"(금지) · "limit"(이용 제한) · "rule"(이용 수칙) · null(규칙 문장 아님) */
export function ruleCategory(text) {
  const s = SQUASH(text);
  if (s.length < 10 || s.length > 160 || QUESTION.test(s) || REVIEWISH.test(s) || REFUND.test(s) || LEGAL.test(s) || TITLEISH.test(s)) return null;
  if (MONEY.test(s) && !CAT_BAN.test(s)) return null;
  if (!VERBISH.test(s) && !CAT_BAN.test(s)) return null; // 제목(‘이용수칙’, ‘매너타임’)만 있는 줄
  if (CAT_BAN.test(s)) return "ban";
  if (CAT_LIMIT.test(s) && /(제한|초과|불가|만\s*가능|까지만|이하로|최대)/.test(s)) return "limit";
  if (CAT_RULE.test(s)) return "rule";
  return null;
}

const OPS = /운영\s*(기간|시간|일|안내|중단|재개|변경|합니다|하지)|휴장|휴무|정기\s*휴|연중\s*무휴|사계절\s*운영|동계\s*운영|개장|폐장|오픈\s*(시간|안내)|관리동\s*(운영|이용\s*시간)|매점\s*(운영|이용\s*시간)|수영장\s*(운영|개장)|물놀이장\s*(운영|개장)|이용\s*시간/;
/** 운영 안내 문장인지(운영 기간·휴장·시설 운영 시간) */
export function isOpsLine(text) {
  const s = SQUASH(text);
  if (s.length < 10 || s.length > 160 || QUESTION.test(s) || REVIEWISH.test(s) || REFUND.test(s) || LEGAL.test(s)) return false;
  return OPS.test(s) && VERBISH.test(s) || /휴장|연중\s*무휴|사계절\s*운영/.test(s) && s.length >= 12;
}

const DATE = /(20\d{2}|\d{2})\s*[-./년]\s*(\d{1,2})\s*[-./월]\s*(\d{1,2})\s*일?/;
const NOTICE = /공지|알림|안내문|휴장\s*안내|임시\s*휴|운영\s*(변경|중단|재개|안내)|공사|오픈\s*안내|예약\s*(오픈|일정|안내)|성수기\s*(안내|예약)|개장\s*안내|폐장\s*안내|이용\s*안내\s*변경/;
/** 게시판 줄(공지 제목) → { title, date } 또는 null. 앞 번호·뒤 조회수·날짜를 떼어 낸다. */
export function noticeOf(text) {
  let s = SQUASH(text);
  if (s.length < 6 || s.length > 140 || !NOTICE.test(s) || REVIEWISH.test(s)) return null;
  let date = null;
  const m = s.match(DATE);
  if (m) {
    const y = m[1].length === 2 ? `20${m[1]}` : m[1];
    const mo = Number(m[2]), d = Number(m[3]);
    if (mo >= 1 && mo <= 12 && d >= 1 && d <= 31) date = `${y}-${String(mo).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
  }
  // 게시판 줄은 날짜가 있거나 [공지]·공지로 시작한다. 그 밖의 안내 문장은 운영 안내/규칙으로 간다.
  if (!date && !/^[\[［(【<]?\s*(공지|알림|notice)/i.test(s)) return null;
  s = s.replace(/^\d{1,5}\s+/, "").replace(/\s+\d{1,6}$/, "");
  if (date) s = s.replace(DATE, " ").replace(/\s+\d{1,6}\s*$/, "");
  s = s.replace(/^[\[［(【<]\s*(공지|알림|notice)\s*[\]］)】>]\s*/i, "").replace(/^공지\s+/, "").replace(/\s+/g, " ").trim();
  if (s.length < 4 || /^공지\s*사항(\s|$|[-|·])|페이지/.test(s)) return null;
  return { title: s.slice(0, 80), date };
}

const norm = (s) => SQUASH(s).replace(/[\s·.,!~\-*※■□▶▷●○◆◇•✔️✅⚠️📌]/gu, "").toLowerCase();

/**
 * 문장 묶음 → 규칙 요약.
 * lines: [{ text, url, at, g: "c"|"m", src }]
 * structured: [{ k, g, quote, url, at, src }] (고캠핑 등록값·운영자 사실 등)
 * positives: { pet: bool, fire: bool, power: bool } — 공식 ‘가능’ 값과 어긋나는 후기 태그는 버린다.
 */
export function houseRules(lines, structured = [], positives = {}) {
  const tags = new Map(), rules = [], ops = [], notices = [];
  const seen = new Set();
  const conflicts = { NO_PET: positives.pet, BIG_DOG: positives.bigDog, NO_FIREWOOD: positives.firewood, NO_FIRE: positives.firewood || positives.charcoal, NO_CHARCOAL: positives.charcoal, NO_POWER: positives.power };
  const putTag = (k, t) => {
    const cur = tags.get(k);
    // 공식 등록값이 ‘가능’인데 문장이 ‘불가’라면(객실·일부 구역 규칙인 경우가 많다) 태그로 쓰지 않는다. 운영자 문장(c)이 후기(m)보다 앞선다.
    if (!t.reg && conflicts[k]) return;
    if (!cur || (cur.g === "m" && t.g !== "m")) tags.set(k, t);
  };
  for (const t of structured) putTag(t.k, { ...t, reg: true });
  // 운영자 문장 먼저, 후기 다음
  const ordered = [...lines].sort((a, b) => (a.g === "m") - (b.g === "m"));
  for (const ln of ordered) {
    const text = SQUASH(ln.text);
    if (!text) continue;
    const key = norm(text);
    if (seen.has(key)) continue;
    seen.add(key);
    // 후기 스니펫은 여러 정보가 한 줄에 섞여 있어 태그만 쓰고, 목록에는 운영자 문장만 올린다.
    for (const k of noTagsOf(text, { official: ln.g !== "m" })) putTag(k, { k, g: ln.g, quote: text.slice(0, 160), url: ln.url, at: ln.at ?? null, src: ln.src ?? null, ...(ln.locator ? { locator: ln.locator } : {}) });
    if (ln.g === "m") continue;
    const n = noticeOf(text);
    if (n) { notices.push({ ...n, url: ln.url, at: ln.at ?? null, ...(ln.locator ? { locator: ln.locator } : {}) }); continue; }
    const cat = ruleCategory(text);
    if (cat) { rules.push({ cat, text: text.slice(0, 160), url: ln.url, at: ln.at ?? null, src: ln.src ?? null, ...(ln.locator ? { locator: ln.locator } : {}) }); continue; }
    if (isOpsLine(text)) ops.push({ text: text.slice(0, 160), url: ln.url, at: ln.at ?? null, src: ln.src ?? null, ...(ln.locator ? { locator: ln.locator } : {}) });
  }
  // 거의 같은 문장(앞 18자 같음) 하나로
  const uniq = (arr, f) => { const s = new Set(); return arr.filter((x) => { const k = norm(f(x)).slice(0, 18); if (s.has(k)) return false; s.add(k); return true; }); };
  const rank = { ban: 0, limit: 1, rule: 2 };
  const tagList = NO_ORDER.filter((k) => tags.has(k)).map((k) => { const { reg, ...t } = tags.get(k); return { ...t, label: NO_TAGS[k].label, icon: NO_TAGS[k].icon }; });
  // 화기 불가가 있으면 장작·숯 따로는 빼고, 장작·숯 둘 다 있으면 화기 불가로
  const has = (k) => tagList.some((t) => t.k === k);
  let finalTags = tagList;
  if (has("NO_FIREWOOD") && has("NO_CHARCOAL") && !has("NO_FIRE")) {
    const src = tags.get("NO_FIREWOOD");
    finalTags = [{ ...src, k: "NO_FIRE", label: NO_TAGS.NO_FIRE.label, icon: "flame" }, ...tagList.filter((t) => t.k !== "NO_FIREWOOD" && t.k !== "NO_CHARCOAL")];
    finalTags.sort((a, b) => NO_ORDER.indexOf(a.k) - NO_ORDER.indexOf(b.k));
  } else if (has("NO_FIRE")) finalTags = tagList.filter((t) => t.k !== "NO_FIREWOOD" && t.k !== "NO_CHARCOAL");
  if (finalTags.some((t) => t.k === "NO_PET")) finalTags = finalTags.filter((t) => t.k !== "BIG_DOG");
  return {
    tags: finalTags,
    rules: uniq(rules, (x) => x.text).sort((a, b) => rank[a.cat] - rank[b.cat]).slice(0, 14),
    ops: uniq(ops, (x) => x.text).slice(0, 8),
    notices: uniq(notices, (x) => x.title).sort((a, b) => String(b.date ?? "").localeCompare(String(a.date ?? ""))).slice(0, 8),
  };
}
