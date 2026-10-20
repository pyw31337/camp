#!/usr/bin/env node
// 공개 운영자 정보 보강 대상의 우선순위를 만든다.
// 수집은 하지 않는다. crawl-operator-sites.mjs에 넘길 ID만 만들며,
// 실제 수집기는 운영자 자체 호스트·robots.txt·1초 이상 간격 규칙을 다시 적용한다.
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { isClosedHost, isOperatorHost } from "../lib/operator-site.mjs";

const root = resolve(fileURLToPath(import.meta.url), "../../..");
const dataDir = join(root, "camping-atlas/public/explore/data");
const camps = JSON.parse(readFileSync(join(dataDir, "campgrounds.json"), "utf8"));
const registryPath = join(root, "pipeline/registry/operator-site-snippets.json");
const registry = existsSync(registryPath) ? JSON.parse(readFileSync(registryPath, "utf8")).campgrounds ?? {} : {};
const arg = (key, fallback) => { const i = process.argv.indexOf(key); return i >= 0 ? process.argv[i + 1] ?? fallback : fallback; };
const limit = Math.max(1, Number(arg("--limit", "20")) || 20);
const outPath = resolve(arg("--out", join(root, "pipeline/out/operator-gap-priority.json")));

const hasOperatorStart = (c) => {
  const urls = [c.homepage, c.booking?.url, ...(c.booking?.channels ?? []).map((x) => x?.url)].filter(Boolean);
  return urls.some((u) => isOperatorHost(u) && !isClosedHost(u));
};
const detail = (id) => {
  const p = join(dataDir, "camps", `${id}.json`);
  try { return existsSync(p) ? JSON.parse(readFileSync(p, "utf8")) : {}; } catch { return {}; }
};
const ageDays = (iso) => iso ? Math.max(0, (Date.now() - Date.parse(iso)) / 864e5) : Infinity;
const fields = (c, d) => {
  const fc = c.field_conditions ?? d.field_conditions ?? {};
  const f = [];
  if (!(c.fee?.min > 0) && !(d.profile?.fields?.PRICE?.value)) f.push("1박 요금");
  if (!fc.power?.limit_w && !d.profile?.fields?.POWER_W?.value) f.push("전기 제한");
  if (!fc.site_size?.groups?.length && !(c.sizes ?? []).length) f.push("사이트 규격");
  if (!fc.ground?.types?.length && !(c.floors ?? []).length) f.push("바닥재");
  if (!d.profile?.fields?.CHECKIN?.value || !d.profile?.fields?.CHECKOUT?.value) f.push("입·퇴실");
  if (!d.profile?.fields?.MANNER?.value) f.push("매너타임");
  if (!(d.operator_snippets ?? []).some((x) => /금지|불가|제한|수칙|규칙|환불|취소|소음|분리수거/.test(x?.text ?? x))) f.push("이용 제한·수칙");
  return f;
};

const rows = camps
  .filter((c) => c.status !== "폐업" && hasOperatorStart(c))
  .map((c) => {
    const d = detail(c.id), prior = registry[c.id], missing = fields(c, d);
    const stale = ageDays(prior?.checked_at);
    const noOfficialText = !prior?.snippets?.length;
    // 규칙·요금처럼 예약 결정에 직접 영향을 주는 누락을 크게, 오래 확인하지 않은 곳을 다음으로 둔다.
    const score = missing.length * 10 + (missing.includes("이용 제한·수칙") ? 12 : 0) + (missing.includes("1박 요금") ? 8 : 0) + (noOfficialText ? 6 : 0) + Math.min(8, Math.floor(stale / 30));
    return { id: String(c.id), name: c.name, region: [c.sido, c.sigungu].filter(Boolean).join(" "), homepage: c.homepage ?? null, score, missing, last_checked_at: prior?.checked_at ?? null, prior_status: prior?.status ?? "NOT_CRAWLED" };
  })
  .filter((x) => x.missing.length)
  .sort((a, b) => b.score - a.score || String(a.last_checked_at ?? "").localeCompare(String(b.last_checked_at ?? "")) || a.name.localeCompare(b.name, "ko"));

const out = {
  generated_at: new Date().toISOString(),
  policy: "대상 선정만 수행. 실제 수집은 운영자 자체 공개 호스트·robots.txt 허용 경로·원문 URL/확인 시각 조건에서만 진행.",
  total_candidates: rows.length,
  selected: rows.slice(0, limit),
};
writeFileSync(outPath, `${JSON.stringify(out, null, 2)}\n`);
console.log(`운영자 정보 보강 우선순위 ${out.selected.length}/${out.total_candidates}곳 → ${outPath}`);
for (const x of out.selected) console.log(`${x.id}\t${x.score}\t${x.name}\t${x.missing.join(" · ")}`);
