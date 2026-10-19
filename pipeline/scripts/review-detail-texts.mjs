#!/usr/bin/env node
// 상세 글 점검 결과를 센다(파일은 바꾸지 않는다). 사용: node scripts/review-detail-texts.mjs [상세 폴더] [catalog.json]
// 기본: camping-atlas/public/explore/data/camps · campgrounds.json. 결과: out/text-review.json + 표준 출력 요약.
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { commonOperatorTexts, mergeLogs, nameCoreOf, reviewDetailTexts } from "../lib/detail-text-review.mjs";

const root = fileURLToPath(new URL("../../", import.meta.url));
const dir = process.argv[2] ?? `${root}camping-atlas/public/explore/data/camps/`;
const catPath = process.argv[3] ?? `${root}camping-atlas/public/explore/data/campgrounds.json`;
const cat = JSON.parse(readFileSync(catPath, "utf8"));
const camps = Array.isArray(cat) ? cat : cat.camps ?? cat.records ?? [];
const byId = new Map(camps.map((c) => [String(c.id), c]));
const coresBy = new Map();
for (const c of camps) { const k = `${c.sido} ${c.sigungu}`; (coresBy.get(k) ?? coresBy.set(k, []).get(k)).push(nameCoreOf(c.name, c.sigungu)); }
const regions = new Set(camps.map((c) => String(c.sigungu ?? "").split(/\s+/)[0].replace(/(시|군|구)$/, "")).filter((x) => x.length >= 2));
// 예전 화면 분류(첫 번째로 맞는 정규식) — 새 분류(낱말 수 점수)와 다르면 ‘옮김’으로 센다.
const OLD = [["입·퇴실", /입실|퇴실|얼리.?체크/], ["요금 · 환불", /요금|할인|환불|취소|수수료|\d+원/], ["주차", /주차|차량|견인|차박/], ["전기", /전기|리드선|차단/], ["불멍 · 화로", /화로|장작|숯|불씨|화재/], ["반려동물", /반려동물|반려견|마리/], ["시설", /온수|화장실|휴게실|산책로|편의시설/], ["이용 규칙", /쓰레기|분리수거|외부인|준수|강제퇴장|입장/], ["사이트 이용", /일반.?사이트|오토.?캠핑|캠핑카|카라반|텐트/]];
const oldCat = (t) => OLD.find(([, re]) => re.test(t))?.[0] ?? "운영 안내";
const logs = [], samples = {};
const files = readdirSync(dir).filter((x) => x.endsWith(".json")).map((f) => [f.replace(/\.json$/, ""), f]).filter(([id]) => byId.has(id)).map(([id, f]) => ({ id, c: byId.get(id), d: JSON.parse(readFileSync(`${dir}${f}`, "utf8")) }));
const commonList = commonOperatorTexts(files.map(({ c, d }) => ({ sido: c.sido, d })));
const common = new Set(commonList);
// 화면도 같은 공통 문구 목록을 쓴다(public/context/text-common.json).
writeFileSync(`${root}camping-atlas/public/context/text-common.json`, `${JSON.stringify(commonList)}\n`);
for (const { id, c, d } of files) {
  const { d: nd, log } = reviewDetailTexts(d, c, { others: coresBy.get(`${c.sido} ${c.sigungu}`) ?? [], regions, common });
  for (const x of nd.operator_snippets ?? []) if (oldCat(x.orig ?? x.text) !== x.cat) log.moved[`운영자 안내: ${oldCat(x.orig ?? x.text)} → ${x.cat}`] = (log.moved[`운영자 안내: ${oldCat(x.orig ?? x.text)} → ${x.cat}`] ?? 0) + 1;
  logs.push(log);
  for (const k of Object.keys(log.removed)) (samples[k] ??= []).length < 3 && samples[k].push(id);
}
const all = mergeLogs(logs);
const total = Object.values(all.removed).reduce((a, b) => a + b, 0);
const outDir = `${root}pipeline/out`;
if (!existsSync(outDir)) mkdirSync(outDir, { recursive: true });
writeFileSync(`${outDir}/text-review.json`, JSON.stringify({ generated_at: new Date().toISOString(), camps: logs.length, removed_total: total, ...all, samples }, null, 1));
console.log(`상세 글 점검: ${logs.length}곳 · 뺀 글 ${total}건 · 남긴 운영 안내 ${all.kept}건 · 표기 다듬음 ${all.normalized}건 · 바뀐 곳 ${all.camps_changed}곳`);
for (const [k, n] of Object.entries(all.removed).sort((a, b) => b[1] - a[1])) console.log(`  ${String(n).padStart(6)}  ${k}`);
const moved = Object.values(all.moved).reduce((a, b) => a + b, 0);
console.log(`옮긴 글(운영 안내 항목 재분류) ${moved}건 — 많은 순 10개:`);
for (const [k, n] of Object.entries(all.moved).sort((a, b) => b[1] - a[1]).slice(0, 10)) console.log(`  ${String(n).padStart(6)}  ${k}`);
