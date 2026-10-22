#!/usr/bin/env node
// t41u-2: 배포 산출물(dist)의 카탈로그·상세에 값 상식 검사(lib/value-sanity.mjs)를 적용한다. 원본 저장소 데이터는 그대로.
//   node pipeline/scripts/apply-value-sanity.mjs --data <explore/data>   → 적용(배포 단계)
//   node pipeline/scripts/apply-value-sanity.mjs --check                  → 임시 사본에 적용해 항목별 결과 출력, 두 번째 적용이 0건(멱등)인지·
//                                                                            남은 위반이 없는지 검사(CI). --report out.json
import { readFileSync, writeFileSync, readdirSync, existsSync, mkdtempSync, cpSync } from "node:fs";
import { join, resolve } from "node:path";
import { tmpdir } from "node:os";
import { fileURLToPath } from "node:url";
import { sanitizeCampValues, sanitizeDetailValues } from "../lib/value-sanity.mjs";

export function applyValueSanity(dataDir) {
  const byField = {}, ex = {};
  const rep = (id) => (field, why) => { byField[field] = (byField[field] ?? 0) + 1; (ex[field] ??= []).length < 5 && ex[field].push(`${id} ${why}`); };
  const cp = join(dataDir, "campgrounds.json"), cat = JSON.parse(readFileSync(cp, "utf8")), byId = new Map();
  for (const c of cat) { sanitizeCampValues(c, rep(c.id)); byId.set(String(c.id), c); }
  writeFileSync(cp, JSON.stringify(cat));
  const lp = join(dataDir, "campgrounds.lite.json");
  if (existsSync(lp)) { const l = JSON.parse(readFileSync(lp, "utf8")); for (const c of l.camps ?? l) sanitizeCampValues(c); writeFileSync(lp, JSON.stringify(l)); }
  const dd = join(dataDir, "camps");
  if (existsSync(dd)) for (const f of readdirSync(dd)) {
    if (!f.endsWith(".json")) continue;
    const p = join(dd, f); let d; try { d = JSON.parse(readFileSync(p, "utf8")); } catch { continue; }
    const before = Object.keys(d._hid ?? {}).length;
    sanitizeDetailValues(d, byId.get(f.slice(0, -5)), rep(f.slice(0, -5)));
    if (Object.keys(d._hid ?? {}).length !== before) writeFileSync(p, JSON.stringify(d));
  }
  return { byField, ex, total: Object.values(byField).reduce((a, b) => a + b, 0) };
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const root = resolve(fileURLToPath(import.meta.url), "../../..");
  const ai = process.argv.indexOf("--data"), ri = process.argv.indexOf("--report");
  let dir = ai > 0 ? resolve(process.argv[ai + 1]) : join(root, "camping-atlas/public/explore/data");
  const check = process.argv.includes("--check");
  if (check) { const t = mkdtempSync(join(tmpdir(), "vs-")); cpSync(join(dir, "campgrounds.json"), join(t, "campgrounds.json")); cpSync(join(dir, "camps"), join(t, "camps"), { recursive: true }); dir = t; }
  const r = applyValueSanity(dir);
  console.log(`값 상식 검사: 숨김 ${r.total}건`);
  for (const [k, n] of Object.entries(r.byField).sort((a, b) => b[1] - a[1])) console.log(`  ${k.padEnd(22)} ${n}  예) ${r.ex[k].slice(0, 2).join(" / ")}`);
  if (ri > 0) writeFileSync(process.argv[ri + 1], JSON.stringify(r, null, 1));
  if (check) {
    const again = applyValueSanity(dir);
    if (again.total) { console.log(`::error::두 번째 적용에서도 ${again.total}건 — 규칙이 멱등이 아니거나 남은 위반이 있음`); process.exit(1); }
    console.log("멱등·남은 위반 없음 ✓");
    const bi = process.argv.indexOf("--baseline");
    if (bi > 0) {
      const base = JSON.parse(readFileSync(resolve(process.argv[bi + 1]), "utf8")).byField ?? {};
      // 작은 항목은 몇 건만 늘어도 20%를 넘는다(2026-10-23 매너타임 8→11로 매일 데이터 발행이 막힘). 기준 + 5건까지는 허용한다.
      // 숨긴 값은 배포 때 어차피 숨겨지므로 이 검사는 수집 원천 회귀 경보다.
      const over = Object.entries(r.byField).filter(([k, n]) => n > Math.max(10, Math.ceil((base[k] ?? 0) * 1.2), (base[k] ?? 0) + 5));
      if (over.length) { console.log(`::error::상식 밖 값이 기준보다 크게 늘었습니다: ${over.map(([k, n]) => `${k} ${base[k] ?? 0}→${n}`).join(", ")} — 수집 원천을 확인하거나 의도한 변화면 기준 파일을 갱신하세요.`); process.exit(1); }
      console.log("기준 대비 급증 없음 ✓");
    }
  }
}
