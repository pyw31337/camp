#!/usr/bin/env node
/**
 * 리뉴얼 시안(design/renewal)용 카드 사진 색인을 만든다.
 * 캠핑장마다 공식 사진 최대 5장: 1장은 자체 호스팅 webp(빠름), 나머지는 고캠핑 공식 imageList 원본 URL.
 * 출력: design/renewal/data/photos.json  { "<id>": ["media/camps/…-t.webp", "https://gocamping.or.kr/…", …] }
 * 입력: camping-atlas/public/explore/data/camps/*.json (photos, photos_remote)
 */
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const dataDir = join(root, 'camping-atlas/public/explore/data');
const outPath = join(root, 'design/renewal/data/photos.json');
const MAX = 5;
// 고캠핑 원본·썸네일은 같은 파일명을 가진다. 접두어/쿼리 제거 키로 중복을 거른다.
const key = (url) => {
  const path = String(url ?? "").split(/[?#]/)[0];
  const raw = path.slice(path.lastIndexOf("/") + 1) || path;
  let base;
  try { base = decodeURIComponent(raw); } catch { base = raw; }
  base = base.toLowerCase();
  return base.replace(/^thumb_\d+_/, "");
};
const official = (u) => /^https?:\/\/(www\.)?gocamping\.or\.kr\/upload\//.test(u);

// 고캠핑에서 지워진 원본(404)은 카드 사진 동기화가 media 브랜치 cards/failures.json에 남긴다.
// 그 주소는 색인에 넣지 않아 상세 사진 묶음에 빈 칸이 생기지 않게 한다.
// PHOTO_FAILURES(파일 경로)가 없으면 origin/media 브랜치에서 읽고, 둘 다 없으면 거르지 않는다.
function loadFailures() {
  try {
    if (process.env.PHOTO_FAILURES && existsSync(process.env.PHOTO_FAILURES)) return JSON.parse(readFileSync(process.env.PHOTO_FAILURES, 'utf8'));
    return JSON.parse(execFileSync('git', ['show', 'origin/media:cards/failures.json'], { cwd: root, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }));
  } catch { return {}; }
}
const dead = new Set(Object.keys(loadFailures()).map((u) => u.replace(/^http:/, 'https:')));
let dropped = 0;
const catalog = new Map(JSON.parse(readFileSync(join(dataDir, 'campgrounds.json'), 'utf8')).map((c) => [String(c.id), c]));
const urlHash = (u) => createHash("sha256").update(String(u)).digest("hex").slice(0, 10);
const dedupedRegPath = join(root, 'pipeline/registry/cards-deduped.json');
const dedupedRegRaw = existsSync(dedupedRegPath) ? JSON.parse(readFileSync(dedupedRegPath, 'utf8')) : {};
const dedupedReg = dedupedRegRaw.camps || {};
const droppedCardHashes = new Set((dedupedRegRaw.dropped || []).map((c) => c.split("/")[2]?.replace(/\.webp$/, "")));

const out = {};
let total = 0;
for (const f of readdirSync(join(dataDir, 'camps'))) {
  const id = f.replace(/\.json$/, '');
  const d = JSON.parse(readFileSync(join(dataDir, 'camps', f), 'utf8'));
  const c = catalog.get(id);
  const list = [];
  const seen = new Set();
  const add = (u, k = key(u)) => { if (u && !seen.has(k) && list.length < MAX) { seen.add(k); list.push(u); } };
  const own = d.photos?.[0];
  // 자체 호스팅 사진은 원본 고캠핑 대표 사진과 같은 장면이다. 대표 사진 키로 묶어 중복을 막는다.
  if (own?.t) add(`media/${own.t}`, c?.img ? key(c.img) : key(own.t));
  else if (c?.img && official(c.img)) add(c.img, key(c.img));
  if (c?.ph) seen.add(key(c.ph));
  // 이미 정제된 카드 사진 키를 seen에 등록하여 중복을 방지
  for (const cardPath of dedupedReg[id] ?? []) seen.add(key(cardPath));
  for (const u of d.photos_remote ?? []) {
    const url = u.replace(/^http:/, 'https:');
    if (!official(u)) continue;
    if (dead.has(url)) { dropped++; continue; }
    if (droppedCardHashes.has(urlHash(url))) continue;
    add(url);
  }
  if (list.length) { out[id] = list; total += list.length; }
}
mkdirSync(dirname(outPath), { recursive: true });
writeFileSync(outPath, JSON.stringify(out));
console.log(`photos.json: ${Object.keys(out).length}곳 · ${total}장 · ${(JSON.stringify(out).length / 1024).toFixed(0)}KB · 지워진 원본 ${dropped}장 제외(실패 목록 ${dead.size})`);
