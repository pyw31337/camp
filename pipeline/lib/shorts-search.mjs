// 캠핑장 이름으로 YouTube 숏츠를 따로 찾는다(t39 #36 보강, 영우 님 2026-10-22: 일반 영상은 없는데 관련 숏츠가 있는 곳).
// 공식 API만 쓴다: ① 카카오(Daum) 동영상 검색 vclip — YouTube 영상도 색인됨, KAKAO_REST_API_KEY
//                 ② YouTube Data API v3 search.list(videoDuration=short) + videos.list(길이) — YOUTUBE_API_KEY가 있을 때만.
// YouTube 검색 화면을 긁지 않는다(서비스 약관). 메타데이터·URL·썸네일 주소만 저장.
// 관련성: 제목(+설명)에 캠핑장 핵심어가 있어야 한다(social-search isRelevant 그대로). 숏츠 판정: /shorts/ 주소 또는 길이 ≤ 180초.
import { cleanName, distinctiveTokens, isRelevant, normalizeVclip, regionStem, stripHtml, youtubeId } from "./social-search.mjs";

export const SHORTS_MAX_SEC = 180; // YouTube 숏츠 최대 길이(2024-10부터 3분)
export const SHORTS_CACHE_VERSION = 1;

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

const ctxOf = (camp, others = []) => ({ tokens: distinctiveTokens(camp?.name, camp?.address?.sigungu), stem: regionStem(camp?.address?.sigungu), others });

/** 카카오 vclip 문서 → 숏츠 항목(YouTube이고, 숏츠이고, 이 캠핑장을 가리키는 것만) */
export function shortsFromVclip(camp, docs, { others = [] } = {}) {
  const ctx = ctxOf(camp, others);
  const out = [];
  for (const d of docs ?? []) {
    const v = normalizeVclip(d);
    if (!v?.yt) continue;
    const dur = v.dur;
    const short = /\/shorts\//.test(v.url) || (dur != null && dur <= SHORTS_MAX_SEC);
    if (!short) continue;
    if (!isRelevant({ title: d?.title, contents: "", src: d?.author }, ctx)) continue;
    out.push({ ...v, kind: "short", via: "daum_vclip" });
  }
  return out;
}

/** YouTube Data API search 항목 + 길이 맵 → 숏츠 항목 */
export function shortsFromYoutube(camp, items, durById = {}, { others = [] } = {}) {
  const ctx = ctxOf(camp, others);
  const out = [];
  for (const it of items ?? []) {
    const id = it?.id?.videoId, sn = it?.snippet ?? {};
    if (!id) continue;
    const dur = durById[id];
    if (!(dur > 0 && dur <= SHORTS_MAX_SEC)) continue;
    if (!isRelevant({ title: sn.title, contents: sn.description, src: sn.channelTitle }, ctx)) continue;
    out.push({
      title: stripHtml(sn.title).slice(0, 120), url: `https://www.youtube.com/shorts/${id}`, thumb: sn.thumbnails?.high?.url ?? sn.thumbnails?.medium?.url ?? null,
      dur, author: stripHtml(sn.channelTitle) || null, date: String(sn.publishedAt ?? "").slice(0, 10) || null, yt: id, kind: "short", via: "youtube_api",
    });
  }
  return out;
}

/** 채우기만(병합 정책 ①): 이미 있는 영상(같은 YouTube id·URL)은 건드리지 않고, 없는 숏츠만 뒤에 붙인다. */
export function fillShorts(videos = [], shorts = [], max = 12) {
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

/** 대상 순서: 영상이 하나도 없는 곳 먼저, 그다음 숏츠가 없는 곳, 캐시가 오래된 순 */
export function pickShortsDue(camps, cache, hasVideo, maxAgeDays = 30, now = Date.now()) {
  const age = (r) => (r?.fetched_at ? (now - Date.parse(r.fetched_at)) / 864e5 : Infinity);
  return camps
    .filter((c) => !cache[c.id] || cache[c.id].v !== SHORTS_CACHE_VERSION || age(cache[c.id]) >= maxAgeDays)
    .sort((a, b) => (hasVideo(a.id) ? 1 : 0) - (hasVideo(b.id) ? 1 : 0) || age(cache[b.id]) - age(cache[a.id]));
}
