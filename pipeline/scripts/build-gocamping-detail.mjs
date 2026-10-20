#!/usr/bin/env node
// data/gocamping-detail.ndjson(crawl-gocamping-detail.mjs)을 탐색 데이터 camps/{id}.json의 gcd로 붙인다.
// 고캠핑 상세 화면에만 있는 요금표·시설정보 표·내부시설·배치도·시설 사진·소개 전문·최종 수정일. 출처 주소·확인 시각을 그대로 남긴다.
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
const root = resolve(fileURLToPath(import.meta.url), "../../..");
const dataDir = join(root, "camping-atlas/public/explore/data");
const src = join(root, "data/gocamping-detail.ndjson");
if (!existsSync(src)) { console.log("gocamping-detail.ndjson 없음 — 건너뜀"); process.exit(0); }
const rows = readFileSync(src, "utf8").split("\n").filter(Boolean).map((l) => JSON.parse(l));
const n = { camps: 0, fees: 0, layout: 0, photos: 0, facilities: 0, intro: 0, inner: 0 };
for (const r of rows) {
  const p = join(dataDir, "camps", `${r.id}.json`);
  if (!existsSync(p)) continue;
  const d = JSON.parse(readFileSync(p, "utf8"));
  const { id, source, ...g } = r;
  d.gcd = g; writeFileSync(p, JSON.stringify(d));
  n.camps++; if (g.fees?.length) n.fees++; if (g.layout?.length) n.layout++; if (g.photos?.length) n.photos++; if (g.facilities?.length) n.facilities++; if (g.intro) n.intro++;
  if (g.facilities?.some((f) => /내부시설/.test(f.k))) n.inner++;
}
console.log("gocamping detail →", JSON.stringify(n));
