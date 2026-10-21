#!/usr/bin/env node
// 전력 제한값 상식성 감사. 400W 미만은 카드의 확정 전력값으로 쓰기 전에
// 운영자·공공 원문을 다시 대조해야 한다. 값은 삭제하지 않고 감사 결과에 남긴다.
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(fileURLToPath(import.meta.url), "../../..");
const dataDir = process.env.EXPLORE_DIR || join(root, "camping-atlas/public/explore/data");
const outPath = process.env.POWER_AUDIT_OUT || join(root, "pipeline/out/power-audit.json");
const camps = JSON.parse(readFileSync(join(dataDir, "campgrounds.json"), "utf8"));
const rows = [];
for (const c of camps) {
  const fc = c.field_conditions?.power?.limit_w;
  const op = c.of?.w?.v;
  for (const [field, value] of [["field_conditions.power.limit_w", fc], ["operator.power", op]]) {
    const w = Number(value);
    if (Number.isFinite(w) && w > 0 && w < 400) rows.push({ id: String(c.id), name: c.name, field, watts: w, source: c.field_conditions?.source?.url ?? c.of?.w?.u ?? null });
  }
}
const report = { version: 1, checked_at: new Date().toISOString(), threshold: 400, below_threshold: rows };
if (existsSync(resolve(outPath, ".."))) writeFileSync(outPath, `${JSON.stringify(report, null, 2)}\n`);
console.log(`전력 이상치 감사: 400W 미만 ${rows.length}곳`);
