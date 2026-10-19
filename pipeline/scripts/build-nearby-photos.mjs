#!/usr/bin/env node
// registry/nearby-photos.json의 주변시설 사진을 상세 파일(camps/{id}.json)의 주변 장소에 붙인다. 멱등.
// 장소에 img가 이미 있으면(관광공사 사진 등) 그대로 둔다. 붙인 사진은 img_u(원문)·img_s(출처)·img_by=search로 표시한다.
// build-nearby-facts.mjs 뒤에 실행한다(data-sync·publish-incremental).
import { existsSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { placeKey } from "../lib/nearby-photos.mjs";

const root = resolve(fileURLToPath(import.meta.url), "../../..");
const dir = join(root, "camping-atlas/public/explore/data/camps");
const regPath = join(root, "pipeline/registry/nearby-photos.json");
// 2026-10-19 첫 실행 표본 점검: 블로그 대표 썸네일 24장 중 실제 가게 모습은 5장뿐(안내문·배너·관계없는 풍경이 대부분).
// 엉뚱한 사진은 신뢰를 해치므로 기본은 붙이지 않고(이미 붙은 검색 사진은 걷어 냄), 실제 모습은 상세의 ‘로드뷰’로 보인다.
// 규칙을 개선해 다시 켤 때만 NEARBY_SEARCH_PHOTOS=on.
const enabled = process.env.NEARBY_SEARCH_PHOTOS === "on";
const places = enabled && existsSync(regPath) ? JSON.parse(readFileSync(regPath, "utf8")).places ?? {} : {};

let files = 0, attached = 0;
for (const f of readdirSync(dir)) {
  const path = join(dir, f);
  let d; try { d = JSON.parse(readFileSync(path, "utf8")); } catch { continue; }
  let changed = false;
  const touch = (x) => {
    if (!x || typeof x !== "object") return;
    const name = x.name ?? x.n;
    if (!name || !Number.isFinite(Number(x.lat))) return;
    // 지난번에 붙인 검색 사진은 매번 다시 계산한다(등록부에서 빠지면 함께 빠진다)
    if (x.img_by === "search") { delete x.img; delete x.img_u; delete x.img_s; delete x.img_by; changed = true; }
    if (x.img) return;
    const p = places[placeKey(name, x.lat, x.lng)];
    if (!p || p.none || !p.t) return;
    Object.assign(x, { img: p.t, img_u: p.u ?? null, img_s: p.s ?? null, img_by: "search" });
    changed = true; attached++;
  };
  for (const x of Object.values(d.nearby_licensed ?? {})) touch(x);
  for (const rows of Object.values(d.nearby ?? {})) if (Array.isArray(rows)) rows.forEach(touch);
  if (changed) { writeFileSync(path, JSON.stringify(d)); files++; }
}
console.log(`주변시설 검색 사진: ${attached}곳 연결 · 상세 ${files}개 갱신 · 등록부 ${Object.values(places).filter((p) => !p.none).length}곳`);
