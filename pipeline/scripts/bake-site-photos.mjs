#!/usr/bin/env node
// 상품(사이트 유형)별 사진을 작은 webp로 굽고 화면용 색인을 만든다(2026-11-11 t55).
// 입력: registry/site-photos.json (collect-site-photos.mjs 선정). 이미 R2에 있는 고캠핑 사본(r2)은 다시 굽지 않고 그 경로를 쓴다.
// 출력: MEDIA_DIR/sites/{캠핑장}/{원본 URL 해시}.webp (가로 720px·품질 62, EXIF·GPS 제거, 자르기·보정 없음)
//       registry/site-photos-index.json (+ MEDIA_DIR/sites/index.json) — 발행 때 media/sites/index.json으로 나간다.
//       색인 모양: { credit, camps: { "<id>": { "<유형 코드>": [[경로, 출처 코드(g 고캠핑·t TourAPI·o 운영자), 바닥, 실내 1|0], …] } } }
// 지우지 않는다: 선정에서 빠진 파일도 그대로 둔다(권리자 삭제 요청은 takedowns.json·media에서 따로 처리).
// 환경 변수: MEDIA_DIR(없으면 굽지 않고 R2 사본만 색인), SITE_BAKE_MAX(실행당 다운로드 상한, 기본 6000), SITE_BAKE_BUDGET_MB(sites/ 상한, 기본 2500)
import { existsSync, readFileSync, writeFileSync, mkdirSync, renameSync, readdirSync, statSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(fileURLToPath(import.meta.url), "../../..");
const num = (k, d) => (process.env[k] != null && process.env[k] !== "" && Number.isFinite(Number(process.env[k])) ? Number(process.env[k]) : d);
const MEDIA_DIR = process.env.MEDIA_DIR ? resolve(process.env.MEDIA_DIR) : null;
const MAX = num("SITE_BAKE_MAX", 6000);
const BUDGET = num("SITE_BAKE_BUDGET_MB", 2500) * 1048576;
const UA = "MoyeoraCampBot/1.0 (+https://github.com/[REDACTED]/camp; operator-published facts only)";
const regDir = join(root, "pipeline/registry");
const sel = JSON.parse(readFileSync(join(regDir, "site-photos.json"), "utf8"));
const SRC = { gocamping: "g", tourapi: "t", operator: "o" };

export const relOf = (id, p) => (p.r2 ? p.r2 : `sites/${id}/${p.k}.webp`);
const gocampThumb = (u) => { const m = u.match(/^(https:\/\/gocamping\.or\.kr\/upload\/camp\/[^/]+\/)([^/]+\.(?:jpe?g|png|webp))$/i); return m ? `${m[1]}thumb/thumb_1000_${m[2]}` : null; };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const hostNext = new Map();
async function fetchBuf(url) {
  const h = new URL(url).hostname;
  for (;;) { const t = hostNext.get(h) ?? 0; if (Date.now() >= t) break; await sleep(t - Date.now()); }
  hostNext.set(h, Date.now() + 1100);
  const ctl = new AbortController(); const timer = setTimeout(() => ctl.abort(), 30000);
  try {
    const r = await fetch(url, { headers: { "user-agent": UA, accept: "image/*" }, signal: ctl.signal, redirect: "follow" });
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    return Buffer.from(await r.arrayBuffer());
  } finally { clearTimeout(timer); }
}
function dirSize(dir) {
  let n = 0;
  if (!existsSync(dir)) return 0;
  for (const d of readdirSync(dir, { withFileTypes: true })) { const p = join(dir, d.name); n += d.isDirectory() ? dirSize(p) : statSync(p).size; }
  return n;
}

let baked = 0, failed = 0, skipped = 0;
if (MEDIA_DIR) {
  const { default: sharp } = await import("sharp");
  let used = dirSize(join(MEDIA_DIR, "sites"));
  const jobs = [];
  for (const [id, types] of Object.entries(sel.camps ?? {})) for (const list of Object.values(types)) for (const p of list) {
    if (p.r2) continue;
    const rel = relOf(id, p);
    if (!existsSync(join(MEDIA_DIR, rel))) jobs.push({ id, p, rel });
  }
  console.log(`상품 사진 굽기: 새로 구울 것 ${jobs.length}장 · 현재 sites/ ${(used / 1048576).toFixed(0)}MB`);
  // 호스트가 다른 일은 나란히 받는다(호스트별 1.1초 간격은 fetchBuf가 지킨다).
  const queue = jobs.slice(0, MAX);
  let next = 0;
  await Promise.all(Array.from({ length: 6 }, async () => {
    while (next < queue.length) {
      const j = queue[next++];
      if (!j) break;
      if (used >= BUDGET) { skipped++; continue; }
      const urls = [gocampThumb(j.p.u), j.p.u].filter(Boolean);
      let buf = null;
      for (const u of urls) { try { buf = await fetchBuf(u); break; } catch {} }
      if (!buf) { failed++; continue; }
      try {
        const abs = join(MEDIA_DIR, j.rel);
        mkdirSync(dirname(abs), { recursive: true });
        const info = await sharp(buf).rotate().resize({ width: 720, withoutEnlargement: true }).webp({ quality: 62, effort: 5 }).toFile(`${abs}.tmp`);
        renameSync(`${abs}.tmp`, abs);
        used += info.size; baked++;
        if (baked % 250 === 0) console.log(`  ${baked}장 · ${(used / 1048576).toFixed(0)}MB`);
      } catch { failed++; }
    }
  }));
}

// 색인: R2 사본이거나 구운 파일이 있는 것만(MEDIA_DIR이 없으면 R2 사본 + 지난 색인에 있던 파일).
const prevPath = join(regDir, "site-photos-index.json");
const prev = existsSync(prevPath) ? JSON.parse(readFileSync(prevPath, "utf8")) : { camps: {} };
const prevFiles = new Set(Object.values(prev.camps ?? {}).flatMap((t) => Object.values(t).flat().map((e) => e[0])));
const camps = {};
let n = 0;
for (const [id, types] of Object.entries(sel.camps ?? {})) {
  for (const [type, list] of Object.entries(types)) {
    const rows = [];
    for (const p of list) {
      const rel = relOf(id, p);
      const have = p.r2 || (MEDIA_DIR ? existsSync(join(MEDIA_DIR, rel)) : prevFiles.has(rel));
      if (!have) continue;
      rows.push([rel, SRC[p.src] ?? "g", p.f ?? "", p.in ? 1 : 0]);
    }
    if (rows.length) { (camps[id] ??= {})[type] = rows; n += rows.length; }
  }
}
const index = {
  note: "캠핑장 상품(사이트 유형)별 사진 색인. [경로, 출처(g 한국관광공사 고캠핑·t 한국관광공사 TourAPI·o 캠핑장 공식 홈페이지), 바닥, 실내]. 경로는 media-base(R2) 기준.",
  generated_at: new Date().toISOString(), credit: { g: "한국관광공사 고캠핑", t: "한국관광공사 TourAPI", o: "캠핑장 공식 홈페이지" }, camps,
};
writeFileSync(prevPath, JSON.stringify(index) + "\n");
if (MEDIA_DIR) { mkdirSync(join(MEDIA_DIR, "sites"), { recursive: true }); writeFileSync(join(MEDIA_DIR, "sites/index.json"), JSON.stringify(index)); }
console.log(`상품 사진 색인: ${Object.keys(camps).length}곳 · ${n}장 (새로 구움 ${baked} · 실패 ${failed} · 용량 상한으로 건너뜀 ${skipped})`);
