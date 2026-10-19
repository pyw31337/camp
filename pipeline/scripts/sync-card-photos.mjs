#!/usr/bin/env node
// 카드 사진 레일(리뉴얼 시안 /camp/renewal/)용 추가 사진을 작은 webp로 굽는다.
// 대표 사진(camps/ 아래, sync-images.mjs 담당)을 뺀 고캠핑 공식 imageList 사진을 캠핑장당 최대 4장,
// 가로 480px·품질 55 webp(장당 약 25~35KB)로 MEDIA_DIR/cards/{id}/{원본 URL 해시}.webp 에 저장하고
// MEDIA_DIR/cards/index.json { "<id>": ["cards/<id>/<hash>.webp", …] } 을 만든다.
// sync-images.mjs의 정리(prune)는 camps/ 만 보므로 cards/ 는 건드리지 않는다.
//
// 환경 변수
//   MEDIA_DIR             출력 루트(기본 pipeline/out/media). 워크플로에서는 media 브랜치 작업 트리
//   CARD_PER_CAMP         캠핑장당 추가 사진 수(기본 4)
//   CARD_MAX_DOWNLOADS    실행당 다운로드 상한(기본 4000, 며칠에 걸쳐 채움)
//   CARD_BUDGET_MB        cards/ 전체 용량 상한(기본 320MB — camps/ 와 합쳐 Pages 1GB 안)
//   CARD_CONCURRENCY      동시 다운로드(기본 4)
import { createHash } from "node:crypto";
import { mkdir, readFile, readdir, rename, rm, stat, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";
import { downloadImage, isOfficialImageUrl, mapLimit, safeCampId } from "../lib/images.mjs";
import { photoKey } from "../lib/photo-dedupe.mjs";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const num = (k, d) => (Number.isFinite(Number(process.env[k])) && process.env[k] !== "" && process.env[k] != null ? Number(process.env[k]) : d);
const MEDIA_DIR = resolve(process.env.MEDIA_DIR || join(root, "pipeline/out/media"));
const PER_CAMP = num("CARD_PER_CAMP", 4);
const MAX_DL = num("CARD_MAX_DOWNLOADS", 4000);
const BUDGET = num("CARD_BUDGET_MB", 320) * 1024 * 1024;
const CONC = num("CARD_CONCURRENCY", 4);
const dataDir = join(root, "camping-atlas/public/explore/data");
const cardsDir = join(MEDIA_DIR, "cards");

const urlHash = (u) => createHash("sha256").update(String(u)).digest("hex").slice(0, 10);

const catalog = new Map(JSON.parse(await readFile(join(dataDir, "campgrounds.json"), "utf8")).map((c) => [String(c.id), c]));
const desired = new Map(); // id → [{url, rel}]
for (const f of await readdir(join(dataDir, "camps"))) {
  const id = f.replace(/\.json$/, "");
  if (!safeCampId(id)) continue;
  const d = JSON.parse(await readFile(join(dataDir, "camps", f), "utf8"));
  const heroImg = catalog.get(id)?.img ? photoKey(catalog.get(id).img) : null;
  const heroThumb = catalog.get(id)?.ph ? photoKey(catalog.get(id).ph) : null;
  const seen = new Set([heroImg, heroThumb].filter(Boolean));
  const list = [];
  for (const raw of d.photos_remote ?? []) {
    const url = String(raw).replace(/^http:/, "https:");
    const k = photoKey(url);
    if (seen.has(k) || !isOfficialImageUrl(url)) continue;
    seen.add(k);
    list.push({ url, rel: `cards/${id}/${urlHash(url)}.webp` });
    if (list.length >= PER_CAMP) break;
  }
  if (list.length) desired.set(id, list);
}

async function dirSize(dir) {
  let n = 0;
  for (const d of await readdir(dir, { withFileTypes: true }).catch(() => [])) {
    const p = join(dir, d.name);
    n += d.isDirectory() ? await dirSize(p) : (await stat(p)).size;
  }
  return n;
}
let used = await dirSize(cardsDir);
// 영구 실패(404 등)는 30일 동안 다시 받지 않는다.
const failPath = join(cardsDir, "failures.json");
const failures = existsSync(failPath) ? JSON.parse(await readFile(failPath, "utf8")) : {};
const freshFail = (u) => failures[u] && Date.now() - Date.parse(failures[u]) < 30 * 864e5;
const jobs = [...desired.values()].flat().filter((j) => !existsSync(join(MEDIA_DIR, j.rel)) && !freshFail(j.url));
console.log(`카드 사진: 대상 ${desired.size}곳 · 필요 ${[...desired.values()].flat().length}장 · 새로 받을 것 ${jobs.length}장 · 현재 ${(used / 1048576).toFixed(0)}MB`);

let ok = 0, bad = 0, skipped = 0;
await mapLimit(jobs.slice(0, MAX_DL), CONC, async (j) => {
  if (used >= BUDGET) { skipped++; return; }
  try {
    const buf = await downloadImage(j.url, { maxBytes: 12_000_000 });
    const abs = join(MEDIA_DIR, j.rel);
    await mkdir(dirname(abs), { recursive: true });
    // 비율 유지 축소만(자르기·보정 없음). 메타데이터(EXIF·GPS)는 기본으로 제거된다.
    const info = await sharp(buf).rotate().resize({ width: 480, withoutEnlargement: true }).webp({ quality: 55, effort: 5 }).toFile(`${abs}.tmp`);
    await rename(`${abs}.tmp`, abs);
    used += info.size;
    ok++;
    if (ok % 250 === 0) console.log(`  ${ok}장 · ${(used / 1048576).toFixed(0)}MB`);
  } catch (e) {
    bad++;
    if (e.permanent) failures[j.url] = new Date().toISOString();
    if (bad <= 20) console.log(`  실패 ${j.url}: ${e.message}`);
  }
});

// 색인: 실제 파일이 있는 것만. 원하는 목록에서 빠진 파일은 지운다(권리자 삭제·imageList 변경 반영).
const index = {};
for (const [id, list] of desired) {
  const have = list.filter((j) => existsSync(join(MEDIA_DIR, j.rel))).map((j) => j.rel);
  if (have.length) index[id] = have;
}
const keep = new Set(Object.values(index).flat());
let pruned = 0;
for (const d of await readdir(cardsDir, { withFileTypes: true }).catch(() => [])) {
  if (!d.isDirectory()) continue;
  for (const f of await readdir(join(cardsDir, d.name))) {
    const rel = `cards/${d.name}/${f}`;
    if (!f.endsWith(".webp") && !f.endsWith(".tmp")) continue;
    if (!keep.has(rel)) { await rm(join(cardsDir, d.name, f), { force: true }); pruned++; }
  }
}
await mkdir(cardsDir, { recursive: true });
const wantedUrls = new Set([...desired.values()].flat().map((j) => j.url));
for (const u of Object.keys(failures)) if (!wantedUrls.has(u)) delete failures[u];
await writeFile(failPath, JSON.stringify(failures));
await writeFile(join(cardsDir, "index.json"), JSON.stringify({ generated_at: new Date().toISOString(), credit: "한국관광공사 고캠핑", camps: index }));
const total = Object.values(index).reduce((n, l) => n + l.length, 0);
console.log(`카드 사진: 성공 ${ok} · 실패 ${bad} · 용량 초과로 건너뜀 ${skipped} · 정리 ${pruned} → ${Object.keys(index).length}곳 ${total}장 · ${(await dirSize(cardsDir) / 1048576).toFixed(0)}MB`);
if (skipped) console.log(`::warning title=카드 사진 용량 상한::CARD_BUDGET_MB에 닿아 ${skipped}장을 건너뜀`);
