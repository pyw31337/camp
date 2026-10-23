#!/usr/bin/env node
// 맥미니 야간 작업: 주변시설 검색 사진을 CLIP + Apple Vision 간판 글자 + 로컬 비전 모델(있으면)로 다시 판독한다(lib/mac-vision.mjs).
// CI의 judge-nearby-photos.mjs(CLIP만)보다 엄격·정확하다. 결과는 같은 자리 e.j에 by:"mac"으로 적고, CI는 by:"mac"을 덮어쓰지 않는다.
// 멱등·이어서. 한 번에 NEARBY_MAC_MAX장, NIGHTSHIFT_DEADLINE(ms) 전에 멈춘다. 이미지는 임시로만 받고 지운다.
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { NEARBY_RULE_VERSION, nearbyPhotoJudge } from "../lib/nearby-photo-judge.mjs";
import { appleVision, askVlm, decideNearbyMac, nearbyPrompt, signMatches, visionAvailable, vlmAvailable, VLM_MODEL } from "../lib/mac-vision.mjs";

const root = resolve(fileURLToPath(import.meta.url), "../../..");
const regPath = join(root, "pipeline/registry/nearby-photos.json");
const MAX = Number(process.env.NEARBY_MAC_MAX ?? 5000);
const DEADLINE = Number(process.env.NIGHTSHIFT_DEADLINE) || Date.now() + 6 * 3600e3;
if (!existsSync(regPath)) process.exit(0);

const clip = await nearbyPhotoJudge({ cacheDir: process.env.HF_CACHE || join(root, "pipeline/.cache/hf") });
const vision = visionAvailable(), vlm = await vlmAvailable();
if (!clip && !vision && !vlm) { console.error("판독기가 하나도 없음(@huggingface/transformers·vision-ocr·Ollama) — install.sh를 다시 실행"); process.exit(1); }
console.log(`판독기: CLIP ${clip ? "O" : "X"} · Apple Vision ${vision ? "O" : "X"} · 비전 모델 ${vlm ? VLM_MODEL : "X"}`);

const reg = JSON.parse(readFileSync(regPath, "utf8"));
// 맥 판독이 아직 없거나 규칙판이 바뀐 것. 비전 모델이 새로 생겼으면 그것 없이 판독한 것도 다시.
const todo = Object.entries(reg.places ?? {}).filter(([, e]) => e.t && !(e.j?.by === "mac" && e.j.v === NEARBY_RULE_VERSION && (e.j.vlm || !vlm))).slice(0, MAX);
const dir = await mkdtemp(join(tmpdir(), "nearby-mac-"));
const save = () => writeFileSync(regPath, `${JSON.stringify(reg)}\n`);
let n = 0, ok = 0, sign = 0;
try {
  for (const [key, e] of todo) {
    if (Date.now() > DEADLINE - 120e3) { console.log("시간 다 됨 — 다음 밤에 이어서"); break; }
    const name = key.split("|")[0];
    try {
      const r = await fetch(e.t, { signal: AbortSignal.timeout(15000) });
      if (!r.ok) throw new Error(String(r.status));
      const buf = Buffer.from(await r.arrayBuffer());
      const file = join(dir, "x.jpg"); await writeFile(file, buf);
      const c = clip ? await clip(file) : null;
      const v = vision ? await appleVision(file) : null;
      const s = signMatches(name, v?.text);
      const a = vlm ? await askVlm(buf, nearbyPrompt(name)) : null;
      const d = decideNearbyMac({ clip: c, sign: s, vlm: a });
      e.j = { ...d, top: c?.top ?? null, pos: c?.pos ?? null, v: NEARBY_RULE_VERSION, ...(a ? { vlm: VLM_MODEL } : {}) };
      if (d.ok) ok++; if (s) sign++;
    } catch { e.j = { ok: false, by: "mac", why: "받기 실패", v: NEARBY_RULE_VERSION }; }
    if (++n % 50 === 0) { save(); console.log(`  ${n}/${todo.length} · 통과 ${ok} · 간판 일치 ${sign}`); }
  }
} finally { save(); await rm(dir, { recursive: true, force: true }); }
console.log(`주변 사진 맥 판독 ${n}장 · 통과 ${ok}장 · 간판 글자 일치 ${sign}장`);
