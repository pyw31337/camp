#!/usr/bin/env node
// apply-dayuse-seed.mjs 멱등 검사(2026-10-21): 발행된 데이터에 다시 돌려도 campgrounds.json·camps/{id}.json이 한 바이트도 안 바뀌어야 한다.
// 바뀌면 다른 단계(프로필·이용규칙·요금·링크 점검)가 시드 값을 덮거나 시드가 그 단계 결과를 지우는 것 — 동기화마다 값이 오락가락한다.
import { cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { execFileSync } from "node:child_process";
const root = resolve(fileURLToPath(import.meta.url), "../../..");
const src = join(root, "camping-atlas/public/explore/data");
const tmp = mkdtempSync(join(tmpdir(), "dayuse-"));
mkdirSync(join(tmp, "camps"));
cpSync(join(src, "campgrounds.json"), join(tmp, "campgrounds.json"));
// 시드가 건드리는 상세 파일만 복사(전체 193MB 대신)
const seed = JSON.parse(readFileSync(join(root, "pipeline/registry/dayuse-seed.json"), "utf8")).places ?? [];
const extra = ["dayuse-osm.json", "manual-camps.json"].map((f) => join(root, "pipeline/registry", f)).filter(existsSync).flatMap((f) => JSON.parse(readFileSync(f, "utf8")).places ?? []);
const ids = [...new Set([...seed, ...extra].map((p) => String(p.id)))];
for (const id of ids) { const f = join(src, "camps", `${id}.json`); if (existsSync(f)) cpSync(f, join(tmp, "camps", `${id}.json`)); }
const run = () => execFileSync(process.execPath, [join(root, "pipeline/scripts/apply-dayuse-seed.mjs")], { env: { ...process.env, EXPLORE_DIR: tmp }, stdio: "pipe" });
const fails = [];
const compare = (label) => {
  const a = JSON.parse(readFileSync(join(src, "campgrounds.json"), "utf8")), b = JSON.parse(readFileSync(join(tmp, "campgrounds.json"), "utf8"));
  const m = new Map(a.map((c) => [String(c.id), JSON.stringify(c)]));
  const rows = b.filter((c) => m.get(String(c.id)) !== JSON.stringify(c));
  if (rows.length || a.length !== b.length) fails.push(`${label}: campgrounds.json 행 ${rows.length}개 바뀜(예: ${rows.slice(0, 5).map((c) => c.id).join(", ")})${a.length !== b.length ? ` · 행 수 ${a.length}→${b.length}` : ""}`);
  const files = readdirSync(join(tmp, "camps")).filter((f) => { const o = join(src, "camps", f); return !existsSync(o) || readFileSync(o, "utf8") !== readFileSync(join(tmp, "camps", f), "utf8"); });
  if (files.length) fails.push(`${label}: 상세 파일 ${files.length}개 바뀜(예: ${files.slice(0, 5).join(", ")})`);
};
run(); compare("1회");
run(); compare("2회");
rmSync(tmp, { recursive: true, force: true });
if (fails.length) { console.error(`FAIL apply-dayuse-seed 멱등 아님 — 발행 데이터와 다름\n${fails.join("\n")}\n고치는 법: 시드 값을 덮는 단계를 apply-dayuse-seed 앞으로, 또는 같은 규칙을 시드 적용에도.`); process.exit(1); }
console.log(`OK apply-dayuse-seed 멱등 — ${ids.length}곳, 2회 실행 모두 발행 데이터와 동일`);
