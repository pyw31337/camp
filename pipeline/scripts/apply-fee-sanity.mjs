#!/usr/bin/env node
// t41u-1: 발행 카탈로그(campgrounds.json·lite·catx 샤드)의 1박 요금에 상식 하한을 적용한다.
// 원본 값은 fee.fee_raw에 남기고(삭제 없음), 공식 재확인(fee-recheck.json) → 같은 출처 유효 범위 → 다른 후기 출처 → 숨김 순.
// 덮어쓴 건 merge-review.ndjson에 남긴다. 멱등(이미 fee_raw가 있으면 건너뜀).
import { readFileSync, writeFileSync, readdirSync, appendFileSync, existsSync } from "node:fs";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { sanitizeFee, plausibleFee, rangeText } from "../lib/fee-sanity.mjs";

export function applyFeeSanity(dataDir, { recheck = {}, log = null, now = new Date().toISOString() } = {}) {
  const altOf = (id) => {
    const p = join(dataDir, "camps", `${id}.json`);
    if (!existsSync(p)) return [];
    try { return JSON.parse(readFileSync(p, "utf8")).prices ?? []; } catch { return []; }
  };
  const decided = new Map();
  const decide = (c) => {
    const id = String(c.id);
    if (decided.has(id)) return decided.get(id);
    let out = null;
    if (c.fee && !c.fee.fee_raw) {
      const r = recheck[id];
      const off = (r?.status === "ok" ? r.fees : []).filter((x) => plausibleFee(c, x.won));
      if (off.length && sanitizeFee(c).changed) {
        const ws = off.map((x) => x.won).sort((a, b) => a - b);
        const raw = { ...c.fee }; delete raw.tiers;
        out = { fee: { min: ws[0], max: ws.at(-1), text: rangeText(ws[0], ws.at(-1)), basis: "업장 공식 홈페이지 재확인", grade: "OFFICIAL", url: off[0].url, checked_at: r.checked_at, fee_raw: raw, sanity: "official_recheck" }, reason: "공식 홈페이지 재확인으로 덮어씀" };
      } else {
        const s = sanitizeFee(c, altOf(id));
        if (s.changed) out = s;
      }
    }
    decided.set(id, out);
    if (out && log) log({ at: now, id, name: c.name, field: "fee", from: c.fee, to: out.fee, why: out.reason, policy: "t41u-1 fee floor" });
    return out;
  };
  const fix = (c) => {
    const d = decide(c);
    if (!d) return false;
    if (c.fee) c.fee = d.fee;
    if (c.pf?.p) {
      if (d.fee.hidden) { c.pf.p_raw = c.pf.p; delete c.pf.p; }
      else { c.pf.p_raw = c.pf.p; c.pf.p = { ...c.pf.p, v: d.fee.text, min: d.fee.min, max: d.fee.max }; }
    }
    return true;
  };
  let n = 0;
  const main = join(dataDir, "campgrounds.json");
  const all = JSON.parse(readFileSync(main, "utf8"));
  for (const c of all) if (fix(c)) n++;
  writeFileSync(main, JSON.stringify(all));
  const lp = join(dataDir, "campgrounds.lite.json");
  if (existsSync(lp)) { const l = JSON.parse(readFileSync(lp, "utf8")); for (const c of l.camps ?? l) fix(c); writeFileSync(lp, JSON.stringify(l)); }
  const cx = join(dataDir, "catx");
  if (existsSync(cx)) for (const f of readdirSync(cx).filter((x) => x.endsWith(".json"))) {
    const s = JSON.parse(readFileSync(join(cx, f), "utf8")); let ch = false;
    for (const [id, c] of Object.entries(s)) if (decided.get(id)) { c.id ??= id; const base = all.find((x) => String(x.id) === id); if (c.fee) c.fee = base.fee; if (c.pf?.p || base.pf) { c.pf = base.pf ?? c.pf; } ch = true; }
    if (ch) writeFileSync(join(cx, f), JSON.stringify(s));
  }
  return n;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const root = resolve(fileURLToPath(import.meta.url), "../../..");
  const ai = process.argv.indexOf("--data");
  const dataDir = ai > 0 ? resolve(process.argv[ai + 1]) : join(root, "camping-atlas/public/explore/data");
  const rp = join(root, "pipeline/registry/fee-recheck.json");
  const recheck = existsSync(rp) ? JSON.parse(readFileSync(rp, "utf8")).results : {};
  const logp = join(root, "pipeline/registry/merge-review.ndjson");
  const n = applyFeeSanity(dataDir, { recheck, log: ai > 0 ? null : (e) => appendFileSync(logp, JSON.stringify(e) + "\n") });
  console.log("fee sanity fixed", n);
}
