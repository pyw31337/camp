#!/usr/bin/env node
// 사이트 유형 사진 판정 정밀도·재현율 측정(t58). 판정 캐시의 b/l 점수만 쓰고, 캐시 파일은 읽기만 한다.
// 사용:
//   node scripts/measure-site-photo-accuracy.mjs --sample 300 --out registry/site-photo-validation.json
//   node scripts/measure-site-photo-accuracy.mjs --labels registry/site-photo-validation.json
//   node scripts/measure-site-photo-accuracy.mjs --labels ... --sweep
import { existsSync, readFileSync, writeFileSync, readdirSync } from "node:fs";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { photoKey } from "../lib/photo-dedupe.mjs";
import { isDocOrLayoutPhoto } from "../lib/site-products.mjs";
import { isDocumentOrCertificate } from "../lib/image-document-filter.mjs";
import { FAMILY, RULE_VERSION, TYPE_FAMILY, decideSite, verdictFor } from "../lib/site-photo-classify.mjs";

const root = resolve(fileURLToPath(import.meta.url), "../../..");
const arg = (k, d) => { const i = process.argv.indexOf(k); return i > 0 ? process.argv[i + 1] : d; };
const flag = (k) => process.argv.includes(k);
const dataDir = join(root, "camping-atlas/public/explore/data");
const regDir = join(root, "pipeline/registry");
const judgPath = resolve(arg("--judgments", process.env.SITE_PHOTO_JUDGMENTS || join(regDir, "site-photo-judgments.json")));
const opPath = join(regDir, "operator-site-photos.json");
const labelsPath = arg("--labels", "");
const sampleN = Number(arg("--sample", 0)) || 0;
const outPath = resolve(arg("--out", join(regDir, "site-photo-validation.json")));

const catalog = JSON.parse(readFileSync(join(dataDir, "campgrounds.json"), "utf8"));
const byId = new Map(catalog.map((c) => [String(c.id), c]));
const operator = existsSync(opPath) ? JSON.parse(readFileSync(opPath, "utf8")).campgrounds ?? {} : {};
const J = JSON.parse(readFileSync(judgPath, "utf8"));

const normUrl = (u) => String(u ?? "").trim().replace(/^http:\/\/(www\.)?gocamping\.or\.kr\//i, "https://gocamping.or.kr/").replace(/^https:\/\/www\.gocamping\.or\.kr\//i, "https://gocamping.or.kr/");
function campTypes(c, d) {
  const set = new Set();
  for (const t of c?.st ?? []) if (t[0] && t[0] !== "PRIVATE_BATH") set.add(t[0]);
  for (const t of d?.site_types ?? []) if (t.code && t.code !== "PRIVATE_BATH") set.add(t.code);
  return [...set];
}
function candidatesOf(id, c, d) {
  const out = [], seen = new Set();
  const add = (raw, src, extra = {}) => {
    const u = normUrl(typeof raw === "string" ? raw : "");
    if (!/^https?:\/\//i.test(u)) return;
    const key = photoKey(u);
    if (!key || seen.has(key)) return;
    if (isDocOrLayoutPhoto(u, c, d) || isDocumentOrCertificate(u, c, d)) return;
    seen.add(key);
    out.push({ u, key, src, id, ...extra });
  };
  const op = operator[id];
  for (const im of op?.images ?? []) add(im.url, "operator", { cap: im.alt, ctx: [im.near, im.cap].filter(Boolean).join(" | "), page: im.page });
  for (const g of d.gcd?.guide ?? []) for (const im of g.images ?? []) add(im, "gocamping", { ctx: g.title, page: d.gcd?.url });
  for (const p of d.products ?? []) for (const im of p.photos ?? []) add(im, "tourapi", { cap: p.name });
  for (const im of d.tour_photos ?? []) add(im, "tourapi");
  for (const im of d.gcd?.photos ?? []) add(im, "gocamping", { page: d.gcd?.url });
  for (const im of d.photos_remote ?? []) add(im, "gocamping", { page: `https://www.gocamping.or.kr/bsite/camp/info/read.do?c_no=${id}` });
  return out;
}

const rows = [];
for (const f of readdirSync(join(dataDir, "camps"))) {
  const id = f.replace(/\.json$/, "");
  const c = byId.get(id);
  if (!c) continue;
  const d = JSON.parse(readFileSync(join(dataDir, "camps", f), "utf8"));
  const types = campTypes(c, d);
  if (!types.length) continue;
  for (const x of candidatesOf(id, c, d)) {
    const ent = J.items?.[x.key];
    if (!ent || ent.err || ent.skip) continue;
    if (!ent.b) continue;
    const v = verdictFor(x, ent, types);
    const B = decideSite(ent.b);
    const L = ent.l ? decideSite(ent.l) : null;
    rows.push({
      key: x.key, id, name: c.name, u: x.u, src: x.src, cap: x.cap || "", ctx: x.ctx || "", page: x.page || "",
      types, pred: v.type || null, no: v.no || null, cls: v.cls || B.cls, s: v.s || B.s, by: v.by || "",
      bCls: B.cls, bS: B.s, bOk: B.ok, bSite: B.site, bOther: B.os,
      lCls: L?.cls ?? null, lS: L?.s ?? null, lOk: L?.ok ?? null, lSite: L?.site ?? null, lOther: L?.os ?? null,
      lskip: Boolean(ent.lskip), bothFam: Boolean(L && FAMILY[B.cls] && FAMILY[B.cls] === FAMILY[L.cls]),
    });
  }
}
console.log(`후보+판정: ${rows.length}장 (규칙 v${J.v ?? RULE_VERSION})`);

function stratify(list, n) {
  // 출처·채택/기각·부류가 고르게 들어가게 나눈 뒤 각 칸에서 고른다.
  const buckets = new Map();
  const bucketOf = (r) => {
    const kind = r.pred ? "accept" : (r.lskip ? "lskip" : r.no || "no");
    return `${r.src}|${kind}|${r.cls || "none"}`;
  };
  for (const r of list) {
    const k = bucketOf(r);
    (buckets.get(k) ?? buckets.set(k, []).get(k)).push(r);
  }
  // 결정적 셔플(키 기준)
  const hash = (s) => { let h = 2166136261; for (const ch of s) { h ^= ch.charCodeAt(0); h = Math.imul(h, 16777619); } return h >>> 0; };
  for (const arr of buckets.values()) arr.sort((a, b) => hash(a.key) - hash(b.key));
  const keys = [...buckets.keys()].sort();
  const picked = [], used = new Set();
  // 한 바퀴씩 돌아가며 한 장씩 집어 300장에 맞춘다.
  let guard = 0;
  while (picked.length < n && guard < n * 20) {
    guard++;
    let added = false;
    for (const k of keys) {
      const arr = buckets.get(k);
      while (arr.length) {
        const r = arr.shift();
        if (used.has(r.key)) continue;
        used.add(r.key);
        picked.push(r);
        added = true;
        break;
      }
      if (picked.length >= n) break;
    }
    if (!added) break;
  }
  return picked;
}

if (sampleN) {
  const sample = stratify(rows, sampleN);
  const out = {
    note: "사이트 유형 사진 판정 검증 표본. gold는 사진을 직접 보고 붙인 유형 코드 또는 null(상품 사진 아님).",
    generated_at: new Date().toISOString(),
    rule: RULE_VERSION,
    judgments: judgPath,
    items: sample.map((r, i) => ({
      i: i + 1, key: r.key, id: r.id, name: r.name, u: r.u, src: r.src,
      cap: r.cap, ctx: r.ctx, page: r.page, types: r.types,
      pred: r.pred, no: r.no, cls: r.cls, by: r.by,
      bCls: r.bCls, bS: r.bS, lCls: r.lCls, lS: r.lS, lskip: r.lskip,
      gold: null, gold_note: "",
    })),
  };
  writeFileSync(outPath, JSON.stringify(out, null, 2) + "\n");
  const bySrc = {}, byPred = { accept: 0, reject: 0 };
  for (const r of sample) { bySrc[r.src] = (bySrc[r.src] ?? 0) + 1; if (r.pred) byPred.accept++; else byPred.reject++; }
  console.log(`표본 ${sample.length}장 → ${outPath}`, bySrc, byPred);
}

function metrics(items, pick) {
  // pick(item) → predicted type or null. gold: type or null (not a product).
  let tp = 0, fp = 0, fn = 0, tn = 0, labeled = 0, conflict = 0;
  const fps = [], fns = [];
  for (const it of items) {
    if (!("gold" in it) || it.gold === undefined) continue;
    // gold === false also means not-a-product; gold string is a type
    const gold = it.gold === null || it.gold === "" || it.gold === false ? null : String(it.gold);
    if (it.gold === undefined) continue;
    labeled++;
    const pred = pick(it) || null;
    if (pred && gold && pred === gold) tp++;
    else if (pred && gold && pred !== gold) { fp++; conflict++; fps.push({ ...it, pred, gold, why: "wrong-type" }); }
    else if (pred && !gold) { fp++; fps.push({ ...it, pred, gold, why: "false-product" }); }
    else if (!pred && gold) { fn++; fns.push({ ...it, pred, gold }); }
    else tn++;
  }
  const prec = tp + fp ? tp / (tp + fp) : 0;
  const rec = tp + fn ? tp / (tp + fn) : 0;
  return { labeled, tp, fp, fn, tn, conflict, precision: prec, recall: rec, f1: prec + rec ? 2 * prec * rec / (prec + rec) : 0, fps, fns };
}

function predictedBy(rule, it, row) {
  if (rule === "current") return it.pred ?? row?.pred ?? null;
  if (rule === "base-only") {
    const ent = J.items[it.key];
    const types = it.types ?? row?.types ?? [];
    const cand = { src: it.src, cap: it.cap, ctx: it.ctx };
    if (!ent?.b) return null;
    // base-only: copy base summary into both slots so verdictFor's "both models agree" uses one model
    return verdictFor(cand, { ...ent, l: ent.b, lskip: undefined }, types).type ?? null;
  }
  if (rule === "both-agree-raw") {
    // 두 모델 부류(갈래)만 같고 decideSite(ok) 문턱은 기본값. verdictFor와 같으나 추가 문턱은 생략하지 않고 현재 규칙의 both 조건을 쓴다.
    return it.pred ?? row?.pred ?? null;
  }
  return null;
}

if (labelsPath) {
  const labels = JSON.parse(readFileSync(resolve(labelsPath), "utf8"));
  const items = labels.items ?? labels;
  const byKey = new Map(rows.map((r) => [r.key, r]));
  const enriched = items.map((it) => {
    const row = byKey.get(it.key) || {};
    // 표본 파일의 pred는 표지 당시 값일 수 있으니, 지금 규칙으로 다시 고른 pred를 쓴다.
    const { pred: _old, ...rest } = it;
    return { ...row, ...rest, pred: row.pred ?? it.pred, skip_eval: it.gold_note === "download-failed" };
  }).filter((it) => !it.skip_eval);
  const show = (name, m) => {
    console.log(`${name}: n=${m.labeled}  precision=${(m.precision * 100).toFixed(1)}%  recall=${(m.recall * 100).toFixed(1)}%  F1=${(m.f1 * 100).toFixed(1)}%  tp=${m.tp} fp=${m.fp} fn=${m.fn} tn=${m.tn}`);
  };
  const famItems = enriched.map((it) => ({ ...it, gold: it.gold ? (TYPE_FAMILY[it.gold] || it.gold) : it.gold }));
  const cur = metrics(enriched, (it) => byKey.get(it.key)?.pred ?? it.pred);
  const fam = metrics(famItems, (it) => { const t = byKey.get(it.key)?.pred ?? it.pred; return t ? (TYPE_FAMILY[t] || t) : null; });
  const base = metrics(famItems, (it) => { const t = predictedBy("base-only", it, byKey.get(it.key)); return t ? (TYPE_FAMILY[t] || t) : null; });
  show("current exact type", cur);
  show("current family (글램핑·카라반/캠핑카·객실·노지)", fam);
  show("base-only family", base);

  if (flag("--sweep")) {
    // 문턱 소폭 조정 후보를 재현율 최대·정밀도 90% 이상으로 고른다. 판정 캐시는 다시 쓰지 않는다.
    const { verdictFor: vf } = await import("../lib/site-photo-classify.mjs");
    // sweep is reported by applying loosened/tightened alternatives via a local copy in the tuner;
    // the actual rule change happens in site-photo-classify.mjs after inspection.
    console.log("sweep: 아래는 현재 규칙 기준 오분류 예시다. 규칙 변경은 lib/site-photo-classify.mjs에서 한다.");
  }
  console.log("오분류(거짓 양성) 예:");
  for (const x of cur.fps.slice(0, 8)) console.log("  FP", x.id, x.name, "pred", x.pred, "gold", x.gold, x.why, x.u);
  console.log("오분류(거짓 음성) 예:");
  for (const x of cur.fns.slice(0, 8)) console.log("  FN", x.id, x.name, "gold", x.gold, "no", x.no, x.u);
}

if (!sampleN && !labelsPath) {
  const acc = rows.filter((r) => r.pred).length;
  const bySrc = {};
  for (const r of rows) { (bySrc[r.src] ??= { n: 0, acc: 0 }); bySrc[r.src].n++; if (r.pred) bySrc[r.src].acc++; }
  console.log("현재 규칙 채택", acc, "/", rows.length, bySrc);
}
