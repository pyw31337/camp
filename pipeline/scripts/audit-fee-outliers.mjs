#!/usr/bin/env node
// 1박 요금 이상치 감사.
// - 2만원 미만이 모두 오류는 아니다. 국립공원·휴양림·지자체의 공식 요금은 남긴다.
// - 후기/검색 문장에서 잡힌 2만원 미만 숫자는 1박 요금으로 화면·필터에 쓰지 않고 재검증 대기로 표시한다.
// - 당일 이용 장소는 1박 가격 필터 대상에서 분리한다.
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(fileURLToPath(import.meta.url), "../../..");
const dataDir = process.env.EXPLORE_DIR || join(root, "camping-atlas/public/explore/data");
const catalogPath = join(dataDir, "campgrounds.json");
const outPath = process.env.FEE_AUDIT_OUT || join(root, "pipeline/out/fee-audit.json");
const APPLY = process.argv.includes("--apply");
const MIN_NIGHTLY_WON = 20_000;
const UNVERIFIED = new Set(["MENTION", "SURVEYED", "", null, undefined]);

const camps = JSON.parse(readFileSync(catalogPath, "utf8"));
const report = { version: 1, checked_at: new Date().toISOString(), threshold: MIN_NIGHTLY_WON, kept_low_official: [], hidden_pending_recheck: [], day_use: [] };

for (const c of camps) {
  const fee = c.fee;
  if (!fee || !Number.isFinite(Number(fee.min)) || Number(fee.min) <= 0) continue;
  if (c.du) {
    if (APPLY) fee.scope = "DAY_USE";
    report.day_use.push({ id: String(c.id), name: c.name, min: Number(fee.min), grade: fee.grade ?? null, basis: fee.basis ?? null });
    continue;
  }
  if (Number(fee.min) >= MIN_NIGHTLY_WON) continue;
  const entry = { id: String(c.id), name: c.name, min: Number(fee.min), max: Number(fee.max ?? fee.min), grade: fee.grade ?? null, basis: fee.basis ?? null, url: fee.url ?? null, checked_at: fee.checked_at ?? null };
  if (UNVERIFIED.has(fee.grade)) {
    if (APPLY) {
      fee.visibility = "HIDDEN_PENDING_RECHECK";
      fee.audit = { status: "RECHECK_REQUIRED", reason: "후기·검색 언급의 2만원 미만 금액은 1박 요금으로 확정하지 않음", checked_at: report.checked_at };
    }
    report.hidden_pending_recheck.push(entry);
  } else {
    if (APPLY) {
      delete fee.visibility;
      fee.audit = { status: "LOW_PRICE_SOURCE_RETAINED", reason: "운영자·공공 원천의 실제 저가 가능", checked_at: report.checked_at };
    }
    report.kept_low_official.push(entry);
  }
}

if (APPLY) writeFileSync(catalogPath, JSON.stringify(camps));
if (existsSync(resolve(outPath, ".."))) writeFileSync(outPath, `${JSON.stringify(report, null, 2)}\n`);
console.log(`요금 이상치 감사: 재검증 대기 ${report.hidden_pending_recheck.length} · 원천 유지 ${report.kept_low_official.length} · 당일 분리 ${report.day_use.length}${APPLY ? " · 적용" : ""}`);
