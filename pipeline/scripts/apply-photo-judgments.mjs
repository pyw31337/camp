#!/usr/bin/env node
// 사진 내용 판정(registry/photo-judgments.json) → 상세 sns_images의 걸러진 사진에 ng(이유) 표시. 화면은 ng 사진을 갤러리·대표에서 뺀다. 멱등.
// 사진은 지우지 않고 표시만 한다(병합 정책: 값 삭제 금지 · 판정이 바뀌면 다시 보인다).
import { existsSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(fileURLToPath(import.meta.url), "../../..");
const dataDir = process.env.EXPLORE_DIR || join(root, "camping-atlas/public/explore/data");
const judgPath = join(root, "pipeline/registry/photo-judgments.json");
if (!existsSync(judgPath)) { console.log("사진 판정 없음 — 건너뜀"); process.exit(0); }
const judg = JSON.parse(readFileSync(judgPath, "utf8")).photos ?? {};
let flagged = 0, files = 0;
for (const f of readdirSync(join(dataDir, "camps"))) {
  const p = join(dataDir, "camps", f), raw = readFileSync(p, "utf8");
  if (!raw.includes("sns_images")) continue;
  let d; try { d = JSON.parse(raw); } catch { continue; }
  let ch = false;
  for (const x of d.sns_images ?? []) {
    const j = judg[x.thumb] ?? judg[x.img];
    const ng = j && !j.ok ? j.why ?? "캠핑장과 무관한 사진" : undefined;
    if (ng && x.ng !== ng) { x.ng = ng; ch = true; flagged++; }
    else if (!ng && x.ng) { delete x.ng; ch = true; }
  }
  if (ch) { writeFileSync(p, JSON.stringify(d)); files++; }
}
console.log(`후기 사진 판정 반영: 숨김 표시 ${flagged}장 · 상세 ${files}개`);
