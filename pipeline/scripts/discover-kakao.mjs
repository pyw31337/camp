#!/usr/bin/env node
// 카카오 공식 API로 (1) 전 캠핑장의 카카오맵 장소를 맞추고 (2) 운영자 홈페이지가 없거나 죽은 곳의 홈페이지 후보를 찾는다.
// 결과: registry/kakao-places.json (장소 ID·전화·분류·주소·카카오맵 링크, 홈페이지 후보와 근거 검색 결과 URL).
// 발굴 홈페이지는 crawl-operator-sites.mjs가 다음 실행에서 읽는다(고캠핑 등록 홈페이지가 없을 때만).
// 키(KAKAO_REST_API_KEY)는 GitHub Actions 비밀값으로만 주입된다. 키가 없으면 아무것도 바꾸지 않고 끝난다.
// 옵션: --max-calls N(기본 8000) --max-age-days N(기본 30) --only id,id --concurrency N(기본 4)
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { DISCOVERY_VERSION, hasOperatorSite, homepageCandidates, kakaoGet, localUrl, matchPlace, pickHomepages, webUrl } from "../lib/kakao-discovery.mjs";

const root = resolve(fileURLToPath(import.meta.url), "../../..");
const arg = (k, d) => { const i = process.argv.indexOf(`--${k}`); return i > 0 ? process.argv[i + 1] : d; };
const MAX_CALLS = Number(arg("max-calls", process.env.KAKAO_DISCOVERY_MAX_CALLS ?? 8000));
const MAX_AGE = Number(arg("max-age-days", 30));
const CONC = Number(arg("concurrency", 4));
const only = arg("only") ? new Set(arg("only").split(",")) : null;
const key = process.env.KAKAO_REST_API_KEY;
const outPath = join(root, "pipeline/registry/kakao-places.json");
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

if (!key) { console.log("::warning title=카카오 발굴 건너뜀::KAKAO_REST_API_KEY 없음"); process.exit(0); }

const camps = JSON.parse(readFileSync(join(root, "camping-atlas/public/explore/data/campgrounds.json"), "utf8"));
const sitesPath = join(root, "pipeline/registry/operator-site-snippets.json");
const sites = existsSync(sitesPath) ? JSON.parse(readFileSync(sitesPath, "utf8")).campgrounds ?? {} : {};
const prev = existsSync(outPath) ? JSON.parse(readFileSync(outPath, "utf8")) : { campgrounds: {} };
const store = prev.campgrounds ?? {};

// 홈페이지 찾기 대상: 운영자 사이트가 없거나, 있어도 읽기에 실패·종료된 곳
const DEAD = new Set(["FETCH_FAILED", "SERVICE_CLOSED", "NO_OPERATOR_SITE"]);
const needsHomepage = (c) => !hasOperatorSite(c) || DEAD.has(sites[c.id]?.status);
const stale = (t) => !t || (Date.now() - Date.parse(t)) / 864e5 > MAX_AGE;

const queue = camps.filter((c) => (!only || only.has(String(c.id))) && (only || stale(store[c.id]?.checked_at)))
  .sort((a, b) => (Date.parse(store[a.id]?.checked_at ?? "") || 0) - (Date.parse(store[b.id]?.checked_at ?? "") || 0));
let calls = 0, stop = null, done = 0;
const stat = { place: 0, web: 0 };

async function one(c) {
  const rec = { checked_at: new Date().toISOString(), place: null, candidates: [], needs_homepage: needsHomepage(c) };
  calls++;
  rec.place = matchPlace(c, await kakaoGet(localUrl(c), { key }));
  if (rec.place) stat.place++;
  if (rec.needs_homepage) {
    calls++;
    rec.candidates = homepageCandidates(c, await kakaoGet(webUrl(c), { key })).slice(0, 5);
    if (rec.candidates.length) stat.web++;
  }
  store[c.id] = rec;
}

let idx = 0;
const per = (c) => (needsHomepage(c) ? 2 : 1);
async function worker() {
  while (!stop && idx < queue.length) {
    const c = queue[idx++];
    if (calls + per(c) > MAX_CALLS) { stop = "호출 상한"; break; }
    try { await one(c); } catch (e) {
      if (e.code === "RATE_LIMIT" || e.code === "AUTH") { stop = `${e.code}: ${e.message}`; break; }
      console.log(`  실패 ${c.id} ${c.name}: ${e.message}`);
    }
    if (++done % 200 === 0) { console.log(`  ${done}/${queue.length} 호출 ${calls}`); save(); }
    await sleep(80);
  }
}
function save() {
  const cands = Object.fromEntries(Object.entries(store).map(([id, r]) => [id, r.needs_homepage ? r.candidates : []]));
  const { picked, shared } = pickHomepages(cands);
  for (const [id, r] of Object.entries(store)) r.homepage = picked[id] ?? null;
  const out = {
    version: DISCOVERY_VERSION,
    generated_at: new Date().toISOString(),
    source: {
      label: "카카오 로컬 키워드 검색 · Daum 웹 검색(공식 REST API)",
      docs: ["https://developers.kakao.com/docs/latest/ko/local/dev-guide", "https://developers.kakao.com/docs/latest/ko/daum-search/dev-guide"],
      terms_note: "장소 ID·전화·분류·주소·카카오맵 링크와 검색 결과 URL·제목만 저장. 카카오맵 장소 페이지·후기·사진은 읽지 않는다(robots.txt가 AI 크롤러 차단).",
    },
    shared_hosts: shared,
    campgrounds: store,
  };
  writeFileSync(outPath, `${JSON.stringify(out, null, 1)}\n`);
}

console.log(`카카오 발굴 대상 ${queue.length}곳(홈페이지 찾기 ${queue.filter(needsHomepage).length}) · 호출 상한 ${MAX_CALLS}`);
await Promise.all(Array.from({ length: CONC }, worker));
save();
const all = Object.values(store);
console.log(`이번 실행 ${done}곳 · 호출 ${calls} · 장소 맞춤 ${stat.place} · 홈페이지 후보 ${stat.web}${stop ? ` · 중단: ${stop}` : ""}`);
console.log(`누적: 장소 ${all.filter((r) => r.place).length}/${all.length} · 홈페이지 발굴 ${all.filter((r) => r.homepage).length}/${all.filter((r) => r.needs_homepage).length}`);
if (stop?.startsWith("AUTH")) console.log("::warning title=카카오 키 확인::앱 키 권한(로컬·검색 API 활성화)을 확인하세요.");
