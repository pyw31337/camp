#!/usr/bin/env node
// 데이터 품질 장부(docs/DATA_QUALITY_PROCESS.md 6단계 ‘환류’). 매일 data-sync 끝에 실행한다. 멱등(같은 날 다시 돌리면 그날 줄만 바꾼다).
// 입력: data/facts/*.ndjson(사실 저장소) + attributes.json + data/quality/decisions.ndjson(검토 판정)
// 출력: data/quality/latest.json   — 속성별 커버리지·평균 신뢰도·확정 비율·확증(독립 원천 2곳↑)·충돌
//       data/quality/ledger.ndjson  — 날짜별 한 줄(추세)
//       data/quality/review-queue.json — 검토 대기열(값이 엇갈리는 곳, 영향 큰 순)
//       data/quality/REPORT.md      — 사람이 읽는 요약(에이전트 게시판에 링크)
//   --check : 어제보다 나빠진 속성(회귀)이 있으면 exit 1 (CI에서 경고로 쓴다)
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { assess, regressions, singleValued, summarize } from "../lib/quality.mjs";

const root = resolve(fileURLToPath(import.meta.url), "../../..");
const factsDir = process.env.FACTS_DIR || join(root, "data/facts");
const qDir = process.env.QUALITY_DIR || join(root, "data/quality");
const CHECK = process.argv.includes("--check");
const today = (process.env.QUALITY_DATE || new Date(Date.now() + 9 * 3600e3).toISOString()).slice(0, 10);
if (!existsSync(factsDir)) { console.log("품질 장부: data/facts 없음 — 건너뜀"); process.exit(0); }
mkdirSync(qDir, { recursive: true });

const readNd = (p) => (existsSync(p) ? readFileSync(p, "utf8").split("\n").filter((l) => l.trim()).map((l) => { try { return JSON.parse(l); } catch { return null; } }).filter(Boolean) : []);
const defs = (() => { const a = JSON.parse(readFileSync(join(factsDir, "attributes.json"), "utf8")); const l = a.attributes ?? a; return Array.isArray(l) ? Object.fromEntries(l.map((x) => [x.code, x])) : l; })();
const camps = readNd(join(factsDir, "campgrounds.ndjson"));
const name = new Map(camps.map((c) => [String(c.cid ?? c.id), c.name]));

// (캠핑장, 속성)별로 묶기
const groups = new Map();
for (const f of readdirSync(factsDir).filter((x) => x.endsWith(".ndjson") && x !== "campgrounds.ndjson")) {
  for (const r of readNd(join(factsDir, f))) {
    if (!r.attr || r.cid == null) continue;
    if (r.scope) continue; // 숙박형·성수기 한정 값은 대표값 경쟁에서 뺀다(lib/fact-refine.mjs)
    const k = `${r.cid}|${r.attr}`;
    (groups.get(k) ?? groups.set(k, []).get(k)).push(r);
  }
}
// 검토 판정: 판정이 난 (캠핑장, 속성)은 대기열에서 뺀다(사실 저장소에는 build-fact-store가 VERIFIED로 넣는다)
const decided = new Set(readNd(join(qDir, "decisions.ndjson")).filter((x) => !x.retract).map((x) => `${x.cid}|${x.attr}`));

const byAttr = {}, conflicts = [];
const now = Date.now();
for (const [k, fs] of groups) {
  const [cid, attr] = k.split("|");
  const a = assess(fs, defs[attr], now);
  if (!a) continue;
  if (decided.has(k) && a.status === "CONFLICT") { a.status = "VERIFIED"; delete a.rival; }
  (byAttr[attr] ??= []).push(a);
  if (a.status === "CONFLICT") {
    const sample = (v) => fs.filter((f) => JSON.stringify(f.value) === JSON.stringify(v)).slice(0, 2).map((f) => ({ grade: f.grade, src: f.src, url: f.url ?? null, at: f.at ?? null, quote: (f.quote ?? f.text ?? "").slice(0, 140) }));
    conflicts.push({ cid, name: name.get(cid) ?? null, attr, label: defs[attr]?.label ?? attr, ui: Boolean(defs[attr]?.filter), top: { value: a.value, confidence: a.confidence, sources: a.sources, evidence: sample(a.value) }, rival: { ...a.rival, evidence: sample(a.rival.value) } });
  }
}
const attrs = summarize(byAttr, camps.length || 1);
const all = Object.values(byAttr).flat();
const totals = {
  campgrounds: camps.length, facts: [...groups.values()].reduce((n, x) => n + x.length, 0), pairs: all.length,
  mean_confidence: Math.round((all.reduce((s, a) => s + a.confidence, 0) / Math.max(1, all.length)) * 1000) / 1000,
  confirmed_pct: Math.round((all.filter((a) => a.status === "VERIFIED" || a.status === "CONFIRMED").length / Math.max(1, all.length)) * 1000) / 10,
  corroborated: all.filter((a) => a.sources >= 2).length, conflicts: conflicts.length, decisions: decided.size,
};

// 어제와 비교(장부의 마지막 다른 날짜)
const ledgerPath = join(qDir, "ledger.ndjson");
const ledger = readNd(ledgerPath).filter((x) => x.date !== today);
const prev = ledger.at(-1);
const regs = prev ? regressions(prev.attrs, attrs) : [];
ledger.push({ date: today, totals, attrs, regressions: regs });
writeFileSync(ledgerPath, ledger.map((x) => JSON.stringify(x)).join("\n") + "\n");
writeFileSync(join(qDir, "latest.json"), `${JSON.stringify({ generated_at: new Date().toISOString(), date: today, totals, attrs, regressions: regs }, null, 1)}\n`);

// 검토 대기열: 화면 필터에 쓰는 속성 먼저, 그다음 경쟁 값 신뢰도가 높은(진짜로 헷갈리는) 순
conflicts.sort((x, y) => Number(y.ui) - Number(x.ui) || y.rival.confidence - x.rival.confidence);
writeFileSync(join(qDir, "review-queue.json"), `${JSON.stringify({ generated_at: new Date().toISOString(), how_to_resolve: "원문을 대조해 data/quality/decisions.ndjson에 {cid, attr, value, url, why, by, at} 한 줄을 덧붙인다(docs/DATA_QUALITY_PROCESS.md 4단계).", count: conflicts.length, items: conflicts.slice(0, 500) }, null, 1)}\n`);

// 사람이 읽는 요약
const d = (k) => (prev ? Math.round((totals[k] - prev.totals[k]) * 1000) / 1000 : null);
const fmtD = (v) => (v == null ? "" : ` (${v >= 0 ? "+" : ""}${v})`);
// 후기 언급(review 묶음)은 원래 MENTION뿐이라 순위에서 뺀다
const worst = Object.entries(attrs).filter(([k, s]) => s.coverage >= 50 && defs[k]?.group !== "review" && !/^REVIEW_/.test(k)).sort((a, b) => a[1].mean_confidence - b[1].mean_confidence).slice(0, 10);
const md = [
  `# 데이터 품질 보고 — ${today}`,
  "",
  "자동 생성(pipeline/scripts/quality-ledger.mjs). 기준·절차는 [docs/DATA_QUALITY_PROCESS.md](../../docs/DATA_QUALITY_PROCESS.md).",
  "",
  `- 사실 ${totals.facts.toLocaleString()}건 · (캠핑장×속성) ${totals.pairs.toLocaleString()}쌍 · 캠핑장 ${totals.campgrounds.toLocaleString()}곳`,
  `- 평균 신뢰도 **${totals.mean_confidence}**${fmtD(d("mean_confidence"))} · 확정 비율 **${totals.confirmed_pct}%**${fmtD(d("confirmed_pct"))}`,
  `- 독립 원천 2곳↑ 확증 ${totals.corroborated.toLocaleString()}쌍${fmtD(d("corroborated"))} · 충돌(검토 대기) **${totals.conflicts}**${fmtD(d("conflicts"))} · 검토 판정 누적 ${totals.decisions}`,
  "",
  regs.length ? `## ⚠ 어제보다 나빠진 속성 ${regs.length}개\n\n${regs.map((r) => `- ${r.attr} ${r.kind}: ${r.from} → ${r.to}`).join("\n")}\n` : "## 회귀 없음\n",
  "## 신뢰도가 낮은 속성(커버리지 50곳↑) — 다음 수집 우선순위",
  "",
  "| 속성 | 커버리지 | 평균 신뢰도 | 확정 % | 충돌 |",
  "|---|---:|---:|---:|---:|",
  ...worst.map(([k, s]) => `| ${defs[k]?.label ?? k} (${k}) | ${s.coverage} | ${s.mean_confidence} | ${s.confirmed_pct} | ${s.conflicts} |`),
  "",
  `## 검토 대기열 상위 ${Math.min(10, conflicts.length)}건 (전체 data/quality/review-queue.json)`,
  "",
  ...conflicts.slice(0, 10).map((c) => `- ${c.name ?? c.cid} · ${c.label}: ${JSON.stringify(c.top.value)}(${c.top.confidence}, ${c.top.sources}곳) vs ${JSON.stringify(c.rival.value)}(${c.rival.confidence}, ${c.rival.sources}곳)`),
  "",
].join("\n");
writeFileSync(join(qDir, "REPORT.md"), md);

console.log(`품질 장부 ${today}: 평균 신뢰도 ${totals.mean_confidence} · 확정 ${totals.confirmed_pct}% · 확증 ${totals.corroborated} · 충돌 ${totals.conflicts} · 회귀 ${regs.length}`);
for (const r of regs) console.log(`::warning title=품질 회귀 ${r.attr}::${r.kind} ${r.from} → ${r.to}`);
if (CHECK && regs.length) process.exit(1);
