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
const baseline = mkdtempSync(join(tmpdir(), "dayuse-baseline-"));
mkdirSync(join(tmp, "camps"));
mkdirSync(join(baseline, "camps"));
cpSync(join(src, "campgrounds.json"), join(tmp, "campgrounds.json"));
cpSync(join(src, "campgrounds.json"), join(baseline, "campgrounds.json"));
// 시드가 건드리는 상세 파일만 복사(전체 193MB 대신)
const seed = JSON.parse(readFileSync(join(root, "pipeline/registry/dayuse-seed.json"), "utf8")).places ?? [];
const extra = ["dayuse-osm.json", "manual-camps.json"].map((f) => join(root, "pipeline/registry", f)).filter(existsSync).flatMap((f) => JSON.parse(readFileSync(f, "utf8")).places ?? []);
const ids = [...new Set([...seed, ...extra].map((p) => String(p.id)))];
const copied = new Set();
for (const id of ids) { const f = join(src, "camps", `${id}.json`); if (existsSync(f)) { cpSync(f, join(tmp, "camps", `${id}.json`)); copied.add(`${id}.json`); } }
for (const f of readdirSync(join(tmp, "camps"))) cpSync(join(tmp, "camps", f), join(baseline, "camps", f));
// 발행 데이터는 publish-sanity를 거친 상태로 비교해야 한다. 기존 파일의 빈 값·잘못된 좌표를
// 매번 새로 정리하는 차이를 멱등성 실패로 오인하지 않도록 기준본을 먼저 같은 규칙으로 정규화한다.
execFileSync(process.execPath, [join(root, "pipeline/scripts/publish-sanity.mjs")], { env: { ...process.env, EXPLORE_DIR: baseline, MERGE_REVIEW_LOG_PATH: join(baseline, "merge-review.ndjson") }, stdio: "pipe" });
// 발행 순서 그대로: 시드 적용 → 발행 전 상식 정리(시·도 표기·중복 합치기 등).
// publish-sanity의 검토 로그도 임시 영역에 둔다. 검사는 읽기 전용이어야 한다.
const run = () => { for (const f of ["apply-dayuse-seed.mjs", "publish-sanity.mjs"]) execFileSync(process.execPath, [join(root, "pipeline/scripts", f)], { env: { ...process.env, EXPLORE_DIR: tmp, MERGE_REVIEW_LOG_PATH: join(tmp, "merge-review.ndjson") }, stdio: "pipe" }); };
const fails = [];
const compare = (label) => {
  const a = JSON.parse(readFileSync(join(baseline, "campgrounds.json"), "utf8")), b = JSON.parse(readFileSync(join(tmp, "campgrounds.json"), "utf8"));
  const m = new Map(a.map((c) => [String(c.id), JSON.stringify(c)]));
  const rows = b.filter((c) => m.get(String(c.id)) !== JSON.stringify(c));
  if (rows.length || a.length !== b.length) fails.push(`${label}: campgrounds.json 행 ${rows.length}개 바뀜(예: ${rows.slice(0, 5).map((c) => c.id).join(", ")})${a.length !== b.length ? ` · 행 수 ${a.length}→${b.length}` : ""}`);
  const files = readdirSync(join(tmp, "camps")).filter((f) => copied.has(f)).filter((f) => { const o = join(baseline, "camps", f); return !existsSync(o) || readFileSync(o, "utf8") !== readFileSync(join(tmp, "camps", f), "utf8"); });
  if (files.length) fails.push(`${label}: 상세 파일 ${files.length}개 바뀜(예: ${files.slice(0, 5).join(", ")})`);
};
run(); compare("1회");
run(); compare("2회");
rmSync(tmp, { recursive: true, force: true });
rmSync(baseline, { recursive: true, force: true });
if (fails.length) { console.error(`FAIL apply-dayuse-seed 멱등 아님 — 발행 데이터와 다름\n${fails.join("\n")}\n고치는 법: 시드 값을 덮는 단계를 apply-dayuse-seed 앞으로, 또는 같은 규칙을 시드 적용에도.`); process.exit(1); }
console.log(`OK apply-dayuse-seed 멱등 — ${ids.length}곳, 2회 실행 모두 발행 데이터와 동일`);
