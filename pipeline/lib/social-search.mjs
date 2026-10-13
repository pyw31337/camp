// 캠핑장별 “사람들이 남긴” 블로그·카페 글, 이미지, 동영상 링크를 카카오(Daum) 검색 REST API로 모은다.
// 이 파일은 정규화·관련성 판정 같은 순수 함수와, fetch를 주입받는 얇은 호출 함수만 둔다(파일 입출력은 scripts/sync-social.mjs).
//
// 원칙(AGENTS.md 4번, docs/SOCIAL_SEARCH.md):
// - 메타데이터와 원문·썸네일 URL만 저장한다. 이미지·영상 파일을 내려받거나 재호스팅하지 않는다.
// - 검색 결과는 “후기·분위기 참고용”이다. 가격·운영 여부·예약 가능 여부의 근거로 쓰지 않는다.
// - 캐시는 사용자 경험 개선 목적이며 주기적으로 새로 고친다(카카오 운영정책 제5조 20호).

export const KAKAO_SEARCH_BASE = "https://dapi.kakao.com/v2/search";
export const SEARCH_TYPES = ["blog", "cafe", "image", "vclip"];
export const CAPS = { blog: 8, cafe: 6, image: 24, vclip: 10 };
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

/** 다른 캠핑장 이름과의 오인 방지에 쓰는 ‘핵심어’(고유 토큰을 이어 붙인 것) */
export const nameCore = (name, sigungu) => distinctiveTokens(name, sigungu).join("");

// ─── 관련성 ───────────────────────────────────────────────────────────────

const AD = /(분양|매매|부동산|매물|급매|경매|임대|토지|평당|시세|투자|중개|공인중개)/;

/**
 * 블로그·카페·동영상 결과가 이 캠핑장 이야기인지 판정한다.
 * @param {{title?:string, contents?:string, src?:string}} doc 원본 필드(HTML 포함 가능)
 * @param {{tokens:string[], stem?:string, others?:string[]}} ctx others: 같은 지역 다른 캠핑장 핵심어(compact)
 */
export function isRelevant(doc, { tokens, stem = "", others = [] }) {
  const titleRaw = stripHtml(doc?.title);
  if (AD.test(titleRaw)) return false;
  const title = compact(doc?.title);
  const text = `${title}|${compact(doc?.contents)}|${compact(doc?.src)}`;
  const toks = tokens.map((t) => t.toLowerCase().replace(/\s+/g, "")).filter(Boolean);
  if (!toks.length) return false;
  const core = toks.join("");
  const hit = text.includes(core) || (toks.length > 1 && toks.every((t) => t.length < 2 || text.includes(t)) && toks.some((t) => t.length >= 2));
  if (!hit) return false;
  // 핵심어가 짧으면(“라하”, “자유”) 우연한 일치가 많다 → 지역명이 같이 나오거나 바로 뒤에 캠핑 관련어가 붙어야 한다.
  if (core.length <= 3) {
    const st = stem.toLowerCase();
    const near = new RegExp(`${core.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}.{0,4}(캠핑|야영|글램핑|카라반|캠프|camp)`, "i").test(text);
    if (!near && !(st && text.includes(st))) return false;
  }
  // 제목이 다른 캠핑장을 가리키고 우리 이름은 제목에 없으면(본문에 스쳐 지나간 언급) 뺀다.
  if (!title.includes(core) && others.some((o) => o && o !== core && o.length >= 2 && !core.includes(o) && title.includes(o))) return false;
  return true;
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
 * @param {{blog?:any[],cafe?:any[],image?:any[],vclip?:any[]}} raw
 * @param {{others?:string[]}} [opts]
 */
export function buildSocialRecord(camp, raw, { others = [] } = {}) {
  const sigungu = camp?.address?.sigungu;
  const ctx = { tokens: distinctiveTokens(camp?.name, sigungu), stem: regionStem(sigungu), others };
  const docs = (t) => dedupe(
    (raw?.[t] ?? []).filter((d) => isRelevant({ title: d?.title, contents: d?.contents, src: t === "cafe" ? d?.cafename : d?.blogname }, ctx))
      .map((d) => normalizeDoc(d, t)).filter(Boolean),
    (x) => urlKey(x.url),
  ).sort(byDateDesc).slice(0, CAPS[t]);
  const blog = docs("blog"), cafe = docs("cafe");

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
    headers: { Authorization: `KakaoAK ${key}` },
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

/** 갱신 대상: 캐시 없음 → 가장 오래된 캐시 순 */
export function pickDue(camps, cache, maxAgeDays, now = Date.now()) {
  return camps
    .filter((c) => isStale(cache[c.id]?.fetched_at, maxAgeDays, now))
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
