// 업장별 “웹 언급” 수집: 네이버 검색 API(블로그·카페·웹문서·지식iN) 결과 요약 + 자동 수집을 허용한 블로그 본문 문장.
// 얻는 것: 업장이 이용자에게 알린 사실(요금·입퇴실·매너타임·주차·전기·사이트 크기·환불 등)을 언급한 짧은 문장과 원문 링크·작성일.
// 원칙(AGENTS.md 데이터 수집 원칙):
//   - 공식 API 결과는 API 조건대로 쓴다(제목·요약·링크·날짜). 본문은 robots.txt가 허용한 곳만, 봇 이름을 밝히고 호스트당 1초 이상 간격으로 읽는다.
//   - robots.txt가 우리 봇을 막거나 AI 수집기(ClaudeBot·GPTBot 등)를 이름으로 막은 호스트, 로그인·봇 차단 플랫폼(네이버 블로그·카페·예약,
//     캠핏 등)은 본문을 읽지 않는다 — 그 통로만 닫혔을 뿐 같은 사실은 API 요약·다른 공개 경로로 채운다.
//   - 본문은 사실 단서가 있는 문장만 잘게(최대 BODY_SENTENCES개, 140자) 남긴다. 후기 본문 전체를 복제하지 않는다.
//   - 모든 문장은 후기 언급(MENTION) 등급이며 원문 URL과 작성일을 함께 둔다. 화면은 지난해 이전 글에 “(YYYY.MM.DD 기준)”을 붙인다.
import { NAVER_HUB_BASE } from "./naver-discovery.mjs";
import { htmlToText, parseRobots, relevantSentences, robotsAllows } from "./operator-site.mjs";
import { stripHtml } from "./social-search.mjs";

export const BOT_UA = "moyeoracampbot/1.0 (+https://pyw31337.github.io/camp/; non-commercial public-interest campground info)";
export const BODY_SENTENCES = 10;

// 네이버 검색 API 종류. HUB 문서마다 경로 표기가 달라 종류별로 순서대로 시도한다(지역 검색과 같은 방식).
export const NAVER_TYPES = {
  blog: { t: "nblog", src: (it) => it.bloggername, date: (it) => it.postdate },
  cafearticle: { t: "ncafe", src: (it) => it.cafename, date: () => null },
  webkr: { t: "web", src: () => null, date: () => null },
  kin: { t: "kin", src: () => "지식iN", date: () => null },
};
export const pathsOf = (type) => [`/search/v1/${type}`, `/search/v1/${type}.json`, `/v1/search/${type}.json`];

// 캠핑장 1곳당 질의 계획. 일반 후기 + 비어 있는 항목(요금·입퇴실·매너타임·전기·환불)을 정밀 겨냥한 질의.
export const QUERY_PLAN = [
  { type: "blog", suffix: "", display: 30 },
  { type: "blog", suffix: '"매너타임"', display: 20 },
  { type: "blog", suffix: '"입실" "퇴실"', display: 20 },
  { type: "blog", suffix: '"600W" 전기', display: 20 },
  { type: "blog", suffix: '"1박" 요금', display: 20 },
  { type: "cafearticle", suffix: '"매너타임" OR "입실"', display: 20 },
  { type: "webkr", suffix: '"환불" 취소', display: 20 },
];

export function naverSearchUrl(path, query, display = 20, sort = "sim") {
  const q = new URLSearchParams({ query, display: String(display), start: "1", sort });
  return `${NAVER_HUB_BASE}${path}?${q}`;
}

const ymd = (s) => (/^\d{8}$/.test(String(s ?? "")) ? `${s.slice(0, 4)}-${s.slice(4, 6)}-${s.slice(6, 8)}` : null);
const httpUrl = (v) => { const s = String(v ?? "").trim(); return /^https?:\/\//i.test(s) ? s : null; };
const clip = (s, n) => { const a = Array.from(String(s)); return a.length > n ? `${a.slice(0, n - 1).join("")}…` : a.join(""); };

/** 네이버 검색 결과 1건 → 공통 문서 {t,title,snippet,url,src,date} (social-search normalizeDoc과 같은 모양) */
export function normalizeNaver(it, type) {
  const spec = NAVER_TYPES[type];
  const url = httpUrl(it?.link);
  const title = stripHtml(it?.title);
  if (!spec || !url || !title) return null;
  return {
    t: spec.t,
    title: clip(title, 120),
    snippet: clip(stripHtml(it?.description), 220) || null,
    url,
    src: stripHtml(spec.src(it) ?? "") || hostLabel(url),
    date: ymd(spec.date(it)),
  };
}

export function hostOf(url) { try { return new URL(url).hostname.toLowerCase(); } catch { return ""; } }
const hostLabel = (url) => hostOf(url).replace(/^(www|m)\./, "") || null;

// 본문을 읽지 않는 곳: 로그인·봇 차단 플랫폼과 AI 수집기를 이름으로 막은 대형 플랫폼(robots 확인 전에 거른다).
const NO_BODY_HOSTS = [
  "naver.com", "naver.me", "campfit.co.kr", "camfit.co.kr", "instagram.com", "facebook.com", "youtube.com", "youtu.be",
  "tiktok.com", "x.com", "twitter.com", "kakao.com", "brunch.co.kr", "threads.net",
];
export function bodyBlockedHost(url) {
  const h = hostOf(url);
  return !h || NO_BODY_HOSTS.some((p) => h === p || h.endsWith(`.${p}`));
}
// 호스트 묶음(같은 서비스는 한 묶음으로 간격을 지킨다): abc.tistory.com → tistory.com
export function hostGroup(url) {
  const h = hostOf(url);
  const parts = h.split(".");
  if (parts.length > 2 && /^(co|or|go|ne|re|pe|ac)$/.test(parts.at(-2))) return parts.slice(-3).join(".");
  return parts.slice(-2).join(".");
}

const AI_AGENTS = /^(claudebot|claude-web|claude-searchbot|anthropic-ai|gptbot|chatgpt-user|oai-searchbot|ccbot|google-extended|perplexitybot|bytespider|meta-externalagent)$/i;
/** robots.txt가 AI 수집기를 이름으로 지정해 전체(/)를 막았는지. 그런 사이트는 데이터 원칙상 본문 자동 수집을 하지 않는다. */
export function robotsBlocksAiByName(txt) {
  let agents = [], lastWasAgent = false;
  for (const raw of String(txt ?? "").split(/\r?\n/)) {
    const line = raw.replace(/#.*/, "").trim();
    const m = line.match(/^([A-Za-z-]+)\s*:\s*(.*)$/);
    if (!m) continue;
    const key = m[1].toLowerCase(), val = m[2].trim();
    if (key === "user-agent") { if (!lastWasAgent) agents = []; agents.push(val); lastWasAgent = true; continue; }
    lastWasAgent = false;
    if (key === "disallow" && val === "/" && agents.some((a) => AI_AGENTS.test(a))) return true;
  }
  return false;
}

/** robots 판정: { ok, reason } */
export function robotsVerdict(txt, path) {
  if (robotsBlocksAiByName(txt)) return { ok: false, reason: "AI_BOTS_BLOCKED" };
  return robotsAllows(parseRobots(txt), path) ? { ok: true, reason: "ALLOWED" } : { ok: false, reason: "ROBOTS_DISALLOWED" };
}

/** 본문 HTML → 사실 단서 문장(최대 n개). 캠핑장 이름이 본문에 없으면(다른 글로 이동·삭제) 빈 배열. */
export function bodySentences(html, { tokens = [], n = BODY_SENTENCES } = {}) {
  const text = htmlToText(html);
  const flat = text.toLowerCase().replace(/\s+/g, "");
  if (tokens.length && !tokens.some((t) => t && flat.includes(t.toLowerCase().replace(/\s+/g, "")))) return [];
  return relevantSentences(text, n * 3)
    .filter((s) => s.length >= 8 && !/댓글|공감|구독|이웃추가|로그인|광고|쿠팡|파트너스|copyright/i.test(s))
    .slice(0, n);
}

/** 문서 + 본문 문장 → 추출기에 넣을 한 덩어리 텍스트(제목·요약·본문) */
export const docText = (d) => [d.title, d.snippet, ...(d.body ?? [])].filter(Boolean).join(" · ");
