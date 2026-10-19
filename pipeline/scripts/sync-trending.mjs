#!/usr/bin/env node
// 실시간 인기: 최근 7일 글에서 캠핑장 언급을 세어 순위를 낸다 → camping-atlas/public/context/trending.json
// - 카카오(Daum) blog·cafe·vclip + 네이버 blog·cafearticle·news, 모두 최신순. 일 무료 한도의 일부만 쓴다(docs/TRENDING.md).
// - 맞춘 글(최근 8일)은 pipeline/registry/trending-posts.json에 굴려 가며 둔다. 같은 주소는 한 번만 센다.
// - 키가 없거나 호출이 실패해도 남은 글로 순위를 다시 쓰고 exit 0(빈 순위면 화면은 빈 상태).
// 환경: KAKAO_REST_API_KEY, NAVER_API_HUB_CLIENT_ID/SECRET, TRENDING_KAKAO_CAPS("blog,cafe,vclip" 기본 3000,3000,800),
//       TRENDING_NAVER_MAX_CALLS(기본 1500), TRENDING_DRY=1(호출 없이 저장된 글로만)
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { buildMatcher, kstDay, matchPost, platformOf, rankCamps, spamReason, urlKey, WINDOW_DAYS } from "../lib/trending.mjs";
import { EXCLUDED, kakaoSource, naverSource, queryPlan } from "../lib/trending-sources.mjs";
import { checkFreeTier, DEFAULT_MONTHLY_CAP, monthKey, remainingBudget } from "../lib/naver-guard.mjs";

const root = fileURLToPath(new URL("../../", import.meta.url));
const OUT = join(root, "camping-atlas/public/context/trending.json");
const POSTS = join(root, "pipeline/registry/trending-posts.json");
const USAGE = join(root, "pipeline/registry/trending-usage.json");
const NAVER_SHARED = join(root, "pipeline/registry/naver-usage.json");
const readJson = (p, d) => { try { return JSON.parse(readFileSync(p, "utf8")); } catch { return d; } };
const writeJson = (p, v, pretty = false) => { mkdirSync(dirname(p), { recursive: true }); writeFileSync(p, `${JSON.stringify(v, null, pretty ? 1 : 0)}\n`); };
const log = (m) => console.log(m);
const envNum = (k, d) => { const n = Number(process.env[k]); return Number.isFinite(n) && process.env[k] !== "" ? n : d; };

const today = process.env.TRENDING_TODAY || kstDay();
const since = new Date(Date.parse(`${today}T00:00:00Z`) - (WINDOW_DAYS - 1) * 864e5).toISOString().slice(0, 10);
const dry = process.env.TRENDING_DRY === "1";

const catRaw = readJson(join(root, "camping-atlas/public/explore/data/campgrounds.json"), []);
const camps = (Array.isArray(catRaw) ? catRaw : catRaw.campgrounds ?? []).filter((c) => c.status !== "closed");
const matcher = buildMatcher(camps);
log(`캠핑장 ${camps.length}곳 · 기간 ${since} ~ ${today}`);

// 1) 수집
const queries = queryPlan();
const usage = readJson(USAGE, { version: 1, days: {} });
const run = { at: new Date().toISOString(), kakao: null, naver: null };
const collected = [];
if (!dry) {
  const [b, c, v] = String(process.env.TRENDING_KAKAO_CAPS || "3000,3000,800").split(",").map(Number);
  const kakao = kakaoSource({ key: process.env.KAKAO_REST_API_KEY?.trim(), caps: { blog: b, cafe: c, vclip: v } });
  if (kakao.enabled) { collected.push(...await kakao.collect(queries, since, log)); run.kakao = kakao.calls; }
  else log("카카오 건너뜀: KAKAO_REST_API_KEY 없음");

  const id = process.env.NAVER_API_HUB_CLIENT_ID?.trim(), secret = process.env.NAVER_API_HUB_CLIENT_SECRET?.trim();
  if (id && secret && String(process.env.NAVER_API_ENABLED ?? "").toLowerCase() !== "false") {
    const free = await checkFreeTier();
    log(`네이버 무료 확인: ${free.free ? "무료" : "중단"} — ${free.reason}`);
    if (free.free) {
      // 월 상한은 Data sync(웹 언급)와 같이 쓴다: 공용 사용량 + 이 수집 사용량을 빼고 남은 만큼만.
      const shared = readJson(NAVER_SHARED, null);
      const mine = Object.entries(usage.days).filter(([d]) => d.startsWith(monthKey())).reduce((n, [, x]) => n + (x.naver ?? 0), 0);
      const budget = remainingBudget(shared, Number(process.env.NAVER_MONTHLY_CAP || DEFAULT_MONTHLY_CAP)) - mine;
      const max = Math.max(0, Math.min(envNum("TRENDING_NAVER_MAX_CALLS", 1500), budget));
      log(`네이버 이번 실행 상한 ${max}건(이번 달 남은 공용 예산 ${budget})`);
      if (max > 0) { const naver = naverSource({ id, secret, maxCalls: max }); collected.push(...await naver.collect(queries, since, log)); run.naver = naver.calls; }
    }
  } else log("네이버 건너뜀: 키 없음 또는 NAVER_API_ENABLED=false");
}
usage.days[today] = { kakao: (usage.days[today]?.kakao ? Object.fromEntries(Object.entries(run.kakao ?? {}).map(([k, n]) => [k, n + (usage.days[today].kakao[k] ?? 0)])) : run.kakao), naver: (usage.days[today]?.naver ?? 0) + (run.naver ?? 0) };
for (const d of Object.keys(usage.days)) if (d < new Date(Date.now() - 62 * 864e5).toISOString().slice(0, 10)) delete usage.days[d];
if (!dry) writeJson(USAGE, usage, true);

// 2) 거르기·맞추기 (같은 주소는 한 번)
const store = readJson(POSTS, { version: 1, posts: {} });
let spam = 0, matched = 0, unmatched = 0, dup = 0;
for (const p of collected) {
  const key = urlKey(p.url);
  if (!key) continue;
  const old = store.posts[key];
  if (old) { dup++; if (!old.thumb && p.thumb) old.thumb = p.thumb; continue; }
  if (spamReason(p)) { spam++; continue; }
  const ids = matchPost(p, matcher);
  if (!ids.length) { unmatched++; continue; }
  matched++;
  // 날짜가 없는 글(네이버 카페)은 처음 본 날로 센다. 최신순 결과에서만 모으므로 대개 당일 글이다.
  store.posts[key] = { ids, date: p.date ?? today, seen: today, url: p.url, title: p.title, platform: platformOf(p), thumb: p.thumb ?? null };
}
for (const [k, p] of Object.entries(store.posts)) if (p.date < since || p.seen < since) delete store.posts[k];
store.updated_at = new Date().toISOString();
writeJson(POSTS, store);
log(`수집 ${collected.length}건 · 같은 주소 ${dup} · 스팸 ${spam} · 캠핑장 못 맞춤 ${unmatched} · 새로 맞춤 ${matched} · 저장 글 ${Object.keys(store.posts).length}`);

// 3) 순위
const prevOut = readJson(OUT, null);
const prevRanks = {};
if (prevOut?.date && prevOut.date < today) for (const x of prevOut.top ?? []) prevRanks[x.id] = x.rank;
else if (prevOut?.prev_ranks) Object.assign(prevRanks, prevOut.prev_ranks);
const top = rankCamps(Object.values(store.posts), today, { prevRanks, top: 30 });
const byId = new Map(camps.map((c) => [String(c.id), c]));
const result = {
  version: 1, date: today, window_days: WINDOW_DAYS, since, generated_at: new Date().toISOString(),
  method: "최근 7일 글(블로그·카페·뉴스·동영상)에서 캠핑장 이름+지역을 맞춰 센 수. 오늘 글 1, 2일 전 0.5처럼 최근일수록 크게 셉니다. 한 글이 여러 곳을 다루면 나눠 셉니다.",
  sources: { daum: "Daum 검색 API(카카오)", naver: "네이버 검색 API", youtube: "Daum 동영상 검색에 잡힌 YouTube" },
  excluded: EXCLUDED.map(({ key, label, status }) => ({ key, label, status })),
  prev_ranks: prevRanks,
  totals: { posts: Object.keys(store.posts).length, camps: new Set(Object.values(store.posts).flatMap((p) => p.ids)).size },
  top: top.map((x) => ({ ...x, name: byId.get(x.id)?.name ?? null, region: [byId.get(x.id)?.sido, byId.get(x.id)?.sigungu].filter(Boolean).join(" ") })),
};
writeJson(OUT, result);
log(`순위 ${top.length}곳 · 상위 10:`);
for (const x of result.top.slice(0, 10)) log(`  ${x.rank}. ${x.name} (${x.region}) 점수 ${x.score} · 오늘 ${x.today} · 7일 ${x.week} ${JSON.stringify(x.by)}`);
process.exit(0);
