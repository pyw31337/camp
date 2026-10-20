#!/usr/bin/env node
// 당일 나들이 장소(registry/dayuse-seed.json — 원천 URL·확인일 포함)를 탐색 데이터에 붙인다. 멱등.
// - campgrounds.json: 같은 id는 시드 값으로 바꾸고 없으면 추가. c.du = "park"|"private". 이름 '캠프닉' → '캠크닉' 통일.
// - camps/{id}.json: house_rules.rules(원문 문장·URL·확인일), day(취사·그늘막 — 근거 없으면 UNKNOWN), du_src.
// 2026-10-20 소유자: 수기 기입 대신 재현 가능한 원천, 취사 가능은 근거 없이 추정하지 않는다(미확인).
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
const root = resolve(fileURLToPath(import.meta.url), "../../..");
const dataDir = process.env.EXPLORE_DIR || join(root, "camping-atlas/public/explore/data");
const seed = JSON.parse(readFileSync(join(root, "pipeline/registry/dayuse-seed.json"), "utf8"));
const catPath = join(dataDir, "campgrounds.json");
const cat = JSON.parse(readFileSync(catPath, "utf8"));
const unify = (t) => (t === "캠프닉" ? "캠크닉" : t);
for (const c of cat) if (c.types?.includes("캠프닉")) c.types = [...new Set(c.types.map(unify))];
const byId = new Map(cat.map((c, i) => [String(c.id), i]));
let added = 0, replaced = 0;
for (const p of seed.places ?? []) {
  const { rules, day, src, ...rec } = p;
  rec.types = [...new Set((rec.types ?? []).map(unify))];
  if (byId.has(rec.id)) { cat[byId.get(rec.id)] = { ...cat[byId.get(rec.id)], ...rec }; replaced++; } else { cat.push(rec); byId.set(rec.id, cat.length - 1); added++; }
  const dp = join(dataDir, "camps", `${rec.id}.json`);
  const d = existsSync(dp) ? JSON.parse(readFileSync(dp, "utf8")) : {};
  if (rules?.length) d.house_rules = { ...(d.house_rules ?? {}), rules, at: src?.checked_at };
  if (day) d.day = day;
  if (src) d.du_src = src;
  writeFileSync(dp, JSON.stringify(d));
}
writeFileSync(catPath, JSON.stringify(cat));
console.log(`dayuse seed → 추가 ${added} · 갱신 ${replaced} · 캠크닉 ${cat.filter((c) => c.types?.includes("캠크닉")).length}곳`);
