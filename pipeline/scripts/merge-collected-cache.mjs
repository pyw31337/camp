#!/usr/bin/env node
// 누적 캐시 두 벌을 합친다(캠핑장별로 더 최근에 확인한 쪽, 같은 때면 기존 쪽). 하나는 지금 실행이 쓴 캐시, 하나는 collected-data 브랜치의 최신 캐시.
// 찜 우선 수집(saved-priority.yml)이 매일 수집(data-sync)과 겹쳐도 서로의 결과를 덮어 지우지 않게 한다(docs/DATA_MERGE_POLICY.md).
// 사용: node scripts/merge-collected-cache.mjs <내 캐시.json> <브랜치 캐시.json> <출력.json>
import { existsSync, readFileSync, writeFileSync } from "node:fs";

const [mine, theirs, out] = process.argv.slice(2);
const read = (p) => (p && existsSync(p) ? JSON.parse(readFileSync(p, "utf8")) : { campgrounds: {} });
const a = read(mine), b = read(theirs);
const at = (e) => Date.parse(e?.fetched_at ?? e?.checked_at ?? "") || 0;
const merged = { ...b, ...a, campgrounds: { ...(b.campgrounds ?? {}) } };
let took = 0;
for (const [id, e] of Object.entries(a.campgrounds ?? {})) if (at(e) > at(merged.campgrounds[id])) { merged.campgrounds[id] = e; took++; }
writeFileSync(out, JSON.stringify(merged));
console.log(`캐시 합침: 브랜치 ${Object.keys(b.campgrounds ?? {}).length}곳 + 이번 실행에서 새로 ${took}곳 → ${Object.keys(merged.campgrounds).length}곳`);
