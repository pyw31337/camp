// 캠핑장 운영자 자체 홈페이지에서 “선택에 필요한 사실” 문장만 골라내는 도구.
// 원칙(docs/OPERATOR_SITE_FACTS.md):
// - 운영자가 스스로 공개한 자기 홈페이지만 읽는다. 예약·리뷰 플랫폼(네이버·캠핏·땡큐캠핑·인스타그램 등)은
//   이용약관상 자동 수집을 하지 않는다. robots.txt가 막은 경로는 읽지 않는다.
// - 페이지 전문을 저장하지 않는다. 판단에 필요한 짧은 문장(≤140자)과 원문 URL·확인 시각만 남긴다.
// - 문장에서 꺼낸 값은 등급 OPERATOR_SITE(운영자 공개 문장, 자동 추출)다. 사람이 대조한 VERIFIED와 섞지 않는다.

import { sentences } from "./spec-extractor.mjs";

// 운영자 소유가 아닌 플랫폼 도메인. 여기에 걸리면 읽지 않는다.
export const PLATFORM_HOSTS = [
  "naver.com", "naver.me", "daum.net", "kakao.com", "instagram.com", "facebook.com", "youtube.com", "youtu.be",
  "band.us", "tistory.com", "blogspot.com", "camfit.co.kr", "camfit.kr", "thankqcamping.com", "campingt.me",
  "campingtalk.me", "onda.me", "yanolja.com", "yeogi.com", "goodchoice.kr", "ticketplay.zone", "letsnowgo.com",
  "zapza.me", "penbang.com", "linktr.ee", "google.com", "booking.com", "agoda.com", "airbnb.co.kr", "airbnb.com",
  "forest.go.kr", "foresttrip.go.kr", "gocamping.or.kr", "knps.or.kr", "reservation.knps.or.kr",
];

export function hostOf(url) {
  try { return new URL(/^[a-z]+:\/\//i.test(url) ? url : `http://${url}`).hostname.toLowerCase(); } catch { return null; }
}
// 운영이 끝난 홈페이지 빌더(네이버 modoo!는 2025-06-26 종료). 고캠핑 등록 홈페이지가 낡아 남아 있다.
export const CLOSED_HOSTS = ["modoo.at"];
export function isClosedHost(url) { const h = hostOf(url); return Boolean(h && CLOSED_HOSTS.some((p) => h === p || h.endsWith(`.${p}`))); }
export function isOperatorHost(url) {
  const h = hostOf(url);
  if (!h) return false;
  return !PLATFORM_HOSTS.some((p) => h === p || h.endsWith(`.${p}`));
}

/** robots.txt에서 User-agent: * (또는 우리 봇) 묶음의 Disallow/Allow를 읽는다. */
export function parseRobots(txt, agent = "moyeoracampbot") {
  const groups = [];
  let cur = null, lastWasAgent = false;
  for (const raw of String(txt ?? "").split(/\r?\n/)) {
    const line = raw.replace(/#.*/, "").trim();
    const m = line.match(/^([A-Za-z-]+)\s*:\s*(.*)$/);
    if (!m) continue;
    const key = m[1].toLowerCase(), val = m[2].trim();
    if (key === "user-agent") {
      if (!lastWasAgent) { cur = { agents: [], rules: [] }; groups.push(cur); }
      cur.agents.push(val.toLowerCase()); lastWasAgent = true;
    } else {
      lastWasAgent = false;
      if (cur && (key === "disallow" || key === "allow")) cur.rules.push({ allow: key === "allow", path: val });
    }
  }
  const mine = groups.find((g) => g.agents.some((a) => a !== "*" && agent.includes(a)));
  const star = groups.find((g) => g.agents.includes("*"));
  return (mine ?? star)?.rules ?? [];
}
const ruleRe = (p) => new RegExp(`^${p.replace(/[.+?^${}()|[\]\\]/g, "\\$&").replace(/\*/g, ".*").replace(/\\\$$/, "$")}`);
export function robotsAllows(rules, path) {
  let best = null;
  for (const r of rules) {
    if (!r.path) continue; // 빈 Disallow = 모두 허용
    if (ruleRe(r.path).test(path) && (!best || r.path.length > best.path.length || (r.path.length === best.path.length && r.allow))) best = r;
  }
  return best ? best.allow : true;
}

/** HTML → 줄 단위 텍스트. 스크립트·스타일·주석을 지우고 블록 태그를 줄바꿈으로 바꾼다. */
export function htmlToText(html) {
  return String(html ?? "")
    .replace(/<!--[\s\S]*?-->/g, " ")
    .replace(/<(script|style|noscript|svg)[\s\S]*?<\/\1>/gi, " ")
    .replace(/<br\s*\/?>|<\/(p|div|li|tr|h[1-6]|dd|dt|section|article|table)>/gi, "\n")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ").replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&#39;/g, "'")
    .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n)))
    .replace(/[ \t\f\v]+/g, " ")
    .replace(/\n\s*\n+/g, "\n")
    .trim();
}

const GUIDE_TEXT = /이용\s*안내|이용\s*규칙|이용\s*요금|요금|시설\s*안내|캠핑장\s*안내|사이트\s*안내|예약\s*안내|공지|유의\s*사항|주의\s*사항|faq|자주\s*묻는|오시는|소개/i;
const GUIDE_HREF = /guide|info|rule|notice|price|fee|facility|faq|use|about|intro|board|sub0?\d|page/i;
const SKIP_HREF = /\.(jpg|jpeg|png|gif|webp|pdf|zip|hwp|mp4)(\?|$)|^(mailto|tel|javascript):|#$/i;

/** 같은 호스트 안에서 이용 안내 성격의 링크·프레임을 찾는다. */
export function guideLinks(html, baseUrl, max = 5) {
  const base = new URL(baseUrl);
  const out = new Map();
  const push = (href, score) => {
    if (!href || SKIP_HREF.test(href)) return;
    let u; try { u = new URL(href, base); } catch { return; }
    if (u.hostname !== base.hostname || !/^https?:$/.test(u.protocol)) return;
    u.hash = "";
    const k = u.toString();
    if (k === base.toString()) return;
    out.set(k, Math.max(out.get(k) ?? 0, score));
  };
  for (const m of String(html).matchAll(/<i?frame[^>]+src\s*=\s*["']?([^"' >]+)/gi)) push(m[1], 10);
  for (const m of String(html).matchAll(/<a\b[^>]*href\s*=\s*["']?([^"' >]+)["']?[^>]*>([\s\S]*?)<\/a>/gi)) {
    const text = htmlToText(m[2]).slice(0, 40);
    const score = (GUIDE_TEXT.test(text) ? 5 : 0) + (GUIDE_HREF.test(m[1]) ? 1 : 0);
    if (score) push(m[1], score);
  }
  return [...out.entries()].sort((a, b) => b[1] - a[1]).slice(0, max).map(([k]) => k);
}

// 선택에 쓰이는 문장만 남긴다(전문 저장 금지).
// 2026-10-19: 이용 규칙(금지·제한·수칙)·운영 안내 문장도 남긴다(업장 규칙 노출, build-house-rules.mjs).
const RELEVANT = /금지|불가|삼가|사절|제한|수칙|유의\s*사항|주의\s*사항|준수|미성년|보호자|방문객|음주|고성|소음|음향|스피커|흡연|금연|폭죽|불꽃|휴장|휴무|공지|운영\s*시간|이용\s*시간|입실|퇴실|체크\s*인|체크\s*아웃|얼리|레이트|매너\s*타임|소등|전기|전력|와트|\d\s*(?:w|kw)\b|주차|차량|차박|오토\s*캠핑|장작|숯|화로|불멍|직화|반려|애견|강아지|인원\s*추가|추가\s*인원|방문객|대여|렌탈|할인|연박|2박|샤워|온수|사이트\s*크기|\d+\s*[x×*]\s*\d+|요금|이용료|\d[\d,]*\s*원|1박|성수기|비수기|평일|주말|공휴일|와이파이|wi-?fi|매점|편의점|수영장|물놀이|트램|방방|키즈|놀이터|개수대|화장실|쓰레기|분리수거|운영\s*기간|휴장|동계|난방|환불|취소|데크|복층|타프\s*존|글램핑|카라반|캠핑카|트레일러|캐빈|방갈로|펜션|독채|오두막|하우스|코티지|솔로|백패킹|티피|설치형|사이트\s*(구성|안내|현황|종류|소개)|[A-Z]\s*(구역|존|사이트)/i;
export function relevantSentences(text, limit = 60) {
  const seen = new Set(), out = [];
  for (const s of sentences(text)) {
    if (s.length > 140 || !RELEVANT.test(s) || seen.has(s)) continue;
    seen.add(s); out.push(s);
    if (out.length >= limit) break;
  }
  return out;
}

const NUM = (s) => Number(String(s).replace(/[,\s]/g, ""));

// 질문(FAQ 제목)·부분 금지(텐트 안·데크 위·강풍 시 등)·조리 도구 문장은 시설 전체 규칙이 아니다.
const QUESTION = /\?\s*$|[가-힣]나요\s*$|까요\s*\??$/;
const NEG = /불가|금지|안\s*됩|안\s*돼|안\s*되|없습니다|없어요|제한|자제|삼가|문의|확인\s*바/;
// “C타입만”, “일부 구역” 같은 구역 한정 문장은 시설 전체 값이 아니다.
const ZONE_ONLY = /(타입|구역|존|동|호|사이트)\s*만|에서만|일부|지정/;
const PARTIAL_FIRE = /밀폐|텐트\s*(안|내)|실내|객실|데크\s*위|잔디|냄비|후라이팬|프라이팬|강풍|우천|날씨|기간|\d+\s*월|산불|건조|소화|불씨|재\b/;

/**
 * 문장 묶음에서 배지에 쓰는 핵심 사실(전력 W·주차 방식·차박·불멍 종류)을 꺼낸다.
 * 값마다 근거 문장(quote)을 함께 둔다. 서로 어긋나는 문장이 있으면 값을 비우고 conflict로 남긴다.
 * 규칙은 보수적이다: 시설 전체에 적용되는 단정문만 받는다(질문·부분 금지·요금 문장은 버린다).
 */
export function extractSiteFacts(lines) {
  const facts = {};
  const add = (code, value, quote) => {
    const f = (facts[code] ??= { values: new Map() });
    const key = JSON.stringify(value);
    if (!f.values.has(key)) f.values.set(key, { value, quote });
  };
  for (const s of lines) {
    if (QUESTION.test(s)) continue;
    // 전력 W: “전기 600W 이하”, “최대 1kw”, “1,000와트까지”. 300~3,000W만 받는다.
    // “전력은 1,100w까지이며 … 전기차 충전기 사용 금지”처럼 충전기를 금지하는 문장은 받는다.
    if (/전기|전력|전원|전열|사용\s*량|와트|\d\s*kw/i.test(s) && !/발전|태양광|충전소/.test(s) && !(/충전기/.test(s) && !/금지|불가|까지|이하/.test(s))) {
      const w = s.match(/(\d{1,2}[,.]?\d{3}|\d{3,4})\s*(?:w|와트)(?![a-z])/i);
      const kw = s.match(/(\d(?:\.\d)?)\s*(?:kw|킬로와트)/i);
      const val = w ? NUM(w[1].replace(".", "")) : kw ? Math.round(Number(kw[1]) * 1000) : null;
      if (val && val >= 300 && val <= 3000) add("POWER_W", val, s);
    }
    // 차박: 긍정·부정이 한 문장에 섞이면(구역별 다름) 버린다.
    if (/차박/.test(s) && !/개조|캠핑카\s*대여|렌트/.test(s)) {
      const no = /차박[^.]{0,14}(불가|금지|입장\s*불가|출입\s*금지|안\s*됩)|(불가|금지)[^.]{0,6}차박/.test(s);
      const yes = /차박\s*(이\s*)?(가능|사이트|존|전용|구역|캠핑\s*가능|환영)|차박[^.]{0,10}(즐기실|이용\s*가능|가능합니다)/.test(s);
      if (no && !yes) add("CAR_CAMPING", false, s);
      else if (yes && !no && !/불가능|금지/.test(s)) add("CAR_CAMPING", true, s);
    }
    // 주차 방식
    if (/주차|차량/.test(s)) {
      // “사이트 바로 앞 개별 주차가 가능”, “캠핑사이트 바로 옆으로 자차 주차”, “사이트별 개별 주차 가능”(2026-10-16 보강)
      const side = (/(사이트|텐트|데크|글램핑|카라반)\s*(바로\s*)?(옆|내|안)\s*(에\s*)?(차량\s*)?주차(?!장)/.test(s)
        || /(사이트|텐트|데크)\s*(바로\s*)?(앞|옆)(에|으로)?\s*((개별|자차|차량|차를|자동차)\s*)+주차\s*(가|를|할|하|이)/.test(s)
        || /(사이트|텐트)\s*별\s*(개별\s*)?(차량\s*)?주차\s*(가|이)?\s*가능/.test(s)
        || /차량\s*(진입|입차)\s*(이\s*)?가능/.test(s)) && !ZONE_ONLY.test(s);
      const external = (/주차장(에|에서)?\s*주차\s*(후|하시고|하신\s*후)[^.]{0,20}(수레|카트|리어카|짐|도보|이동)|(?<!잔디밭?(에|의)?\s*)차량\s*(진입|출입)\s*(이\s*)?(불가|금지)|사이트\s*(내|옆)\s*주차[^.]{0,8}(금지|불가)/.test(s)
        || /캠핑장\s*내(에는|에서는|에)?\s*(차량\s*)?주차(가|는)?\s*(불가|금지)/.test(s)
        || /(짐|장비)[^.]{0,20}(내린|내려\s*놓은|하차한?)\s*(후|뒤)[^.]{0,25}주차장[^.]{0,10}(이동|주차)/.test(s)) && !/잔디/.test(s);
      // “차량진입금지”처럼 맥락 없는 짧은 문장은 어느 구역 얘기인지 알 수 없어 받지 않는다.
      if (external && !side && s.replace(/[\s\-–·•*※]/g, "").length >= 14) add("PARKING", "EXTERNAL", s);
      else if (side && !external && !NEG.test(s.replace(/추가\s*차량[^.]*/, ""))) add("PARKING", "SITE_SIDE", s);
    }
    // 불멍 종류(시설 전체 규칙만)
    if (/장작|숯|차콜|화로|불멍|모닥불|화목|화기/.test(s) && !PARTIAL_FIRE.test(s)) {
      const charcoalOnly = /(숯|숯불|차콜)\s*만\s*(을\s*)?(사용|가능|허용|이용)|장작[^.]{0,15}(금지|불가)[^.]{0,20}숯[^.]{0,8}(가능|사용)/.test(s);
      const noFire = /(모든|개인)\s*(숯[,\s]*장작\s*)?화기[^.]{0,15}(금지|불가)|화기\s*(사용|반입)\s*(전면\s*)?(금지|불가)|(숯|장작)\s*(및|,|·|과|와)\s*(숯|장작)[^.]{0,12}(반입|사용)\s*(이\s*)?(금지|불가)/.test(s);
      const woodYes = /(장작|불멍|모닥불|화목)[^.]{0,12}(가능|허용|즐기실)/.test(s) && !/불가|금지|안\s*됩|허용\s*안|제한/.test(s) && !ZONE_ONLY.test(s);
      if (charcoalOnly) add("FIRE", "CHARCOAL_ONLY", s);
      else if (noFire && !woodYes) add("FIRE", "NO_FIRE", s);
      else if (woodYes) add("FIRE", "FIREWOOD_OK", s);
    }
  }
  const out = {};
  for (const [code, f] of Object.entries(facts)) {
    const vals = [...f.values.values()];
    if (code === "POWER_W") {
      // 여러 W가 나오면(구역별 등) 가장 낮은 값을 보수적으로, 범위로 함께 남긴다.
      const ws = vals.map((v) => v.value).sort((a, b) => a - b);
      out[code] = { value: ws[0], max: ws.at(-1), quote: vals.find((v) => v.value === ws[0]).quote };
    } else if (vals.length === 1) out[code] = { value: vals[0].value, quote: vals[0].quote };
    else out[code] = { value: null, conflict: vals.map((v) => ({ value: v.value, quote: v.quote })) };
  }
  return out;
}

// ---------- 상세 사실(v2, 2026-10-16): 요금·편의시설 운영·운영 기간·환불 ----------
const WON = /(\d{1,3}(?:\s?,\s?\d{3})+|\d{4,6})\s*원|(\d{1,2})\s*만\s*(\d{1,4})?\s*천?\s*원/g;
const wonOf = (m) => m[1] ? Number(m[1].replace(/[\s,]/g, "")) : Number(m[2]) * 10000 + (m[3] ? Number(m[3]) * (m[3].length <= 1 ? 1000 : 1) : 0);
const amounts = (s) => [...s.matchAll(WON)].map(wonOf).filter((n) => n > 0);
// 기본 숙박 요금이 아닌 ‘추가·부대’ 요금 문장
const EXTRA_FEE = /추가|인원|1\s*인|인당|차량|대당|방문|대여|렌탈|그릴|숯|장작|불멍|모닥불|세트|셋트|바베?큐|바비큐|할인|청소|세탁|배상|보증|위반|부과|전기\s*(료|사용|요금)|시간당|1\s*시간|마리|이불|체험|입장|수수료|환불|취소|위약|쓰레기|충전|샤워|온수|코인|매점|판매|구매|쿠폰|적립|포인트/;
const NIGHT_CUE = /1\s*박|박\s*당|평일|주말|금요일|토요일|일요일|공휴일|성수기|비수기|극성수기|사이트|텐트|오토|데크|파쇄석|글램핑|카라반|캠핑장|이용\s*요금|이용료|기본\s*요금|객실/;
const SEASON_LABEL = [["극성수기", /극성수기/], ["성수기", /(?<!비)성수기/], ["비수기", /비수기/], ["주말", /주말|토요일|금요일|공휴일|휴일\s*전날/], ["평일", /평일|일~목|일요일~목요일/]];

const AMENITY_RULES = [
  ["WIFI", "와이파이", /와이파이|wi-?fi/i, /안\s*됩|불가|없습니다|없어요/],
  ["STORE", "매점", /매점|편의점/, /없습니다|없어요|운영하지\s*않/],
  ["POOL", "수영장·물놀이장", /수영장|물놀이장|풀장/, /없습니다|운영하지\s*않|미운영/],
  ["TRAMPOLINE", "트램펄린", /트램|방방|트렘/, /없습니다/],
  ["HOT_WATER", "온수", /온수/, /안\s*나|나오지\s*않|없습니다/],
  ["PLAYGROUND", "놀이터·키즈", /놀이터|키즈\s*(존|카페|룸)|어린이\s*놀이/, /없습니다/],
  ["PRIVATE_TOILET", "개별 화장실·샤워", /개별\s*(화장실|샤워|욕실)|개인\s*(화장실|샤워)|전용\s*(화장실|샤워)/, /없습니다/],
  ["DISHWASH", "개수대", /개수대|설거지/, /없습니다/],
];

/**
 * 운영자 문장에서 요금·편의시설·운영 기간·환불 규정을 꺼낸다(출처 문장 함께).
 * - SITE_PRICE: 기본 숙박 요금(1박, 2만~40만원). 추가·부대 요금 문장은 뺀다. 연박 합계(2박 9만5천원 등)도 뺀다.
 * - FIRE_SET_FEE·BBQ_SET_FEE·ELECTRIC_FEE·PET_FEE: 부대 요금
 * - AMENITIES: 운영 문장이 있는 편의시설(부정 문장은 제외)
 * - SEASON: 동계·기간 휴장 / 연중 운영, REFUND: 취소·환불 규정 문장
 */
export function extractSiteDetails(lines) {
  const out = { SITE_PRICE: null, FIRE_SET_FEE: null, BBQ_SET_FEE: null, ELECTRIC_FEE: null, PET_FEE: null, AMENITIES: [], SEASON: null, REFUND: null };
  const prices = [];
  const fee = (code, s, re) => { if (out[code] || !re.test(s)) return; const n = amounts(s).find((x) => x >= 1000 && x <= 200000); if (n) out[code] = { amount: n, quote: s }; };
  for (const s of lines) {
    if (QUESTION.test(s)) continue;
    const ams = amounts(s);
    if (ams.length) {
      fee("FIRE_SET_FEE", s, /(불멍|모닥불|화롯대|화로대|캠프\s*파이어)[^.]{0,20}(세트|셋트|이용)|장작\s*\d+\s*kg/);
      fee("BBQ_SET_FEE", s, /(바베?큐|바비큐|숯불|그릴)[^.]{0,20}(세트|셋트|이용\s*요금|이용료)/);
      fee("ELECTRIC_FEE", s, /전기\s*(사용|요금|료)/);
      fee("PET_FEE", s, /(반려견|반려동물|애견|강아지)[^.]{0,20}(요금|비용|마리당|1\s*마리)/);
      // 기본 숙박 요금
      // “주말 45,000원 (텐트1동 + 차량1대 + 4인)”처럼 괄호 안 구성 설명은 추가 요금 단서로 보지 않는다.
      const bare = s.replace(/\([^)]*\)/g, " ");
      // 단, 숯·그릴·장작·얼리 체크인·할인 같은 부대 요금 단서는 괄호 안에 있어도 기본 요금이 아니다.
      const STRONG_EXTRA = /숯|그릴|장작|화로|불멍|모닥불|바베?큐|바비큐|얼리|레이트|체크\s*인|체크\s*아웃|할인|시간/;
      if (!EXTRA_FEE.test(bare) && !STRONG_EXTRA.test(s) && !/[2-9]\s*박\s*[^당]?\s*\d/.test(s) && (NIGHT_CUE.test(s) || /^[\s\-·•]*\d[\d,]*\s*원/.test(s))) {
        for (const n of ams) if (n >= 20000 && n <= 400000) prices.push({ amount: n, label: SEASON_LABEL.find(([, re]) => re.test(s))?.[0] ?? null, quote: s });
      }
    }
    for (const [code, label, re, neg] of AMENITY_RULES) {
      if (re.test(s) && !neg.test(s) && !out.AMENITIES.some((a) => a.code === code)) {
        const period = s.match(/(\d{1,2})\s*월\s*(\d{1,2}\s*일)?\s*[~\-–]\s*(\d{1,2})\s*월/);
        out.AMENITIES.push({ code, label, quote: s, ...(period ? { period: `${period[1]}월~${period[3]}월` } : {}) });
      }
    }
    if (!out.SEASON) {
      if (/동계\s*(기간\s*)?(휴장|휴업|운영\s*중단)|(\d{1,2})\s*월[^.]{0,12}휴장|휴장\s*기간/.test(s)) out.SEASON = { value: "SEASONAL_CLOSURE", quote: s };
      else if (/연중\s*무휴|사계절\s*운영|365\s*일\s*운영|동계\s*(캠핑\s*)?운영/.test(s)) out.SEASON = { value: "YEAR_ROUND", quote: s };
    }
    if (!out.REFUND && /(?:취소|환불|위약금)[^.]{0,30}?(?:수수료|위약|\d+\s*%|일\s*전|불가|불가능|기준|안내|규정|정책|전액|공제)/.test(s)) out.REFUND = { quote: s };
  }
  if (prices.length) {
    const ns = prices.map((p) => p.amount).sort((a, b) => a - b);
    out.SITE_PRICE = { min: ns[0], max: ns.at(-1), items: prices.slice(0, 8) };
  }
  return out;
}

const NOTICE_TITLE = /공지|알림|안내|휴장|휴무|운영|공사|오픈|개장|폐장|예약|성수기|변경|중단|재개|이벤트|할인/;
const NOTICE_DATE = /(20\d{2}|\d{2})\s*[-./]\s*(\d{1,2})\s*[-./]\s*(\d{1,2})/;
/**
 * 공지 게시판 목록에서 글 제목·링크·날짜를 꺼낸다(같은 호스트 링크만, 최대 max개).
 * 게시판 줄은 보통 <tr>/<li> 안에 제목 링크와 날짜가 함께 있다 — 링크 뒤 300자 안의 날짜를 쓴다.
 */
export function noticeLinks(html, pageUrl, max = 12) {
  const base = new URL(pageUrl), out = [], seen = new Set();
  const src = String(html ?? "");
  for (const m of src.matchAll(/<a\b[^>]*href\s*=\s*["']?([^"' >]+)["']?[^>]*>([\s\S]*?)<\/a>/gi)) {
    const title = htmlToText(m[2]).replace(/\s+/g, " ").trim();
    if (title.length < 6 || title.length > 80 || !NOTICE_TITLE.test(title) || /전체\s*보기|더\s*보기|목록|바로\s*가기|^공지\s*사항$/.test(title) || SKIP_HREF.test(m[1])) continue;
    let u; try { u = new URL(m[1].replace(/&amp;/g, "&"), base); } catch { continue; }
    if (u.hostname !== base.hostname || !/^https?:$/.test(u.protocol)) continue;
    // 게시글 주소처럼 보이는 링크만(글 번호·idx·wr_id·seq·no 등)
    if (!/(wr_id|idx|seq|no|num|uid|id|bbs|board|notice|article|view|read|post|document_srl|b_no)\b|\/\d{2,}(\/|$|\?)/i.test(u.pathname + u.search)) continue;
    u.hash = "";
    const key = u.toString();
    if (seen.has(key) || key === base.toString()) continue;
    const tail = htmlToText(src.slice(m.index + m[0].length, m.index + m[0].length + 400)).slice(0, 120);
    const d = tail.match(NOTICE_DATE) ?? title.match(NOTICE_DATE);
    let date = null;
    if (d) {
      const y = d[1].length === 2 ? `20${d[1]}` : d[1], mo = Number(d[2]), dd = Number(d[3]);
      if (mo >= 1 && mo <= 12 && dd >= 1 && dd <= 31) date = `${y}-${String(mo).padStart(2, "0")}-${String(dd).padStart(2, "0")}`;
    }
    // 날짜가 없으면 [공지]·공지로 시작하는 제목만(메뉴 링크 거르기)
    if (!date && !/^[\[［(【<]?\s*(공지|알림)/.test(title)) continue;
    seen.add(key);
    out.push({ title: title.replace(NOTICE_DATE, " ").replace(/\s+/g, " ").trim(), url: key, date });
    if (out.length >= max) break;
  }
  return out;
}
