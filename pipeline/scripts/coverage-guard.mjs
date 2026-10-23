#!/usr/bin/env node
// 발행 전 커버리지 회귀 검사. 기준 meta.json의 coverage와 새 meta.json을 비교해, 어느 항목이라도
// max(20곳, 2%) 넘게 줄면 실패(종료 코드 1)한다. 캐시가 일부만 복원된 실행이 최신 데이터를 덮어쓰지 않게.
// 사용: node scripts/coverage-guard.mjs <base-meta.json> <new-meta.json>
import { existsSync, readFileSync } from "node:fs";
import { coverageDrops } from "../lib/merge-collected.mjs";

const [basePath, nextPath] = process.argv.slice(2);
const cov = (p) => JSON.parse(readFileSync(p, "utf8")).coverage;
const base = cov(basePath), next = cov(nextPath);
if (!base?.fields) { console.log("기준 커버리지가 없어 검사를 건너뜁니다."); process.exit(0); }
// 검토한 의도적 감소는 registry/merge-overrides.json의 coverage_acks에 이유와 함께 적는다(docs/DATA_MERGE_POLICY.md).
const ackPath = new URL("../registry/merge-overrides.json", import.meta.url);
const acks = existsSync(ackPath) ? JSON.parse(readFileSync(ackPath, "utf8")).coverage_acks ?? [] : [];
const drops = coverageDrops(base, next, acks);
for (const a of acks.filter((x) => !drops.some((d) => d.field === x.field) && base.fields?.[x.field] && base.fields[x.field].any - (next?.fields?.[x.field]?.any ?? 0) > Math.max(20, Math.round(base.fields[x.field].any * 0.02)))) console.log(`::notice::검토된 감소 통과: ${a.field} — ${a.reason}`);
for (const [k, b] of Object.entries(base.fields)) console.log(`  ${k.padEnd(11)} ${String(b.any).padStart(5)} → ${String(next?.fields?.[k]?.any ?? 0).padStart(5)}`);
if (drops.length) {
  console.log(`::error::커버리지가 줄어 발행하지 않습니다: ${drops.map((x) => `${x.field} ${x.before}→${x.after}`).join(", ")}`);
  process.exit(1);
}
console.log("커버리지 회귀 없음.");
