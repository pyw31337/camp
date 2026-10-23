#!/usr/bin/env node
// 후기·카페·웹문서·영상 제목의 내용 판정(lib/text-judge.mjs) → registry/text-judgments.json(URL별, 규칙판 v).
// 한 번에 MAX건까지(기본 20,000) — 매주 이어서 처리하고, 같은 규칙판으로 판정한 글은 다시 보지 않는다. 결과 반영은 apply-text-judgments.mjs.
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { MODEL, RULE_VERSION, textJudge, textOf } from "../lib/text-judge.mjs";

const root = resolve(fileURLToPath(import.meta.url), "../../..");
const dataDir = join(root, "camping-atlas/public/explore/data");
const judgPath = join(root, "pipeline/registry/text-judgments.json");
const TEXT_KINDS = ["reviews", "cafe", "web", "videos"];
const MAX = Number(process.env.TEXT_JUDGE_MAX ?? 20000), BATCH = 64;
const judge = await textJudge({ cacheDir: process.env.HF_CACHE || join(root, "pipeline/.cache/hf") });
if (!judge) { console.log("::warning::텍스트 내용 판정기(@huggingface/transformers) 없음 — 건너뜀"); process.exit(0); }
const judg = existsSync(judgPath) ? JSON.parse(readFileSync(judgPath, "utf8")).texts ?? {} : {};
const camps = JSON.parse(readFileSync(join(dataDir, "campgrounds.json"), "utf8"));
const queue = [], seen = new Set();
for (const c of camps) {
  const p = join(dataDir, "camps", `${c.id}.json`);
  if (!existsSync(p)) continue;
  let d; try { d = JSON.parse(readFileSync(p, "utf8")); } catch { continue; }
  for (const k of TEXT_KINDS) for (const x of d[k] ?? []) {
    const key = `${c.id}|${x.url}`;
    if (!x.url || seen.has(key) || judg[key]?.v === RULE_VERSION) continue;
    seen.add(key); queue.push({ key, camp: c.name, text: textOf(x) });
  }
  if (queue.length >= MAX) break;
}
const save = () => writeFileSync(judgPath, `${JSON.stringify({ updated_at: new Date().toISOString(), model: MODEL, rule: "lib/text-judge.mjs decide() — 캠핑장 이름이 없고 식당·광고·부동산·무관 주제가 1위인 글은 숨김", texts: judg })}\n`);
let done = 0, bad = 0;
const today = new Date().toISOString().slice(0, 10);
const DEADLINE = Number(process.env.NIGHTSHIFT_DEADLINE) || Infinity; // 맥미니 야간 작업이 넘겨주는 끝낼 시각
for (let i = 0; i < Math.min(queue.length, MAX); i += BATCH) {
  if (Date.now() > DEADLINE - 120e3) break;
  const part = queue.slice(i, Math.min(i + BATCH, MAX));
  const out = await judge(part);
  part.forEach((x, j) => { judg[x.key] = { ...out[j], at: today }; done++; if (!out[j].ok) bad++; });
  if (done % 2048 < BATCH) save();
}
save();
console.log(`텍스트 내용 판정: 이번 ${done}건(숨김 ${bad}) · 대기 ${Math.max(0, queue.length - MAX)}건 이상 · 누적 ${Object.keys(judg).length}건`);
