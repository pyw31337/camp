#!/usr/bin/env node
// registry/review-thumbs.json의 썸네일을 상세 후기 글(reviews·cafe·web)에 채운다 — 썸네일이 비어 있을 때만(채우기만). 멱등.
// data-sync 전체 빌드·증분 발행에서 내용 판정(apply-text-judgments) 앞에 돈다.
import { existsSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(fileURLToPath(import.meta.url), "../../..");
const dir = join(root, "camping-atlas/public/explore/data/camps");
const regPath = join(root, "pipeline/registry/review-thumbs.json");
if (!existsSync(regPath)) { console.log("후기 썸네일 등록부 없음 — 건너뜀"); process.exit(0); }
const urls = JSON.parse(readFileSync(regPath, "utf8")).urls ?? {};
let files = 0, filled = 0;
for (const f of readdirSync(dir)) {
  const p = join(dir, f);
  let d; try { d = JSON.parse(readFileSync(p, "utf8")); } catch { continue; }
  let n = 0;
  for (const x of [...(d.reviews ?? []), ...(d.cafe ?? []), ...(d.web ?? [])]) {
    const r = x?.url && !x.thumb ? urls[x.url] : null;
    if (r?.thumb) { x.thumb = r.thumb; if (r.img && !x.img) x.img = r.img; x.thumb_by = "image_search"; n++; }
  }
  if (n) { writeFileSync(p, JSON.stringify(d)); files++; filled += n; }
}
console.log(`후기 썸네일 채움: ${files}곳 · ${filled}건`);
