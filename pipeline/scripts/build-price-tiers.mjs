#!/usr/bin/env node
// 1박 요금을 숙박 형태별(캠핑 사이트·글램핑·카라반·펜션)로 나눠 campgrounds.json의 fee.tiers에 넣는다. 멱등.
// 근거: 상세의 요금 언급(d.prices의 금액·이름표), 관광공사 상품(d.products), 목록 요금 범위(fee.min·max). lib/price-tiers.mjs 참고.
// build-site-pricing-facts.mjs·build-site-types.mjs(사이트 타입 c.st) 뒤에 실행한다.
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { feeTiers } from "../lib/price-tiers.mjs";
import { logReview } from "../lib/merge-policy.mjs";
import { reviewDetailTexts } from "../lib/detail-text-review.mjs";

const root = resolve(fileURLToPath(import.meta.url), "../../..");
const dataDir = join(root, "camping-atlas/public/explore/data");
const camps = JSON.parse(readFileSync(join(dataDir, "campgrounds.json"), "utf8"));
const count = {};
let n = 0;
for (const c of camps) {
  if (!c.fee) continue;
  const prevTiers = c.fee.tiers?.length ?? 0;
  delete c.fee.tiers;
  // 공공 표준 요금처럼 근거가 범위 하나뿐인 곳은 나눌 것이 없다
  const obs = [{ won: c.fee.min }, { won: c.fee.max }];
  const path = join(dataDir, "camps", `${c.id}.json`);
  if (existsSync(path)) {
    let d = null; try { d = JSON.parse(readFileSync(path, "utf8")); } catch {}
    const cleanPrices = d ? (reviewDetailTexts(d, c).d?.prices ?? []) : [];
    for (const p of cleanPrices) obs.push({ won: p.won, label: p.label ?? null });
    for (const p of d?.products ?? []) for (const v of Object.values(p.price ?? {})) if (v) obs.push({ won: v, label: p.name ?? null });
  }
  // 목록 범위(fee) 밖의 언급(다른 철·장박 요금)은 쓰지 않는다
  const lo = c.fee.min, hi = c.fee.max ?? c.fee.min;
  const tiers = feeTiers(obs.filter((o) => Number(o.won) >= lo && Number(o.won) <= hi), (c.st ?? []).map((t) => t[0]), c.name);
  if (!tiers.length || (tiers.length === 1 && tiers[0][0] === "site")) {
    if (prevTiers) logReview({ by: "build-price-tiers", action: "removed", file: "campgrounds.json", id: String(c.id), field: "fee.tiers", reason: "요금 형태 나누기 규칙 정정(대량 단가·범위 밖 금액 제외, QA)" });
    continue;
  }
  if (tiers.length < prevTiers) logReview({ by: "build-price-tiers", action: "removed", file: "campgrounds.json", id: String(c.id), field: "fee.tiers", reason: "요금 형태 나누기 규칙 정정(대량 단가·범위 밖 금액 제외, QA)" });
  c.fee.tiers = tiers;
  n++;
  for (const [t] of tiers) count[t] = (count[t] ?? 0) + 1;
}
writeFileSync(join(dataDir, "campgrounds.json"), JSON.stringify(camps));
console.log(`요금 형태 나누기: ${n}곳 (사이트 외 형태가 있는 곳) · 형태별 ${JSON.stringify(count)}`);
