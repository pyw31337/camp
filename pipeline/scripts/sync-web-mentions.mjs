#!/usr/bin/env node
// 업장별 웹 언급 수집 → out/campground-web.json (lib/web-mentions.mjs 원칙 참고)
// 1) 네이버 검색 API(NAVER API HUB: 블로그·카페·웹문서·지식iN) — 캠핑장당 QUERY_PLAN 7회, 14일마다 순환 갱신.
// 2) 본문 문장 — 네이버 결과와 카카오 다음 검색 후기(.cache/social-search.json) 중 robots.txt가 허용한 블로그만(티스토리 등).
//    호스트 묶음마다 1.1초 간격, 봇 이름 표기, 한 번 읽은 글은 다시 읽지 않는다.
// 유료 방지: naver-guard(요금표 0원 확인·월 예산·402 즉시 중단·NAVER_API_ENABLED=false 킬스위치). 한 실행 호출은 일 한도(25,000)의 절반 미만.
// 환경: NAVER_API_HUB_CLIENT_ID/SECRET, NAVER_MENTION_MAX_CALLS(기본 8000), WEB_MAX_AGE_DAYS(14), BODY_MINUTES(25), SEARCH_MINUTES(15), BODY_MAX(2500)
// 키가 없거나 실패해도 캐시로 출력하고 exit 0.
import { existsSync, readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { naverGet } from "../lib/naver-discovery.mjs";
import { checkFreeTier, DEFAULT_MONTHLY_CAP, monthKey, recordUsage, remainingBudget } from "../lib/naver-guard.mjs";
import { buildQuery, distinctiveTokens, extractPriceMentions, isRelevant, isStale, nameCore, regionStem } from "../lib/social-search.mjs";
import {
  BOT_UA, NAVER_TYPES, QUERY_PLAN, bodyBlockedHost, bodySentences, docText, hostGroup, naverSearchUrl, normalizeNaver, pathsOf, robotsVerdict,
} from "../lib/web-mentions.mjs";

const root = resolve(fileURLToPath(import.meta.url), "../../..");
const envNum = (k, d) => { const n = Number(process.env[k] ?? d); return Number.isFinite(n) ? n : d; };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const warn = (t, m) => console.log(`::warning title=${t}::${m}`);
const cacheDir = join(root, "pipeline/.cache"), outDir = join(root, "pipeline/out");
const cachePath = join(cacheDir, "web-mentions.json");
const usagePath = join(root, "pipeline/registry/naver-usage.json");
const MAX_AGE = envNum("WEB_MAX_AGE_DAYS", 14);
const DROP_AGE = envNum("WEB_DROP_AGE_DAYS", 120);
const BODY_MINUTES = envNum("BODY_MINUTES", 25);
const SEARCH_MINUTES = envNum("SEARCH_MINUTES", 15);
const BODY_MAX = envNum("BODY_MAX", 2500);
const KEEP_DOCS = 30;
mkdirSync(cacheDir, { recursive: true }); mkdirSync(outDir, { recursive: true });

const readJson = (p, d) => { try { return JSON.parse(readFileSync(p, "utf8")); } catch { return d; } };
const cache = readJson(cachePath, { v: 1, campgrounds: {}, bodies: {}, robots: {} });
cache.campgrounds ??= {}; cache.bodies ??= {}; cache.robots ??= {};
const saveCache = () => writeFileSync(cachePath, JSON.stringify(cache));

const camps = readJson(join(root, "camping-atlas/public/explore/data/campgrounds.json"), [])
  .filter((c) => c.status !== "폐업" && c.name)
  .map((c) => ({ id: String(c.id), name: c.name, address: { sido: c.sido, sigungu: c.sigungu } }));
if (!camps.length) { warn("웹 언급 건너뜀", "캠핑장 카탈로그 없음"); process.exit(0); }
const cores = new Map();
for (const c of camps) { const k = `${c.address.sido} ${c.address.sigungu}`; if (!cores.has(k)) cores.set(k, []); cores.get(k).push(nameCore(c.name, c.address.sigungu)); }
const ctxOf = (c) => ({ tokens: distinctiveTokens(c.name, c.address.sigungu), stem: regionStem(c.address.sigungu), others: cores.get(`${c.address.sido} ${c.address.sigungu}`) ?? [] });

await naverPhase();
await bodyPhase();
writeOutput();
process.exit(0);

// ── 1) 네이버 검색 API ──────────────────────────────────────────────
async function naverPhase() {
  const id = process.env.NAVER_API_HUB_CLIENT_ID?.trim(), secret = process.env.NAVER_API_HUB_CLIENT_SECRET?.trim();
  if (!id || !secret) { warn("네이버 검색 건너뜀", "NAVER_API_HUB_CLIENT_ID/SECRET 없음 — 캐시만 사용"); return; }
  if (String(process.env.NAVER_API_ENABLED ?? "").toLowerCase() === "false") { console.log("::notice::NAVER_API_ENABLED=false — 네이버 호출 안 함"); return; }
  let usage = readJson(usagePath, null);
  const free = await checkFreeTier();
  console.log(`무료 확인: ${free.free ? "무료" : "중단"} — ${free.reason}`);
  if (!free.free) { writeFileSync(usagePath, `${JSON.stringify(recordUsage(usage, 0, { check: free }), null, 1)}\n`); console.log(`::error title=네이버 호출 중단(유료 방지)::${free.reason}`); return; }
  const cap = Number(process.env.NAVER_MONTHLY_CAP || DEFAULT_MONTHLY_CAP);
  const budget = remainingBudget(usage, cap);
  const MAX = Math.min(envNum("NAVER_MENTION_MAX_CALLS", 8000), budget, Math.floor((free.daily_limit ?? 25000) / 2) - 1);
  console.log(`이번 달(${monthKey()}) 남은 예산 ${budget}/${cap} · 이번 실행 상한 ${MAX}건`);
  if (MAX < QUERY_PLAN.length) return;
  let calls = 0;
  const persist = () => writeFileSync(usagePath, `${JSON.stringify(recordUsage(usage, calls, { check: free }), null, 1)}\n`);
  // 종류별 경로 확인
  const paths = {};
  const sample = camps[0];
  for (const type of Object.keys(NAVER_TYPES)) {
    for (const p of pathsOf(type)) {
      try { calls++; await naverGet(naverSearchUrl(p, buildQuery(sample), 1), { id, secret }); paths[type] = p; break; }
      catch (e) {
        if (e.code === "BILLING") { persist(); console.log(`::error title=네이버 결제 응답(즉시 중단)::${e.message.slice(0, 200)}`); process.exit(0); }
        if (e.code === "AUTH") { console.log(`  ${type} ${p}: 인증 거부(이 API가 Application에 없음?)`); break; }
      }
    }
    console.log(`경로 ${type}: ${paths[type] ?? "없음"}`);
  }
  const plan = QUERY_PLAN.filter((q) => paths[q.type]);
  if (!plan.length) { persist(); warn("네이버 검색 경로 없음", "HUB Application의 검색 API 선택을 확인하세요."); return; }
  const due = camps.filter((c) => isStale(cache.campgrounds[c.id]?.fetched_at, MAX_AGE))
    .sort((a, b) => String(cache.campgrounds[a.id]?.fetched_at ?? "").localeCompare(String(cache.campgrounds[b.id]?.fetched_at ?? "")));
  console.log(`갱신 대상 ${due.length}곳 · 캠핑장당 ${plan.length}회`);
  let done = 0, stop = null;
  // 검색 단계 시간 상한: 워크플로 단계 시간 제한(50분)에 걸려 out/campground-web.json을 못 쓰고 끝나지 않게(2026-10-19 run 39200981608).
  const searchDeadline = Date.now() + SEARCH_MINUTES * 60e3;
  for (const c of due) {
    if (calls + plan.length > MAX) { stop = "호출 상한"; break; }
    if (Date.now() > searchDeadline) { stop = `시간 상한 ${SEARCH_MINUTES}분`; break; }
    const q = buildQuery(c);
    const ctx = ctxOf(c);
    const docs = new Map();
    try {
      for (const p of plan) {
        calls++;
        const items = await naverGet(naverSearchUrl(paths[p.type], `${q} ${p.suffix}`.trim(), p.display), { id, secret });
        for (const it of items) {
          const d = normalizeNaver(it, p.type);
          if (d && !docs.has(d.url) && isRelevant({ title: d.title, contents: d.snippet, src: d.src }, ctx)) docs.set(d.url, d);
        }
        await sleep(40);
      }
    } catch (e) {
      if (e.code === "BILLING") { stop = `BILLING ${e.message.slice(0, 120)}`; break; }
      if (e.code === "RATE_LIMIT" || e.code === "AUTH") { stop = `${e.code} ${e.message.slice(0, 120)}`; break; }
      continue; // 이 캠핑장은 다음 실행에서
    }
    const prev = cache.campgrounds[c.id]?.docs ?? [];
    const merged = [...docs.values(), ...prev.filter((x) => !docs.has(x.url))]
      .sort((a, b) => String(b.date ?? "").localeCompare(String(a.date ?? ""))).slice(0, 60);
    cache.campgrounds[c.id] = { fetched_at: new Date().toISOString(), query: q, docs: merged };
    if (++done % 200 === 0) { saveCache(); persist(); console.log(`  ${done}/${due.length} · 호출 ${calls}`); }
  }
  saveCache(); persist();
  if (stop?.startsWith("BILLING")) console.log(`::error title=네이버 결제 응답(즉시 중단)::${stop}`);
  console.log(`네이버 검색: ${done}곳 갱신 · 호출 ${calls}건${stop ? ` · 중단: ${stop}` : ""}`);
}

// ── 2) 허용 블로그 본문 문장 ─────────────────────────────────────────
async function robotsFor(origin) {
  const r = cache.robots[origin];
  if (r && !isStale(r.at, 30)) return r.txt;
  let txt = "";
  try {
    const res = await fetch(`${origin}/robots.txt`, { headers: { "User-Agent": BOT_UA }, signal: AbortSignal.timeout(10000), redirect: "follow" });
    txt = res.ok ? (await res.text()).slice(0, 30000) : "";
  } catch { txt = null; }
  if (txt === null) return null; // 접속 실패: 이번엔 건너뛴다
  cache.robots[origin] = { at: new Date().toISOString(), txt };
  return txt;
}
// 카카오 후기·카페 글 목록: 소셜 캐시가 없으면(로컬 실행 등) 커밋된 상세 데이터의 d.reviews·d.cafe를 쓴다.
var socialMemo = null; // 최상위 await보다 아래에 선언되므로 var(호이스팅)
function socialDocs() {
  if (socialMemo) return socialMemo;
  const cached = readJson(join(cacheDir, "social-search.json"), { campgrounds: {} }).campgrounds ?? {};
  if (Object.keys(cached).length) return (socialMemo = cached);
  const dir = join(root, "camping-atlas/public/explore/data/camps"), out = {};
  for (const c of camps) { const d = readJson(join(dir, `${c.id}.json`), null); if (d) out[c.id] = { blog: d.reviews ?? [], cafe: d.cafe ?? [] }; }
  return (socialMemo = out);
}
async function bodyPhase() {
  const social = socialDocs();
  // 캠핑장별 후보 글(최신 우선): 네이버 결과 + 카카오 후기·카페
  const jobs = [];
  for (const c of camps) {
    const docs = [...(cache.campgrounds[c.id]?.docs ?? []), ...(social[c.id]?.blog ?? []), ...(social[c.id]?.cafe ?? [])];
    for (const d of docs) if (d?.url && !cache.bodies[d.url] && !bodyBlockedHost(d.url)) jobs.push({ c, url: d.url, date: d.date ?? "" });
  }
  const seen = new Set();
  const queue = jobs.filter((j) => !seen.has(j.url) && seen.add(j.url)).sort((a, b) => String(b.date).localeCompare(String(a.date))).slice(0, BODY_MAX);
  if (!queue.length) { console.log("본문: 새로 읽을 글 없음"); return; }
  const groups = new Map();
  for (const j of queue) { const g = hostGroup(j.url); if (!groups.has(g)) groups.set(g, []); groups.get(g).push(j); }
  console.log(`본문 후보 ${queue.length}건 · 호스트 묶음 ${groups.size}개 · 시간 상한 ${BODY_MINUTES}분`);
  const deadline = Date.now() + BODY_MINUTES * 60e3;
  const stat = { ok: 0, empty: 0, blocked: 0, failed: 0 };
  const runGroup = async (list) => {
    for (const j of list) {
      if (Date.now() > deadline) return;
      const u = new URL(j.url);
      const txt = await robotsFor(u.origin);
      if (txt === null) { stat.failed++; continue; }
      const v = robotsVerdict(txt, u.pathname + u.search);
      if (!v.ok) { cache.bodies[j.url] = { at: new Date().toISOString(), status: v.reason }; stat.blocked++; continue; }
      try {
        const res = await fetch(j.url, { headers: { "User-Agent": BOT_UA, Accept: "text/html" }, signal: AbortSignal.timeout(15000), redirect: "follow" });
        if (!res.ok || !/html/i.test(res.headers.get("content-type") ?? "html")) { cache.bodies[j.url] = { at: new Date().toISOString(), status: `HTTP_${res.status}` }; stat.failed++; }
        else {
          const html = (await res.text()).slice(0, 2_000_000);
          const s = bodySentences(html, { tokens: ctxOf(j.c).tokens });
          cache.bodies[j.url] = { at: new Date().toISOString(), status: s.length ? "OK" : "NO_FACTS", s };
          s.length ? stat.ok++ : stat.empty++;
        }
      } catch (e) { cache.bodies[j.url] = { at: new Date().toISOString(), status: "FETCH_FAILED" }; stat.failed++; }
      await sleep(1100);
    }
  };
  const lists = [...groups.values()];
  let gi = 0;
  await Promise.all(Array.from({ length: Math.min(12, lists.length) }, async () => { while (gi < lists.length && Date.now() < deadline) await runGroup(lists[gi++]); }));
  saveCache();
  console.log(`본문: 사실 문장 ${stat.ok}건 · 단서 없음 ${stat.empty} · robots/AI 차단 ${stat.blocked} · 실패 ${stat.failed}`);
}

// ── 출력 ────────────────────────────────────────────────────────────
function writeOutput() {
  const social = socialDocs();
  const records = {}, bodies = {};
  let withDocs = 0, withBody = 0;
  for (const c of camps) {
    const r = cache.campgrounds[c.id];
    const docs = r && !isStale(r.fetched_at, DROP_AGE) ? r.docs.slice(0, KEEP_DOCS) : [];
    const withB = (d) => { const b = cache.bodies[d.url]; return b?.s?.length ? { ...d, body: b.s } : d; };
    const out = docs.map(withB);
    // 카카오 후기·카페 글의 본문 문장(글 자체는 d.reviews/d.cafe에 이미 있다)
    for (const d of [...(social[c.id]?.blog ?? []), ...(social[c.id]?.cafe ?? [])]) { const b = cache.bodies[d.url]; if (b?.s?.length) bodies[d.url] = b.s; }
    const prices = extractPriceMentions([...out, ...[...(social[c.id]?.blog ?? []), ...(social[c.id]?.cafe ?? [])].filter((d) => bodies[d.url]).map((d) => ({ ...d, body: bodies[d.url] }))]
      .map((d) => ({ ...d, snippet: docText(d) })));
    if (!out.length && !prices.length) continue;
    if (out.length) withDocs++;
    if (out.some((d) => d.body)) withBody++;
    records[c.id] = { fetched_at: r?.fetched_at ?? null, docs: out, ...(prices.length ? { prices } : {}) };
  }
  writeFileSync(join(outDir, "campground-web.json"), JSON.stringify({
    generated_at: new Date().toISOString(),
    source: { name: "네이버 검색 API(블로그·카페·웹문서·지식iN) + robots 허용 블로그 본문", tier: "MENTION", note: "후기·게시글 언급. 원문 링크·작성일과 함께 단서로만 쓴다." },
    campgrounds: records, bodies,
  }));
  console.log(`출력: 웹 언급 ${withDocs}곳 · 본문 문장 보유 ${withBody}곳 · 카카오 후기 본문 ${Object.keys(bodies).length}건`);
}
