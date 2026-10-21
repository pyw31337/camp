#!/usr/bin/env node
// 주기적 정제·적합성 검사. 수집된 값이 모여라 언어·포맷과 레이블에 맞는지 확인한다.
// 사용: node pipeline/scripts/refine-check.mjs [--report out.json]
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const root = new URL("../../", import.meta.url).pathname;
const camps = JSON.parse(readFileSync(join(root, "camping-atlas/public/explore/data/campgrounds.json"), "utf8"));
const issues = [];

const LABEL_RULES = [
  { field: "fee.min", test: (v) => typeof v === "number" && v > 0 && v < 1_000_000, why: "요금은 0~100만원 사이 숫자" },
  { field: "pets", test: (v) => /가능|불가|문의/.test(String(v ?? "")), why: "반려동물은 가능/불가/문의" },
  { field: "rv.n", test: (v, c) => !c.rv || (typeof c.rv.n === "number" && c.rv.n >= 0), why: "후기 건수는 0 이상 숫자" },
  { field: "lat", test: (v) => typeof v === "number" && v >= 33 && v <= 39, why: "위도는 33~39" },
  { field: "lng", test: (v) => typeof v === "number" && v >= 124 && v <= 132, why: "경도는 124~132" },
];

for (const c of camps) {
  for (const rule of LABEL_RULES) {
    const v = rule.field.split(".").reduce((o, k) => o?.[k], c);
    if (v !== undefined && !rule.test(v, c)) {
      issues.push({ id: c.id, name: c.name, field: rule.field, value: v, why: rule.why });
    }
  }
  // 소개 문구가 후기 요약과 모순되는지
  if (c.line && c.rv?.p) {
    const intro = String(c.line);
    if (/애견|반려/.test(intro) && /불가/.test(String(c.pets ?? ""))) {
      issues.push({ id: c.id, name: c.name, field: "line", value: intro.slice(0, 40), why: "소개에 애견인데 반려동물 불가" });
    }
  }
}

const report = { generated_at: new Date().toISOString(), total: camps.length, issues: issues.length, sample: issues.slice(0, 20) };
const out = process.argv.includes("--report") ? process.argv[process.argv.indexOf("--report") + 1] : null;
if (out) writeFileSync(out, JSON.stringify(report, null, 1));
console.log(`정제 검사: ${camps.length}곳 · 문제 ${issues.length}건`);
if (issues.length) console.log(issues.slice(0, 5).map((x) => `  ${x.id} ${x.field}: ${x.why}`).join("\n"));
process.exit(issues.length > 100 ? 1 : 0);
