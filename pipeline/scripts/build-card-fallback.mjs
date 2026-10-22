#!/usr/bin/env node
// registry/card-fallback.json → campgrounds.json의 c.pt { i: 원본 이미지, t: 썸네일, u: 원문 글, s: 출처 }. 공식 사진이 생기면 빠진다. 멱등.
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(fileURLToPath(import.meta.url), "../../..");
const dataDir = join(root, "camping-atlas/public/explore/data");
const path = join(dataDir, "campgrounds.json");
const regPath = join(root, "pipeline/registry/card-fallback.json");
const reg = existsSync(regPath) ? JSON.parse(readFileSync(regPath, "utf8")).camps ?? {} : {};
const official = existsSync(join(dataDir, "photos.json")) ? JSON.parse(readFileSync(join(dataDir, "photos.json"), "utf8")) : {};
const camps = JSON.parse(readFileSync(path, "utf8"));
// 사진 내용 판정(registry/photo-judgments.json): 걸러진 첫 검색 썸네일(c.sn)은 카드에 쓰지 않는다(음식·인물 사진, 2026-10-22)
const judgPath = join(root, "pipeline/registry/photo-judgments.json");
const judg = existsSync(judgPath) ? JSON.parse(readFileSync(judgPath, "utf8")).photos ?? {} : {};
let snDropped = 0;
for (const c of camps) if (c.sn && judg[c.sn] && !judg[c.sn].ok) { delete c.sn; snDropped++; }
let n = 0;
for (const c of camps) {
  const p = reg[c.id];
  if (p && !c.img && !c.ph && !(official[c.id]?.length)) { c.pt = { i: p.i, t: p.t, u: p.u, s: p.s }; n++; } else delete c.pt;
}
writeFileSync(path, JSON.stringify(camps));
console.log(`카드 대체 사진 연결: ${n}곳 (공식 사진 없는 곳 중) · 걸러진 검색 썸네일 제외 ${snDropped}곳`);
