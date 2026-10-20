#!/usr/bin/env node
// data/gocamping-detail.ndjson(crawl-gocamping-detail.mjs)을 탐색 데이터 camps/{id}.json의 gcd로 붙인다.
// 고캠핑 상세 화면에만 있는 요금표·시설정보 표·내부시설·배치도·시설 사진·소개 전문·최종 수정일. 출처 주소·확인 시각을 그대로 남긴다.
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { createHash } from "node:crypto";
const root = resolve(fileURLToPath(import.meta.url), "../../..");
const dataDir = join(root, "camping-atlas/public/explore/data");
const src = join(root, "data/gocamping-detail.ndjson");
if (!existsSync(src)) { console.log("gocamping-detail.ndjson 없음 — 건너뜀"); process.exit(0); }
const rows = readFileSync(src, "utf8").split("\n").filter(Boolean).map((l) => JSON.parse(l));
// 이미 보이는 사진은 빼고 새 사진만 남긴다: 카드 사진(cards/{id}/{원본 URL sha256 앞 10자}.webp, sync-card-photos.mjs)·photos.json 원격 사진과 파일 이름 비교.
const readJson = (f, d) => { try { return JSON.parse(readFileSync(f, "utf8")); } catch { return d; } };
const cards = readJson(join(root, "pipeline/registry/cards-deduped.json"), {}).camps ?? {};
const photosJson = readJson(join(dataDir, "photos.json"), {});
const fname = (u) => String(u).split(/[?#]/)[0].split("/").pop().replace(/^thumb_\d+_/, "");
const urlHash = (u) => createHash("sha256").update(String(u)).digest("hex").slice(0, 10);
let dropped = 0;
const n = { camps: 0, fees: 0, layout: 0, photos: 0, facilities: 0, intro: 0, inner: 0 };
for (const r of rows) {
  const p = join(dataDir, "camps", `${r.id}.json`);
  if (!existsSync(p)) continue;
  const d = JSON.parse(readFileSync(p, "utf8"));
  const { id, source, intro_photos, ...g } = r;
  if (g.photos?.length) {
    const cardHash = new Set((cards[id] ?? []).map((x) => fname(x).replace(/\.webp$/, "")));
    const names = new Set((photosJson[id] ?? []).map(fname));
    const keep = g.photos.filter((u) => !names.has(fname(u)) && !cardHash.has(urlHash(`https://gocamping.or.kr/upload/camp/${id}/${fname(u)}`)) && !cardHash.has(urlHash(u)));
    dropped += g.photos.length - keep.length;
    if (keep.length) g.photos = keep; else delete g.photos;
  }
  if (g.layout?.length) {
    const have = new Set((d.layout?.images ?? []).map((x) => fname(x.img || x.thumb || "")));
    g.layout = g.layout.filter((u) => !have.has(fname(u)));
    if (!g.layout.length) delete g.layout;
  }
  d.gcd = g; writeFileSync(p, JSON.stringify(d));
  n.camps++; if (g.fees?.length) n.fees++; if (g.layout?.length) n.layout++; if (g.photos?.length) n.photos++; if (g.facilities?.length) n.facilities++; if (g.intro) n.intro++;
  if (g.facilities?.some((f) => /내부시설/.test(f.k))) n.inner++;
}
// 겨울 정보(소유자 2026-10-21) → 카탈로그 campgrounds.json에 짧게:
//   c.win = 1 운영기간에 ‘겨울’ 있음 · 0 운영기간은 있는데 ‘겨울’ 없음(화면에선 기존 ‘동계 휴장’ 빨간 배지로 보임) · 없음 = 모름
//   c.heat = ["g","c"] 글램핑(g)·카라반(c) 내부시설에 ‘난방’이 등록된 상품
const catPath = join(dataDir, "campgrounds.json");
if (existsSync(catPath)) {
  const cat = JSON.parse(readFileSync(catPath, "utf8"));
  const byId = new Map(rows.map((r) => [String(r.id), r]));
  const w = { win: 0, closed: 0, heat: 0 };
  for (const c of cat) {
    const r = byId.get(String(c.id));
    delete c.win; delete c.heat;
    if (!r) continue;
    const per = String(r.info?.["운영기간"] ?? "").trim();
    if (per) { c.win = /겨울/.test(per) ? 1 : 0; c.win ? w.win++ : w.closed++; }
    const heat = [["g", /글램핑\s*내부/], ["c", /카라반\s*내부/]].filter(([, re]) => (r.facilities ?? []).some((f) => re.test(f.k) && /난방/.test(`${f.v ?? ""} ${(f.items ?? []).join(" ")}`))).map(([k]) => k);
    if (heat.length) { c.heat = heat; w.heat++; }
  }
  writeFileSync(catPath, JSON.stringify(cat));
  console.log("winter →", JSON.stringify(w));
}
console.log("gocamping detail →", JSON.stringify({ ...n, photos_dropped_as_duplicate: dropped }));
