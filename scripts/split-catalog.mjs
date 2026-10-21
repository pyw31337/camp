#!/usr/bin/env node
// 카탈로그 나누기(소유자 2026-10-21 승인): campgrounds.json(원본, 파이프라인·검사는 그대로 이 파일만 씀) →
//   campgrounds.lite.json  { v, n, camps } 홈·목록·지도·필터·배지·개수에 쓰는 가벼운 판. 아래 HEAVY 경로와 null 값만 뺀다.
//   catx/{0..n-1}.json     같은 캠핑장의 원본 행 전체(상세·비교에서 필요할 때만 받음). 화면은 원본 행으로 덮어써 내용이 같다.
// 배포(deploy-pages)와 CI(web-quality)에서 생성한다. 저장소에는 커밋하지 않는다(.gitignore).
// HEAVY는 “목록·홈·지도·조건 화면 HTML이 원본과 같다”를 실험으로 확인한 경로만(camping-atlas/scripts/catalog-split-test.mjs가 매번 다시 확인).
// 사용: node scripts/split-catalog.mjs [data 디렉터리, 기본 camping-atlas/public/explore/data]
import { createHash } from "node:crypto";
import { mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

export const HEAVY = [
  "field_conditions.source", "field_conditions.status", "field_conditions.version", "field_conditions.fire_pit", "field_conditions.features", "field_conditions.rental_offers",
  "field_conditions.power.regulatory_reference_w", "field_conditions.power.statutory_standard", "field_conditions.power.high_power_mention",
  "field_conditions.parking.drop_off_external", "field_conditions.parking.shared_nearby", "field_conditions.parking.cart_required",
  "field_conditions.shelter_setup.canopy_allowed", "field_conditions.sanitary.private_bathroom_state", "field_conditions.sanitary.note",
  "booking.source", "booking.channels.[].evidence", "booking.primary.evidence", "booking.primary.confidence",
  "fee.url", "fee.basis", "fee.checked_at", "gc_url", "src_url", "src_at", "modified_at", "nearby_toilets", "notes", "seasons",
];
export const SHARDS = 64;
export const shardOf = (id) => { let h = 0; for (const ch of String(id)) h = (h * 31 + ch.charCodeAt(0)) >>> 0; return h % SHARDS; };
const del = (o, parts) => {
  if (o == null || typeof o !== "object") return o;
  const [h, ...t] = parts;
  if (h === "[]") return Array.isArray(o) ? o.map((x) => del(x, t)) : o;
  if (!(h in o)) return o;
  const r = Array.isArray(o) ? [...o] : { ...o };
  if (!t.length) delete r[h]; else r[h] = del(r[h], t);
  return r;
};
const nonull = (o) => (Array.isArray(o) ? o.map(nonull) : o && typeof o === "object" ? Object.fromEntries(Object.entries(o).filter(([, v]) => v !== null).map(([k, v]) => [k, nonull(v)])) : o);
export const liteOf = (c) => nonull(HEAVY.reduce((o, p) => del(o, p.split(".")), c));

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const root = resolve(fileURLToPath(import.meta.url), "../..");
  const dir = resolve(process.argv[2] ?? join(root, "camping-atlas/public/explore/data"));
  const raw = readFileSync(join(dir, "campgrounds.json"), "utf8");
  const full = JSON.parse(raw);
  const v = createHash("sha256").update(raw).digest("hex").slice(0, 12);
  const shards = Array.from({ length: SHARDS }, () => ({}));
  for (const c of full) shards[shardOf(c.id)][c.id] = c;
  rmSync(join(dir, "catx"), { recursive: true, force: true });
  mkdirSync(join(dir, "catx"), { recursive: true });
  shards.forEach((s, i) => writeFileSync(join(dir, "catx", `${i}.json`), JSON.stringify(s)));
  const lite = JSON.stringify({ v, n: SHARDS, camps: full.map(liteOf) });
  writeFileSync(join(dir, "campgrounds.lite.json"), lite);
  console.log(`catalog split v=${v}: full ${Math.round(raw.length / 1024)}KB → lite ${Math.round(lite.length / 1024)}KB + ${SHARDS} shards`);
}
