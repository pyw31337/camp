#!/usr/bin/env node
// 발행 전 필드 단위 손실 검사·복원(docs/DATA_MERGE_POLICY.md). 기준(최신 main) 데이터에 있던 레코드·값이 새 데이터에서
// 사라지거나 비거나 항목 수가 줄었는지 레코드·필드 단위로 본다. coverage-guard(전체 곳 수)를 넓힌 것.
//  --heal  : 줄어든 원천 값을 기준 값으로 되살려(빈 칸 채우기·배열 합치기) 파일에 다시 쓰고 검토 기록에 남긴다 → 발행은 계속.
//  기본    : 손실이 있으면 실패(PR 검사). 정당한 삭제(폐업·중복 합치기·오류 정정)는 pipeline/registry/merge-overrides.json에 이유와 함께.
//  파생 읽기 모델(프로필·후기 요약 등, 원천에서 매번 다시 계산)은 경고만.
// 사용: node pipeline/scripts/field-guard.mjs <기준 루트> <새 루트> [--heal] [--warn-only] [--report out.json]
import { readFileSync, existsSync, readdirSync, writeFileSync, appendFileSync } from "node:fs";
import { join } from "node:path";
import { recordLosses, isEmpty, mergeValue, leafAmounts, trustRank } from "../lib/merge-policy.mjs";

const argv = process.argv.slice(2);
const opt = (k) => (argv.includes(k) ? argv[argv.indexOf(k) + 1] : null);
const pos = argv.filter((a, i) => !a.startsWith("--") && argv[i - 1] !== "--report");
const [baseRoot, nextRoot] = pos;
const HEAL = argv.includes("--heal");
const warnOnly = argv.includes("--warn-only") || process.env.FIELD_GUARD_WARN_ONLY === "1";
const reportPath = opt("--report");
const DATA = "camping-atlas/public/explore/data";
const REVIEW_LOG = join(nextRoot, "pipeline/registry/merge-review.ndjson");
const read = (p) => { try { return JSON.parse(readFileSync(p, "utf8")); } catch { return null; } };
const writeLike = (p, obj) => { // 원래 파일의 줄바꿈 형식을 따른다
  const old = existsSync(p) ? readFileSync(p, "utf8") : "";
  const ind = /^\{\n( +)"/.exec(old)?.[1]?.length;
  writeFileSync(p, ind ? `${JSON.stringify(obj, null, ind)}\n` : JSON.stringify(obj));
};

// 매번 새로 계산되거나 실시간으로 바뀌는 값(예보·인기·빈자리·확인 시각). 줄어도 된다.
const VOLATILE = [
  /(^|\.)(wx|forecast|fc|snow|frost|weather|trend|trending|hot|rank|score|popular|vacancy|avail|availability|live)(\.|$)/i,
  /(^|\.)(dl|img_dup|updated_at|generated_at|fetched_at|checked_at|social_checked_at|web_checked_at|sanity_dropped)$/,
];
// 원천에서 매번 다시 계산하는 읽기 모델 — 규칙이 바뀌면 정당하게 줄 수 있어 경고만(원천 값은 엄격 검사가 지킨다).
const DERIVED = /^(pf|rv|profile|nl|st|line|om|sn|pt|th|soc|nr|ti|win|heat|themes|env|kinds|sizes|floors|seasons|days|fire|toilets|sinks|showers|rental|tq|of|nearby_licensed|operator_snippets|site_types|house_rules|field_conditions)(\.|$)/;
const isVolatile = (f) => VOLATILE.some((re) => re.test(f));

const ov = read(join(nextRoot, "pipeline/registry/merge-overrides.json")) ?? { overrides: [] };
const overrides = (ov.overrides ?? []).filter((o) => String(o.reason ?? "").trim().length >= 4);
// 수집기가 logReview({action:"removed", reason})로 남긴 정당한 삭제(예: 공식 공원으로 바뀐 OSM 중복)도 통과.
try {
  for (const line of readFileSync(REVIEW_LOG, "utf8").split("\n")) {
    if (!line.includes('"removed"')) continue;
    const e = JSON.parse(line); if (e.action === "removed" && String(e.reason ?? "").length >= 4) overrides.push({ file: e.file, id: e.id, field: e.field ?? "*", reason: e.reason });
  }
} catch { /* 기록 없음 */ }
const overridden = (file, id, field) => overrides.some((o) =>
  (!o.file || file.endsWith(o.file)) && (!o.id || String(o.id) === String(id)) &&
  (!o.field || o.field === "*" || field === o.field || field.startsWith(`${o.field}.`)));

const strict = [], warned = [], superseded = [];
// ② 더 최신·더 믿을 만한 출처가 묶음을 통째로 바꾼 경우(예: fee의 grade·checked_at이 더 높음/최근)는 손실이 아니라 교체다.
// 옛 값은 검토 기록(merge-review.ndjson)에 previous로 남겨 되돌릴 수 있게 한다.
const provOf = (o) => (o && typeof o === "object" ? { grade: o.grade, src: o.src, tier: o.tier, at: o.checked_at ?? o.at ?? o.src_at ?? o["확인일"] } : {});
function isSupersede(b, n, field) {
  const t = field.split(".")[0], bo = b?.[t], no = n?.[t];
  const pb = provOf(bo), pn = provOf(no);
  if (!pn.at && !pn.grade) return false;
  const rb = trustRank(pb), rn = trustRank(pn), tb = Date.parse(pb.at ?? "") || 0, tn = Date.parse(pn.at ?? "") || 0;
  return rn > rb || (rn === rb && tn > tb);
}
let cur = { b: null, n: null };
const note = (l) => {
  if (overridden(l.file, l.id, l.field)) return;
  if (DERIVED.test(l.field)) return warned.push(l);
  if (isSupersede(cur.b, cur.n, l.field)) return superseded.push({ ...l, previous: cur.b?.[l.field.split(".")[0]] });
  strict.push(l);
};

function getPath(o, f) { return f.split(".").reduce((x, k) => (x == null ? undefined : x[k]), o); }
function setPath(o, f, v) { const ks = f.split("."); let x = o; for (const k of ks.slice(0, -1)) { if (x[k] == null || typeof x[k] !== "object") x[k] = {}; x = x[k]; } x[ks.at(-1)] = v; }
/**
 * 줄어든 값을 기준 값으로 되살린다. 최상위 묶음(예: fee) 단위로 본다 — 새 묶음의 값 개수가 기준보다 적으면
 * 묶음 전체를 기준 것으로 되돌려(요금 값과 출처가 섞이지 않게), 아니면 빈 잎만 채우거나 배열을 합친다.
 */
function heal(base, next, list) {
  const tops = new Map();
  for (const l of list) { const t = l.field.split(".")[0]; if (!tops.has(t)) tops.set(t, []); tops.get(t).push(l); }
  for (const [t, ls] of tops) {
    const bo = base[t], no = next[t];
    if (ls.some((l) => l.field === t) || leafCount(no) < leafCount(bo)) { next[t] = structuredClone(bo); continue; }
    for (const l of ls) {
      const ov = getPath(base, l.field), nv = getPath(next, l.field);
      setPath(next, l.field, isEmpty(nv) ? structuredClone(ov) : mergeValue(nv, ov, { field: l.field }).value);
    }
  }
}
const leafCount = (o) => Object.values(leafAmounts(o ?? {})).reduce((a, b) => a + (b > 0 ? 1 : 0), 0);
function compareSet(file, baseArr, nextArr, key, onHeal) {
  if (!Array.isArray(baseArr)) return 0;
  const next = new Map();
  for (const x of nextArr ?? []) next.set(String(key(x)), x);
  let healed = 0;
  for (const b of baseArr) {
    const id = String(key(b));
    const n = next.get(id);
    if (!n) {
      const l = { file, id, field: "*", before: 1, after: 0 };
      if (overridden(file, id, "*")) continue;
      strict.push(l);
      if (HEAL) { nextArr.push(structuredClone(b)); next.set(id, nextArr.at(-1)); l.healed = true; healed++; }
      continue;
    }
    const ls = recordLosses(b, n, isVolatile).map((x) => ({ file, id, ...x }));
    cur = { b, n }; const before = strict.length; ls.forEach(note);
    const mine = strict.slice(before);
    if (HEAL && mine.length) { heal(b, n, mine); mine.forEach((l) => (l.healed = true)); healed++; }
  }
  if (HEAL && healed) onHeal?.();
  return healed;
}

// 1) 목록
{
  const p = join(nextRoot, DATA, "campgrounds.json");
  const nextArr = read(p) ?? [];
  compareSet(`${DATA}/campgrounds.json`, read(join(baseRoot, DATA, "campgrounds.json")), nextArr, (x) => x?.id, () => writeLike(p, nextArr));
}
// 2) 상세 camps/{id}.json
const bd = join(baseRoot, DATA, "camps"), nd = join(nextRoot, DATA, "camps");
if (existsSync(bd)) for (const f of readdirSync(bd)) {
  if (!f.endsWith(".json")) continue;
  const b = read(join(bd, f)); if (!b) continue;
  const np = join(nd, f), n = read(np);
  const file = `${DATA}/camps/${f}`, id = f.replace(/\.json$/, "");
  if (!n) {
    if (overridden(file, id, "*")) continue;
    const l = { file, id, field: "*", before: 1, after: 0 }; strict.push(l);
    if (HEAL) { writeFileSync(np, readFileSync(join(bd, f))); l.healed = true; }
    continue;
  }
  const before = strict.length; cur = { b, n };
  recordLosses(b, n, isVolatile).map((x) => ({ file, id, ...x })).forEach(note);
  const mine = strict.slice(before);
  if (HEAL && mine.length) { heal(b, n, mine); mine.forEach((l) => (l.healed = true)); writeLike(np, n); }
}
// 3) 손으로·주기적으로 쌓는 원천(registry)
for (const [f, k, keyFn] of [
  ["dayuse-seed.json", "places", (x) => x?.id ?? x?.name],
  ["manual-camps.json", "places", (x) => x?.id ?? x?.name],
  ["urban-parks.json", "parks", (x) => `${x?.no}|${x?.name}|${x?.addr ?? ""}`],
  ["dayuse-osm.json", "places", (x) => x?.id],
]) {
  const p = `pipeline/registry/${f}`, np = join(nextRoot, p);
  const nobj = read(np); if (!nobj) continue;
  nobj[k] ??= [];
  compareSet(p, read(join(baseRoot, p))?.[k], nobj[k], keyFn, () => writeLike(np, nobj));
}

const summarize = (ls) => { const m = {}; for (const l of ls) m[l.field] = (m[l.field] ?? 0) + 1; return Object.entries(m).sort((a, b) => b[1] - a[1]); };
if (warned.length) console.log(`(참고) 파생 읽기 모델 감소 ${warned.length}건: ${summarize(warned.map((l) => ({ field: l.field.split(".")[0] }))).slice(0, 10).map(([k, v]) => `${k} ${v}`).join(", ")}`);
if (superseded.length) console.log(`(참고) 더 최신·더 믿을 만한 출처로 교체 ${superseded.length}건(옛 값은 검토 기록에 보관)`);
const logAt = new Date().toISOString(), logRun = process.env.GITHUB_RUN_ID ?? "local", logBy = process.env.GITHUB_WORKFLOW ?? "local";
if (HEAL && superseded.length) {
  const seen = new Set();
  appendFileSync(REVIEW_LOG, superseded.slice(0, 500).filter((l) => { const k = `${l.file}|${l.id}|${l.field.split(".")[0]}`; if (seen.has(k)) return false; seen.add(k); return true; })
    .map((l) => JSON.stringify({ at: logAt, by: logBy, run: logRun, action: "superseded", file: l.file, id: l.id, field: l.field.split(".")[0], previous: l.previous })).join("\n") + "\n");
}
if (reportPath) writeFileSync(reportPath, JSON.stringify({ strict: strict.length, warned: warned.length, byField: Object.fromEntries(summarize(strict)), sample: strict.slice(0, 300) }, null, 1));
if (!strict.length) { console.log("필드 손실 없음(기존 값이 지워지거나 줄지 않음)."); process.exit(0); }
console.log(`기존 값 손실 ${strict.length}건 (레코드 ${new Set(strict.map((l) => l.file + l.id)).size}곳)`);
for (const [f, n] of summarize(strict).slice(0, 20)) console.log(`  ${f.padEnd(36)} ${n}`);
for (const l of strict.slice(0, 12)) console.log(`  예: ${l.file.split("/").pop()} #${l.id} ${l.field} ${l.before}→${l.after}`);
if (HEAL) {
  const at = new Date().toISOString(), run = process.env.GITHUB_RUN_ID ?? "local", by = process.env.GITHUB_WORKFLOW ?? "local";
  const cap = (ls) => (ls.length > 500 ? [...ls.slice(0, 500), { file: "*", id: "*", field: `외 ${ls.length - 500}건`, before: 0, after: 0 }] : ls);
  appendFileSync(REVIEW_LOG, cap(strict).map((l) => JSON.stringify({ at, by, run, action: "restored", file: l.file, id: l.id, field: l.field, before: l.before, after: l.after })).join("\n") + "\n");
  console.log(`::warning::기존 값 ${strict.length}건이 줄어들 뻔해서 되살렸습니다(검토 기록: pipeline/registry/merge-review.ndjson).`);
  process.exit(0);
}
const msg = `기존 값을 지우거나 줄이는 변경입니다(${strict.length}건). 의도한 정정이면 pipeline/registry/merge-overrides.json에 file·id·field·reason을 적으세요. docs/DATA_MERGE_POLICY.md`;
console.log(`${warnOnly ? "::warning::" : "::error::"}${msg}`);
process.exit(warnOnly ? 0 : 1);
