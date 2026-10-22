#!/usr/bin/env node
// 검토 판정 기록(docs/DATA_QUALITY_PROCESS.md 4단계). 검토 대기열(data/quality/review-queue.json)의 충돌을 원문 대조로 확정한다.
//   node pipeline/scripts/quality-decide.mjs --by Claude --cid 102167 --attr PET_POLICY --value NOT_ALLOWED \
//        --url "https://업장/이용안내" --why "업장 이용안내 ‘반려동물 출입 불가’. ALLOWED는 다른 캠핑장(detail_id 3100137) 페이지가 섞인 것"
//   --value는 속성 형식대로(bool은 true/false, 숫자는 숫자, enum은 코드). --retract 로 판정을 거둔다.
// 판정은 data/quality/decisions.ndjson에 한 줄로 덧붙고(merge=union), 다음 build-fact-store가 VERIFIED 사실(agent_review)로 넣는다.
import { appendFileSync, existsSync, mkdirSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { validateFacts } from "../lib/fact-store.mjs";

const root = resolve(fileURLToPath(import.meta.url), "../../..");
const file = process.env.DECISIONS_FILE || join(root, "data/quality/decisions.ndjson");
const o = {};
const av = process.argv.slice(2);
for (let i = 0; i < av.length; i++) if (av[i].startsWith("--")) o[av[i].slice(2)] = av[i + 1] == null || av[i + 1].startsWith("--") ? true : av[++i];
const need = o.retract ? ["by", "cid", "attr", "why"] : ["by", "cid", "attr", "value", "url", "why"];
const miss = need.filter((k) => o[k] == null || o[k] === true);
if (miss.length) { console.error(`필요: ${miss.map((k) => `--${k}`).join(" ")}`); process.exit(2); }
const parse = (v) => (v === "true" ? true : v === "false" ? false : /^-?\d+(\.\d+)?$/.test(v) ? Number(v) : v);
const row = { cid: String(o.cid), attr: String(o.attr), ...(o.retract ? { retract: true } : { value: parse(String(o.value)), url: String(o.url) }), why: String(o.why), by: String(o.by), at: new Date().toISOString() };
if (!row.retract) {
  const e = validateFacts([{ cid: row.cid, attr: row.attr, value: row.value, grade: "VERIFIED", src: "agent_review", url: row.url }]);
  if (e.length) { console.error(`판정 형식 오류: ${e.join("; ")}`); process.exit(1); }
}
if (!existsSync(join(root, "data/quality"))) mkdirSync(join(root, "data/quality"), { recursive: true });
appendFileSync(file, JSON.stringify(row) + "\n");
console.log(`판정 기록: ${JSON.stringify(row)}`);
