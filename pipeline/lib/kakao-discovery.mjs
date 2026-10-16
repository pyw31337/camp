// 카카오 공식 API(로컬 키워드 검색 + Daum 웹 검색)로 캠핑장 장소를 맞추고, 홈페이지가 없는 곳의 운영자 홈페이지 후보를 찾는다.
// - 로컬: 장소 ID·전화·분류·도로명 주소·카카오맵 링크(place_url)만 저장한다. 카카오맵 장소 페이지(place.map.kakao.com)는
//   robots.txt가 AI 크롤러를 명시적으로 막으므로 읽지 않는다(docs/KAKAO_DISCOVERY.md).
// - 웹 검색: 결과의 URL·제목만 근거로 쓴다. 플랫폼·포털 호스트, 여러 캠핑장에 공통으로 나오는 호스트(모음·뉴스 사이트)는 버린다.
import { hostOf, isClosedHost, isOperatorHost } from "./operator-site.mjs";

export const KAKAO_LOCAL_URL = "https://dapi.kakao.com/v2/local/search/keyword.json";
export const KAKAO_WEB_URL = "https://dapi.kakao.com/v2/search/web";
export const DISCOVERY_VERSION = 1;

// 홈페이지 후보에서 뺄 호스트(플랫폼 목록 외): 정부·언론·백과·지도·쇼핑·블로그형 서비스
const NOT_OPERATOR = [
  "go.kr", "or.kr", "re.kr", "visitkorea.or.kr", "wikipedia.org", "namu.wiki", "news", "co.kr/news", "joins.com", "chosun.com",
  "donga.com", "hani.co.kr", "khan.co.kr", "yna.co.kr", "newsis.com", "news1.kr", "mk.co.kr", "hankyung.com", "sedaily.com",
  "kmib.co.kr", "seoul.co.kr", "ohmynews.com", "brunch.co.kr", "velog.io", "github.io", "coupang.com", "11st.co.kr",
  "gmarket.co.kr", "auction.co.kr", "tmon.co.kr", "wemakeprice.com", "interpark.com", "nol.yanolja.com", "trip.com",
  "tripadvisor.co.kr", "tripadvisor.com", "expedia.co.kr", "hotels.com", "kayak.co.kr", "modoo.at", "wixsite.com/blog",
  "campingfirst.co.kr", "camping.or.kr", "imweb.me/blog", "youtube.com", "pinterest.com", "x.com", "twitter.com",
  "threads.net", "kakaocdn.net", "daumcdn.net", "pstatic.net", "map.kakao.com", "dcinside.com", "fmkorea.com", "clien.net",
  "ruliweb.com", "theqoo.net", "82cook.com", "ppomppu.co.kr", "bobaedream.co.kr", "inven.co.kr", "mlbpark.donga.com",
];
const blockedHost = (h) => NOT_OPERATOR.some((p) => (p.includes("/") ? false : h === p || h.endsWith(`.${p}`) || h.includes(`${p}.`)));

const GENERIC = /(오토)?캠핑장|캠핑|글램핑|카라반|야영장|오토|파크|리조트|펜션|빌리지|\s+/g;
/** 비교용 이름 핵심: 괄호·지점 표기·업종어 제거 */
export function nameKey(name) {
  return String(name ?? "")
    .replace(/\[[^\]]*\]|\([^)]*\)|（[^）]*）/g, "")
    .replace(/주식회사|㈜|\(주\)|농업회사법인|영농조합법인/g, "")
    .replace(GENERIC, "")
    .replace(/[^0-9a-z가-힣]/gi, "")
    .toLowerCase();
}

/** 두 이름 핵심의 유사도(0~1): 포함 관계면 1, 아니면 공통 2글자 조각 비율 */
export function nameSimilarity(a, b) {
  const x = nameKey(a), y = nameKey(b);
  if (!x || !y) return 0;
  if (x.includes(y) || y.includes(x)) return Math.min(x.length, y.length) >= 2 ? 1 : 0.5;
  const grams = (s) => new Set(Array.from({ length: Math.max(0, s.length - 1) }, (_, i) => s.slice(i, i + 2)));
  const gx = grams(x), gy = grams(y);
  if (!gx.size || !gy.size) return 0;
  let hit = 0;
  for (const g of gx) if (gy.has(g)) hit++;
  return (2 * hit) / (gx.size + gy.size);
}

const digits = (s) => String(s ?? "").replace(/\D/g, "");
const CAMP_CATEGORY = /캠핑|야영|글램핑|카라반|오토캠핑|숙박|휴양림|펜션/;

/** 로컬 키워드 검색 결과 중 이 캠핑장으로 볼 장소 하나(또는 null). 전화 일치 > 이름+거리+분류. */
export function matchPlace(c, docs) {
  const tel = digits(c.tel);
  let best = null;
  for (const d of docs ?? []) {
    const sim = nameSimilarity(c.name, d.place_name);
    const dist = Number(d.distance);
    const phone = Boolean(tel && tel.length >= 8 && digits(d.phone) === tel);
    const camp = CAMP_CATEGORY.test(d.category_name ?? "");
    let score = sim * 60 + (phone ? 50 : 0) + (camp ? 15 : 0);
    if (Number.isFinite(dist)) score += dist <= 300 ? 20 : dist <= 1000 ? 12 : dist <= 3000 ? 4 : -20;
    const ok = phone ? sim >= 0.3 || (Number.isFinite(dist) && dist <= 1000) : sim >= 0.6 && camp && (!Number.isFinite(dist) || dist <= 3000);
    if (ok && (!best || score > best.score)) best = { d, score, sim, phone, dist: Number.isFinite(dist) ? dist : null };
  }
  if (!best) return null;
  const { d } = best;
  return {
    id: String(d.id), name: d.place_name, category: d.category_name ?? null, phone: d.phone || null,
    road_address: d.road_address_name || null, address: d.address_name || null, url: d.place_url || null,
    x: Number(d.x) || null, y: Number(d.y) || null,
    match: { score: Math.round(best.score), name: Number(best.sim.toFixed(2)), phone: best.phone, distance_m: best.dist },
  };
}

const strip = (s) => String(s ?? "").replace(/<[^>]+>/g, "").replace(/&[a-z]+;|&#\d+;/g, " ");
/** 웹 검색 결과 → 호스트별 후보(점수순). 제목·본문 요약에 이름 핵심이 있어야 한다. */
// 기사·블로그 글·구인·숙박 중개처럼 “캠핑장 소개 글”이지 운영자 사이트가 아닌 주소(2026-10-16 첫 실행에서 후보의 약 80%).
const ARTICLE_URL = /\/(news|article|articleview|articles|post|posts|blog|wpblog|story|column|press|bodo|jobs?|recruit|zf_user|content\/view|detail\.php|view\.php\?(no|number)=)|articleView\.html|article\.php|\/20\d\d\/\d\d\/|\/(category|tag)\/|%[0-9a-f]{2}%[0-9a-f]{2}%[0-9a-f]{2}.*%[0-9a-f]{2}%[0-9a-f]{2}%[0-9a-f]{2}/i;
const CONTENT_HOST = /news|times|timez|ilbo|daily|media|press|journal|magazine|tv\b|mbc|kbs|sbs|jtbc|ytn|blog|tistory|wiki|review|trend|keyword|policy|travel|trip|tour|hotel|stay|booking|saramin|catch\.co|jobkorea|ok114|danawa|nate\.com|chosun|joins|donga|hani|khan|segye|nongmin|anewsa|knews|ketv|tjb|issue|info|guide|life|lemon|picjjang|honey|carview|airunwp|apps?\b/i;
// 후기·안내 글 제목(운영자가 자기 사이트 제목으로 쓰지 않는 말)
export const ARTICLE_TITLE = /후기|방문기|다녀|다녀온|추천|방법|정리|가이드|총정리|꿀팁|팁|축제|페스타|이벤트|모집|채용|구인|기사|선정|개장|개소|준공|인기|각광|명소|여행|가볼만|비교|순위|best|top\s?\d/i;
/** 운영자 사이트가 아니라 소개 글·기사로 보이는 주소 */
export function looksLikeArticle(url) {
  let u;
  try { u = new URL(url); } catch { return true; }
  const h = u.hostname.replace(/^(www|m)\./, "");
  return ARTICLE_URL.test(u.pathname + u.search) || CONTENT_HOST.test(h);
}

export function homepageCandidates(c, docs) {
  const key = nameKey(c.name);
  if (key.length < 2) return [];
  const byHost = new Map();
  for (const d of docs ?? []) {
    const url = d.url;
    const h = hostOf(url)?.replace(/^www\./, "");
    if (!h || !isOperatorHost(url) || isClosedHost(url) || blockedHost(h) || looksLikeArticle(url)) continue;
    const title = strip(d.title), body = strip(d.contents);
    const inTitle = nameSimilarity(c.name, title) >= 0.8 || nameKey(title).includes(key);
    const inBody = nameKey(body).includes(key);
    if (!inTitle && !inBody) continue;
    if (ARTICLE_TITLE.test(title)) continue;
    let path = "/";
    try { path = new URL(url).pathname; } catch { /* 그대로 */ }
    const e = byHost.get(h) ?? { host: h, url: null, score: 0, hits: 0, evidence: [] };
    e.hits++;
    e.score += (inTitle ? 10 : 4) + (path === "/" || path === "" ? 4 : 0) + (nameKey(h).length >= 3 && key.includes(nameKey(h).slice(0, 4)) ? 6 : 0);
    if (!e.url || path === "/" || path.length < new URL(e.url).pathname.length) e.url = url;
    if (e.evidence.length < 3) e.evidence.push({ title: title.slice(0, 80), url });
    byHost.set(h, e);
  }
  return [...byHost.values()].sort((a, b) => b.score - a.score);
}

/** 여러 캠핑장 후보에 반복해 나오는 호스트(모음·뉴스·지자체 통합 사이트)를 걸러 최종 홈페이지를 고른다. */
export function pickHomepages(candidatesById, { maxShare = 1, minScore = 10 } = {}) {
  const hostCamps = new Map();
  for (const [id, list] of Object.entries(candidatesById)) for (const e of list ?? []) {
    (hostCamps.get(e.host) ?? hostCamps.set(e.host, new Set()).get(e.host)).add(id);
  }
  const shared = new Set([...hostCamps].filter(([, s]) => s.size > maxShare).map(([h]) => h));
  const out = {};
  for (const [id, list] of Object.entries(candidatesById)) {
    const top = (list ?? []).find((e) => !shared.has(e.host) && e.score >= minScore);
    out[id] = top ? { url: top.url, host: top.host, score: top.score, evidence: top.evidence } : null;
  }
  return { picked: out, shared: [...shared].sort() };
}

/** 카카오 API 호출 1회. 한도 초과는 code=RATE_LIMIT, 인증 실패는 code=AUTH. */
export async function kakaoGet(url, { key, fetchImpl = fetch, timeoutMs = 10000 }) {
  const res = await fetchImpl(url, { headers: { Authorization: `KakaoAK ${key}` }, signal: AbortSignal.timeout(timeoutMs) });
  if (!res.ok) {
    const body = (await res.text().catch(() => "")).slice(0, 200);
    const e = new Error(`카카오 HTTP ${res.status}: ${body}`);
    e.code = res.status === 429 || /"code"\s*:\s*-10\b|limit|quota|exceed/i.test(body) ? "RATE_LIMIT" : res.status === 401 || res.status === 403 ? "AUTH" : "HTTP";
    throw e;
  }
  const j = await res.json();
  return Array.isArray(j?.documents) ? j.documents : [];
}

export const localUrl = (c) => {
  const q = new URLSearchParams({ query: String(c.name ?? "").replace(/\[[^\]]*\]\s*/g, "").trim(), size: "15" });
  if (Number.isFinite(c.lng) && Number.isFinite(c.lat)) { q.set("x", String(c.lng)); q.set("y", String(c.lat)); q.set("radius", "5000"); q.set("sort", "accuracy"); }
  return `${KAKAO_LOCAL_URL}?${q}`;
};
export const webUrl = (c) => {
  const name = String(c.name ?? "").replace(/\[[^\]]*\]\s*/g, "").trim();
  const q = new URLSearchParams({ query: `${name} ${c.sigungu ?? ""} 예약`.trim(), size: "30", sort: "accuracy" });
  return `${KAKAO_WEB_URL}?${q}`;
};

/** 운영자 홈페이지가 이미 있는 곳(고캠핑 등록 홈페이지나 예약 URL이 운영자 호스트이고 종료 서비스가 아님) */
export const hasOperatorSite = (c) => [c.homepage, c.booking?.url].some((u) => u && isOperatorHost(u) && !isClosedHost(u));

// 읽어 온 문장이 정말 그 캠핑장 운영자 사이트인지: 이름 핵심이 나오고, 운영 규칙 문장이 2개 이상.
const RULE_SENTENCE = /입실|퇴실|체크\s*인|체크\s*아웃|매너\s*타임|환불|취소\s*(규정|수수료)|1박|사이트\s*요금|이용\s*요금|예약\s*안내|반려(견|동물)|전기\s*(사용|용량)/;
export function validatesAsOperatorSite(c, snippets = []) {
  const key = nameKey(c.name);
  const texts = snippets.map((s) => (typeof s === "string" ? s : s.text ?? ""));
  const named = key.length >= 2 && texts.some((t) => nameKey(t).includes(key));
  const rules = texts.filter((t) => RULE_SENTENCE.test(t)).length;
  return { ok: named && rules >= 3, named, rules };
}
