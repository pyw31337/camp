#!/usr/bin/env node
// 전국 캠핑장 프로필·한 줄 요약·분류 태그를 만든다(lib/campground-profile.mjs).
// 쓰기: camps/{id}.json의 profile(항목별 값·등급·출처), campgrounds.json의 pf = { s(요약), t(태그 코드), k(확인 항목 수) },
//       meta.json의 profiles(항목·태그별 커버리지). data-sync가 build-review-digest.mjs 뒤에 실행한다.
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { buildProfile, PROFILE_FIELDS } from "../lib/campground-profile.mjs";
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
for (const c of camps) {
  const path = join(dataDir, "camps", `${c.id}.json`);
  const d = existsSync(path) ? JSON.parse(readFileSync(path, "utf8")) : null;
  const site = sites[c.id];
  const shared = (hostCount.get(hostOf(c.homepage ?? "")) ?? 0) > 1 || (hostCount.get(hostOf(site?.url ?? "")) ?? 0) > 1;
  const usable = site?.status === "OK" && site.snippets?.length && !shared;
  const details = usable ? extractSiteDetails(site.snippets.map((s) => s.text)) : null;
  const urlOf = (q) => site?.snippets?.find((s) => s.text === q)?.url ?? site?.url ?? null;
  const intro = d?.intro ? extractSiteDetails(sentences(d.intro)) : null;
  const p = buildProfile(c, d, details, { detailDate: site?.checked_at ?? null, urlOf, intro });
  p.generated_at = now;
  c.pf = { s: p.summary, t: p.tags.map((t) => t.code), k: p.score.facts };
  if (d) { d.profile = p; writeFileSync(path, JSON.stringify(d)); }
  for (const [k, f] of Object.entries(p.fields)) { cov[k].any++; if (f.grade !== "MENTION") cov[k].facts++; }
  for (const t of p.tags) tagCount[t.code] = (tagCount[t.code] ?? 0) + 1;
  const k = p.score.facts;
  dist[k <= 5 ? "0-5" : k <= 9 ? "6-9" : k <= 13 ? "10-13" : "14-18"]++;
}
writeFileSync(campsPath, JSON.stringify(camps));
const metaPath = join(dataDir, "meta.json");
const meta = JSON.parse(readFileSync(metaPath, "utf8"));
meta.profiles = { generated_at: now, total: camps.length, fields: cov, tags: tagCount, facts_distribution: dist };
writeFileSync(metaPath, JSON.stringify(meta, null, 2));
console.log(`프로필 ${camps.length}곳`);
for (const [k, l] of PROFILE_FIELDS) console.log(`  ${l.padEnd(10)} 확인 ${String(cov[k].facts).padStart(4)} · 후기 포함 ${cov[k].any}`);
console.log("  확인 항목 수 분포", JSON.stringify(dist));
console.log("  태그", JSON.stringify(tagCount));
