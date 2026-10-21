#!/usr/bin/env node
// t41u: 수기·공식 확인으로 확정한 값(registry/curated-pins.json)을 재계산 뒤에 다시 얹는다. 멱등.
// 확정 값이 출력물에만 있으면 증분 발행·data-sync의 재계산이 후기 값으로 덮어쓴다(화성에코팜 102229 회귀) → 원천을 registry에 둔다.
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const setPath = (o, f, v) => { const ks = f.split("."); let x = o; for (const k of ks.slice(0, -1)) { if (x[k] == null || typeof x[k] !== "object") x[k] = {}; x = x[k]; } x[ks.at(-1)] = v; };
const getPath = (o, f) => f.split(".").reduce((x, k) => (x == null ? undefined : x[k]), o);
export function applyPins(root) {
  const pins = JSON.parse(readFileSync(join(root, "pipeline/registry/curated-pins.json"), "utf8")).camps ?? {};
  const data = join(root, "camping-atlas/public/explore/data");
  const cp = join(data, "campgrounds.json"), cat = JSON.parse(readFileSync(cp, "utf8"));
  let n = 0, catCh = false;
  for (const [id, p] of Object.entries(pins)) {
    const c = cat.find((x) => String(x.id) === id);
    if (c) for (const [f, v] of Object.entries(p.catalog ?? {})) if (JSON.stringify(getPath(c, f)) !== JSON.stringify(v)) { setPath(c, f, structuredClone(v)); n++; catCh = true; }
    // 카드 요약(pf.p)도 확정 요금과 맞춘다
    if (c && p.catalog?.fee && c.pf?.p && c.pf.p.g !== p.catalog.fee.grade) { c.pf.p = { ...c.pf.p, v: `${p.catalog.fee.min / 10000}만~${p.catalog.fee.max / 10000}만원`, min: p.catalog.fee.min, max: p.catalog.fee.max, g: p.catalog.fee.grade, l: p.catalog.fee.basis, u: p.catalog.fee.url, a: p.catalog.fee.checked_at }; n++; catCh = true; }
    const dp = join(data, "camps", `${id}.json`);
    if (p.detail && existsSync(dp)) {
      const raw = readFileSync(dp, "utf8"), d = JSON.parse(raw); let ch = false;
      for (const [f, v] of Object.entries(p.detail)) if (JSON.stringify(getPath(d, f)) !== JSON.stringify(v)) { setPath(d, f, structuredClone(v)); n++; ch = true; }
      if (ch) writeFileSync(dp, JSON.stringify(d) + (raw.endsWith("\n") ? "\n" : ""));
    }
  }
  if (catCh) writeFileSync(cp, JSON.stringify(cat));
  return n;
}
if (process.argv[1] === fileURLToPath(import.meta.url)) console.log("pins applied", applyPins(resolve(fileURLToPath(import.meta.url), "../../..")));
