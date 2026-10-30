// 캠핑장 이름으로 YouTube 숏츠를 따로 찾는다(t39 #36 보강, 영우 님 2026-10-22: 일반 영상은 없는데 관련 숏츠가 있는 곳).
// 공식 API만 쓴다: ① 카카오(Daum) 동영상 검색 vclip — YouTube 영상도 색인됨, KAKAO_REST_API_KEY
//                 ② YouTube Data API v3 search.list(videoDuration=short) + videos.list(길이) — YOUTUBE_API_KEY가 있을 때만.
// YouTube 검색 화면을 긁지 않는다(서비스 약관). 메타데이터·URL·썸네일 주소만 저장.
// 관련성: 제목(+설명)에 캠핑장 핵심어가 있어야 한다(social-search isRelevant 그대로). 숏츠 판정: /shorts/ 주소 또는 길이 ≤ 180초.
import { cleanName, distinctiveTokens, isRelevant, normalizeVclip, regionStem, stripHtml, youtubeId } from "./social-search.mjs";

export const SHORTS_MAX_SEC = 180; // YouTube 숏츠 최대 길이(2024-10부터 3분)
// v2(2026-10-30): 숏츠만이 아니라 이 캠핑장의 YouTube 영상 전체(일반 영상 + 숏츠)를 여러 검색어·여러 쪽으로 모은다 → 전부 다시 찾는다.
export const SHORTS_CACHE_VERSION = 2;
/** 캠핑장당 내보내는 최대 개수(화면 SNS 영상 칸) */
export const VIDEO_CAPS = { shorts: 20, videos: 30 };

/** 숏츠 검색어: ‘이름 쇼츠’, ‘이름 shorts’ (이름에 캠핑 관련어가 없으면 ‘캠핑’을 붙인다) */
export function shortsQueries(camp) {
  const name = cleanName(camp?.name);
  if (!name) return [];
  const base = /(캠핑|야영|글램핑|카라반|캠프|오토)/.test(name) ? name : `${name} 캠핑`;
  return [`${base} 쇼츠`, `${base} shorts`];
}

/** ISO 8601 길이(PT1M5S) → 초 */
export function isoDurationSec(s) {
  const m = String(s ?? "").match(/^P(?:(\d+)D)?T?(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?$/);
  if (!m) return null;
  const [, d, h, mi, se] = m.map((x) => Number(x ?? 0));
  return d * 86400 + h * 3600 + mi * 60 + se;
}

const cmp = (x) => stripHtml(x).toLowerCase().replace(/[\s#@·.,!?'"()[\]\-_/|:~]+/g, "");
const SHORT_CAMP = /(캠핑|야영|글램핑|글램|카라반|캠프|텐트|차박|노지|오토캠|불멍|캠퍼|camp|glamp)/i;
// 이름 자체가 장소 일반명(공원·물놀이장·호수…)이면 그 장소 영상과 섞인다 → 핵심어 바로 뒤에 캠핑 관련어가 붙어야 한다.
const CAMP_NAME_RE = /([가-힣a-z0-9]{2,8}?)(?:오토)?(?:캠핑장|야영장|글램핑장|캠프장)/g;
const esc = (x) => x.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const PLACEY = /(공원|유원지|물놀이장|수영장|해수욕장|해변|호수|저수지|댐|계곡|강변|둔치|광장|패드|놀이터|숲|섬|마을)$/;
const NEAR = (core) => new RegExp(`${core.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}.{0,3}(캠핑|야영|글램핑|카라반|캠프|camp)`, "i");
/**
 * 숏츠 엄격 판정(t39 #36 정밀도 보강): 첫 수집에서 “물놀이장·호수·생태공원·채널명” 오인이 나와 기준을 올렸다.
 * ① 핵심어가 ‘제목’에 그대로(채널명·설명만으로는 안 됨) ② 제목에 캠핑 맥락 ③ 핵심어 3자 이하·장소 일반명이면 핵심어 바로 뒤 캠핑어
 * ④ 같은 이름(핵심어) 캠핑장이 전국에 둘 이상이면 제목에 시군구명도 ⑤ 제목에 같은 지역 다른 캠핑장 핵심어가 있으면 제외
 */
export function shortsMatch(camp, title, opt = {}) {
  // “임진각 평화누리 / 평화누리캠핑장”처럼 별칭이 있으면 하나라도 맞으면 된다.
  const alts = String(camp?.name ?? "").split("/").map((x) => x.trim()).filter(Boolean);
  if (alts.length > 1) return alts.some((n) => matchOne({ ...camp, name: n }, title, opt));
  return matchOne(camp, title, opt);
}
function matchOne(camp, title, { dup = false, others = [], stems: opt_stems = [] } = {}) {
  const core = cmp(distinctiveTokens(camp?.name, camp?.address?.sigungu).join(""));
  const t = cmp(title);
  if (!core || core.length < 2 || !t.includes(core)) return false;
  if (!SHORT_CAMP.test(stripHtml(title))) return false;
  const stem = cmp(regionStem(camp?.address?.sigungu));
  // 제목이 다른 캠핑장 이름(“한탄강오토캠핑장”)을 달고 있으면 뺀다.
  for (const m of t.matchAll(CAMP_NAME_RE)) { const pre = m[1]; if (pre !== core && pre !== stem + core && !(core.length >= 4 && pre.endsWith(core)) && !(pre.length < core.length && core.endsWith(pre))) return false; }
  // ① 고유명 형태: 핵심어 바로 뒤에 캠핑장 접미어(“도깨비캠핑장”, “합강오토캠핑장”) — 일반어(좋은·숲에·우산)만 겹친 제목은 여기서 걸러진다.
  const proper = new RegExp(`${esc(core)}(오토)?(캠핑장|야영장|글램핑장|글램핑|캠프장|오토캠핑)`).test(t);
  // ② 또는 핵심어가 5자 이상이고 제목에 시군구명도 있다(“구미 동락공원”, “합천영상테마파크”).
  const placed = core.length >= 5 && stem && t.includes(stem);
  if (!proper && !placed) return false;
  // 핵심어가 2자(“노을”)이거나 3자인데 고유명 형태가 아니거나 같은 이름이 전국에 또 있으면 제목에 시군구명도 있어야 한다.
  // 제목이 다른 시·군 이름을 핵심어 바로 앞에 붙이면(“진천 더빌리지”, 우리는 태안) 다른 곳이다.
  if ((opt_stems ?? []).some((st) => st && st !== stem && st.length >= 2 && t.includes(st + core))) return false;
  if ((dup || core.length <= 2 || (core.length === 3 && !proper)) && !(stem && t.includes(stem))) return false;
  if (others.some((o) => o && o.length >= 3 && o !== core && !core.includes(o) && !o.includes(core) && t.includes(o))) return false;
  return true;
}
/**
 * 영상 판정(v2, 일반 영상·숏츠 공통): 카카오 vclip 기본 관련성(isRelevant: 이름 + 캠핑 맥락 + 다른 캠핑장 제외)에 더해
 * 핵심어가 ‘제목’에 그대로 있어야 한다(채널명·설명만으로는 안 됨). 숏츠 엄격 판정(shortsMatch)의 ‘고유명 형태’ 조건은 빼서
 * “OO캠핑장 브이로그”가 아닌 “OO 우중캠핑”, “OO에서 1박” 같은 제목도 받는다. 같은 이름 캠핑장이 전국에 둘 이상이거나
 * 핵심어가 2자면 제목에 시군구명도 있어야 하고, 다른 시·군 이름이 핵심어 앞에 붙거나 제목이 다른 캠핑장 이름을 달면 뺀다.
 */
export function videoMatch(camp, title, opt = {}) {
  const alts = String(camp?.name ?? "").split("/").map((x) => x.trim()).filter(Boolean);
  if (alts.length > 1) return alts.some((n) => videoMatchOne({ ...camp, name: n }, title, opt));
  return videoMatchOne(camp, title, opt);
}
function videoMatchOne(camp, title, { dup = false, others = [], stems = [], author = "" } = {}) {
  const core = cmp(distinctiveTokens(camp?.name, camp?.address?.sigungu).join(""));
  const t = cmp(title);
  if (!core || core.length < 2 || !t.includes(core)) return false;
  if (!isRelevant({ title, contents: "", src: author }, ctxOf(camp, others))) return false;
  const stem = cmp(regionStem(camp?.address?.sigungu));
  for (const m of t.matchAll(CAMP_NAME_RE)) { const pre = m[1]; if (pre !== core && pre !== stem + core && !(core.length >= 4 && pre.endsWith(core)) && !(pre.length < core.length && core.endsWith(pre)) && !pre.endsWith(core)) return false; }
  if ((stems ?? []).some((st) => st && st !== stem && st.length >= 2 && t.includes(st + core))) return false;
  if ((dup || core.length <= 2) && !(stem && t.includes(stem))) return false;
  if (others.some((o) => o && o.length >= 3 && o !== core && !core.includes(o) && !o.includes(core) && t.includes(o))) return false;
  return true;
}
/** YouTube 숏츠인가: /shorts/ 주소, 60초 이하, 또는 3분 이하이면서 제목에 #shorts·쇼츠 */
export const isShortVideo = (v) => /\/shorts\//.test(v?.url ?? "") || (v?.dur != null && v.dur <= 60) || (v?.dur != null && v.dur <= SHORTS_MAX_SEC && /#?shorts|쇼츠|숏츠/i.test(v?.title ?? ""));
/** 영상 검색어(v2): 이름 그대로(1·2쪽) + ‘이름(캠핑) 쇼츠’ */
export function videoQueries(camp) {
  const name = cleanName(camp?.name);
  if (!name) return [];
  const base = /(캠핑|야영|글램핑|카라반|캠프|오토|휴양림)/.test(name) ? name : `${name} 캠핑`;
  return [{ q: name, page: 1 }, { q: name, page: 2, ifFull: true }, { q: `${base} 쇼츠`, page: 1 }];
}
/** 카카오 vclip 문서 → { shorts, videos } (YouTube이고 이 캠핑장을 가리키는 것만, 같은 id는 한 번) */
export function videosFromVclip(camp, docs, opt = {}) {
  const shorts = [], videos = [], seen = new Set(opt.exclude ?? []);
  for (const d of docs ?? []) {
    const v = normalizeVclip(d);
    if (!v?.yt || seen.has(v.yt)) continue;
    if (!videoMatch(camp, d?.title, { ...opt, author: d?.author })) continue;
    seen.add(v.yt);
    if (isShortVideo(v)) shorts.push({ ...v, kind: "short", via: "daum_vclip" });
    else videos.push({ ...v, kind: "video", via: "daum_vclip" });
  }
  return { shorts: shorts.slice(0, VIDEO_CAPS.shorts), videos: videos.slice(0, VIDEO_CAPS.videos) };
}
/** 캐시된 영상(v2 일반 영상)을 판정으로 다시 거른다(재검색 없이). */
export const refilterVideos = (camp, videos, opt = {}) => (videos ?? []).filter((s) => !(opt.exclude ?? []).includes(s?.yt) && videoMatch(camp, s?.title, { ...opt, author: s?.author }));
/** 캐시 기록 → 화면에 덧붙일 영상(숏츠 먼저, 그다음 일반 영상). v1 숏츠는 엄격 판정, v2는 영상 판정. */
export function recordVideos(camp, r, opt = {}) {
  if (!r) return [];
  const sh = r.v >= 2 || r.videos ? refilterVideos(camp, r.shorts, opt) : refilterShorts(camp, r.shorts, opt);
  return [...sh, ...refilterVideos(camp, r.videos, opt)];
}

/** 캐시된 숏츠를 엄격 판정으로 다시 거른다(재검색 없이). */
export const refilterShorts = (camp, shorts, opt = {}) => (shorts ?? []).filter((s) => !(opt.exclude ?? []).includes(s?.yt) && shortsMatch(camp, s?.title, opt));
/** registry/shorts-exclude.json → { id: [yt…] } */
export const excludeMap = (j) => Object.fromEntries(Object.entries(j ?? {}).filter(([k]) => !k.startsWith("_")).map(([k, v]) => [k, (v ?? []).map((x) => x?.yt ?? x)]));

const ctxOf = (camp, others = []) => ({ tokens: distinctiveTokens(camp?.name, camp?.address?.sigungu), stem: regionStem(camp?.address?.sigungu), others });

/** 카카오 vclip 문서 → 숏츠 항목(YouTube이고, 숏츠이고, 이 캠핑장을 가리키는 것만) */
export function shortsFromVclip(camp, docs, { others = [], dup = false } = {}) {
  const ctx = ctxOf(camp, others);
  const out = [];
  for (const d of docs ?? []) {
    const v = normalizeVclip(d);
    if (!v?.yt) continue;
    const dur = v.dur;
    const short = /\/shorts\//.test(v.url) || (dur != null && dur <= SHORTS_MAX_SEC);
    if (!short) continue;
    if (!isRelevant({ title: d?.title, contents: "", src: d?.author }, ctx) || !shortsMatch(camp, d?.title, { dup, others })) continue;
    out.push({ ...v, kind: "short", via: "daum_vclip" });
  }
  return out;
}

/** YouTube Data API search 항목 + 길이 맵 → 숏츠 항목 */
export function shortsFromYoutube(camp, items, durById = {}, { others = [], dup = false } = {}) {
  const ctx = ctxOf(camp, others);
  const out = [];
  for (const it of items ?? []) {
    const id = it?.id?.videoId, sn = it?.snippet ?? {};
    if (!id) continue;
    const dur = durById[id];
    if (!(dur > 0 && dur <= SHORTS_MAX_SEC)) continue;
    if (!isRelevant({ title: sn.title, contents: sn.description, src: sn.channelTitle }, ctx) || !shortsMatch(camp, sn.title, { dup, others })) continue;
    out.push({
      title: stripHtml(sn.title).slice(0, 120), url: `https://www.youtube.com/shorts/${id}`, thumb: sn.thumbnails?.high?.url ?? sn.thumbnails?.medium?.url ?? null,
      dur, author: stripHtml(sn.channelTitle) || null, date: String(sn.publishedAt ?? "").slice(0, 10) || null, yt: id, kind: "short", via: "youtube_api",
    });
  }
  return out;
}

/** 채우기만(병합 정책 ①): 이미 있는 영상(같은 YouTube id·URL)은 건드리지 않고, 없는 숏츠만 뒤에 붙인다. */
export function fillShorts(videos = [], shorts = [], max = VIDEO_CAPS.shorts + VIDEO_CAPS.videos) {
  const have = new Set();
  for (const v of videos ?? []) { const id = v?.yt || youtubeId(v?.url); if (id) have.add(id); if (v?.url) have.add(v.url); }
  const add = [];
  for (const s of shorts ?? []) {
    if (add.length >= max) break;
    if (!s?.yt || have.has(s.yt) || have.has(s.url)) continue;
    have.add(s.yt); add.push(s);
  }
  return { videos: [...(videos ?? []), ...add], added: add };
}

/** 대상 순서: ① 찜/우선순위 업장(priorityIds) 먼저, ② 영상이 하나도 없는 곳, ③ 그다음 숏츠가 없는 곳, ④ 캐시가 오래된 순 */
export function pickShortsDue(camps, cache, hasVideo, maxAgeDays = 30, now = Date.now(), priorityIds = new Set()) {
  const age = (r) => (r?.fetched_at ? (now - Date.parse(r.fetched_at)) / 864e5 : Infinity);
  const isPrio = (id) => priorityIds && (priorityIds.has?.(String(id)) || (Array.isArray(priorityIds) && priorityIds.includes(String(id))));
  return camps
    .filter((c) => !cache[c.id] || cache[c.id].v !== SHORTS_CACHE_VERSION || age(cache[c.id]) >= maxAgeDays)
    .sort((a, b) => {
      const pDiff = (isPrio(b.id) ? 1 : 0) - (isPrio(a.id) ? 1 : 0);
      if (pDiff !== 0) return pDiff;
      return (hasVideo(a.id) ? 1 : 0) - (hasVideo(b.id) ? 1 : 0) || age(cache[b.id]) - age(cache[a.id]);
    });
}
