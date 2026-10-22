#!/usr/bin/env node
// 공식 사진이 없는 캠핑장의 후기 사진(상세 sns_images)을 CLIP으로 판정해 registry/photo-judgments.json에 쌓는다(lib/photo-judge.mjs).
// 한 번에 MAX장까지(기본 3,000) — 매주 이어서 처리하고, 이미 판정한 사진(같은 규칙 판)은 다시 받지 않는다. 이미지는 저장하지 않는다.
// 결과 반영은 apply-photo-judgments.mjs(걸러진 사진에 ng 표시 → 화면 갤러리에서 숨김).
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { RULE_VERSION, photoJudge } from "../lib/photo-judge.mjs";

const root = resolve(fileURLToPath(import.meta.url), "../../..");
const dataDir = join(root, "camping-atlas/public/explore/data");
const judgPath = join(root, "pipeline/registry/photo-judgments.json");
const MAX = Number(process.env.PHOTO_JUDGE_MAX ?? 3000), PER_CAMP = Number(process.env.PHOTO_JUDGE_PER_CAMP ?? 8);
const judge = await photoJudge({ cacheDir: process.env.HF_CACHE || join(root, "pipeline/.cache/hf") });
if (!judge) { console.log("::warning::사진 내용 판정기(@huggingface/transformers) 없음 — 건너뜀"); process.exit(0); }
const judg = existsSync(judgPath) ? JSON.parse(readFileSync(judgPath, "utf8")).photos ?? {} : {};
const camps = JSON.parse(readFileSync(join(dataDir, "campgrounds.json"), "utf8"));
const official = existsSync(join(dataDir, "photos.json")) ? JSON.parse(readFileSync(join(dataDir, "photos.json"), "utf8")) : {};
// 공식 사진이 없는 곳 먼저(그곳은 후기 사진이 대표가 된다), 그다음 나머지
const order = [...camps.filter((c) => !c.img && !c.ph && !(official[c.id]?.length)), ...camps.filter((c) => c.img || c.ph || official[c.id]?.length)];
const queue = [];
// 1순위: 카드에 바로 쓰이는 첫 검색 썸네일(c.sn — 걸러 고른 사진이 없을 때 카드 대표)
for (const c of order) if (c.sn && !c.pt && judg[c.sn]?.v !== RULE_VERSION) queue.push(c.sn);
for (const c of order) {
  const p = join(dataDir, "camps", `${c.id}.json`);
  if (!existsSync(p)) continue;
  let d; try { d = JSON.parse(readFileSync(p, "utf8")); } catch { continue; }
  for (const x of (d.sns_images ?? []).slice(0, PER_CAMP)) if (x.thumb && judg[x.thumb]?.v !== RULE_VERSION) queue.push(x.thumb);
  if (queue.length >= MAX) break;
}
let done = 0, bad = 0;
for (const u of queue.slice(0, MAX)) {
  try { const v = await judge(u); judg[u] = { ...v, at: new Date().toISOString().slice(0, 10) }; done++; if (!v.ok) bad++; } catch {}
  if (done % 500 === 0) writeFileSync(judgPath, `${JSON.stringify({ updated_at: new Date().toISOString(), model: "Xenova/clip-vit-base-patch32", rule: "lib/photo-judge.mjs decide()", photos: judg })}\n`);
}
writeFileSync(judgPath, `${JSON.stringify({ updated_at: new Date().toISOString(), model: "Xenova/clip-vit-base-patch32", rule: "lib/photo-judge.mjs decide() — 음식·인물·차 안·글 캡처 등은 후기 사진에서 숨김", photos: judg })}\n`);
console.log(`후기 사진 판정: 이번 ${done}장(걸러냄 ${bad}) · 대기 ${Math.max(0, queue.length - MAX)}장 이상 · 누적 ${Object.keys(judg).length}장`);
