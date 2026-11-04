#!/usr/bin/env node
// 최종 발행 직전의 작고 결정적인 안전 게이트. 수집 실패는 발행을 멈추지 않지만,
// 이미 만들어진 공개 카탈로그가 구조적으로 깨졌거나 레코드가 중복이면 멈춘다.
import { existsSync, readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(fileURLToPath(import.meta.url), "../../..");
const dir = process.env.EXPLORE_DIR || join(root, "camping-atlas/public/explore/data");
const catalogPath = join(dir, "campgrounds.json");
const reportPath = process.env.RELEASE_GATE_REPORT || join(root, "pipeline/out/release-gate.json");
const errors = [];
let catalog = [];
try { catalog = JSON.parse(readFileSync(catalogPath, "utf8")); } catch (e) { errors.push(`catalog read: ${e.message}`); }
if (!Array.isArray(catalog) || catalog.length < 1000) errors.push(`catalog count too low: ${catalog.length}`);
const ids = new Set();
for (const [i, c] of catalog.entries()) {
  const id = String(c?.id ?? "");
  if (!id) errors.push(`row ${i}: missing id`);
  else if (ids.has(id)) errors.push(`duplicate id: ${id}`);
  ids.add(id);
  if (!String(c?.name ?? "").trim()) errors.push(`${id || i}: missing name`);
  if (c?.lat != null && (Number(c.lat) < 32 || Number(c.lat) > 39)) errors.push(`${id}: latitude out of Korea bounds`);
  if (c?.lng != null && (Number(c.lng) < 124 || Number(c.lng) > 132)) errors.push(`${id}: longitude out of Korea bounds`);
}
const report = { at: new Date().toISOString(), status: errors.length ? "hold" : "pass", rows: catalog.length, errors };
mkdirSync(join(root, "pipeline/out"), { recursive: true });
writeFileSync(reportPath, JSON.stringify(report, null, 2));
if (errors.length) { console.error(`RELEASE HOLD\n${errors.slice(0, 30).join("\n")}`); process.exit(1); }
console.log(`OK release gate — ${catalog.length} rows, unique ids, names and coordinates sane`);
