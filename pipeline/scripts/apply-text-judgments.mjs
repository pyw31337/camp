#!/usr/bin/env node
// 텍스트 내용 판정(registry/text-judgments.json) → 상세 reviews·cafe·web·videos의 무관한 글에 ng(이유) 표시. 화면은 ng 글을 목록에서 뺀다. 멱등.
// 글은 지우지 않고 표시만 한다(병합 정책: 값 삭제 금지 · 판정이 바뀌면 다시 보인다).
import { existsSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(fileURLToPath(import.meta.url), "../../..");
const dataDir = process.env.EXPLORE_DIR || join(root, "camping-atlas/public/explore/data");
const judgPath = join(root, "pipeline/registry/text-judgments.json");
if (!existsSync(judgPath)) { console.log("텍스트 판정 없음 — 건너뜀"); process.exit(0); }
const judg = JSON.parse(readFileSync(judgPath, "utf8")).texts ?? {};
const KINDS = ["reviews", "cafe", "web", "videos"];
let flagged = 0, files = 0;
for (const f of readdirSync(join(dataDir, "camps"))) {
  const id = f.replace(/\.json$/, ""), p = join(dataDir, "camps", f);
  let d; try { d = JSON.parse(readFileSync(p, "utf8")); } catch { continue; }
  let ch = false;
  for (const k of KINDS) for (const x of d[k] ?? []) {
    const j = judg[`${id}|${x.url}`];
    const ng = j && !j.ok ? j.why ?? "캠핑장과 무관한 글" : undefined;
    if (ng && x.ng !== ng) { x.ng = ng; ch = true; flagged++; }
    else if (!ng && x.ng) { delete x.ng; ch = true; }
  }
  if (ch) { writeFileSync(p, JSON.stringify(d)); files++; }
}
console.log(`텍스트 판정 반영: 숨김 표시 ${flagged}건 · 상세 ${files}개`);
