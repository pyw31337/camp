#!/usr/bin/env node
// 이색 캠핑장 분류(lib/unique-camps.mjs)를 배포 직전 카탈로그에 덧붙인다: c.uq = ["spa","animal",…].
// 원본 값은 하나도 지우거나 바꾸지 않는다(필드 추가만). 근거는 unique-camps.json { cats, counts, evidence }로 함께 낸다.
// 사용: node pipeline/scripts/apply-unique-camps.mjs --data camping-atlas/dist/client/explore/data
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { UNIQUE_CATS, classifyUnique } from "../lib/unique-camps.mjs";

const i = process.argv.indexOf("--data");
const dir = i > 0 ? process.argv[i + 1] : "camping-atlas/public/explore/data";
const file = join(dir, "campgrounds.json");
if (!existsSync(file)) { console.log(`::warning::${file} 없음 — 이색 분류 건너뜀`); process.exit(0); }
const camps = JSON.parse(readFileSync(file, "utf8"));
const evidence = {};
const counts = Object.fromEntries(UNIQUE_CATS.map((c) => [c.id, 0]));
for (const c of camps) {
  if (c.status === "폐업") continue;
  const f = join(dir, "camps", `${encodeURIComponent(c.id)}.json`);
  let det = null;
  if (existsSync(f)) { try { det = JSON.parse(readFileSync(f, "utf8")); } catch { det = null; } }
  const r = classifyUnique(c, det);
  const ids = UNIQUE_CATS.map((x) => x.id).filter((id) => r[id]);
  if (!ids.length) continue;
  c.uq = ids;
  evidence[c.id] = r;
  for (const id of ids) counts[id]++;
}
writeFileSync(file, JSON.stringify(camps));
writeFileSync(join(dir, "unique-camps.json"), JSON.stringify({ generated_at: new Date().toISOString(), cats: UNIQUE_CATS.map(({ id, label }) => ({ id, label })), counts, total: Object.keys(evidence).length, evidence }));
console.log(`이색 캠핑장 ${Object.keys(evidence).length}곳:`, UNIQUE_CATS.map((x) => `${x.label} ${counts[x.id]}`).join(" · "));
