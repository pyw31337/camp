#!/usr/bin/env node
// 후기 요약에서 장점·단점 한 줄을 만들어 공개 카탈로그(campgrounds.json)의 rv = { n, p, c }에 쓴다.
// p·c는 [[주제, 건수], …]. 화면은 카드 아래에 “👍 …  👎 …(후기 n건 요약)”으로 보인다.
// 홈 테마 줄(featured.json)의 썸네일에도 장단점과 배지 요약을 붙인다. data-sync가 build-spec-sheet.mjs 뒤에 실행한다.
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { digestReviews } from "../lib/review-digest.mjs";

const root = resolve(fileURLToPath(import.meta.url), "../../..");
const dataDir = join(root, "camping-atlas/public/explore/data");
const campsPath = join(dataDir, "campgrounds.json");
const camps = JSON.parse(readFileSync(campsPath, "utf8"));
const count = { campgrounds: 0, with_pros: 0, with_cons: 0, reviews: 0 };
for (const c of camps) {
  delete c.rv;
  const path = join(dataDir, "camps", `${c.id}.json`);
  if (!existsSync(path)) continue;
  const d = JSON.parse(readFileSync(path, "utf8"));
  const dg = digestReviews(c.name, [...(d.reviews ?? []), ...(d.cafe ?? []), ...(d.web ?? [])], { min: 1, top: 4 });
  if (!dg || (!dg.pros.length && !dg.cons.length && !dg.details?.issues?.length)) continue;
  c.rv = { n: dg.n, p: dg.pros.slice(0, 2), c: dg.cons.slice(0, 2) };
  d.rv = { n: dg.n, p: dg.pros, c: dg.cons, details: dg.details };
  writeFileSync(path, JSON.stringify(d));
  count.campgrounds++; count.reviews += dg.n;
  if (dg.pros.length) count.with_pros++;
  if (dg.cons.length) count.with_cons++;
}
writeFileSync(campsPath, JSON.stringify(camps));

// 홈 테마 줄(featured.json)의 썸네일에도 같은 요약을 붙인다: 후기 장단점(rv) + 포스터 배지(bd).
// 배지는 탐색 화면 posterBadges와 같은 규칙의 축약판: 출처 있는 값만 채우고, 모르면 칸을 비운다(홈은 공간이 좁아 ‘확인필요’ 칸을 생략).
const byId = new Map(camps.map((c) => [c.id, c]));
function badges(c) {
  const f = c.field_conditions ?? {}, of = c.of ?? {}, out = [];
  const verified = f.status === "VERIFIED";
  const w = verified && Number(f.power?.limit_w) > 0 ? Number(f.power.limit_w) : of.w?.v ?? null;
  if (w) out.push(["pw", w >= 1000 ? `${+(w / 1000).toFixed(1)}kW` : `${w}W`]);
  const fw = verified ? f.firewood?.allowed : null;
  if (fw === true || of.fire?.v === "FIREWOOD_OK") out.push(["fi", "장작 OK"]);
  else if (of.fire?.v === "CHARCOAL_ONLY") out.push(["fi", "숯만"]);
  else if (c.fire === "불가" || of.fire?.v === "NO_FIRE") out.push(["off", c.fire === "불가" ? "화기 불가" : "개인 화기 불가"]);
  else if (c.fire === "개별") out.push(["fo", "화로대 개별"]);
  if (of.cc?.v === true) out.push(["pk", "차박 OK"]);
  else if ((verified && f.parking?.tent_side === true) || of.pk?.v === "SITE_SIDE") out.push(["pk", "사이트 옆 주차"]);
  else if (of.pk?.v === "EXTERNAL") out.push(["off", "외부 주차"]);
  return out;
}
const featuredPath = join(dataDir, "featured.json");
if (existsSync(featuredPath)) {
  const featured = JSON.parse(readFileSync(featuredPath, "utf8"));
  for (const t of featured.themes ?? []) for (const fc of t.camps ?? []) {
    const c = byId.get(fc.id);
    delete fc.rv; delete fc.bd;
    if (!c) continue;
    if (c.rv) fc.rv = c.rv;
    const bd = badges(c);
    if (bd.length) fc.bd = bd;
  }
  writeFileSync(featuredPath, JSON.stringify(featured));
}
const metaPath = join(dataDir, "meta.json");
if (existsSync(metaPath)) {
  const meta = JSON.parse(readFileSync(metaPath, "utf8"));
  meta.review_digest = { generated_at: new Date().toISOString(), ...count };
  writeFileSync(metaPath, JSON.stringify(meta, null, 2));
}
console.log(`후기 장단점 요약: ${count.campgrounds}곳 · 장점 ${count.with_pros} · 단점 ${count.with_cons}`);
