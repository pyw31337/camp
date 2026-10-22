#!/usr/bin/env node
// 업장 정보량 점수(lib/info-score.mjs)를 계산해 카탈로그 c.iq(0~100)로 넣고, data/quality/info-score.json에 분포·부족 항목을 남긴다. 멱등.
// 입력: data/facts(build-fact-store 뒤에 실행), camping-atlas/public/explore/data(campgrounds.json·photos.json)
// 화면은 c.iq로 목록·추천·지역 목록의 기본 순서를 정한다(design/renewal/app.js rich). 다른 에이전트도 이 값·이 함수만 쓴다.
import { existsSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { SCORE_VERSION, scoreCamp } from "../lib/info-score.mjs";

const root = resolve(fileURLToPath(import.meta.url), "../../..");
const factsDir = process.env.FACTS_DIR || join(root, "data/facts");
const dataDir = process.env.EXPLORE_DIR || join(root, "camping-atlas/public/explore/data");
const outPath = join(root, "data/quality/info-score.json");
if (!existsSync(join(factsDir, "attributes.json"))) { console.log("정보량 점수: data/facts 없음 — 건너뜀"); process.exit(0); }

const defs = Object.fromEntries((JSON.parse(readFileSync(join(factsDir, "attributes.json"), "utf8")).attributes ?? []).map((a) => [a.code, a]));
const byCid = new Map();
for (const f of readdirSync(factsDir).filter((x) => x.endsWith(".ndjson") && x !== "campgrounds.ndjson")) {
  for (const line of readFileSync(join(factsDir, f), "utf8").split("\n")) {
    if (!line) continue;
    let r; try { r = JSON.parse(line); } catch { continue; }
    if (r.cid == null) continue;
    const k = String(r.cid);
    (byCid.get(k) ?? byCid.set(k, []).get(k)).push(r);
  }
}
const catPath = join(dataDir, "campgrounds.json");
const cat = JSON.parse(readFileSync(catPath, "utf8"));
const photos = existsSync(join(dataDir, "photos.json")) ? JSON.parse(readFileSync(join(dataDir, "photos.json"), "utf8")) : {};
const now = Date.now();
const rows = {};
let changed = 0;
for (const c of cat) {
  const id = String(c.id);
  const official = (photos[id]?.length ?? 0) || (c.ph || c.img ? 1 : 0);
  const s = scoreCamp({ facts: byCid.get(id) ?? [], defs, photos: official, reviewPhotos: c.pt || c.sn ? 1 : 0, reviews: Number(c.rv?.n) || 0, now });
  if (c.iq !== s.score) { c.iq = s.score; changed++; }
  rows[id] = [s.score, s.missing.slice(0, 3)];
}
writeFileSync(catPath, JSON.stringify(cat));

// 분포·부족 항목 요약(다음 수집 우선순위): 점수 하위 절반에서 가장 많이 비어 있는 속성
const scores = Object.values(rows).map((r) => r[0]).sort((a, b) => a - b);
const q = (p) => scores[Math.min(scores.length - 1, Math.floor(p * (scores.length - 1)))] ?? 0;
const median = q(0.5);
const gap = {};
for (const [s, miss] of Object.values(rows)) if (s <= median) for (const m of miss) gap[m] = (gap[m] ?? 0) + 1;
writeFileSync(outPath, `${JSON.stringify({
  generated_at: new Date().toISOString(), version: SCORE_VERSION, rule: "pipeline/lib/info-score.mjs scoreCamp", camps: scores.length,
  distribution: { p10: q(0.1), p25: q(0.25), median, p75: q(0.75), p90: q(0.9), max: scores.at(-1) ?? 0 },
  next_priorities: Object.entries(gap).sort((a, b) => b[1] - a[1]).slice(0, 10).map(([attr, n]) => ({ attr, camps: n })),
  scores: rows,
})}\n`);
console.log(`정보량 점수 v${SCORE_VERSION}: ${scores.length}곳 · 중앙값 ${median} · 상위10% ${q(0.9)} · 갱신 ${changed}곳`);
