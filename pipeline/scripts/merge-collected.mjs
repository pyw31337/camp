#!/usr/bin/env node
// 새로 모은 웹 언급(out/campground-web.json)을 발행된 상세 데이터에 덧붙인다(지우지 않음).
// 사용: node scripts/merge-collected.mjs [--web <campground-web.json>] [--shorts <campground-shorts.json>] [--data <explore data dir>]
// 숏츠(--shorts): 영상(videos)에 같은 YouTube id가 없는 숏츠만 덧붙인다(채우기만, 기존 영상 그대로).
// 증분 발행(publish-incremental.sh)이 최신 main 작업 트리에서 부른다.
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { mergeWebMentions } from "../lib/merge-collected.mjs";
import { fillShorts } from "../lib/shorts-search.mjs";

const root = resolve(fileURLToPath(import.meta.url), "../../..");
const arg = (n, d = null) => { const i = process.argv.indexOf(n); return i > -1 ? process.argv[i + 1] : d; };
const webPath = arg("--web");
const shortsPath = arg("--shorts");
const dataDir = resolve(arg("--data", join(root, "camping-atlas/public/explore/data")));
if (shortsPath && existsSync(shortsPath)) {
  const sh = JSON.parse(readFileSync(shortsPath, "utf8"));
  const t = { camps: 0, fromZero: 0, added: 0 };
  for (const [id, r] of Object.entries(sh.campgrounds ?? {})) {
    if (!r?.shorts?.length) continue;
    const p = join(dataDir, "camps", `${id}.json`);
    if (!existsSync(p)) continue;
    const d = JSON.parse(readFileSync(p, "utf8"));
    const before = d.videos?.length ?? 0;
    const f = fillShorts(d.videos ?? [], r.shorts);
    if (!f.added.length) continue;
    d.videos = f.videos;
    writeFileSync(p, JSON.stringify(d));
    t.camps++; t.added += f.added.length; if (!before) t.fromZero++;
  }
  console.log(`숏츠 병합: ${t.camps}곳(영상 없던 곳 ${t.fromZero}곳) · 숏츠 ${t.added}개`);
  if (process.env.GITHUB_STEP_SUMMARY) writeFileSync(process.env.GITHUB_STEP_SUMMARY, `### 숏츠 화면 반영\n\n- 숏츠가 새로 붙은 캠핑장: ${t.camps}곳\n- 그중 영상이 하나도 없던 곳: ${t.fromZero}곳\n- 붙인 숏츠: ${t.added}개\n`, { flag: "a" });
}
if (!webPath) process.exit(0);
if (!webPath || !existsSync(webPath)) { console.log(`웹 언급 파일이 없어 건너뜁니다: ${webPath}`); process.exit(0); }

const web = JSON.parse(readFileSync(webPath, "utf8"));
const total = { camps: 0, docs: 0, prices: 0, bodies: 0 };
for (const [id, w] of Object.entries(web.campgrounds ?? {})) {
  const p = join(dataDir, "camps", `${id}.json`);
  if (!existsSync(p)) continue;
  const d = JSON.parse(readFileSync(p, "utf8"));
  const a = mergeWebMentions(d, w, web.bodies ?? {});
  if (!a.docs && !a.prices && !a.bodies) continue;
  writeFileSync(p, JSON.stringify(d));
  total.camps++; total.docs += a.docs; total.prices += a.prices; total.bodies += a.bodies;
}
console.log(`웹 언급 병합: ${total.camps}곳 · 새 글 ${total.docs} · 요금 언급 ${total.prices} · 본문 문장 붙임 ${total.bodies}`);
