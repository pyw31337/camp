#!/usr/bin/env node
// 검토 대기열(data/quality/review-queue.json) 중 “업장 원문 vs 고캠핑 등록값” 충돌을 원문 문장으로 판정한다(docs/DATA_QUALITY_PROCESS.md 4단계).
// 대상: 1위 값의 근거에 운영자 원문(operator_homepage·operator_discovered·booking_engine)이 있고, 경쟁 값에는 운영자 원문이 없는 경우.
// 조건: 원문이 그 캠핑장 전체에 대한 분명한 규칙 문장일 때만(질문·후기·홍보·시설 목록·일부 구역 문장은 사람 판정으로 남긴다).
// 판정은 data/quality/decisions.ndjson에 덧붙인다(by: "Claude(원문 대조·규칙)", url: 업장 원문, why: 원문 인용). --dry 로 미리보기.
import { appendFileSync, existsSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(fileURLToPath(import.meta.url), "../../..");
const qDir = process.env.QUALITY_DIR || join(root, "data/quality");
const DRY = process.argv.includes("--dry");
const OP = /^(operator_homepage|operator_discovered|booking_engine)$/;
const PET_NO = /(반려|애견|애완|동물)[^.?]{0,24}(불가|금지)/;
const PET_YES = /(반려|애견|애완|동물)[^.?]{0,24}가능/;
const NOT_RULE = /\?|있나요|다녀왔|추천|신생|후기|같네요|좋을\s*것|했어요|왔어요|숯그릴|주요\s*시설|레저\s*시설|이벤트|봄\s*꽃/;

export function clearRule(attr, value, quote) {
  const q = String(quote ?? "");
  if (!q || NOT_RULE.test(q)) return false;
  if (attr === "PET_POLICY") return value === "NOT_ALLOWED" ? PET_NO.test(q) : PET_YES.test(q);
  if (attr === "OPERATOR_TYPE") return value === "NATURAL_RECREATION_FOREST" && /자연휴양림/.test(q);
  return false;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const q = JSON.parse(readFileSync(join(qDir, "review-queue.json"), "utf8"));
  const decPath = join(qDir, "decisions.ndjson");
  const done = new Set(existsSync(decPath) ? readFileSync(decPath, "utf8").split("\n").filter(Boolean).map((l) => { try { const x = JSON.parse(l); return `${x.cid}|${x.attr}`; } catch { return ""; } }) : []);
  let n = 0, skipped = 0;
  const at = new Date().toISOString();
  for (const it of q.items ?? []) {
    if (done.has(`${it.cid}|${it.attr}`)) continue;
    const ev = (it.top.evidence ?? []).find((e) => OP.test(e.src) && e.url);
    if (!ev || (it.rival.evidence ?? []).some((e) => OP.test(e.src))) continue;
    if (!clearRule(it.attr, it.top.value, ev.quote)) { skipped++; continue; }
    const rival = (it.rival.evidence ?? []).map((e) => e.src).join("+");
    const row = { cid: String(it.cid), attr: it.attr, value: it.top.value, url: ev.url, why: `업장 원문 “${String(ev.quote).slice(0, 120)}”이 ${rival} 값(${JSON.stringify(it.rival.value)})보다 1차 원천`, by: "Claude(원문 대조·규칙)", at };
    if (DRY) console.log(JSON.stringify(row)); else appendFileSync(decPath, JSON.stringify(row) + "\n");
    n++;
  }
  console.log(`자동 판정 ${n}건${DRY ? "(미리보기)" : ""} · 사람 판정으로 남김 ${skipped}건`);
}
