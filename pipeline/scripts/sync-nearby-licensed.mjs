#!/usr/bin/env node
// 행정안전부 LOCALDATA 인허가 공개 파일(키 불필요)로 캠핑장별 가장 가까운 편의점·상비약·마트·정육점·주유소·약국·동물병원을 찾는다.
// 결과: registry/nearby-licensed.json → build-fact-store가 NEARBY_*_M 사실(CONFIRMED, 원천 LOCALDATA 업종 페이지)로 쓴다.
// 매주 operator-sites 워크플로에서 실행(인허가 파일은 매일 갱신되지만 주 1회면 충분). 실패한 업종은 이전 결과를 유지한다.
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { downloadLocaldata } from "../lib/localdata.mjs";
import { buildIndexes, CATEGORIES, nearestFor, placeOf, SLUGS } from "../lib/nearby-licensed.mjs";

const root = resolve(fileURLToPath(import.meta.url), "../../..");
const outPath = join(root, "pipeline/registry/nearby-licensed.json");
const camps = JSON.parse(readFileSync(join(root, "camping-atlas/public/explore/data/campgrounds.json"), "utf8"));
const prev = existsSync(outPath) ? JSON.parse(readFileSync(outPath, "utf8")) : null;

const placesBySlug = {};
const sources = [];
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
// LOCALDATA는 연속 다운로드에 429를 준다: 업종 사이 8초, 429면 45초 쉬고 두 번까지 다시.
async function download(slug) {
  for (let i = 0; ; i++) {
    try { return await downloadLocaldata(slug, { pick: () => true }); } catch (e) {
      if (i >= 2 || !/429/.test(e.message)) throw e;
      await sleep(45000);
    }
  }
}
for (const slug of SLUGS) {
  const t = Date.now();
  if (Object.keys(placesBySlug).length) await sleep(8000);
  try {
    const r = await download(slug);
    placesBySlug[slug] = r.rows.map(placeOf).filter(Boolean);
    sources.push({ slug, page_url: r.pageUrl, rows: r.rows.length, operating_with_coords: placesBySlug[slug].length, fetched_at: new Date().toISOString() });
    console.log(`${slug}: ${r.rows.length}행 → 영업·좌표 ${placesBySlug[slug].length} (${Math.round((Date.now() - t) / 1000)}초)`);
  } catch (e) {
    console.log(`::warning title=LOCALDATA ${slug} 실패::${e.message.slice(0, 200)}`);
  }
}
const failed = SLUGS.filter((s) => !placesBySlug[s]);
// 원천 하나라도 실패한 범주는 이전 결과를 그대로 둔다(빈 값으로 덮지 않기).
const okCats = CATEGORIES.filter((c) => c.from.every((s) => placesBySlug[s]));
const indexes = buildIndexes(placesBySlug);
const result = {};
for (const c of camps) {
  if (!Number.isFinite(c.lat) || !Number.isFinite(c.lng)) continue;
  const near = nearestFor(c.lat, c.lng, indexes);
  const keep = {};
  for (const cat of CATEGORIES) keep[cat.code] = okCats.includes(cat) ? near[cat.code] : prev?.campgrounds?.[c.id]?.[cat.code] ?? null;
  result[c.id] = keep;
}
const summary = Object.fromEntries(CATEGORIES.map((cat) => {
  const ms = Object.values(result).map((r) => r[cat.code]?.m).filter((m) => m != null).sort((a, b) => a - b);
  return [cat.code, { label: cat.label, places: indexes[cat.code].size, campgrounds_with_one_within_20km: ms.length, median_m: ms[Math.floor(ms.length / 2)] ?? null, within_3km: ms.filter((m) => m <= 3000).length }];
}));
writeFileSync(outPath, `${JSON.stringify({
  version: 1,
  generated_at: new Date().toISOString(),
  source: {
    label: "행정안전부 지방행정 인허가데이터(LOCALDATA) 공개 파일",
    url: "https://www.localdata.go.kr/",
    license: "공공데이터 이용허락범위 제한 없음",
    note: "영업 중·좌표 있는 업소만. 좌표 EPSG:5174→WGS84 변환(수 m 오차). 거리는 직선. 편의점은 상비약 판매업소·담배소매인 중 체인 상호로 판별. 영업시간은 원천에 없다(상비약 판매업소는 법상 24시간 운영 요건).",
  },
  sources: [...sources, ...failed.map((slug) => ({ slug, failed: true, kept_previous: true }))],
  summary,
  campgrounds: result,
}, null, 0)}\n`);
console.log(JSON.stringify(summary, null, 1));
if (failed.length) console.log(`실패 업종(이전 결과 유지): ${failed.join(", ")}`);
