#!/usr/bin/env node
// 발행 JSON의 안전한 표시용 HTML 문자 엔티티만 정제한다. URL·원문 주소는 절대 고치지 않는다.
// 사용: node scripts/sanitize-display-text.mjs [--apply]
import { existsSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { decodeDisplayEntities } from "../lib/detail-text-review.mjs";

const root = resolve(fileURLToPath(import.meta.url), "../../..");
const apply = process.argv.includes("--apply");
const files = [
  join(root, "camping-atlas/public/explore/data/campgrounds.json"),
  ...readdirSync(join(root, "camping-atlas/public/explore/data/camps")).filter((f) => f.endsWith(".json")).map((f) => join(root, "camping-atlas/public/explore/data/camps", f)),
];
const URL_KEY = /(?:^|_)(?:url|href|src|image|embed)(?:$|_)/i;
let changedFiles = 0, changedStrings = 0;
function clean(value, key = "") {
  if (typeof value === "string") {
    if (URL_KEY.test(key)) return value;
    const next = decodeDisplayEntities(value);
    if (next !== value) changedStrings++;
    return next;
  }
  if (Array.isArray(value)) return value.map((x) => clean(x, key));
  if (!value || typeof value !== "object") return value;
  return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, clean(v, k)]));
}
for (const file of files) {
  if (!existsSync(file)) continue;
  const original = readFileSync(file, "utf8");
  const next = JSON.stringify(clean(JSON.parse(original)));
  if (next !== original) {
    changedFiles++;
    if (apply) writeFileSync(file, next);
  }
}
console.log(`${apply ? "적용" : "점검"}: 표시 텍스트 ${changedStrings}건 · 파일 ${changedFiles}개`);
