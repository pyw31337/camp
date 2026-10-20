#!/usr/bin/env node
// 공식 사진이 없는 캠핑장의 카드 대표 사진을 고른다 → registry/card-fallback.json
// 후보: 상세의 d.sns_images(카카오 검색 API 결과 — 썸네일 URL·원문 링크). 썸네일(130px)만 잠깐 받아 픽셀로 거르고, 저장하지 않는다.
// 결과는 URL·원문 링크·출처뿐(이미지 재호스팅 없음). 화면은 ‘블로그 사진’ 출처와 원문 링크를 붙인다. build-card-fallback.mjs가 목록에 반영.
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";
import { looksLikePlace, orderCandidates, pixelStats } from "../lib/card-fallback.mjs";

const root = resolve(fileURLToPath(import.meta.url), "../../..");
const dataDir = join(root, "camping-atlas/public/explore/data");
const outPath = join(root, "pipeline/registry/card-fallback.json");
const camps = JSON.parse(readFileSync(join(dataDir, "campgrounds.json"), "utf8"));
const official = existsSync(join(dataDir, "photos.json")) ? JSON.parse(readFileSync(join(dataDir, "photos.json"), "utf8")) : {};
const prev = existsSync(outPath) ? JSON.parse(readFileSync(outPath, "utf8")).camps ?? {} : {};
const MAX_TRY = 10;

async function stats(url) {
  const ctl = AbortSignal.timeout(10000);
  const r = await fetch(url, { signal: ctl, headers: { "user-agent": "MoyeoraCampBot/1.0 (+https://github.com/pyw31337/camp)" } });
  if (!r.ok) return null;
  const b = Buffer.from(await r.arrayBuffer());
  const { data } = await sharp(b).resize(64, 64, { fit: "fill" }).removeAlpha().raw().toBuffer({ resolveWithObject: true });
  return pixelStats(data);
}
const need = camps.filter((c) => !c.img && !c.ph && !(official[c.id]?.length));
const out = {};
let picked = 0, none = 0, kept = 0;
const queue = [...need];
async function worker() {
  while (queue.length) {
    const c = queue.shift();
    const path = join(dataDir, "camps", `${c.id}.json`);
    if (!existsSync(path)) continue;
    let d; try { d = JSON.parse(readFileSync(path, "utf8")); } catch { continue; }
    // 후보: 이미지 검색(sns_images) → 없으면 블로그·카페 후기 글의 대표 썸네일(소유자 2026-10-20: 사진이 전혀 없으면 후기에서라도)
    const posts = [...(d.reviews ?? []), ...(d.cafe ?? []), ...(d.web ?? [])].filter((x) => x?.thumb && x?.url).map((x) => ({ thumb: x.thumb, img: null, url: x.url, src: x.src ?? "블로그 후기", date: x.date ?? null }));
    const cands = [...orderCandidates(d.sns_images), ...posts].slice(0, MAX_TRY + 4);
    // 지난번에 고른 사진이 아직 후보에 있으면 그대로(다시 받지 않음)
    const old = prev[c.id];
    if (old && cands.some((x) => x.thumb === old.t)) { out[c.id] = old; kept++; continue; }
    let hit = null;
    for (const x of cands) {
      const st = await stats(x.thumb).catch(() => null);
      if (looksLikePlace(st)) { hit = x; break; }
    }
    if (hit) { out[c.id] = { i: hit.img ?? null, t: hit.thumb, u: hit.url, s: hit.src ?? null, d: hit.date ?? null, at: new Date().toISOString() }; picked++; }
    else none++;
  }
}
await Promise.all(Array.from({ length: 8 }, worker));
writeFileSync(outPath, `${JSON.stringify({ updated_at: new Date().toISOString(), policy: "공식 사진이 없는 곳만. 카카오 검색 API 결과의 썸네일·원문 링크만 저장(이미지 재호스팅 없음). 픽셀 규칙으로 배치도·안내판·야간 사진을 거름.", camps: out }, null, 1)}\n`);
console.log(`카드 대체 사진: 대상 ${need.length}곳 · 새로 고름 ${picked} · 유지 ${kept} · 맞는 사진 없음 ${none}`);
