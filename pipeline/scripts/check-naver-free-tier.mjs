#!/usr/bin/env node
// 네이버 API HUB 무료 여부 감시(매일, naver-free-tier-watch.yml). 무료가 확인되지 않으면 exit 1 → 워크플로가 이슈로 알린다.
// 이 스크립트는 네이버 API를 호출하지 않는다(가이드 페이지만 읽음).
import { existsSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { checkFreeTier, DEFAULT_MONTHLY_CAP, FREE_QUOTA_MONTHLY, monthKey } from "../lib/naver-guard.mjs";

const root = resolve(fileURLToPath(import.meta.url), "../../..");
const usagePath = join(root, "pipeline/registry/naver-usage.json");
const usage = existsSync(usagePath) ? JSON.parse(readFileSync(usagePath, "utf8")) : null;
const used = usage?.months?.[monthKey()]?.calls ?? 0;
const r = await checkFreeTier();
console.log(`판정: ${r.free ? "무료" : "무료 확인 안 됨"} — ${r.reason}`);
if (r.quote) console.log(`근거: “${r.quote}”`);
console.log(`이번 달(${monthKey()}) 사용 ${used}건 / 우리 상한 ${Number(process.env.NAVER_MONTHLY_CAP || DEFAULT_MONTHLY_CAP)}건 / 무료 한도 ${FREE_QUOTA_MONTHLY}건`);
if (process.env.GITHUB_STEP_SUMMARY) {
  const { appendFileSync } = await import("node:fs");
  appendFileSync(process.env.GITHUB_STEP_SUMMARY, `### 네이버 API HUB 무료 감시\n- 판정: **${r.free ? "무료" : "무료 확인 안 됨 — 수집기 자동 중단"}**\n- 사유: ${r.reason}\n- 이번 달 사용: ${used}건\n- 원문: ${r.url}\n`);
}
process.exit(r.free ? 0 : 1);
