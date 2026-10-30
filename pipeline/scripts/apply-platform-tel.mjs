#!/usr/bin/env node
// 전화번호가 빈 캠핑장에 카카오맵 플레이스에 등록된 번호를 채운다(2026-10-30 소유자 결정 X1: “플랫폼 등록 번호”로 표기).
// - 빈 칸만 채운다(고캠핑·운영자 번호가 있으면 건드리지 않음, docs/DATA_MERGE_POLICY.md ①). 멱등.
// - 플레이스 매칭(registry/kakao-places.json, discover-kakao.mjs)이 이름·주소 기준 80점 이상이고 좌표가 500m 안일 때만 쓴다.
// - 출처를 남긴다: c.tel_src = { by: "kakao"|"naver", url, at } → 화면은 “플랫폼 등록 번호”로 표기한다(app.js 상세 기본 정보).
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(fileURLToPath(import.meta.url), "../../..");
const dataDir = process.env.EXPLORE_DIR || join(root, "camping-atlas/public/explore/data");
const reg = (f) => { const p = join(root, "pipeline/registry", f); return existsSync(p) ? JSON.parse(readFileSync(p, "utf8")).campgrounds ?? {} : {}; };
const kakao = reg("kakao-places.json"), naver = reg("naver-places.json");
export const MIN_SCORE = 80, MAX_DIST_M = 500;
const TEL = /^0\d{1,2}-?\d{3,4}-?\d{4}$/;
export function platformTel(id, k = kakao, n = naver) {
  for (const [by, rec] of [["kakao", k[id]], ["naver", n[id]]]) {
    const p = rec?.place, m = p?.match ?? {};
    const phone = String(p?.phone ?? "").trim();
    if (!phone || !TEL.test(phone.replace(/\s/g, ""))) continue;
    if ((m.score ?? 0) < MIN_SCORE || (m.distance_m ?? Infinity) > MAX_DIST_M) continue;
    return { tel: phone, src: { by, url: p.url ?? p.link ?? null, at: String(rec.checked_at ?? "").slice(0, 10) || null } };
  }
  return null;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const catPath = join(dataDir, "campgrounds.json");
  const cat = JSON.parse(readFileSync(catPath, "utf8"));
  let filled = 0, kept = 0;
  for (const c of cat) {
    if (c.du) continue;
    if (c.tel) { if (c.tel_src) kept++; continue; }
    const hit = platformTel(String(c.id));
    if (!hit) continue;
    c.tel = hit.tel; c.tel_src = hit.src; filled++;
  }
  if (filled) writeFileSync(catPath, `${JSON.stringify(cat)}\n`);
  console.log(`플랫폼 등록 전화번호: 새로 채움 ${filled}곳 · 이미 채워 둔 곳 ${kept}곳 (기준 매칭 ${MIN_SCORE}점↑·${MAX_DIST_M}m 안)`);
}
