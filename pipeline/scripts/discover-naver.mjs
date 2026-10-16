#!/usr/bin/env node
// 네이버 검색 API(NAVER API HUB 지역 검색)로 전 캠핑장의 네이버 등록 장소(홈페이지 링크·전화·분류·주소)를 맞춘다.
// 결과: registry/naver-places.json. 등록 링크가 운영자 호스트이면 crawl-operator-sites가 시작 주소로 쓴다.
// 키: NAVER_API_HUB_CLIENT_ID / NAVER_API_HUB_CLIENT_SECRET(저장소 비밀값). 없으면 아무것도 바꾸지 않는다.
// 옵션: --max-calls N(기본 4000) --max-age-days N(기본 30) --probe(1건만 호출해 키·경로 확인) --only id,id
// 유료 방지: 호출 전 NCP 가이드의 ‘한시적으로 무료’ 확인(못 하면 중단) · 월 예산 NAVER_MONTHLY_CAP(기본 20,000) · 402/요금 응답 즉시 중단 ·
//            저장소 변수 NAVER_API_ENABLED=false면 끔. 사용량은 registry/naver-usage.json.
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { LOCAL_PATHS, localUrl, matchNaver, naverGet, queryOf } from "../lib/naver-discovery.mjs";
import { checkFreeTier, DEFAULT_MONTHLY_CAP, monthKey, recordUsage, remainingBudget } from "../lib/naver-guard.mjs";

const root = resolve(fileURLToPath(import.meta.url), "../../..");
const arg = (k, d) => { const i = process.argv.indexOf(`--${k}`); return i > 0 ? process.argv[i + 1] : d; };
const MAX_CALLS_ARG = Number(arg("max-calls", process.env.NAVER_MAX_CALLS ?? 4000));
const MAX_AGE = Number(arg("max-age-days", 30));
const PROBE = process.argv.includes("--probe");
const only = arg("only") ? new Set(arg("only").split(",")) : null;
const id = process.env.NAVER_API_HUB_CLIENT_ID?.trim(), secret = process.env.NAVER_API_HUB_CLIENT_SECRET?.trim();
const outPath = join(root, "pipeline/registry/naver-places.json");
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

if (!id || !secret) { console.log("::warning title=네이버 발굴 건너뜀::NAVER_API_HUB_CLIENT_ID/SECRET 없음"); process.exit(0); }
// ── 유료 방지 안전장치(lib/naver-guard.mjs) ──────────────────────────────
if (String(process.env.NAVER_API_ENABLED ?? "").toLowerCase() === "false") { console.log("::notice title=네이버 꺼짐::저장소 변수 NAVER_API_ENABLED=false — 호출하지 않습니다."); process.exit(0); }
const usagePath = join(root, "pipeline/registry/naver-usage.json");
let usage = existsSync(usagePath) ? JSON.parse(readFileSync(usagePath, "utf8")) : null;
const freeCheck = await checkFreeTier();
console.log(`무료 확인: ${freeCheck.free ? "무료" : "중단"} — ${freeCheck.reason}${freeCheck.quote ? ` (“${freeCheck.quote}”)` : ""}`);
if (!freeCheck.free) {
  writeFileSync(usagePath, `${JSON.stringify(recordUsage(usage, 0, { check: freeCheck }), null, 1)}\n`);
  console.log(`::error title=네이버 API 호출 중단(유료 방지)::${freeCheck.reason} — ${freeCheck.url}`);
  process.exit(0);
}
const MONTHLY_CAP = Number(process.env.NAVER_MONTHLY_CAP || DEFAULT_MONTHLY_CAP);
const budget = remainingBudget(usage, MONTHLY_CAP);
console.log(`이번 달(${monthKey()}) 남은 예산 ${budget}/${MONTHLY_CAP}건 (무료 한도 월 775,000건)`);
if (budget < 2) { console.log("::warning title=네이버 월 예산 소진::이번 달은 더 호출하지 않습니다."); process.exit(0); }
console.log(`키 확인: ID ${id.length}자 · SECRET ${secret.length}자`);

const camps = JSON.parse(readFileSync(join(root, "camping-atlas/public/explore/data/campgrounds.json"), "utf8"));
const prev = existsSync(outPath) ? JSON.parse(readFileSync(outPath, "utf8")) : { campgrounds: {} };
const store = prev.campgrounds ?? {};

// 경로 확인: 첫 캠핑장으로 경로를 하나씩 시도한다.
const MAX_CALLS = Math.min(MAX_CALLS_ARG, budget);
let calls = 0;
const persistUsage = () => writeFileSync(usagePath, `${JSON.stringify(recordUsage(usage, calls, { check: freeCheck }), null, 1)}\n`);
let path = null;
const sample = camps.find((c) => c.name && c.sigungu) ?? camps[0];
for (const p of LOCAL_PATHS) {
  try {
    calls++;
    const items = await naverGet(localUrl(p, queryOf(sample)), { id, secret });
    path = p;
    console.log(`경로 확인: ${p} → ${items.length}건 (예: ${sample.name} → ${items[0] ? items[0].title.replace(/<[^>]+>/g, "") : "없음"})`);
    break;
  } catch (e) {
    console.log(`  ${p}: ${e.message.slice(0, 160)}`);
    if (e.code === "BILLING") { persistUsage(); console.log(`::error title=네이버 결제·요금 응답(즉시 중단)::${e.message.slice(0, 200)}`); process.exit(0); }
    if (e.code === "AUTH") { persistUsage(); console.log("::error title=네이버 키 인증 실패::HUB 콘솔에서 Application에 ‘검색 > 지역’ API가 선택됐는지, 키를 정확히 넣었는지 확인하세요."); process.exit(1); }
  }
}
if (!path) { persistUsage(); console.log("::error title=네이버 지역 검색 경로 없음::HUB 지역 검색 가이드의 요청 경로를 확인하세요."); process.exit(1); }
if (PROBE) { persistUsage(); process.exit(0); }

const stale = (t) => !t || (Date.now() - Date.parse(t)) / 864e5 > MAX_AGE;
const queue = camps.filter((c) => c.name && (!only || only.has(String(c.id))) && (only || stale(store[c.id]?.checked_at)));
let done = 0, stop = null;
const stat = { matched: 0, operatorLink: 0 };
for (const c of queue) {
  if (calls >= MAX_CALLS) { stop = "호출 상한"; break; }
  try {
    const items = await naverGet(localUrl(path, queryOf(c)), { id, secret });
    calls++;
    const place = matchNaver(c, items);
    store[c.id] = { checked_at: new Date().toISOString(), query: queryOf(c), place };
    if (place) stat.matched++;
    if (place?.link_is_operator) stat.operatorLink++;
  } catch (e) {
    if (e.code === "BILLING") { stop = `BILLING: ${e.message.slice(0, 160)}`; break; }
    if (e.code === "RATE_LIMIT") { stop = "429(한도) — 이번 실행 중단"; break; }
    if (e.code === "AUTH") { stop = `AUTH: ${e.message}`; break; }
    console.log(`  실패 ${c.id} ${c.name}: ${e.message.slice(0, 120)}`);
  }
  if (++done % 250 === 0) { console.log(`  ${done}/${queue.length} 호출 ${calls}`); save(); }
  await sleep(60); // 키당 50 RPS 한도보다 훨씬 느리게
}
function save() {
  writeFileSync(outPath, `${JSON.stringify({
    version: 1,
    generated_at: new Date().toISOString(),
    source: {
      label: "네이버 검색 API(NAVER API HUB 지역 검색)",
      docs: "https://guide.ncloud-docs.com/docs/apihub-overview",
      path,
      terms_note: "업장이 네이버에 등록한 장소 정보(링크·전화·분류·주소·좌표)만 저장. 플랫폼 평점·리뷰·사진은 받지 않는다. HUB 한시 무료(월 775,000건).",
    },
    campgrounds: store,
  }, null, 0)}\n`);
}
save();
persistUsage();
if (stop?.startsWith("BILLING")) console.log(`::error title=네이버 결제·요금 응답(즉시 중단)::${stop}`);
const all = Object.values(store);
console.log(`이번 실행 ${done}곳 · 호출 ${calls} · 맞춤 ${stat.matched} · 운영자 링크 ${stat.operatorLink}${stop ? ` · 중단: ${stop}` : ""}`);
console.log(`누적: 맞춤 ${all.filter((r) => r.place).length}/${all.length} · 운영자 홈페이지 링크 ${all.filter((r) => r.place?.link_is_operator).length}`);
