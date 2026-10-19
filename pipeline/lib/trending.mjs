// 실시간 인기(최근 글 언급 순위): 플랫폼에서 ‘캠핑장’ 같은 일반 검색어로 최신 글을 모은 뒤,
// 글이 어느 캠핑장 이야기인지 이름·지역으로 맞추고, 최근 7일 글 수(최근일수록 가중)로 순위를 낸다.
// 외부 호출 없는 순수 함수만 둔다(수집은 lib/trending-sources.mjs, 실행은 scripts/sync-trending.mjs). docs/TRENDING.md
import { distinctiveTokens, isRelevant, regionStem, stripHtml, cleanName } from "./social-search.mjs";
import { AGGREGATOR_HOST, aboutCamp } from "./detail-text-review.mjs";

export const WINDOW_DAYS = 7;
export const HALF_LIFE_DAYS = 2;
export const MAX_CAMPS_PER_POST = 4; // 이보다 많은 캠핑장을 늘어놓은 글은 ‘모음 글’로 본다(순위에 넣지 않음)

const compact = (s) => stripHtml(s).toLowerCase().replace(/[\s·.,\-_()[\]'"!?~&|/:;#@]/g, "");
// 이름 핵심어가 이 낱말뿐이면 일반어와 겹친다(“하늘”“숲속”) → 이름 전체와 지역이 함께 나와야 인정한다.
const GENERIC_CORE = new Set(["하늘", "바다", "숲속", "숲", "솔밭", "솔숲", "별빛", "별", "달빛", "힐링", "가족", "자연", "계곡", "강변", "해변", "산", "산속", "호수", "행복", "휴", "쉼", "쉼터", "포레스트", "리버", "레이크", "파크", "힐", "밸리", "캠프", "오토", "글램", "노지", "차박", "펜션", "리조트", "휴양림", "공원", "유원지", "해수욕장", "캠핑", "야영", "family", "camp", "park"]);
// 이름을 이루는 흔한 조각. 핵심어에서 이것들을 다 떼고 2자 미만이 남으면 일반어 이름으로 본다(“숲자연휴양림”“글램핑장”“캠핑스테이”).
const FRAGMENTS = ["자연휴양림", "관광농원", "국민여가", "오토캠핑", "글램핑", "캠핑", "캠프", "글램", "카라반", "오토", "야영", "휴양림", "스테이", "빌리지", "리조트", "펜션", "하우스", "포레스트", "파크", "리버", "밸리", "랜드", "월드", "클럽", "힐링", "가족", "숲속", "하늘", "바다", "별빛", "달빛", "해변", "계곡", "강변", "호수", "쉼터", "마을", "농원", "공원", "유원지", "해수욕장", "사이트", "숲", "별", "산", "휴", "쉼", "뷰", "존", "앤", "더", "장", "and", "the", "camp", "glamping", "park"].sort((a, b) => b.length - a.length);
const isGenericCore = (core) => { let r = core; for (const f of FRAGMENTS) r = r.split(f).join(""); return r.replace(/\d+/g, "").length < 2; };
const SIDO_STEM = (s) => String(s ?? "").replace(/(특별자치도|특별자치시|특별시|광역시|도)$/, "").replace(/^(충청|전라|경상)(남|북)$/, (_, a, b) => `${a[0]}${b}`);
const AD_TITLE = /(분양|매매|부동산|매물|급매|경매|임대|토지|평당|시세|투자|중개|대출|카지노|토토|바카라|도박|코인|리딩방|구인|알바|채용)/;

/** URL 같음 판정 키(스킴·www·m.·쿼리·끝 / 무시). 같은 글이 여러 검색 결과에 나와도 한 번만 센다. */
export function urlKey(u) {
  let s = String(u ?? "").trim().replace(/^https?:\/\//i, "").replace(/^(www|m)\./i, "").replace(/#.*$/, "");
  // 네이버 블로그 PostView 주소 → blog.naver.com/{id}/{no}
  const pv = s.match(/^blog\.naver\.com\/PostView\.(?:nhn|naver)\?(.*)$/i);
  if (pv) { const q = new URLSearchParams(pv[1]); if (q.get("blogId") && q.get("logNo")) return `blog.naver.com/${q.get("blogId")}/${q.get("logNo")}`.toLowerCase(); }
  s = s.replace(/\?.*$/, "").replace(/\/$/, "");
  return s.toLowerCase();
}
export const hostOf = (u) => { try { return new URL(u).hostname.replace(/^(www|m)\./, ""); } catch { return ""; } };

/** 글 → 화면 아이콘 묶음(같은 크기 아이콘으로 보인다) */
export function platformOf(post) {
  const h = hostOf(post.url);
  if (/(^|\.)youtube\.com$|^youtu\.be$/.test(h)) return "youtube";
  if (/(^|\.)tiktok\.com$/.test(h)) return "tiktok";
  if (/(^|\.)instagram\.com$/.test(h)) return "instagram";
  if (/(^|\.)facebook\.com$/.test(h)) return "facebook";
  if (/naver\.com$/.test(h)) return "naver";
  if (/(daum\.net|kakao\.com|tistory\.com|brunch\.co\.kr)$/.test(h)) return "daum";
  return post.via === "naver" ? "naver" : "daum";
}

/**
 * 캠핑장 목록 → 맞춤 색인. camps: [{id, name, sido, sigungu}]
 * 핵심어(distinctiveTokens 이음)가 여러 곳에 같거나, 짧거나(3자 이하), 일반어면 ‘지역 단서’를 요구한다.
 */
export function buildMatcher(camps) {
  const rows = [];
  for (const c of camps) {
    if (!c?.id || !c?.name) continue;
    const tokens = distinctiveTokens(c.name, c.sigungu);
    const core = compact(tokens.join(""));
    if (core.length < 2) continue;
    const stem = compact(regionStem(c.sigungu));
    rows.push({ id: String(c.id), name: c.name, tokens, core, full: compact(cleanName(c.name)), stem, sido: compact(SIDO_STEM(c.sido)), sigungu: compact(c.sigungu) });
  }
  const byCore = new Map();
  for (const r of rows) (byCore.get(r.core) ?? byCore.set(r.core, []).get(r.core)).push(r);
  for (const r of rows) {
    r.dup = byCore.get(r.core).length;
    r.generic = GENERIC_CORE.has(r.core) || isGenericCore(r.core);
    r.needRegion = r.dup > 1 || r.core.length <= 3 || r.generic;
  }
  // 같은 시군구 다른 캠핑장 핵심어(제목이 다른 캠핑장을 가리키는지 볼 때)
  const byArea = new Map();
  for (const r of rows) (byArea.get(`${r.sido}|${r.stem}`) ?? byArea.set(`${r.sido}|${r.stem}`, []).get(`${r.sido}|${r.stem}`)).push(r.core);
  for (const r of rows) r.others = byArea.get(`${r.sido}|${r.stem}`).filter((o) => o !== r.core);
  // 긴 핵심어부터 본다(“솔바람숲”이 “솔바람”을 덮는다)
  rows.sort((a, b) => b.core.length - a.core.length);
  return { rows, byCore };
}

function regionCue(text, r) {
  if (r.stem.length >= 3 && text.includes(r.stem)) return true;
  if (r.stem.length === 2 && text.includes(r.stem) && (r.stem.endsWith("구") ? text.includes(r.sido) : true)) return true;
  if (r.sigungu && r.sigungu.length >= 2 && text.includes(r.sigungu)) return true;
  return false;
}

/** 스팸·정보 모음 사이트·광고 글이면 사유, 아니면 null */
export function spamReason(post) {
  const h = hostOf(post.url);
  if (h && AGGREGATOR_HOST.test(h)) return "정보 모음 사이트";
  if (AD_TITLE.test(String(post.title ?? ""))) return "광고·부동산";
  return null;
}

/**
 * 글 하나가 어느 캠핑장 이야기인지. 반환: 캠핑장 id 배열(모음 글·애매하면 빈 배열)
 * @param {{title:string, snippet?:string, src?:string}} post
 */
export function matchPost(post, matcher) {
  const title = compact(post.title), body = compact(post.snippet);
  const text = `${title}|${body}`;
  const hits = [];
  for (const r of matcher.rows) {
    if (!text.includes(r.core)) continue;
    if (hits.some((h) => h.core.includes(r.core))) continue; // 더 긴 이름에 덮인 짧은 이름
    if (r.needRegion) {
      if (!regionCue(text, r)) continue;
      if (r.generic && !text.includes(r.full)) continue;
      // 같은 핵심어·같은 지역 캠핑장이 둘 이상이면 이름 전체로만 고른다
      const twins = matcher.byCore.get(r.core).filter((x) => x !== r && regionCue(text, x));
      if (twins.length && !(text.includes(r.full) && !twins.some((x) => x.full === r.full))) continue;
    }
    const doc = { title: post.title, contents: post.snippet ?? "", src: post.src ?? "" };
    if (!isRelevant(doc, { tokens: r.tokens, stem: r.stem, others: r.others })) continue;
    if (aboutCamp({ title: post.title, snippet: post.snippet ?? "" }, { tokens: r.tokens.map((t) => t.toLowerCase()), core: r.core, others: r.others })) continue;
    hits.push(r);
  }
  // 같은 캠핑장이 쌍둥이로 두 번 잡히면 하나로
  const ids = [...new Set(hits.map((h) => h.id))];
  return ids.length > MAX_CAMPS_PER_POST ? [] : ids;
}

const dayMs = 864e5;
export const kstDay = (t = Date.now()) => new Date(t + 9 * 3600e3).toISOString().slice(0, 10);
export const daysBetween = (a, b) => Math.round((Date.parse(`${b}T00:00:00Z`) - Date.parse(`${a}T00:00:00Z`)) / dayMs);

/** 최근 가중치: 오늘 1, 2일 전 0.5, 4일 전 0.25 … 7일 넘으면 0 */
export function recencyWeight(date, today) {
  const age = daysBetween(date, today);
  if (!(age >= 0) || age >= WINDOW_DAYS) return 0;
  return 0.5 ** (age / HALF_LIFE_DAYS);
}

/**
 * 맞춘 글 묶음 → 순위. posts: [{key,url,title,date,platform,thumb,ids[]}]
 * prevRanks: {id: rank}(전날 순위) — 화살표용
 */
export function rankCamps(posts, today, { prevRanks = {}, top = 30, samples = 3 } = {}) {
  const agg = new Map();
  for (const p of posts) {
    if (!p.ids?.length || !p.date) continue;
    const w = recencyWeight(p.date, today);
    if (!w) continue;
    const share = 1 / p.ids.length;
    for (const id of p.ids) {
      const a = agg.get(id) ?? { id, score: 0, today: 0, week: 0, by: {}, posts: [] };
      a.score += w * share;
      a.week++;
      if (p.date === today) a.today++;
      a.by[p.platform] = (a.by[p.platform] ?? 0) + 1;
      a.posts.push(p);
      agg.set(id, a);
    }
  }
  const list = [...agg.values()].filter((a) => a.week >= 2 || a.today >= 1)
    .sort((a, b) => b.score - a.score || b.today - a.today || b.week - a.week || a.id.localeCompare(b.id))
    .slice(0, top);
  return list.map((a, i) => {
    const rank = i + 1, prev = prevRanks[a.id];
    const picked = a.posts.sort((x, y) => (y.date ?? "").localeCompare(x.date ?? "") || Number(Boolean(y.thumb)) - Number(Boolean(x.thumb))).slice(0, samples);
    return {
      rank, id: a.id, score: Number(a.score.toFixed(3)), today: a.today, week: a.week, by: a.by,
      prev: prev ?? null, trend: prev == null ? "new" : prev > rank ? "up" : prev < rank ? "down" : "same",
      samples: picked.map((p) => ({ url: p.url, title: String(p.title ?? "").slice(0, 80), date: p.date, platform: p.platform, thumb: p.thumb ?? null })),
    };
  });
}
