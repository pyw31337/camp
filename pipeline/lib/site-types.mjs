// 업장별 사이트·상품 타입(일반·오토·데크·복층 데크·타프존·글램핑·카라반·캠핑카·숙박동·차박·반려견 전용·솔로·장비 포함·개별 욕실).
// 원천과 등급:
//   고캠핑 등록값(사이트 수·바닥 데크 수·트레일러/카라반 입장) → CONFIRMED(gocamping)
//   카카오 로컬·네이버 지역 검색 분류(글램핑장·카라반·오토캠핑장·펜션) → CONFIRMED(kakao_local / naver_local)
//   고캠핑 소개글 문장 → CONFIRMED(gocamping_intro, 근거 문장 보존)
//   운영자 홈페이지 문장 → OPERATOR(operator_homepage, 근거 문장·URL·시각 보존)
// 부정 문장(“카라반 입장 불가”, “차박 금지”)은 받지 않는다.

export const SITE_TYPES = [
  ["PITCH", "일반 사이트"],
  ["AUTO", "오토캠핑"],
  ["DECK", "데크"],
  ["DUPLEX_DECK", "복층 데크"],
  ["TARP_ZONE", "타프존"],
  ["GLAMPING", "글램핑"],
  ["CARAVAN", "카라반"],
  ["RV", "캠핑카·트레일러"],
  ["HOUSE", "숙박동"],
  ["CAR_CAMP", "차박"],
  ["PET_SITE", "반려견 전용"],
  ["SOLO", "솔로·백패킹"],
  ["EQUIPPED", "장비 포함"],
  ["PRIVATE_BATH", "개별 화장실"],
];
export const SITE_TYPE_LABEL = Object.fromEntries(SITE_TYPES);
const ORDER = Object.fromEntries(SITE_TYPES.map(([k], i) => [k, i]));

// 문장 규칙. sub는 숙박동처럼 세부 이름(방갈로·캐빈 …)을 함께 남길 때.
const RULES = [
  ["DUPLEX_DECK", /복층\s*데크|2층\s*데크|이층\s*데크|복층\s*(사이트|텐트\s*사이트)/],
  ["DECK", /데크\s*(사이트|존|캠핑|구역|형)|나무\s*데크\s*사이트|우드\s*데크|(\d+\s*[x×*]\s*\d+\s*m?\s*)데크/],
  ["TARP_ZONE", /타프\s*(존|사이트|구역)|쉘터\s*(존|사이트)|그늘막\s*(존|사이트)/],
  ["GLAMPING", /글램핑/],
  ["CARAVAN", /카라반(?!\s*(입장|진입|동반|반입|견인|출입|사이트\s*없))/],
  ["RV", /캠핑카\s*(존|사이트|전용|구역)|트레일러\s*(존|사이트|구역)|개인\s*카라반|카라반\s*(동반|입장|견인)\s*(가능|사이트)|(RV|알브이)\s*(존|사이트)/i],
  ["HOUSE", /(캐빈|방갈로|펜션|통나무\s*집|독채|오두막|캠핑\s*하우스|하우스\s*(동|객실)|트리\s*하우스|코티지|돔\s*하우스|이글루|모빌\s*하우스|숙박\s*동)/, true],
  ["CAR_CAMP", /차박\s*(존|사이트|전용|구역|캠핑|가능)/],
  ["PET_SITE", /(애견|반려견|반려동물|펫)\s*(전용\s*)?(사이트|존|구역|캠핑장)/],
  ["SOLO", /(솔로|1인|백패킹|미니|소형)\s*(전용\s*)?(사이트|존|구역)/],
  ["EQUIPPED", /(텐트|장비)\s*(설치형|대여형|포함|완비)|설치형\s*텐트|티피\s*(텐트|사이트)?|인디언\s*텐트|벨\s*텐트|캠핑\s*장비\s*(일체|풀\s*세트)/],
  ["PRIVATE_BATH", /(개별|개인|전용)\s*(화장실|욕실|샤워실)/],
  ["AUTO", /오토\s*캠핑\s*(사이트|존|구역|장)|오토\s*사이트/],
];
// 이 문장 뒤 12자 안에 부정이 오면 버린다.
const NEG = /^[^.。!?]{0,12}(불가|금지|안\s*됩|안\s*돼|없습니다|없음|제한|운영\s*(안|하지\s*않))/;

/** 문장 하나 → [[code, sub|null, quote]] */
export function typesInText(text) {
  const out = [];
  const s = String(text ?? "");
  for (const [code, re, wantSub] of RULES) {
    const g = new RegExp(re.source, re.flags.includes("g") ? re.flags : `${re.flags}g`);
    let m;
    while ((m = g.exec(s))) {
      const tail = s.slice(m.index + m[0].length);
      if (NEG.test(tail)) continue;
      const a = Math.max(0, s.lastIndexOf(".", m.index) + 1);
      const quote = s.slice(a, Math.min(s.length, m.index + m[0].length + 40)).trim().slice(0, 120);
      out.push([code, wantSub ? m[1]?.replace(/\s+/g, "") ?? null : null, quote]);
      break;
    }
  }
  return out;
}

const KIND_CODE = { PITCH: "PITCH", GENERAL_PITCH: "PITCH", AUTO_PITCH: "AUTO", GLAMPING: "GLAMPING", CARAVAN_RENTAL: "CARAVAN", CARAVAN: "CARAVAN", RV_PITCH: "RV" };

/**
 * 업장 하나의 사이트 타입 목록.
 * @param c 카탈로그 행, d 상세(intro·feature), opts { snippets: {url, checked_at, snippets[]}, kakao: place, naver: place }
 * @returns [{ code, label, count, sub, grade, src, url, at, quote }] — 타입마다 가장 강한 근거 하나
 */
export function siteTypesOf(c, d = {}, { snippets = null, kakao = null, naver = null } = {}) {
  const best = new Map();
  const RANK = { OPERATOR: 3, CONFIRMED: 2 };
  const put = (code, e) => {
    const cur = best.get(code);
    // 개수가 있는 등록값을 가장 먼저 둔다. 그다음 운영자 문장, 그다음 분류·소개글.
    const score = (x) => (x.count ? 10 : 0) + RANK[x.grade];
    if (!cur) best.set(code, e);
    else {
      if (score(e) > score(cur)) best.set(code, { ...e, sub: e.sub ?? cur.sub });
      else if (!cur.sub && e.sub) cur.sub = e.sub;
    }
  };
  const gc = { src: "gocamping", url: c.gc_url ?? null, at: c.modified_at ?? null };
  // 1) 고캠핑 등록값
  for (const [k, n] of c.kinds ?? []) if (KIND_CODE[k] && n > 0) put(KIND_CODE[k], { count: n, grade: "CONFIRMED", ...gc });
  const deck = (c.floors ?? []).find(([t]) => t === "DECK")?.[1] ?? c.field_conditions?.ground?.types?.find((t) => t.type === "DECK")?.count;
  if (deck > 0) put("DECK", { count: deck, grade: "CONFIRMED", ...gc });
  if (c.trailer === true || c.caravan === true) put("RV", { count: null, grade: "CONFIRMED", ...gc, quote: [c.trailer && "트레일러 입장 가능", c.caravan && "개인 카라반 입장 가능"].filter(Boolean).join(" · ") });
  if (c.field_conditions?.sanitary?.private_bathroom === true) put("PRIVATE_BATH", { count: null, grade: "CONFIRMED", ...gc });
  // 2) 카카오·네이버 분류
  const kcat = String(kakao?.category ?? kakao?.category_name ?? "");
  const kc = { src: "kakao_local", url: kakao?.url ?? kakao?.place_url ?? null, at: kakao?.checked_at ?? null };
  if (/글램핑/.test(kcat)) put("GLAMPING", { count: null, grade: "CONFIRMED", ...kc, quote: kcat });
  if (/카라반/.test(kcat)) put("CARAVAN", { count: null, grade: "CONFIRMED", ...kc, quote: kcat });
  if (/오토캠핑/.test(kcat)) put("AUTO", { count: null, grade: "CONFIRMED", ...kc, quote: kcat });
  if (/펜션|민박/.test(kcat)) put("HOUSE", { count: null, grade: "CONFIRMED", ...kc, sub: "펜션", quote: kcat });
  const ncat = String(naver?.category ?? "");
  if (/펜션|민박/.test(ncat) && naver?.link) put("HOUSE", { count: null, grade: "CONFIRMED", src: "naver_local", url: naver.link, at: naver.checked_at ?? null, sub: "펜션", quote: ncat });
  // 3) 고캠핑 소개글
  const intro = [d.intro, d.feature].filter(Boolean).join(" ");
  if (intro && c.gc_url) for (const [code, sub, quote] of typesInText(intro)) put(code, { count: null, grade: "CONFIRMED", src: "gocamping_intro", url: c.gc_url, at: c.modified_at ?? null, sub, quote });
  // 4) 운영자 홈페이지 문장
  if (snippets?.snippets?.length && snippets.url) {
    for (const raw of snippets.snippets) {
      const line = typeof raw === "string" ? raw : raw?.text ?? "";
      const url = (typeof raw === "object" && raw?.url) || snippets.url;
      for (const [code, sub, quote] of typesInText(line)) put(code, { count: null, grade: "OPERATOR", src: "operator_homepage", url, at: snippets.checked_at ?? null, sub, quote });
    }
  }
  return [...best.entries()]
    .map(([code, e]) => ({ code, label: SITE_TYPE_LABEL[code], count: e.count ?? null, sub: e.sub ?? null, grade: e.grade, src: e.src, url: e.url ?? null, at: e.at ?? null, quote: e.quote ?? null }))
    .sort((a, b) => ORDER[a.code] - ORDER[b.code]);
}

/** 카탈로그용 짧은 형태: [[code, count|null, g, sub|null]] (g: c=공식 등록·분류·소개글, o=운영자 홈페이지) */
export const compactTypes = (list) => list.map((t) => [t.code, t.count, t.grade === "OPERATOR" ? "o" : "c", t.sub]);
