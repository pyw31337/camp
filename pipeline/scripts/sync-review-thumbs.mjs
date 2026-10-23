#!/usr/bin/env node
// 카카오 후기 글(다음 카페·티스토리·브런치) 중 썸네일이 없는 글의 사진을 다음 이미지 검색에서 찾는다 → registry/review-thumbs.json
// 원문 주소가 같은 결과만 쓴다(lib/review-thumbs.mjs pickPostImage). 찾지 못한 글은 30일 동안 다시 찾지 않는다.
// 호출 상한 REVIEW_THUMB_MAX_CALLS(기본 3000 — 다음 이미지 검색 일 한도의 절반을 넘지 않게 sync-social과 합쳐 계산). 키가 없거나 한도면 멈추고 exit 0.
import { existsSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { kakaoSearch } from "../lib/social-search.mjs";
import { isKakaoPost, pickPostImage, thumbQuery } from "../lib/review-thumbs.mjs";

const root = resolve(fileURLToPath(import.meta.url), "../../..");
const dir = join(root, "camping-atlas/public/explore/data/camps");
const regPath = join(root, "pipeline/registry/review-thumbs.json");
const MAX = Number(process.env.REVIEW_THUMB_MAX_CALLS ?? 3000);
const RETRY_DAYS = 30;
const key = process.env.KAKAO_REST_API_KEY;
const reg = existsSync(regPath) ? JSON.parse(readFileSync(regPath, "utf8")) : { urls: {} };
reg.urls ??= {};
const now = Date.now();

const todo = new Map();
for (const f of readdirSync(dir)) {
  let d; try { d = JSON.parse(readFileSync(join(dir, f), "utf8")); } catch { continue; }
  const imgs = new Set((d.sns_images ?? []).map((x) => x.url));
  for (const x of [...(d.reviews ?? []), ...(d.cafe ?? []), ...(d.web ?? [])]) {
    if (!x?.url || x.ng || x.thumb || imgs.has(x.url) || !isKakaoPost(x.url) || todo.has(x.url)) continue;
    const r = reg.urls[x.url];
    if (r?.thumb) continue;
    if (r?.none && now - Date.parse(r.at) < RETRY_DAYS * 864e5) continue;
    const q = thumbQuery(x);
    if (q) todo.set(x.url, q);
  }
}
console.log(`썸네일 없는 카카오 후기 ${todo.size}건 · 이번 상한 ${MAX}건 · 등록부 ${Object.keys(reg.urls).length}건`);
if (!key) { console.log("::notice::KAKAO_REST_API_KEY 없음 — 건너뜀"); process.exit(0); }
let calls = 0, found = 0;
for (const [url, q] of todo) {
  if (calls >= MAX) break;
  calls++;
  try {
    const docs = await kakaoSearch("image", q, { sort: "accuracy", size: 30 }, { key });
    const hit = pickPostImage(docs, url);
    reg.urls[url] = hit ? { ...hit, at: new Date().toISOString() } : { none: true, at: new Date().toISOString() };
    if (hit) found++;
  } catch (e) {
    if (e.code === "RATE_LIMIT" || e.code === "AUTH") { console.log(`::warning::카카오 이미지 검색 중단: ${e.message}`); break; }
  }
  if (calls % 200 === 0) writeFileSync(regPath, `${JSON.stringify(reg)}\n`);
  await new Promise((ok) => setTimeout(ok, 80));
}
writeFileSync(regPath, `${JSON.stringify(reg)}\n`);
console.log(`카카오 이미지 검색 ${calls}건 · 썸네일 찾음 ${found}건`);
