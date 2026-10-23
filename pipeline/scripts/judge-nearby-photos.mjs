#!/usr/bin/env node
// registry/nearby-photos.json의 검색 사진(t)을 판독해 같은 항목에 j={ok,top,why,v}로 적는다(lib/nearby-photo-judge.mjs). 멱등·이어서.
// build-nearby-photos.mjs는 j.ok인 사진만 붙인다. 한 번에 NEARBY_JUDGE_MAX장(기본 3000). 이미지는 저장하지 않는다.
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { NEARBY_RULE_VERSION, nearbyPhotoJudge } from "../lib/nearby-photo-judge.mjs";

const root = resolve(fileURLToPath(import.meta.url), "../../..");
const regPath = join(root, "pipeline/registry/nearby-photos.json");
const MAX = Number(process.env.NEARBY_JUDGE_MAX ?? 3000);
if (!existsSync(regPath)) process.exit(0);
const judge = await nearbyPhotoJudge({ cacheDir: process.env.HF_CACHE || join(root, "pipeline/.cache/hf") });
if (!judge) { console.log("::error::판독기(@huggingface/transformers) 없음 — 워크플로에서 설치해야 한다"); process.exit(1); }
const reg = JSON.parse(readFileSync(regPath, "utf8"));
const todo = Object.entries(reg.places ?? {}).filter(([, e]) => e.t && e.j?.v !== NEARBY_RULE_VERSION && e.j?.by !== "mac") // 맥미니 판독(더 정확)은 덮어쓰지 않는다.slice(0, MAX);
let n = 0, ok = 0, fail = 0;
for (const [, e] of todo) {
  try { e.j = await judge(e.t); if (e.j.ok) ok++; } catch { fail++; e.j = { ok: false, why: "받기 실패", v: NEARBY_RULE_VERSION }; }
  if (++n % 100 === 0) { writeFileSync(regPath, `${JSON.stringify(reg)}\n`); console.log(`  ${n}/${todo.length} · 통과 ${ok}`); }
}
writeFileSync(regPath, `${JSON.stringify(reg)}\n`);
console.log(`주변 사진 판독 ${n}장 · 통과 ${ok}장 · 받기 실패 ${fail}장`);
