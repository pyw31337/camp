#!/usr/bin/env node
// 고캠핑 ‘분야별 공공 우수야영장’ 연도별 공개 목록을 받아 registry/gocamping-best.json으로 남긴다(키 불필요, 연 1회면 충분).
// 봇 이름을 밝히고 요청 사이 1.5초 쉰다. 한 해라도 실패하면 직전 파일의 그 해 값을 유지한다.
// 사용: node scripts/sync-best-campgrounds.mjs [--years 2023,2024,2025]
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { BEST_URL, indexBest, parseBestList } from "../lib/best-campgrounds.mjs";
import { BOT_UA } from "../lib/web-mentions.mjs";

const outPath = fileURLToPath(new URL("../registry/gocamping-best.json", import.meta.url));
const arg = process.argv.indexOf("--years");
const thisYear = new Date().getFullYear();
const years = arg > 0 ? process.argv[arg + 1].split(",").map(Number) : Array.from({ length: thisYear - 2022 }, (_, i) => 2023 + i);
const prev = existsSync(outPath) ? JSON.parse(readFileSync(outPath, "utf8")) : { rows: [] };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const rows = [];
const fetched = {};
for (const y of years) {
  try {
    const res = await fetch(BEST_URL(y), { headers: { "user-agent": BOT_UA } });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const got = parseBestList(await res.text(), y);
    if (!got.length) throw new Error("항목 0건(해당 연도 목록 없음 또는 화면 구조 변경)");
    rows.push(...got);
    fetched[y] = got.length;
    console.log(`${y}: ${got.length}건`);
  } catch (e) {
    const keep = (prev.rows ?? []).filter((r) => r.year === y);
    rows.push(...keep);
    // 올해 목록은 보통 하반기에 올라온다. 올해 0건은 경고가 아니라 안내로만 남긴다.
    console.log(`::${y >= thisYear ? "notice" : "warning"} title=우수야영장 ${y}::${e.message} — 직전 값 ${keep.length}건 유지`);
  }
  await sleep(1500);
}
const out = {
  generated_at: new Date().toISOString(),
  source: { name: "한국관광공사 고캠핑 분야별 공공 우수야영장(문화체육관광부·한국관광공사 선정)", url: "https://gocamping.or.kr/camp/best/list.do", tier: "A", terms: "고캠핑 공개 목록(robots.txt 허용). 선정 분야·한 줄 소개만 보관" },
  fetched,
  rows,
  by_campground: indexBest(rows),
};
writeFileSync(outPath, `${JSON.stringify(out, null, 1)}\n`);
console.log(`우수야영장 ${rows.length}건 · 캠핑장 ${Object.keys(out.by_campground).length}곳 → registry/gocamping-best.json`);
