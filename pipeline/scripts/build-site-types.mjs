#!/usr/bin/env node
// 업장별 사이트·상품 타입을 모아 탐색 데이터에 넣는다(lib/site-types.mjs).
//   campgrounds.json  c.st = [[code, count|null, g, sub|null]]   (카드·필터용, g: c=공식 등록·분류·소개글, o=운영자 홈페이지)
//   camps/{id}.json   d.site_types = [{code, label, count, sub, grade, src, url, at, quote}]   (상세 근거)
// 원천: 고캠핑 등록값·소개글, 카카오/네이버 장소 분류, 운영자 홈페이지 문장(registry/operator-site-snippets.json).
import { existsSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { compactTypes, siteTypesOf, SITE_TYPE_LABEL } from "../lib/site-types.mjs";

const root = resolve(fileURLToPath(import.meta.url), "../../..");
const dataDir = join(root, "camping-atlas/public/explore/data");
const reg = (f) => { const p = join(root, "pipeline/registry", f); return existsSync(p) ? JSON.parse(readFileSync(p, "utf8")).campgrounds ?? {} : {}; };
const snippets = reg("operator-site-snippets.json");
const kakao = reg("kakao-places.json");
const naver = reg("naver-places.json");

// 수기 시드(manual-camps·dayuse-seed)의 사이트 타입은 apply-dayuse-seed와 같은 규칙(코드별 한 번, 뒤에 붙이기)으로 남긴다.
// 이 단계가 시드 뒤에 다시 돌면서 시드 값을 지워, 동기화마다 값이 오락가락했다(check-dayuse-idempotent, 102377 AUTO 44면 2026-11-05).
const seedSt = new Map();
for (const f of ["dayuse-seed.json", "manual-camps.json"]) {
  const p = join(root, "pipeline/registry", f);
  if (!existsSync(p)) continue;
  for (const pl of JSON.parse(readFileSync(p, "utf8")).places ?? []) if (Array.isArray(pl?.st) && pl.st.length) seedSt.set(String(pl.id), pl.st);
}
const withSeed = (st, id) => {
  const seed = seedSt.get(id);
  if (!seed) return st ?? [];
  const base = Array.isArray(st) ? st : [];
  const seen = new Set(base.map((x) => String(x?.[0] ?? "")));
  return [...base, ...seed.filter((x) => !seen.has(String(x?.[0] ?? "")))];
};

const catalogPath = join(dataDir, "campgrounds.json");
const camps = JSON.parse(readFileSync(catalogPath, "utf8"));
const detailFiles = new Set(readdirSync(join(dataDir, "camps")));
const tally = {};
let withTypes = 0, beyondPitch = 0;
for (const c of camps) {
  const id = String(c.id);
  const f = `${id}.json`;
  const dPath = join(dataDir, "camps", f);
  const d = detailFiles.has(f) ? JSON.parse(readFileSync(dPath, "utf8")) : null;
  const s = snippets[id];
  const k = kakao[id];
  const n = naver[id];
  const list = siteTypesOf(c, d ?? {}, {
    snippets: s && s.status === "OK" ? s : null,
    kakao: k?.place ? { ...k.place, checked_at: k.checked_at } : null,
    naver: n?.place ? { ...n.place, checked_at: n.checked_at } : null,
    posts: d ? [...(d.reviews ?? []), ...(d.cafe ?? []), ...(d.web ?? [])] : [],
  });
  const st = withSeed(list.length ? compactTypes(list) : null, id);
  if (st.length) { c.st = st; withTypes++; } else delete c.st;
  if (list.some((t) => t.code !== "PITCH" && t.code !== "AUTO")) beyondPitch++;
  for (const t of list) tally[t.code] = (tally[t.code] ?? 0) + 1;
  if (d) {
    if (list.length) d.site_types = list; else delete d.site_types;
    writeFileSync(dPath, JSON.stringify(d));
  }
}
writeFileSync(catalogPath, JSON.stringify(camps));
console.log(`사이트 타입: ${withTypes}/${camps.length}곳 · 일반·오토 외 타입 보유 ${beyondPitch}곳`);
console.log("  " + Object.entries(tally).sort((a, b) => b[1] - a[1]).map(([k, v]) => `${SITE_TYPE_LABEL[k]} ${v}`).join(" · "));
