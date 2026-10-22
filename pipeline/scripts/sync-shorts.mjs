// 캠핑장별 YouTube 숏츠 능동 수집 → out/campground-shorts.json (t39 #36 보강)
// - 카카오(Daum) 동영상 검색(vclip) ‘이름 쇼츠’·‘이름 shorts’ 2회/곳. KAKAO_REST_API_KEY. 숏츠(/shorts/ 또는 ≤180초)이고 이름이 맞는 것만.
// - YOUTUBE_API_KEY가 있으면 YouTube Data API search.list(videoDuration=short, 100단위) + videos.list(길이, 1단위)도 쓴다(일 10,000단위의 절반 이하 → YT_MAX_SEARCHES 기본 45곳 ≈ 4,550단위, AGENTS.md 무과금 원칙).
// - 영상이 하나도 없는 캠핑장부터. 캐시 registry/shorts-search.json(SHORTS_MAX_AGE_DAYS 기본 30일). 한도·인증 오류면 즉시 멈춤.
// - 화면 데이터에는 build-explore-data가 ‘채우기만’ 한다(이미 있는 영상은 그대로, 없는 숏츠만 덧붙임).
// 키가 없거나 네트워크가 실패해도 캐시로 결과를 쓰고 exit 0.
import { existsSync } from "node:fs";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { nowInKst, toKstIso } from "../lib/kst.mjs";
import { kakaoSearch, nameCore, regionStem } from "../lib/social-search.mjs";
import { SHORTS_CACHE_VERSION, isoDurationSec, pickShortsDue, refilterShorts, excludeMap, shortsFromVclip, shortsFromYoutube, shortsQueries } from "../lib/shorts-search.mjs";

const out = fileURLToPath(new URL("../out/", import.meta.url));
const cacheDir = fileURLToPath(new URL("../.cache/", import.meta.url));
// 캐시는 저장소에 커밋한다(registry): 매일 실행·수동 실행·증분 발행이 같은 기록을 이어 쓴다. 숏츠가 없는 곳은 확인 시각만.
const cachePath = fileURLToPath(new URL("../registry/shorts-search.json", import.meta.url));
const warn = (t, m) => console.log(`::warning title=${t}::${m}`);
const readJson = async (p, fb) => { try { return JSON.parse(await readFile(p, "utf8")); } catch { return fb; } };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
// 한 줄에 한 곳(커밋 차이를 작게)
const dumpCache = (c) => `{"campgrounds":{\n${Object.entries(c.campgrounds).map(([k, v]) => `${JSON.stringify(k)}:${JSON.stringify(v)}`).join(",\n")}\n}}\n`;
const envNum = (k, d) => { const n = Number(process.env[k] ?? d); return Number.isFinite(n) ? n : d; };
const MAX_AGE_DAYS = envNum("SHORTS_MAX_AGE_DAYS", 30);
const MAX_CALLS = envNum("SHORTS_MAX_CALLS", 6000);
const YT_MAX = envNum("YT_MAX_SEARCHES", 45);
const DELAY_MS = envNum("SHORTS_DELAY_MS", 120);
const CONCURRENCY = Math.max(1, envNum("SHORTS_CONCURRENCY", 4));

try { await mkdir(out, { recursive: true }); await mkdir(cacheDir, { recursive: true }); await main(); }
catch (e) { warn("숏츠 수집 실패", e?.stack ?? String(e)); }
process.exit(0);

async function loadCamps() {
  const p1 = `${out}campgrounds.json`;
  if (existsSync(p1)) {
    const { campgrounds = [] } = await readJson(p1, {});
    return campgrounds.map((c) => ({ id: String(c?.external_id?.id ?? ""), name: c?.name, address: c?.address ?? {} })).filter((c) => c.id && c.name);
  }
  const p2 = fileURLToPath(new URL("../../camping-atlas/public/explore/data/campgrounds.json", import.meta.url));
  const raw = await readJson(p2, []);
  return (Array.isArray(raw) ? raw : raw.campgrounds ?? []).map((c) => ({ id: String(c?.id ?? ""), name: c?.name, address: { sido: c?.sido, sigungu: c?.sigungu } })).filter((c) => c.id && c.name);
}
async function videoCounts() {
  // 지금 화면에 영상이 있는지(목록 soc[1]) — 없는 곳부터 찾는다.
  const p = fileURLToPath(new URL("../../camping-atlas/public/explore/data/campgrounds.json", import.meta.url));
  const raw = await readJson(p, []);
  const m = new Map();
  for (const c of Array.isArray(raw) ? raw : raw.campgrounds ?? []) m.set(String(c.id), Number(c?.soc?.[1] ?? 0));
  return m;
}
async function ytJson(url) {
  const r = await fetch(url, { signal: AbortSignal.timeout(10000) });
  if (r.status === 403 || r.status === 429) { const e = new Error(`YouTube ${r.status}`); e.code = r.status === 429 ? "RATE_LIMIT" : "AUTH"; throw e; }
  if (!r.ok) throw new Error(`YouTube ${r.status}`);
  return r.json();
}

async function main() {
  const fetchedAt = toKstIso(nowInKst());
  const camps = await loadCamps();
  if (!camps.length) { warn("숏츠 수집 건너뜀", "캠핑장 카탈로그 없음"); return; }
  const vc = await videoCounts();
  const coresBySigungu = new Map();
  for (const c of camps) { const k = `${c.address.sido ?? ""} ${c.address.sigungu ?? ""}`; if (!coresBySigungu.has(k)) coresBySigungu.set(k, []); coresBySigungu.get(k).push(nameCore(c.name, c.address.sigungu)); }
  const coreCount = new Map();
  for (const c of camps) { const k = nameCore(c.name, c.address.sigungu).toLowerCase(); coreCount.set(k, (coreCount.get(k) ?? 0) + 1); }
  const stems = [...new Set(camps.map((c) => regionStem(c.address.sigungu)).filter((x) => x && x.length >= 2))];
  const excl = excludeMap(await readJson(fileURLToPath(new URL("../registry/shorts-exclude.json", import.meta.url)), {}));
  const dupOf = (c) => (coreCount.get(nameCore(c.name, c.address.sigungu).toLowerCase()) ?? 0) > 1;
  const othersOf = (c) => coresBySigungu.get(`${c.address.sido ?? ""} ${c.address.sigungu ?? ""}`) ?? [];
  const cache = await readJson(cachePath, { campgrounds: {} }); cache.campgrounds ??= {};
  const due = pickShortsDue(camps, cache.campgrounds, (id) => (vc.get(id) ?? 0) > 0, MAX_AGE_DAYS);
  const kkey = process.env.KAKAO_REST_API_KEY, ykey = process.env.YOUTUBE_API_KEY;
  console.log(`캠핑장 ${camps.length}곳 · 영상 없는 곳 ${[...vc.values()].filter((n) => !n).length}곳 · 숏츠 갱신 대상 ${due.length}곳`);
  let calls = 0, yt = 0, ok = 0, failed = 0, stopped = null, firstError = null, ytStopped = false;
  if (!kkey) warn("숏츠 수집 호출 건너뜀", "KAKAO_REST_API_KEY 없음 — 캐시만 사용");
  else if (MAX_CALLS > 0) {
    const batch = due.slice(0, Math.floor(MAX_CALLS / 2));
    let i = 0, since = 0;
    const worker = async () => {
      while (i < batch.length && !stopped) {
        const c = batch[i++];
        const qs = shortsQueries(c);
        if (!qs.length) continue;
        try {
          const docs = [];
          for (const q of qs) { calls++; docs.push(...(await kakaoSearch("vclip", q, { sort: "accuracy", size: 30 }, { key: kkey }))); if (DELAY_MS) await sleep(DELAY_MS); }
          let shorts = shortsFromVclip(c, docs, { others: othersOf(c), dup: dupOf(c), stems, exclude: excl[c.id] ?? [] });
          if (ykey && !ytStopped && yt < YT_MAX) {
            try {
              yt++;
              const s = await ytJson(`https://www.googleapis.com/youtube/v3/search?part=snippet&type=video&videoDuration=short&maxResults=15&regionCode=KR&relevanceLanguage=ko&q=${encodeURIComponent(qs[0].replace(/ 쇼츠$/, " #shorts"))}&key=${ykey}`);
              const ids = (s.items ?? []).map((x) => x?.id?.videoId).filter(Boolean);
              const durs = {};
              if (ids.length) for (const v of (await ytJson(`https://www.googleapis.com/youtube/v3/videos?part=contentDetails&id=${ids.join(",")}&key=${ykey}`)).items ?? []) durs[v.id] = isoDurationSec(v.contentDetails?.duration);
              shorts = [...shorts, ...shortsFromYoutube(c, s.items, durs, { others: othersOf(c), dup: dupOf(c), stems, exclude: excl[c.id] ?? [] })];
            } catch (e) { ytStopped = true; warn("YouTube API 중단", e.message); }
          }
          const seen = new Set();
          shorts = shorts.filter((x) => !seen.has(x.yt) && seen.add(x.yt)).slice(0, 12);
          cache.campgrounds[c.id] = shorts.length ? { v: SHORTS_CACHE_VERSION, fetched_at: fetchedAt, shorts } : { v: SHORTS_CACHE_VERSION, fetched_at: fetchedAt };
          ok++;
          if (++since >= 100) { since = 0; await writeFile(cachePath, dumpCache(cache)); }
        } catch (e) {
          failed++; firstError ??= e.message;
          if (e.code === "RATE_LIMIT" || e.code === "AUTH" || failed >= 20) stopped = e;
        }
      }
    };
    await Promise.all(Array.from({ length: Math.min(CONCURRENCY, batch.length) }, worker));
    await writeFile(cachePath, dumpCache(cache));
    if (stopped) warn("카카오 숏츠 검색 중단", stopped.message); else if (firstError) warn("일부 숏츠 검색 실패", `${failed}곳 · ${firstError}`);
  }
  const records = {};
  let withShorts = 0, noVideoGained = 0, total = 0;
  for (const c of camps) {
    const r = cache.campgrounds[c.id];
    // 캐시는 예전 기준으로 걸렀을 수 있다 → 내보낼 때마다 엄격 판정으로 다시 거른다.
    const sh = refilterShorts(c, r?.shorts, { others: othersOf(c), dup: dupOf(c), stems, exclude: excl[c.id] ?? [] });
    if (!sh.length) continue;
    records[c.id] = { fetched_at: r.fetched_at, shorts: sh };
    withShorts++; total += sh.length;
    if (!(vc.get(c.id) ?? 0)) noVideoGained++;
  }
  const stats = { camps: camps.length, searched_this_run: ok, kakao_calls: calls, youtube_searches: yt, with_shorts: withShorts, shorts_total: total, no_video_camps_with_shorts: noVideoGained };
  await writeFile(`${out}campground-shorts.json`, JSON.stringify({ generated_at: fetchedAt, source: "Kakao Daum vclip search" + (ykey ? " + YouTube Data API v3" : ""), stats, campgrounds: records }));
  console.log(`숏츠: ${JSON.stringify(stats)}`);
  if (process.env.GITHUB_STEP_SUMMARY) await writeFile(process.env.GITHUB_STEP_SUMMARY, `### YouTube 숏츠 수집\n\n${Object.entries(stats).map(([k, v]) => `- ${k}: ${v}`).join("\n")}\n`, { flag: "a" });
}
