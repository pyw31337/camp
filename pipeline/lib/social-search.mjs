// 캠핑장별 “사람들이 남긴” 블로그·카페 글, 이미지, 동영상 링크를 카카오(Daum) 검색 REST API로 모은다.
// 이 파일은 정규화·관련성 판정 같은 순수 함수와, fetch를 주입받는 얇은 호출 함수만 둔다(파일 입출력은 scripts/sync-social.mjs).
//
// 원칙(AGENTS.md 4번, docs/SOCIAL_SEARCH.md):
// - 메타데이터와 원문·썸네일 URL만 저장한다. 이미지·영상 파일을 내려받거나 재호스팅하지 않는다.
// - 검색 결과는 “후기·분위기 참고용”이다. 가격·운영 여부·예약 가능 여부의 근거로 쓰지 않는다.
// - 캐시는 사용자 경험 개선 목적이며 주기적으로 새로 고친다(카카오 운영정책 제5조 20호).

export const KAKAO_SEARCH_BASE = "https://dapi.kakao.com/v2/search";
export const SEARCH_TYPES = ["blog", "cafe", "image", "vclip"];
// 추가 검색(같은 API): 시설 배치도 이미지·배치도 글, 요금이 언급된 후기. 캐시 버전이 다르면 다시 받는다.
export const EXTRA_SEARCHES = [
  { key: "layout_blog", type: "blog", suffix: "배치도", params: { sort: "accuracy", size: 15 } },
  { key: "layout_image", type: "image", suffix: "배치도", params: { sort: "accuracy", size: 20 } },
  { key: "price_blog", type: "blog", suffix: "가격 요금", params: { sort: "recency", size: 25 } },
  { key: "manner_blog", type: "blog", suffix: "매너타임", params: { sort: "accuracy", size: 15 } },
  { key: "time_blog", type: "blog", suffix: "입실 퇴실", params: { sort: "accuracy", size: 15 } },
];
export const SOCIAL_CACHE_VERSION = 2;
export const CAPS = { blog: 12, cafe: 6, image: 24, vclip: 10 };
// 타입별 1회 호출. blog·cafe는 최신 후기를 보이려고 recency, image·vclip은 엉뚱한 결과를 줄이려고 accuracy.
export const REQUEST_PLAN = {
  blog: { sort: "recency", size: 10 },
  cafe: { sort: "recency", size: 10 },
  image: { sort: "accuracy", size: 30 },
  vclip: { sort: "accuracy", size: 15 },
};

export const SOURCE = {
  id: "kakao-daum-search",
  name: "카카오 Daum 검색 API(블로그·카페·이미지·동영상)",
  url: "https://developers.kakao.com/docs/latest/ko/daum-search/dev-guide",
  tier: "D",
  terms_note: "검색 결과 메타데이터·원문 링크·썸네일 URL만 저장(이미지 미저장·재호스팅 금지). 원문 링크로 이동해 보여 주고 'Daum 검색 제공'을 표기한다. 카카오 서비스·제휴로 오인되게 표시하지 않는다. 캐시는 SOCIAL_MAX_AGE_DAYS 주기로 갱신하고 오래된 항목은 출력에서 뺀다. 가격·운영 정보의 근거로 쓰지 않는다. 운영정책: https://developers.kakao.com/terms/latest/ko/site-policies",
};

// ─── 텍스트 도우미 ─────────────────────────────────────────────────────────

const ENTITIES = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " ", "#39": "'", "#34": '"' };
/** <b> 등 HTML 태그 제거 + 기본 엔티티 해제 + 공백 정리 */
export function stripHtml(v) {
  return String(v ?? "")
    .replace(/<[^>]*>/g, "")
    .replace(/&(#?\w+);/g, (m, e) => ENTITIES[e.toLowerCase()] ?? (/^#\d+$/.test(e) ? String.fromCodePoint(Number(e.slice(1))) : m))
    .replace(/\s+/g, " ")
    .trim();
}
const compact = (s) => stripHtml(s).toLowerCase().replace(/[\s·.,\-_()[\]'"!?~&]/g, "");
const clip = (s, n) => (s.length > n ? `${s.slice(0, n - 1)}…` : s);
const httpUrl = (v) => { const s = String(v ?? "").trim(); return /^https?:\/\//i.test(s) ? s.replace(/^http:\/\//i, "https://") : null; };
const day = (v) => { const t = Date.parse(v ?? ""); return Number.isFinite(t) ? String(v).slice(0, 10) : null; };

// ─── 검색어 ───────────────────────────────────────────────────────────────

const LEGAL = /(주식회사|유한회사|농업회사법인|영농조합법인|사회적협동조합|협동조합|\(주\)|\(유\)|㈜)/g;
// 이름에서 떼어도 그 캠핑장을 가리키는 데 지장이 없는 일반어(관련성 판정용 ‘고유 토큰’ 계산에서만 쓴다).
const GENERIC = ["오토캠핑장", "캠핑장", "야영장", "캠핑", "캠프", "글램핑", "카라반", "오토", "펜션", "관광농원", "국민여가", "캠프펜션", "the", "더"];
const GENERIC_SUFFIX = new RegExp(`(${[...GENERIC].sort((a, b) => b.length - a.length).filter((g) => g.length >= 2 && g !== "the").join("|")})+$`, "i");
const CAMP_WORD = /(캠핑|야영|글램핑|카라반|캠프|camp)/i;

/** "파주시"→"파주", "서귀포시"→"서귀포", "중구"→"중구"(두 글자는 그대로) */
export function regionStem(sigungu) {
  const s = String(sigungu ?? "").trim().split(/\s+/)[0] ?? "";
  return s.length > 2 ? s.replace(/(시|군|구)$/, "") : s;
}

export function cleanName(name) {
  return String(name ?? "").replace(LEGAL, " ").replace(/\s+/g, " ").trim();
}

/** 관련성 판정용 고유 토큰(소문자). 일반어·지역명은 뺀다. */
export function distinctiveTokens(name, sigungu) {
  const stem = regionStem(sigungu).toLowerCase();
  const raw = cleanName(name).toLowerCase().replace(/[()[\]&·.,\-_/]/g, " ").split(/\s+/).filter(Boolean);
  const out = [];
  for (let t of raw) {
    if (GENERIC.includes(t)) continue;
    t = t.replace(GENERIC_SUFFIX, "");
    if (!t || t === stem || GENERIC.includes(t)) continue;
    // "화천둥지" 처럼 지역명이 붙어 있으면 떼되, 남는 게 있을 때만
    if (stem) { const m = t.match(new RegExp(`^${stem}(시|군|구)?`)); if (m && t.length - m[0].length >= 2) t = t.slice(m[0].length); }
    out.push(t);
  }
  if (!out.length) { const whole = compact(cleanName(name)); if (whole) out.push(whole); }
  return out;
}

/** 검색어: 정리한 이름 + (이름에 없으면) 시군구 약칭. 일반어가 하나도 없으면 ‘캠핑’을 붙여 다른 업종 결과를 줄인다. */
export function buildQuery(campground) {
  const name = cleanName(campground?.name);
  if (!name) return null;
  const stem = regionStem(campground?.address?.sigungu);
  const parts = [name];
  if (!CAMP_WORD.test(name) && !/(휴양림|농원|마을|해수욕장|유원지|공원)/.test(name)) parts.push("캠핑");
  if (stem && !compact(name).includes(stem.toLowerCase())) parts.push(stem);
  return parts.join(" ");
}

// 동영상은 보정어를 붙이지 않은 시설명 그대로 검색한다.
export const buildVideoQuery = (campground) => {
  const name = cleanName(campground?.name);
  return name || null;
};

/** 다른 캠핑장 이름과의 오인 방지에 쓰는 ‘핵심어’(고유 토큰을 이어 붙인 것) */
export const nameCore = (name, sigungu) => distinctiveTokens(name, sigungu).join("");

// ─── 관련성 ───────────────────────────────────────────────────────────────

const AD = /(분양|매매|부동산|매물|급매|경매|임대|토지|평당|시세|투자|중개|공인중개)/;

// 캠핑 이야기라는 최소 맥락: 제목·본문 어디에도 이런 말이 없으면(버스·등산·맛집 글에 지명만 겹친 경우) 뺀다.
const CAMP_CONTEXT = /(캠핑|야영|글램핑|글램|카라반|캠프|텐트|타프|차박|노지|오토캠|데크|파쇄석|불멍|바베큐|바비큐|휴양림|숙박|캠퍼|camp|glamp)/i;
// 제목이 다른 주제(교통·산행 공지·모집 등)를 가리키면, 제목 자체에 캠핑 이야기가 있을 때만 남긴다.
const OFF_TOPIC = /(마을버스|시내버스|광역버스|버스노선|노선도|정류장|저상버스|전기버스|산행|등산|일정표|채용|구인|알바|입찰|공고|부고|모집)/;
const escRe = (x) => x.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
/**
 * 블로그·카페·동영상 결과가 이 캠핑장 이야기인지 판정한다.
 * @param {{title?:string, contents?:string, src?:string}} doc 원본 필드(HTML 포함 가능)
 * @param {{tokens:string[], stem?:string, others?:string[]}} ctx others: 같은 지역 다른 캠핑장 핵심어(compact)
 */
export function isRelevant(doc, { tokens, stem = "", others = [] }) {
  const titleRaw = stripHtml(doc?.title);
  if (AD.test(titleRaw)) return false;
  const title = compact(doc?.title), body = compact(doc?.contents);
  const text = `${title}|${body}|${compact(doc?.src)}`;
  const toks = tokens.map((t) => t.toLowerCase().replace(/\s+/g, "")).filter(Boolean);
  if (!toks.length) return false;
  const core = toks.join("");
  const hit = text.includes(core) || (toks.length > 1 && toks.every((t) => t.length < 2 || text.includes(t)) && toks.some((t) => t.length >= 2));
  if (!hit) return false;
  if (!CAMP_CONTEXT.test(`${titleRaw} ${stripHtml(doc?.contents)}`)) return false;
  if (OFF_TOPIC.test(title) && !CAMP_CONTEXT.test(titleRaw)) return false;
  // 핵심어가 짧으면(“도덕산”, “라하”) 산·마을 이름과 겹친다 → 핵심어 바로 뒤에 캠핑 관련어가 붙어야 한다(“도덕산 캠핑장”).
  // 제목에서 붙거나, 본문에 캠핑장 이름 그대로 나오거나, 본문에서 붙고 제목에도 핵심어가 있어야 한다. 지역명만 같이 나오는 것으로는 부족하다.
  if (core.length <= 3) {
    const near = new RegExp(`${escRe(core)}.{0,4}(캠핑|야영|글램핑|카라반|캠프|camp)`, "i");
    const tight = new RegExp(`${escRe(core)}.?(캠핑장|야영장|글램핑|오토캠핑|캠프장)`, "i"); // 본문의 “명학산캠핑장 다녀옴”처럼 이름 그대로
    if (!near.test(title) && !tight.test(body) && !(near.test(body) && title.includes(core))) return false;
  }
  // 제목이 다른 캠핑장을 가리키고 우리 이름은 제목에 없으면(본문에 스쳐 지나간 언급) 뺀다.
  if (!title.includes(core) && others.some((o) => o && o !== core && o.length >= 2 && !core.includes(o) && title.includes(o))) return false;
  return true;
}

const DETAIL_WORDS = /(사이트|화장실|샤워|개수대|매점|전기|온수|데크|파쇄석|잔디|주차|요금|가격|예약|명당|구역|배치|놀이터|계곡|그늘|뷰|매너|입실|퇴실|환불)/g;
/**
 * 후기 정보량·정확도 점수(0~100). 화면의 ‘정확순’과 ‘추천’ 정렬에 쓴다.
 * 제목에 이름(+캠핑 관련어)이 있는지, 본문 길이, 사이트·시설 같은 구체어, 썸네일 유무를 본다.
 */
export function reviewScore(doc, { tokens }) {
  const title = compact(doc?.title), body = compact(doc?.snippet ?? doc?.contents);
  const core = tokens.map((t) => t.toLowerCase().replace(/\s+/g, "")).join("");
  let q = 0;
  if (core && title.includes(core)) q += 20;
  if (core && new RegExp(`${escRe(core)}.{0,6}(캠핑|야영|글램핑|카라반|캠프|camp)`, "i").test(title)) q += 20;
  else if (CAMP_CONTEXT.test(stripHtml(doc?.title))) q += 8;
  q += Math.round(Math.min(String(doc?.snippet ?? "").length, 160) / 160 * 23);
  q += Math.min(new Set(String(doc?.snippet ?? "").match(DETAIL_WORDS) ?? []).size * 4, 20);
  if (doc?.thumb) q += 10;
  return Math.min(100, q);
}

/** 캐시된 후기 레코드(정규화된 제목·요약)에 새 판정 규칙을 다시 적용하고 점수를 붙인다. */
export function refilterSocial(camp, rec, { others = [] } = {}) {
  const sigungu = camp?.address?.sigungu;
  const ctx = { tokens: distinctiveTokens(camp?.name, sigungu), stem: regionStem(sigungu), others };
  const posts = (list) => (list ?? []).filter((x) => isRelevant({ title: x.title, contents: x.snippet, src: x.src }, ctx)).map((x) => ({ ...x, q: reviewScore(x, ctx) }));
  return {
    ...rec,
    blog: posts(rec?.blog),
    cafe: posts(rec?.cafe),
    vclip: (rec?.vclip ?? []).filter((v) => isRelevant({ title: v.title, src: v.author }, ctx)),
  };
}

// ─── 정규화 ───────────────────────────────────────────────────────────────

export function normalizeDoc(d, t) {
  const url = httpUrl(d?.url);
  const title = stripHtml(d?.title);
  if (!url || !title) return null;
  return {
    t,
    title: clip(title, 120),
    snippet: clip(stripHtml(d?.contents), 160) || null,
    url,
    src: stripHtml(t === "cafe" ? d?.cafename : d?.blogname) || null,
    thumb: httpUrl(d?.thumbnail),
    date: day(d?.datetime),
  };
}

export function normalizeImage(d) {
  const thumb = httpUrl(d?.thumbnail_url), url = httpUrl(d?.doc_url);
  if (!thumb || !url) return null;
  const w = Number(d?.width), h = Number(d?.height);
  return {
    thumb,
    img: httpUrl(d?.image_url),
    url,
    src: stripHtml(d?.display_sitename) || null,
    w: Number.isFinite(w) && w > 0 ? w : null,
    h: Number.isFinite(h) && h > 0 ? h : null,
    date: day(d?.datetime),
  };
}

/** 유튜브 영상 ID(11자). youtu.be/ID, watch?v=ID, /shorts/ID, /embed/ID, /live/ID */
export function youtubeId(url) {
  let u;
  try { u = new URL(String(url ?? "")); } catch { return null; }
  const host = u.hostname.replace(/^(www\.|m\.|music\.)/, "");
  const ok = (s) => (/^[A-Za-z0-9_-]{11}$/.test(s ?? "") ? s : null);
  if (host === "youtu.be") return ok(u.pathname.split("/")[1]);
  if (host === "youtube.com" || host === "youtube-nocookie.com") {
    if (u.pathname === "/watch") return ok(u.searchParams.get("v"));
    const m = u.pathname.match(/^\/(shorts|embed|live|v)\/([^/?#]+)/);
    return m ? ok(m[2]) : null;
  }
  return null;
}

export function normalizeVclip(d) {
  const url = httpUrl(d?.url);
  const title = stripHtml(d?.title);
  if (!url || !title) return null;
  const dur = Number(d?.play_time);
  const short = /\/shorts\//.test(url) || (Number.isFinite(dur) && dur > 0 && dur <= 60);
  return {
    title: clip(title, 120),
    url,
    thumb: httpUrl(d?.thumbnail),
    dur: Number.isFinite(dur) && dur > 0 ? dur : null,
    author: stripHtml(d?.author) || null,
    date: day(d?.datetime),
    yt: youtubeId(url),
    kind: short ? "short" : "video",
  };
}

// ─── 묶기 ─────────────────────────────────────────────────────────────────

const urlKey = (u) => String(u ?? "").replace(/^https?:\/\/(www\.|m\.)?/i, "").replace(/[?#].*$/, "").replace(/\/$/, "").toLowerCase();

export function dedupe(items, keyOf) {
  const seen = new Set();
  return items.filter((it) => { const k = keyOf(it); if (!k || seen.has(k)) return false; seen.add(k); return true; });
}

const byDateDesc = (a, b) => String(b.date ?? "").localeCompare(String(a.date ?? ""));

/**
 * 한 캠핑장의 원본 응답(documents 배열들)을 걸러 압축 레코드로 만든다.
 * @param {{name:string,address?:{sigungu?:string}}} camp
 * @param {{blog?:any[],cafe?:any[],image?:any[],vclip?:any[],manner_blog?:any[],time_blog?:any[],price_blog?:any[]}} raw
 * @param {{others?:string[]}} [opts]
 */
export function buildSocialRecord(camp, raw, { others = [] } = {}) {
  const sigungu = camp?.address?.sigungu;
  const ctx = { tokens: distinctiveTokens(camp?.name, sigungu), stem: regionStem(sigungu), others };
  const rawBlogDocs = [
    ...(raw?.blog ?? []),
    ...(raw?.manner_blog ?? []),
    ...(raw?.time_blog ?? []),
    ...(raw?.price_blog ?? []),
  ];
  const docs = (list, t) => dedupe(
    (list ?? []).filter((d) => isRelevant({ title: d?.title, contents: d?.contents, src: t === "cafe" ? d?.cafename : d?.blogname }, ctx))
      .map((d) => normalizeDoc(d, t)).filter(Boolean),
    (x) => urlKey(x.url),
  ).sort(byDateDesc).slice(0, CAPS[t]);
  const blog = docs(rawBlogDocs, "blog"), cafe = docs(raw?.cafe ?? [], "cafe");

  const vclip = dedupe(
    (raw?.vclip ?? []).filter((d) => isRelevant({ title: d?.title, src: d?.author }, ctx)).map(normalizeVclip).filter(Boolean),
    (x) => (x.yt ? `yt:${x.yt}` : urlKey(x.url)),
  ).slice(0, CAPS.vclip);

  // 이미지는 제목·본문이 없어 글자로 판정할 수 없다 → 검색 순위(관련도)를 기본으로,
  // 관련 판정을 통과한 블로그·카페 글에서 나온 이미지는 앞으로, 광고성 출처는 뺀다. 같은 점수면 최신순.
  const trusted = new Set([...blog, ...cafe].map((x) => urlKey(x.url)));
  const imgs = (raw?.image ?? []).map((d, rank) => ({ d, rank, n: normalizeImage(d) })).filter((x) => x.n && !AD.test(x.n.src ?? ""));
  const scored = imgs.map(({ d, rank, n }) => {
    let score = -rank;
    if (trusted.has(urlKey(n.url))) score += 20;
    if (/blog|cafe/i.test(String(d?.collection ?? ""))) score += 2;
    if (n.w && n.h && (n.w < 200 || n.h < 150)) score -= 15; // 아이콘·배너급 작은 그림
    return { n, score };
  });
  scored.sort((a, b) => b.score - a.score || byDateDesc(a.n, b.n));
  const image = dedupe(scored.map((x) => x.n), (x) => urlKey(x.img ?? x.thumb)).slice(0, CAPS.image);

  return { blog, cafe, image, vclip };
}

// ─── 호출(fetch 주입) ─────────────────────────────────────────────────────

export function searchUrl(type, query, { sort = "accuracy", size = 10, page = 1 } = {}) {
  const q = new URLSearchParams({ query, sort, size: String(size), page: String(page) });
  return `${KAKAO_SEARCH_BASE}/${type}?${q}`;
}

/** 카카오 검색 1회 → documents 배열. 한도 초과는 code=RATE_LIMIT, 인증 실패는 code=AUTH로 throw. */
export async function kakaoSearch(type, query, params, { key, fetchImpl = fetch, timeoutMs = 10000 }) {
  const res = await fetchImpl(searchUrl(type, query, params), {
    headers: {
      Authorization: `KakaoAK ${key}`,
      KA: "sdk/1.0 os/javascript lang/ko res/1920x1080 device/web_pc origin/https://pyw31337.github.io",
      Origin: "https://pyw31337.github.io",
    },
    signal: AbortSignal.timeout(timeoutMs),
  });
  if (!res.ok) {
    const body = (await res.text().catch(() => "")).slice(0, 200);
    const e = new Error(`카카오 검색 ${type} HTTP ${res.status}: ${body}`);
    // 카카오 한도 초과는 보통 HTTP 429 + {"code":-10,...}. 앱 키 비활성·권한 없음은 401/403(-401, -3 등).
    e.code = res.status === 429 || /"code"\s*:\s*-10\b|limit|quota|exceed/i.test(body) ? "RATE_LIMIT"
      : res.status === 401 || res.status === 403 ? "AUTH" : "HTTP";
    e.status = res.status;
    throw e;
  }
  const j = await res.json();
  return Array.isArray(j?.documents) ? j.documents : [];
}

/** 캐시 항목이 없거나 maxAgeDays보다 오래됐으면 true */
export function isStale(fetchedAt, maxAgeDays, now = Date.now()) {
  const t = Date.parse(fetchedAt ?? "");
  return !Number.isFinite(t) || (now - t) / 864e5 > maxAgeDays;
}

/** 갱신 대상: 캐시 없음·이전 버전(배치도·요금 없음) → 가장 오래된 캐시 순 */
export function pickDue(camps, cache, maxAgeDays, now = Date.now()) {
  return camps
    .filter((c) => (cache[c.id]?.v ?? 1) < SOCIAL_CACHE_VERSION || isStale(cache[c.id]?.fetched_at, maxAgeDays, now))
    .sort((a, b) => (Date.parse(cache[a.id]?.fetched_at ?? "") || 0) - (Date.parse(cache[b.id]?.fetched_at ?? "") || 0));
}

/** 출력 통계 */
export function summarize(records) {
  const vals = Object.values(records);
  const n = vals.length || 1;
  return {
    camps: vals.length,
    avg_images: Math.round((vals.reduce((s, r) => s + (r.image?.length ?? 0), 0) / n) * 10) / 10,
    with_video_pct: Math.round((vals.filter((r) => r.vclip?.length).length / n) * 1000) / 10,
    with_posts_pct: Math.round((vals.filter((r) => r.blog?.length || r.cafe?.length).length / n) * 1000) / 10,
  };
}

// ─── 시설 배치도 · 후기 속 요금 ────────────────────────────────────────────

const LAYOUT_WORD = /배치도|배치|안내도|사이트\s*맵|사이트맵|지도/;
/**
 * 배치도 후보 이미지: 이름 관련도를 통과한 ‘배치도’ 글에서 나온 이미지를 우선, 그다음 검색 상위 3장(추정 표시).
 * 이미지는 저장하지 않고 썸네일 주소·원문 링크만 쓴다.
 */
export function buildLayout(camp, raw, { others = [] } = {}) {
  const sigungu = camp?.address?.sigungu;
  const ctx = { tokens: distinctiveTokens(camp?.name, sigungu), stem: regionStem(sigungu), others };
  const posts = (raw?.layout_blog ?? []).filter((d) => isRelevant({ title: d?.title, contents: d?.contents, src: d?.blogname }, ctx) && LAYOUT_WORD.test(stripHtml(`${d?.title ?? ""} ${d?.contents ?? ""}`)))
    .map((d) => normalizeDoc(d, "blog")).filter(Boolean);
  const postUrls = new Set(posts.map((x) => urlKey(x.url)));
  const imgs = (raw?.layout_image ?? []).map(normalizeImage).filter((x) => x && !AD.test(x.src ?? ""));
  const confirmed = imgs.filter((x) => postUrls.has(urlKey(x.url))).map((x) => ({ ...x, sure: true }));
  const guess = imgs.filter((x) => !postUrls.has(urlKey(x.url)) && (!x.w || x.w >= 400)).slice(0, 3).map((x) => ({ ...x, sure: false }));
  const images = dedupe([...confirmed, ...guess], (x) => urlKey(x.img ?? x.thumb)).slice(0, 6);
  return { images, posts: posts.slice(0, 4) };
}

const SEASON = [["peak", /성수기|극성수기|여름\s*휴가|7월|8월/], ["off", /비수기|평상시/]];
const DAY = [["weekend", /주말|금요일|토요일|금토|토일|공휴일|휴일/], ["weekday", /평일|주중|일[~-]목|월[~-]목/]];
const SITE_WORD = /(오토\s*캠핑|오토|일반\s*캠핑|데크|파쇄석|잔디|마사토|글램핑|카라반|캠핑카|트레일러|텐트|사이트|구역|존|[A-Z]\s*구역|[A-Z]\s*존|[A-Z]\d{0,2}\s*사이트)/;
/** 문자열에서 가장 마지막에 나온 태그(정규식 목록 중) */
function lastTag(text, tags) {
  let best = null, at = -1;
  for (const [tag, re] of tags) for (const m of String(text).matchAll(new RegExp(re.source, "g"))) if (m.index > at) { at = m.index; best = tag; }
  return best;
}
/** "50,000원", "5만원", "5만 5천원", "55,000원~" → 원 단위 숫자 */
export function parseWon(t) {
  const s = String(t).replace(/\s+/g, "");
  let m = s.match(/^(\d{1,3}(?:,\d{3})+|\d{4,7})원$/);
  if (m) return Number(m[1].replace(/,/g, ""));
  m = s.match(/^(\d{1,2})만(?:(\d)천)?원$/);
  if (m) return Number(m[1]) * 10000 + (m[2] ? Number(m[2]) * 1000 : 0);
  return null;
}
/**
 * 후기·카페 글의 본문 일부에서 1박 요금 언급을 뽑는다(이용자 작성 정보 = 참고용).
 * 반환: [{won, label(사이트 단어), season, day, quote, url, src, date}] — 1만~50만원 범위, 같은 글·같은 금액은 1건.
 */
export function extractPriceMentions(docs) {
  const out = [];
  const seen = new Set();
  const PRICE = /(\d{1,3}(?:,\d{3})+|\d{4,6})\s*원|(\d{1,2})\s*만\s*(?:(\d)\s*천)?\s*원/g;
  for (const d of docs ?? []) {
    const text = stripHtml(`${d?.title ?? ""} ${d?.snippet ?? d?.contents ?? ""}`);
    for (const m of text.matchAll(PRICE)) {
      const won = parseWon(m[0]);
      if (!won || won < 10000 || won > 500000) continue;
      const a = Math.max(0, m.index - 28), b = Math.min(text.length, m.index + m[0].length + 12);
      const quote = text.slice(a, b).trim();
      // 주차·장작·전기 등 부대 요금, 할인·적립·쿠폰은 제외
      const near = text.slice(Math.max(0, m.index - 9), m.index + m[0].length + 3);
      if (/장작|전기|추가\s*인원|인당|1인|주차|쿠폰|적립|할인|보증금|대여|렌탈|입장료|샤워/.test(near)) continue;
      // 계절·요일은 금액 바로 앞(같은 문장)의 단어를 우선한다: "평일 45,000원 주말 6만원"
      const pre = text.slice(Math.max(0, m.index - 22), m.index);
      const key = `${d?.url}|${won}`;
      if (seen.has(key)) continue;
      seen.add(key);
      out.push({
        won, label: quote.match(SITE_WORD)?.[0]?.replace(/\s+/g, " ") ?? null,
        season: lastTag(pre, SEASON) ?? lastTag(quote, SEASON), day: lastTag(pre, DAY) ?? lastTag(quote, DAY),
        quote, url: d?.url ?? null, src: d?.src ?? d?.blogname ?? null, date: d?.date ?? d?.datetime ?? null,
      });
    }
  }
  return out.sort((x, y) => String(y.date ?? "").localeCompare(String(x.date ?? ""))).slice(0, 12);
}
