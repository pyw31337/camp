#!/usr/bin/env node
// 전국 캠핑장 프로필·한 줄 요약·분류 태그를 만든다(lib/campground-profile.mjs).
// 쓰기: camps/{id}.json의 profile(항목별 값·등급·출처), campgrounds.json의 pf = { s(요약), t(태그 코드), k(확인 항목 수) },
//       meta.json의 profiles(항목·태그별 커버리지). data-sync가 build-review-digest.mjs 뒤에 실행한다.
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { buildProfile, PROFILE_FIELDS, compactTimes, openMonthsOf } from "../lib/campground-profile.mjs";
import { extractSiteDetails } from "../lib/operator-site.mjs";
import { sentences } from "../lib/spec-extractor.mjs";

const root = resolve(fileURLToPath(import.meta.url), "../../..");
const dataDir = join(root, "camping-atlas/public/explore/data");
const campsPath = join(dataDir, "campgrounds.json");
const camps = JSON.parse(readFileSync(campsPath, "utf8"));
const sitesPath = join(root, "pipeline/registry/operator-site-snippets.json");
const sites = existsSync(sitesPath) ? JSON.parse(readFileSync(sitesPath, "utf8")).campgrounds ?? {} : {};
const hostOf = (u) => { try { return new URL(/^[a-z]+:\/\//i.test(u) ? u : `http://${u}`).hostname.replace(/^www\./, ""); } catch { return null; } };
const hostCount = new Map();
for (const c of camps) { const h = c.homepage && hostOf(c.homepage); if (h) hostCount.set(h, (hostCount.get(h) ?? 0) + 1); }

const now = new Date().toISOString();
const cov = Object.fromEntries(PROFILE_FIELDS.map(([k]) => [k, { any: 0, facts: 0 }]));
const tagCount = {};
const dist = { "0-5": 0, "6-9": 0, "10-13": 0, "14-18": 0 };
const priceCoverage = { published: 0, operator: 0, mention: 0 };
// 목록에서 가격 필터·정렬을 할 수 있도록 상세 프로필의 가격을 짧게 복제한다.
// 정확한 원문 URL·원문 게시일·마지막 프로필 산출 시각을 함께 넣어, 후기 언급을
// 현재 결제 가격처럼 보이지 않게 한다. 증빙이 하나라도 없으면 목록에 발행하지 않는다.
const compactPrice = (field, observedAt) => {
  const min = Number(field?.min), max = Number(field?.max ?? field?.min);
  const source = field?.source ?? {};
  if (!Number.isFinite(min) || min <= 0 || !Number.isFinite(max) || max < min || !source.url || !source.date) return null;
  return {
    v: field.value,
    min,
    max,
    g: field.grade,
    n: field.count ?? 1,
    l: source.label ?? null,
    u: source.url,
    a: source.date,
    o: observedAt,
  };
};
for (const c of camps) {
  const path = join(dataDir, "camps", `${c.id}.json`);
  const d = existsSync(path) ? JSON.parse(readFileSync(path, "utf8")) : null;
  const site = sites[c.id];
  const shared = (hostCount.get(hostOf(c.homepage ?? "")) ?? 0) > 1 || (hostCount.get(hostOf(site?.url ?? "")) ?? 0) > 1;
  const usable = site?.status === "OK" && site.snippets?.length && !shared;
  const details = usable ? extractSiteDetails(site.snippets.map((s) => s.text)) : null;
  const urlOf = (q) => site?.snippets?.find((s) => s.text === q)?.url ?? site?.url ?? null;
  // OCR로 읽은 문장이면 원본 안내 이미지 주소(화면 (i)에서 이미지 원문 보기)
  const imageOf = (q) => site?.snippets?.find((s) => s.text === q)?.image ?? null;
  const intro = d?.intro ? extractSiteDetails(sentences(d.intro)) : null;
  const p = buildProfile(c, d, details, { detailDate: site?.checked_at ?? null, urlOf, imageOf, intro });
  p.generated_at = now;
  const price = compactPrice(p.fields.PRICE, now);
  c.pf = { s: p.summary, t: p.tags.map((t) => t.code), k: p.score.facts, ...(price ? { p: price } : {}) };
  // 목록 행(#/list)용: 운영 달·입퇴실 시각을 카탈로그에 압축해 둔다(상세 파일을 열지 않고 날짜 판단·표시).
  const om = openMonthsOf(p.fields.SEASON), ti = compactTimes(p.fields);
  if (om != null) c.om = om; else delete c.om;
  if (ti) c.ti = ti; else delete c.ti;
  if (price) {
    priceCoverage.published++;
    if (price.g === "OPERATOR") priceCoverage.operator++;
    if (price.g === "MENTION") priceCoverage.mention++;
  }
  if (d) { d.profile = p; writeFileSync(path, JSON.stringify(d)); }
  for (const [k, f] of Object.entries(p.fields)) { if (f.statutory || f.grade === "REFERENCE") continue; cov[k].any++; if (f.grade !== "MENTION") cov[k].facts++; }
  for (const t of p.tags) tagCount[t.code] = (tagCount[t.code] ?? 0) + 1;
  const k = p.score.facts;
  dist[k <= 5 ? "0-5" : k <= 9 ? "6-9" : k <= 13 ? "10-13" : "14-18"]++;
}
writeFileSync(campsPath, JSON.stringify(camps));
const metaPath = join(dataDir, "meta.json");
const meta = JSON.parse(readFileSync(metaPath, "utf8"));
meta.profiles = { generated_at: now, total: camps.length, fields: cov, tags: tagCount, facts_distribution: dist, price: priceCoverage };
writeFileSync(metaPath, JSON.stringify(meta, null, 2));
console.log(`프로필 ${camps.length}곳`);
for (const [k, l] of PROFILE_FIELDS) console.log(`  ${l.padEnd(10)} 확인 ${String(cov[k].facts).padStart(4)} · 후기 포함 ${cov[k].any}`);
console.log("  확인 항목 수 분포", JSON.stringify(dist));
console.log("  태그", JSON.stringify(tagCount));
console.log("  목록 가격", JSON.stringify(priceCoverage));
