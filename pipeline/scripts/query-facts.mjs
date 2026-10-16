#!/usr/bin/env node
// 사실 저장소(data/facts)에서 조건을 조합해 캠핑장을 찾는다. 에이전트·사람이 터미널에서 바로 쓴다.
//   node pipeline/scripts/query-facts.mjs --preset firewood,pet --must "ENV_VALLEY eq true" --want "REVIEW_PRO_QUIET min 1" --limit 10
//   --lenient: 후기 언급(MENTION)도 근거로 쓴다(결과에 grade로 표시) · --known: 필수 조건이 ‘확인필요’인 곳 제외 · --json
//   --presets: 취향 묶음 목록 · --attrs [묶음]: 속성 사전
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { DICTIONARY } from "../lib/fact-store.mjs";
import { PRESETS, loadFactStore, matchCampgrounds, parseCondition } from "../lib/fact-query.mjs";

const root = resolve(fileURLToPath(import.meta.url), "../../..");
const argv = process.argv.slice(2);
const all = (k) => argv.flatMap((a, i) => (a === k ? [argv[i + 1]] : []));
const has = (k) => argv.includes(k);
if (has("--presets")) { for (const [k, p] of Object.entries(PRESETS)) console.log(`${k.padEnd(14)} ${p.label}  ${p.conditions.map((c) => `${c.must ? "!" : ""}${c.attr} ${c.op} ${c.value ?? ""}`).join(" · ")}`); process.exit(0); }
if (has("--attrs")) {
  const g = all("--attrs")[0];
  for (const a of DICTIONARY.attributes.filter((x) => !g || g.startsWith("--") || x.group === g)) console.log(`${a.group.padEnd(9)} ${a.code.padEnd(26)} ${a.type.padEnd(6)} ${a.label}${a.enum ? `  [${Object.keys(a.enum).join("|")}]` : ""}`);
  process.exit(0);
}
const conditions = [
  ...all("--preset").flatMap((s) => s.split(",")).flatMap((k) => { if (!PRESETS[k]) throw new Error(`없는 묶음 ${k} (--presets)`); return PRESETS[k].conditions; }),
  ...all("--must").map((s) => parseCondition(s, { must: true })),
  ...all("--want").map((s) => parseCondition(s)),
];
if (!conditions.length) { console.log("조건이 없습니다. --preset / --must / --want (도움말은 파일 머리말)"); process.exit(1); }
const store = loadFactStore(join(root, "data/facts"));
const rows = matchCampgrounds(store, conditions, { mode: has("--lenient") ? "lenient" : "strict", limit: Number(all("--limit")[0] ?? 15), requireKnown: has("--known") });
if (has("--json")) { console.log(JSON.stringify(rows, null, 1)); process.exit(0); }
for (const r of rows) {
  console.log(`${String(r.score).padStart(6)}  ${r.name} (${[r.sido, r.sigungu].filter(Boolean).join(" ")}) #${r.cid}`);
  for (const m of r.matched) console.log(`          ✓ ${m.label}: ${JSON.stringify(m.value)} [${m.grade}]${m.evidence?.quote ? ` “${m.evidence.quote.slice(0, 50)}”` : ""}`);
  for (const u of r.unknown) console.log(`          ? ${u.label} 확인필요${u.why ? `(${u.why})` : ""}`);
  for (const f of r.failed) console.log(`          ✗ ${f.label}: ${JSON.stringify(f.value)} [${f.grade}]`);
}
console.log(`${rows.length}곳 · 조건 ${conditions.length}개`);
