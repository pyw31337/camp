#!/usr/bin/env node
// 운영자·공공 원문을 직접 대조한 소수의 정밀 보정값을 발행 데이터에 적용한다.
// 자동 추출값으로 생긴 가격·규칙 오염을 같은 원천 URL·확인일을 가진 값으로 바로잡되,
// 그 밖의 수집값은 지우지 않는다. 레지스트리: registry/curated-camp-facts.json
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(fileURLToPath(import.meta.url), "../../..");
const dataDir = process.env.EXPLORE_DIR || join(root, "camping-atlas/public/explore/data");
const registry = JSON.parse(readFileSync(join(root, "pipeline/registry/curated-camp-facts.json"), "utf8"));
const catalogPath = join(dataDir, "campgrounds.json");
const camps = JSON.parse(readFileSync(catalogPath, "utf8"));
const byId = new Map(camps.map((c) => [String(c.id), c]));
let catalogUpdated = 0, detailUpdated = 0;

const clone = (v) => JSON.parse(JSON.stringify(v));
const mergeFields = (base, patch) => ({
  ...(base ?? {}),
  ...(patch ?? {}),
  ...(patch?.fields ? { fields: { ...(base?.fields ?? {}), ...patch.fields } } : {}),
});
const mergeConditions = (base, patch) => ({
  ...(base ?? {}),
  ...(patch ?? {}),
  ...Object.fromEntries(Object.entries(patch ?? {}).filter(([, value]) => value && typeof value === "object" && !Array.isArray(value)).map(([key, value]) => [key, { ...(base?.[key] ?? {}), ...value }])),
});
for (const item of registry.camps ?? []) {
  const c = byId.get(String(item.id));
  if (!c) {
    console.warn(`::warning title=정밀 보정 대상 없음::${item.id}`);
    continue;
  }
  const catalog = clone(item.catalog ?? {});
  const priorConditions = c.field_conditions;
  Object.assign(c, catalog);
  if (catalog.field_conditions) c.field_conditions = mergeConditions(priorConditions, catalog.field_conditions);
  for (const field of item.remove_catalog_fields ?? []) delete c[field];
  c.curated_at = registry.updated_at;
  c.curated_source = "operator_or_public_primary";
  catalogUpdated++;

  const detailPath = join(dataDir, "camps", `${item.id}.json`);
  const d = existsSync(detailPath) ? JSON.parse(readFileSync(detailPath, "utf8")) : { id: String(item.id) };
  const patch = clone(item.detail ?? {});
  for (const [key, value] of Object.entries(patch)) {
    // 고캠핑의 시설 원문은 보존하고, 정밀 요금표·원천만 교체한다.
    if (key === "gcd" && value && typeof value === "object") d.gcd = { ...(d.gcd ?? {}), ...value };
    else if ((key === "profile" || key === "spec") && value && typeof value === "object") d[key] = mergeFields(d[key], value);
    else if (key === "field_conditions" && value && typeof value === "object") d.field_conditions = mergeConditions(d.field_conditions, value);
    else d[key] = value;
  }
  d.curated_at = registry.updated_at;
  d.curated_source = "operator_or_public_primary";
  writeFileSync(detailPath, JSON.stringify(d));
  detailUpdated++;
}

writeFileSync(catalogPath, JSON.stringify(camps));
console.log(`정밀 보정 적용: 카탈로그 ${catalogUpdated}곳 · 상세 ${detailUpdated}곳`);
