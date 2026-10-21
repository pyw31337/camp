#!/usr/bin/env node
// 공개 카탈로그의 숫자·좌표·시간 값이 사람에게 바로 보이기 전의 보수적 상식 검사.
// ‘낮은 가격=오류’처럼 추정하지 않는다. 원천 등급이 있는 값은 보존하되,
// 물리적으로 불가능한 값·범위 역전·대한민국 밖 좌표만 발행 실패로 막는다.
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(fileURLToPath(import.meta.url), "../../..");
const dataDir = process.env.EXPLORE_DIR || join(root, "camping-atlas/public/explore/data");
const outPath = process.env.SANITY_AUDIT_OUT || join(root, "pipeline/out/catalog-sanity-audit.json");
const camps = JSON.parse(readFileSync(join(dataDir, "campgrounds.json"), "utf8"));
const hard = [], warning = [];
const validTime = (value) => typeof value === "string" && (/^(?:[01]\d|2[0-3]):[0-5]\d$/.test(value) || value === "24:00");
const finite = (value) => Number.isFinite(Number(value));
const issue = (level, code, c, value) => (level === "hard" ? hard : warning).push({ id: String(c.id), name: c.name, code, value });

for (const c of camps) {
  const fee = c.fee;
  if (fee && finite(fee.min)) {
    const min = Number(fee.min), max = finite(fee.max) ? Number(fee.max) : min;
    if (min < 0 || max < min) issue("hard", "FEE_RANGE", c, { min, max });
    // 무료 공원·당일 이용은 유효한 ‘0원’이라 1박 요금 오류로 취급하지 않는다.
    else if (min === 0 && !c.du && fee.g !== "FREE" && fee.grade !== "FREE") issue("hard", "FEE_ZERO_NON_DAY_USE", c, { min, max });
  }
  for (const [field, raw] of [["field_conditions.power.limit_w", c.field_conditions?.power?.limit_w], ["of.w", c.of?.w?.v]]) {
    if (!finite(raw) || Number(raw) === 0) continue;
    const watts = Number(raw);
    if (watts < 400) issue("hard", "POWER_BELOW_400W", c, { field, watts });
    if (watts > 10_000) issue("warning", "POWER_OVER_10KW_RECHECK", c, { field, watts });
  }
  const groups = c.field_conditions?.site_size?.groups?.length ? c.field_conditions.site_size.groups.map((g) => [g.width_m, g.depth_m, g.count]) : (c.sizes ?? []);
  for (const [width, depth, count] of groups) {
    if (!finite(width) || !finite(depth) || Number(width) <= 0 || Number(depth) <= 0 || (count != null && (!finite(count) || Number(count) < 0))) issue("hard", "SITE_SIZE_INVALID", c, { width, depth, count });
    else if (Number(width) > 30 || Number(depth) > 30 || Number(count) > 500) issue("warning", "SITE_SIZE_RECHECK", c, { width, depth, count });
  }
  for (const [key, raw] of Object.entries(c.ti ?? {})) {
    const value = Array.isArray(raw) ? raw[0] : raw;
    if (value && !validTime(value)) issue("hard", "TIME_FORMAT", c, { key, value });
  }
  for (const [key, value] of [["checkin", c.checkin], ["checkout", c.checkout]]) if (value && !validTime(value)) issue("hard", "TIME_FORMAT", c, { key, value });
  if (finite(c.lat) && finite(c.lng) && (Number(c.lat) < 32 || Number(c.lat) > 39 || Number(c.lng) < 124 || Number(c.lng) > 132)) issue("hard", "COORDINATE_OUTSIDE_KOREA", c, { lat: c.lat, lng: c.lng });
}

const report = { version: 1, checked_at: new Date().toISOString(), total: camps.length, hard, warning };
if (existsSync(resolve(outPath, ".."))) writeFileSync(outPath, `${JSON.stringify(report, null, 2)}\n`);
console.log(`카탈로그 상식 감사: 오류 ${hard.length} · 재확인 ${warning.length}`);
if (hard.length) process.exitCode = 1;
