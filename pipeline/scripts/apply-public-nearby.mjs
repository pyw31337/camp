#!/usr/bin/env node
// 상세 주변시설의 공공시설(nearby.public)·휴게소(nearby.rest)를 지금 데이터로 다시 맞춘다. 멱등.
// - public: 공공데이터포털 표준데이터(registry/public-leisure.json → lib/public-poi.mjs) — 휴양림·박물관·수영장·실내 놀이
// - rest: 이미 있는 목록에서 같은 이름 500m 안 중복을 하나로(상행·하행은 따로)
// 정기 갱신은 sync-nearby-context.mjs → build-explore-data.mjs가 같은 규칙(lib/nearby-context.mjs)으로 만든다. 이 스크립트는 그 사이를 메운다.
import { existsSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { NEARBY_RULES, buildNearbyIndexes, dedupeHits, nearbyFor } from "../lib/nearby-context.mjs";
import { publicLeisureRecords } from "../lib/public-poi.mjs";

const root = resolve(fileURLToPath(import.meta.url), "../../..");
const dataDir = process.env.EXPLORE_DIR || join(root, "camping-atlas/public/explore/data");
const reg = JSON.parse(readFileSync(join(root, "pipeline/registry/public-leisure.json"), "utf8"));
const idx = buildNearbyIndexes({ public: publicLeisureRecords(reg) });
const cat = JSON.parse(readFileSync(join(dataDir, "campgrounds.json"), "utf8"));
const byId = new Map(cat.map((c) => [String(c.id), c]));
let withPublic = 0, restFixed = 0, changed = 0;
for (const f of readdirSync(join(dataDir, "camps"))) {
  const id = f.replace(/\.json$/, ""), c = byId.get(id);
  if (!c || !Number.isFinite(c.lat) || !Number.isFinite(c.lng)) continue;
  const p = join(dataDir, "camps", f), raw = readFileSync(p, "utf8");
  let d; try { d = JSON.parse(raw); } catch { continue; }
  const before = JSON.stringify([d.nearby?.public ?? null, d.nearby?.rest ?? null]);
  const pub = nearbyFor(c.lat, c.lng, idx, NEARBY_RULES).public;
  if (pub || d.nearby) d.nearby ??= {};
  if (pub) { d.nearby.public = pub; withPublic++; } else if (d.nearby) delete d.nearby.public;
  if (d.nearby?.rest?.length) {
    const hits = d.nearby.rest.map((x) => ({ point: { name: x.n ?? x.name }, distance_m: x.m ?? x.distance_m, x }));
    const kept = dedupeHits(hits, NEARBY_RULES.rest.limit).map((h) => h.x);
    if (kept.length !== d.nearby.rest.length) { d.nearby.rest = kept; restFixed++; }
  }
  if (JSON.stringify([d.nearby?.public ?? null, d.nearby?.rest ?? null]) !== before) { writeFileSync(p, JSON.stringify(d)); changed++; }
}
console.log(`주변 공공시설·휴게소: 공공시설 붙은 곳 ${withPublic} · 휴게소 중복 정리 ${restFixed} · 상세 갱신 ${changed}`);
