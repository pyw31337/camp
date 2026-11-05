#!/usr/bin/env node
// 화면 데이터에 남은 literal &quot; 엔티티만 JSON 값에서 큰따옴표로 복원한다.
// URL·HTML 템플릿·코드의 escape 문자열은 대상이 아니다.
import { existsSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(fileURLToPath(import.meta.url), "../../..");
const apply = process.argv.includes("--apply");
const dataRoot = join(root, "camping-atlas/public/explore/data");
const files = [
  join(dataRoot, "campgrounds.json"),
  ...readdirSync(join(dataRoot, "camps")).filter((f) => f.endsWith(".json")).map((f) => join(dataRoot, "camps", f)),
  join(root, "data/gocamping-detail.ndjson"),
  ...readdirSync(join(root, "data/facts")).filter((f) => f.endsWith(".ndjson")).map((f) => join(root, "data/facts", f)),
].filter(existsSync);
let occurrences = 0, changedFiles = 0;
const clean = (value) => {
  if (typeof value === "string") {
    const count = (value.match(/&quot;/g) ?? []).length;
    occurrences += count;
    return value.replace(/&quot;/g, '"');
  }
  if (Array.isArray(value)) return value.map(clean);
  if (!value || typeof value !== "object") return value;
  return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, clean(v)]));
};
for (const file of files) {
  const original = readFileSync(file, "utf8");
  let next;
  if (file.endsWith(".ndjson")) {
    next = original.split("\n").map((line) => line.trim() ? JSON.stringify(clean(JSON.parse(line))) : line).join("\n");
  } else next = JSON.stringify(clean(JSON.parse(original)));
  if (next !== original) { changedFiles++; if (apply) writeFileSync(file, next); }
}
console.log(`${apply ? "적용" : "점검"}: &quot; ${occurrences}건 · 파일 ${changedFiles}개`);
