#!/usr/bin/env node
// 전국 캠핑장 원자 사실 저장소를 만든다(lib/fact-store.mjs, 속성 사전 registry/attribute-dictionary.json).
// 쓰기(커밋되는 공유 원장, 에이전트가 grep·jq·SQL로 바로 쓴다):
//   data/facts/campgrounds.ndjson      캠핑장 기준표(id·이름·지역·좌표) 1곳 1행
//   data/facts/{group}.ndjson          속성 묶음별 사실 1건 1행(power·fire·price·amenity·review …)
//   data/facts/attributes.json         속성 사전 사본 + 속성별 커버리지(곳 수·등급별 건수)
//   data/facts/manifest.json           생성 시각·행 수·파일 목록·원천별 건수
// 선택(--sqlite): pipeline/out/facts.sqlite (node:sqlite, 커밋 안 함) — 같은 내용을 SQL로 조회.
// data-sync가 build-campground-profiles.mjs 뒤에 실행한다.
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { ATTR, DICTIONARY, GRADE_RANK, SOURCES, factsOf, validateFacts } from "../lib/fact-store.mjs";
import { CATEGORIES as NEARBY_CATS } from "../lib/nearby-licensed.mjs";
import { extractSiteDetails, hostOf } from "../lib/operator-site.mjs";
import { digestReviews } from "../lib/review-digest.mjs";

const root = resolve(fileURLToPath(import.meta.url), "../../..");
const dataDir = join(root, "camping-atlas/public/explore/data");
const outDir = join(root, "data/facts");
const readJson = (p, d) => (existsSync(p) ? JSON.parse(readFileSync(p, "utf8")) : d);
const camps = readJson(join(dataDir, "campgrounds.json"), []);
const sites = readJson(join(root, "pipeline/registry/operator-site-snippets.json"), {}).campgrounds ?? {};
const kakao = readJson(join(root, "pipeline/registry/kakao-places.json"), {}).campgrounds ?? {};
const naverReg = readJson(join(root, "pipeline/registry/naver-places.json"), {}).campgrounds ?? {};
const nearbyReg = readJson(join(root, "pipeline/registry/nearby-licensed.json"), null);
// 범주 → 원천 업종 페이지(첫 번째 원천) URL
const nearbyUrls = Object.fromEntries(NEARBY_CATS.map((c) => [c.code, nearbyReg?.sources?.find((s) => s.slug === c.from[0] && s.page_url)?.page_url ?? "https://www.localdata.go.kr/"]));
const nearbyOf = (id) => (nearbyReg?.campgrounds?.[id] ? { places: nearbyReg.campgrounds[id], urls: nearbyUrls, at: nearbyReg.generated_at } : null);

// 여러 캠핑장이 같이 쓰는 홈페이지 호스트(지자체 통합 예약 등)의 문장은 특정 캠핑장의 사실로 쓰지 않는다.
const host = (u) => hostOf(u ?? "")?.replace(/^www\./, "") ?? null;
const hostCount = new Map();
for (const c of camps) for (const h of new Set([host(c.homepage), host(sites[c.id]?.url)].filter(Boolean))) hostCount.set(h, (hostCount.get(h) ?? 0) + 1);

const now = new Date().toISOString();
const facts = [];
const registry = [];
for (const c of camps) {
  const path = join(dataDir, "camps", `${c.id}.json`);
  const d = readJson(path, null);
  const s = sites[c.id];
  const shared = [host(c.homepage), host(s?.url)].some((h) => h && (hostCount.get(h) ?? 0) > 1);
  const site = s?.status === "OK" && s.snippets?.length && !shared ? s : null;
  const details = site ? extractSiteDetails(site.snippets.map((x) => x.text)) : null;
  const digest = d ? digestReviews(c.name, [...(d.reviews ?? []), ...(d.cafe ?? [])], { min: 1, top: 99, regions: [c.sigungu, c.sido] }) : null;
  facts.push(...factsOf(c, d, { site, details, digest, kakao: kakao[c.id] ?? null, nearby: nearbyOf(c.id), naver: naverReg[c.id] ?? null }));
  registry.push({ cid: String(c.id), name: c.name, sido: c.sido ?? null, sigungu: c.sigungu ?? null, lat: c.lat ?? null, lng: c.lng ?? null, gc_url: c.gc_url ?? null, gc_at: c.modified_at ?? null, kakao_place_id: kakao[c.id]?.place?.id ?? null });
}

const errs = validateFacts(facts);
if (errs.length) {
  console.error(`사실 검증 실패 ${errs.length}건:\n${errs.slice(0, 20).join("\n")}`);
  process.exit(1);
}

// 묶음별 파일: 캠핑장 id → 속성 → 등급 높은 순으로 정렬해 diff가 안정되게 한다.
const order = (a, b) => a.cid.localeCompare(b.cid, "en", { numeric: true }) || a.attr.localeCompare(b.attr) || GRADE_RANK[b.grade] - GRADE_RANK[a.grade] || String(a.value).localeCompare(String(b.value));
const clean = (f) => Object.fromEntries(Object.entries(f).filter(([, v]) => v !== null && v !== undefined));
// 고캠핑 등록값은 원천 URL·확인 시각이 캠핑장 기준표(gc_url·gc_at)와 같으므로 파일에서는 생략한다(용량 절반). SQLite·Postgres에는 채워 넣는다.
const regById = new Map(registry.map((r) => [r.cid, r]));
const slim = (f) => {
  const r = regById.get(f.cid);
  if (f.src !== "gocamping" || !r) return clean(f);
  const { url, at, ...rest } = f;
  return clean({ ...rest, url: url === r.gc_url ? undefined : url, at: at === r.gc_at ? undefined : at });
};
rmSync(outDir, { recursive: true, force: true });
mkdirSync(outDir, { recursive: true });
const byGroup = new Map(Object.keys(DICTIONARY.groups).map((g) => [g, []]));
for (const f of facts) byGroup.get(ATTR.get(f.attr).group).push(f);
const files = {};
for (const [g, list] of byGroup) {
  if (!list.length) continue;
  list.sort(order);
  writeFileSync(join(outDir, `${g}.ndjson`), list.map((f) => JSON.stringify(slim(f))).join("\n") + "\n");
  files[`${g}.ndjson`] = list.length;
}
writeFileSync(join(outDir, "campgrounds.ndjson"), registry.map((r) => JSON.stringify(clean(r))).join("\n") + "\n");

// 속성별 커버리지
const cov = {};
for (const f of facts) {
  const x = (cov[f.attr] ??= { campgrounds: new Set(), grades: {} });
  x.campgrounds.add(f.cid);
  x.grades[f.grade] = (x.grades[f.grade] ?? 0) + 1;
}
const attributes = DICTIONARY.attributes.map((a) => ({ ...a, coverage: { campgrounds: cov[a.code]?.campgrounds.size ?? 0, by_grade: cov[a.code]?.grades ?? {} } }));
writeFileSync(join(outDir, "attributes.json"), `${JSON.stringify({ ...DICTIONARY, generated_at: now, attributes }, null, 1)}\n`);
const bySrc = {}, byGrade = {};
for (const f of facts) { bySrc[f.src] = (bySrc[f.src] ?? 0) + 1; byGrade[f.grade] = (byGrade[f.grade] ?? 0) + 1; }
writeFileSync(join(outDir, "manifest.json"), `${JSON.stringify({
  version: 1, generated_at: now, campgrounds: registry.length, facts: facts.length,
  row: "{cid, attr, value, grade, src, url?, at?, quote?, text?, n?, period?, label?, num?, count?} — src=gocamping에서 url·at이 없으면 campgrounds.ndjson의 gc_url·gc_at",
  files: { "campgrounds.ndjson": registry.length, ...files }, by_source: bySrc, by_grade: byGrade, sources: SOURCES,
  guide: "docs/FACT_STORE.md",
}, null, 1)}\n`);

console.log(`사실 ${facts.length}건 · 캠핑장 ${registry.length}곳 · 묶음 ${Object.keys(files).length}개`);
console.log("  등급", JSON.stringify(byGrade));
console.log("  원천", JSON.stringify(bySrc));
for (const [k, n] of Object.entries(files)) console.log(`  ${k.padEnd(22)} ${n}`);

if (process.argv.includes("--sqlite")) {
  const { writeSqlite } = await import("../lib/fact-sqlite.mjs");
  const dbPath = join(root, "pipeline/out/facts.sqlite");
  writeSqlite(dbPath, { registry, facts, attributes: DICTIONARY.attributes });
  console.log(`SQLite ${dbPath}`);
}
