#!/usr/bin/env node
// 이색 캠핑장 분류(lib/unique-camps.mjs)를 배포 직전 카탈로그에 덧붙인다: c.uq = ["spa","animal",…].
// 원본 값은 하나도 지우거나 바꾸지 않는다(필드 추가만). 근거는 unique-camps.json { cats, counts, evidence }로 함께 낸다.
// 사용: node pipeline/scripts/apply-unique-camps.mjs --data camping-atlas/dist/client/explore/data
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { UNIQUE_CATS, classifyUnique } from "../lib/unique-camps.mjs";

const i = process.argv.indexOf("--data");
const dir = i > 0 ? process.argv[i + 1] : "camping-atlas/public/explore/data";
const file = join(dir, "campgrounds.json");
if (!existsSync(file)) { console.log(`::warning::${file} 없음 — 이색 분류 건너뜀`); process.exit(0); }
const camps = JSON.parse(readFileSync(file, "utf8"));
const evidence = {};
const counts = Object.fromEntries(UNIQUE_CATS.map((c) => [c.id, 0]));
const reviewRows = (det, c, cat) => {
  const core = String(c.name ?? "").replace(/\s|캠핑장|오토|글램핑|야영장|카라반/g, "").slice(0, 4);
  if (!core) return [];
  const rows = [];
  for (const key of ["reviews", "web", "cafe", "videos", "sns_images"]) {
    for (const item of det?.[key] ?? []) {
      const title = String(item?.title ?? item?.text ?? item?.snippet ?? "").trim();
      const url = String(item?.url ?? "").trim();
      if (!title || !/^https?:\/\//i.test(url)) continue;
      if (!title.replace(/\s/g, "").includes(core) || !cat.re.test(title)) continue;
      if (rows.some((x) => x.url === url)) continue;
      rows.push({ text: title.slice(0, 72), url });
      if (rows.length >= 2) return rows;
    }
  }
  return rows;
};
for (const c of camps) {
  if (c.status === "폐업") continue;
  const f = join(dir, "camps", `${encodeURIComponent(c.id)}.json`);
  let det = null;
  if (existsSync(f)) { try { det = JSON.parse(readFileSync(f, "utf8")); } catch { det = null; } }
  const r = classifyUnique(c, det);
  const ids = UNIQUE_CATS.map((x) => x.id).filter((id) => r[id]);
  if (!ids.length) continue;
  c.uq = ids;
  // 카드의 특색 배지 옆에 해당 체험이 실제로 언급된 후기 원문을 연결한다.
  // 후기 원문이 없으면 배지만 표시하고 임의의 글을 링크하지 않는다.
  const uqReviews = {};
  for (const cat of UNIQUE_CATS.filter((x) => ids.includes(x.id))) {
    const rows = reviewRows(det, c, cat);
    if (rows.length) uqReviews[cat.id] = rows;
  }
  if (Object.keys(uqReviews).length) c.uq_reviews = uqReviews;
  evidence[c.id] = r;
  for (const id of ids) counts[id]++;
}
writeFileSync(file, JSON.stringify(camps));
writeFileSync(join(dir, "unique-camps.json"), JSON.stringify({ generated_at: new Date().toISOString(), cats: UNIQUE_CATS.map(({ id, label }) => ({ id, label })), counts, total: Object.keys(evidence).length, evidence }));
console.log(`이색 캠핑장 ${Object.keys(evidence).length}곳:`, UNIQUE_CATS.map((x) => `${x.label} ${counts[x.id]}`).join(" · "));
