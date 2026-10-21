#!/usr/bin/env node
// 당일 나들이 장소(registry/dayuse-seed.json — 원천 URL·확인일 포함)를 탐색 데이터에 붙인다. 멱등.
// - campgrounds.json: 같은 id는 시드 값으로 바꾸고 없으면 추가. c.du = "park"|"private". 이름 '캠프닉' → '캠크닉' 통일.
// - camps/{id}.json: house_rules.rules(원문 문장·URL·확인일), day(취사·그늘막 — 근거 없으면 UNKNOWN), du_src.
// 2026-10-20 소유자: 수기 기입 대신 재현 가능한 원천, 취사 가능은 근거 없이 추정하지 않는다(미확인).
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { normalizeUrl } from "../lib/booking-intel.mjs";
import { assignNonEmpty, logReview } from "../lib/merge-policy.mjs";
const root = resolve(fileURLToPath(import.meta.url), "../../..");
const dataDir = process.env.EXPLORE_DIR || join(root, "camping-atlas/public/explore/data");
const seed = JSON.parse(readFileSync(join(root, "pipeline/registry/dayuse-seed.json"), "utf8"));
// P1: OSM 공원·공공 물놀이(registry/dayuse-osm.json, build-dayuse-osm.mjs 산출) — 수기 시드가 우선.
const osmPath = join(root, "pipeline/registry/dayuse-osm.json");
if (existsSync(osmPath)) { const ids = new Set(seed.places.map((p) => p.id)); seed.places.push(...JSON.parse(readFileSync(osmPath, "utf8")).places.filter((p) => !ids.has(p.id))); }
// 고캠핑에 없는 1박 캠핑장 수기 보강분(registry/manual-camps.json, 원문 src 포함) — 같은 방식으로 붙인다(du 없음).
{ const mp = join(root, "pipeline/registry/manual-camps.json"); if (existsSync(mp)) { const ids = new Set(seed.places.map((p) => p.id)); seed.places.push(...JSON.parse(readFileSync(mp, "utf8")).places.filter((p) => !ids.has(p.id))); } }
const catPath = join(dataDir, "campgrounds.json");
const cat = JSON.parse(readFileSync(catPath, "utf8"));
const unify = (t) => (t === "캠프닉" ? "캠크닉" : t);
for (const c of cat) if (c.types?.includes("캠프닉")) c.types = [...new Set(c.types.map(unify))];
// 자동 수집 장소(osm-*, park-*) 중 현재 레지스트리에 없는 것은 지운다(공식 공원으로 바뀐 OSM 공원 중복 방지).
{ const live = new Set((seed.places ?? []).map((p) => p.id)); for (let i = cat.length - 1; i >= 0; i--) if (/^(osm|park)-/.test(String(cat[i].id)) && !live.has(String(cat[i].id))) { logReview({ action: "removed", file: "campgrounds.json", id: String(cat[i].id), field: "*", reason: "자동 수집 공원이 레지스트리에서 빠짐(공식 공원으로 대체된 OSM 중복)" }); cat.splice(i, 1); } }
const byId = new Map(cat.map((c, i) => [String(c.id), i]));
let added = 0, replaced = 0;
for (const p of seed.places ?? []) {
  const { rules, day, src, ...rec } = p;
  if (src?.url) { rec.src_url = src.url; rec.src_at = src.checked_at; }
  rec.types = [...new Set((rec.types ?? []).map(unify))];
  // 홈페이지 주소는 build-link-health.mjs와 같은 규칙으로 바로잡아 둔다(다시 돌려도 결과가 같게).
  if (rec.homepage && !/^https?:\/\/[^/\s]+\.[^/\s]+/i.test(rec.homepage)) { const u = normalizeUrl(rec.homepage); if (u) rec.homepage = u; else { rec.homepage_raw = rec.homepage; delete rec.homepage; } }
  // 빈 값으로 기존 값을 지우지 않는다(docs/DATA_MERGE_POLICY.md ①).
  if (byId.has(rec.id)) { cat[byId.get(rec.id)] = assignNonEmpty({ ...cat[byId.get(rec.id)] }, rec); replaced++; } else { cat.push(rec); byId.set(rec.id, cat.length - 1); added++; }
  if (!rec.du && !rules?.length && !day) continue; // 1박 수기 보강분(manual-camps)은 카탈로그 행만
  const dp = join(dataDir, "camps", `${rec.id}.json`);
  const d = existsSync(dp) ? JSON.parse(readFileSync(dp, "utf8")) : {};
  if (rules?.length) d.house_rules = { ...(d.house_rules ?? {}), rules, at: src?.checked_at };
  if (day) d.day = day;
  if (src) d.du_src = src;
  writeFileSync(dp, JSON.stringify(d));
}
writeFileSync(catPath, JSON.stringify(cat));
console.log(`dayuse seed → 추가 ${added} · 갱신 ${replaced} · 캠크닉 ${cat.filter((c) => c.types?.includes("캠크닉")).length}곳`);
