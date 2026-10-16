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
const RELEVANT = /입실|퇴실|체크\s*인|체크\s*아웃|얼리|레이트|매너\s*타임|소등|전기|전력|와트|\d\s*(?:w|kw)\b|주차|차량|차박|오토\s*캠핑|장작|숯|화로|불멍|직화|반려|애견|인원\s*추가|추가\s*인원|방문객|대여|렌탈|할인|연박|2박|샤워|온수|사이트\s*크기|\d+\s*[x×*]\s*\d+/i;
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
    if (/전기|전력|전원|전열|사용\s*량|와트|\d\s*kw/i.test(s) && !/발전|태양광|충전소|충전기/.test(s)) {
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
      const side = (/(사이트|텐트|데크|글램핑|카라반)\s*(바로\s*)?(옆|내|안)\s*(에\s*)?(차량\s*)?주차(?!장)/.test(s) || /차량\s*(진입|입차)\s*(이\s*)?가능/.test(s)) && !ZONE_ONLY.test(s);
      const external = /주차장(에|에서)?\s*주차\s*(후|하시고|하신\s*후)[^.]{0,20}(수레|카트|리어카|짐|도보|이동)|(?<!잔디밭?(에|의)?\s*)차량\s*(진입|출입)\s*(이\s*)?(불가|금지)|사이트\s*(내|옆)\s*주차[^.]{0,8}(금지|불가)/.test(s) && !/잔디/.test(s);
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
