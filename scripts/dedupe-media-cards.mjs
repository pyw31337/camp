#!/usr/bin/env node
/**
 * 자체 보관 공식 카드 사진(media/cards/index.json)에서 중복 사진을 정제한다.
 * 1) 고캠핑 대표 사진(camps/)과 동일한 장면(dHash hamming distance <= 6) 제거
 * 2) 같은 캠핑장 내 카드 사진 간 중복 장면 제거
 * 3) 사전 계산된 레지스트리(pipeline/registry/cards-deduped.json)가 있으면 즉시 적용하고, 없으면 dHash로 직접 연산
 */
import { existsSync } from "node:fs";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const [targetArg] = process.argv.slice(2);
const mediaDir = resolve(targetArg || join(root, "camping-atlas/dist/client/media"));
const registryPath = join(root, "pipeline/registry/cards-deduped.json");
const cardsIndexPath = join(mediaDir, "cards/index.json");

if (!existsSync(mediaDir)) {
  console.log(`미디어 폴더가 없어 카드 중복 정제를 건너뜁니다: ${mediaDir}`);
  process.exit(0);
}

const cardsDir = join(mediaDir, "cards");
await mkdir(cardsDir, { recursive: true });

if (existsSync(registryPath)) {
  const reg = JSON.parse(await readFile(registryPath, "utf8"));
  const cleanIndex = {
    generated_at: reg.generated_at || new Date().toISOString(),
    credit: reg.credit || "한국관광공사 고캠핑",
    camps: reg.camps || {},
  };
  await writeFile(cardsIndexPath, JSON.stringify(cleanIndex));
  console.log(`카드 사진 중복 정제 완료(레지스트리 기반): ${cardsIndexPath} (중복 제거 ${reg.duplicates_removed ?? 0}장, 총 캠핑장 ${reg.total_camps ?? 0}곳)`);
  process.exit(0);
}

// 레지스트리가 없으면 dHash 모듈로 직접 분석
const { dhashFile, hamming } = await import("../pipeline/lib/photo-dedupe.mjs");
const manifestPath = join(mediaDir, "manifest.json");

if (!existsSync(cardsIndexPath)) {
  console.log(`cards/index.json이 없어 카드 중복 정제를 건너뜁니다: ${cardsIndexPath}`);
  process.exit(0);
}

const rawCards = JSON.parse(await readFile(cardsIndexPath, "utf8"));
const cardsIndex = rawCards.camps || {};
const manifest = existsSync(manifestPath) ? JSON.parse(await readFile(manifestPath, "utf8")).camps || {} : {};

const campIds = Object.keys(cardsIndex);
let dupCount = 0;
let campDupCount = 0;
let totalCards = 0;
let keptCards = 0;
const cleanedCamps = {};

for (const cid of campIds) {
  const heroEntries = manifest[cid] || [];
  const cardEntries = cardsIndex[cid] || [];
  totalCards += cardEntries.length;
  const hashes = [];
  const keptList = [];
  let campHasDup = false;

  for (const h of heroEntries) {
    if (!h.thumb) continue;
    const file = join(mediaDir, h.thumb);
    if (!existsSync(file)) continue;
    try {
      const hash = await dhashFile(file);
      hashes.push({ src: h.thumb, hash });
    } catch {}
  }

  for (const c of cardEntries) {
    const file = join(mediaDir, c);
    if (!existsSync(file)) continue;
    try {
      const hash = await dhashFile(file);
      const match = hashes.find((prev) => hamming(prev.hash, hash) <= 6);
      if (match) {
        campHasDup = true;
        dupCount++;
      } else {
        hashes.push({ src: c, hash });
        keptList.push(c);
      }
    } catch {
      keptList.push(c);
    }
  }

  if (campHasDup) campDupCount++;
  if (keptList.length) cleanedCamps[cid] = keptList;
  keptCards += keptList.length;
}

const out = {
  generated_at: new Date().toISOString(),
  credit: rawCards.credit || "한국관광공사 고캠핑",
  total_camps: campIds.length,
  camps_with_duplicates: campDupCount,
  total_original_cards: totalCards,
  duplicates_removed: dupCount,
  camps: cleanedCamps,
};

await writeFile(cardsIndexPath, JSON.stringify(out));
console.log(`카드 사진 dHash 중복 정제 완료: 원본 ${totalCards}장 → ${keptCards}장 (중복 ${dupCount}장 제거)`);
