#!/usr/bin/env node
// 운영자 홈페이지 문장(registry/operator-site-snippets.json)에서 배지용 사실을 꺼내 공개 카탈로그에 붙인다.
// campgrounds.json의 각 캠핑장에 of = { w, pk, fire, cc }를 쓴다. 값마다 v(값)·q(원문 문장)·u(원문 URL)·t(확인 시각).
// 등급은 화면에서 OPERATOR(운영자 공개 문장, 자동 추출)로 보인다. 사람이 대조한 VERIFIED와 섞지 않는다.
// data-sync가 survey-all-campgrounds.mjs 뒤에 실행한다(카탈로그를 새로 만들면 of가 사라지므로).
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { extractSiteFacts } from "../lib/operator-site.mjs";

const root = resolve(fileURLToPath(import.meta.url), "../../..");
const dataDir = join(root, "camping-atlas/public/explore/data");
const snippetsPath = join(root, "pipeline/registry/operator-site-snippets.json");
if (!existsSync(snippetsPath)) { console.log("운영자 홈페이지 문장이 없어 건너뜁니다."); process.exit(0); }
const sites = JSON.parse(readFileSync(snippetsPath, "utf8")).campgrounds ?? {};
const campsPath = join(dataDir, "campgrounds.json");
const camps = JSON.parse(readFileSync(campsPath, "utf8"));
const maxAgeDays = Number(process.env.OPERATOR_FACT_MAX_AGE_DAYS ?? 120);

const KEY = { POWER_W: "w", PARKING: "pk", FIRE: "fire", CAR_CAMPING: "cc" };
// 시·군 통합 예약 사이트처럼 한 홈페이지를 여러 캠핑장이 함께 쓰면 문장이 어느 시설 것인지 알 수 없다.
// 이런 곳은 배지 사실을 만들지 않는다(이용 정보 스펙은 원문 링크와 함께 보이므로 그대로 둔다).
const hostOf = (u) => { try { return new URL(/^[a-z]+:\/\//i.test(u) ? u : `http://${u}`).hostname.replace(/^www\./, ""); } catch { return null; } };
const hostCount = new Map();
for (const c of camps) { const h = c.homepage && hostOf(c.homepage); if (h) hostCount.set(h, (hostCount.get(h) ?? 0) + 1); }
const count = { campgrounds: 0, w: 0, pk: 0, fire: 0, cc: 0, conflicts: 0, stale: 0, shared_host: 0 };
for (const c of camps) {
  delete c.of;
  const site = sites[c.id];
  if (site?.status !== "OK" || !site.snippets?.length) continue;
  if (Date.now() - Date.parse(site.checked_at) > maxAgeDays * 864e5) { count.stale++; continue; } // 오래된 확인값은 쓰지 않는다
  if ((hostCount.get(hostOf(site.url)) ?? 0) > 1 || (hostCount.get(hostOf(c.homepage)) ?? 0) > 1) { count.shared_host++; continue; }
  const facts = extractSiteFacts(site.snippets.map((s) => s.text));
  const of = {};
  for (const [code, f] of Object.entries(facts)) {
    if (f.value == null) { count.conflicts++; continue; } // 문장끼리 어긋나면 확인필요로 남긴다
    const url = site.snippets.find((s) => s.text === f.quote)?.url ?? site.url;
    of[KEY[code]] = { v: f.value, ...(f.max && f.max !== f.value ? { max: f.max } : {}), q: f.quote, u: url, t: site.checked_at };
  }
  if (Object.keys(of).length) { c.of = of; count.campgrounds++; for (const k of Object.keys(of)) count[k]++; }
}
writeFileSync(campsPath, JSON.stringify(camps));
const metaPath = join(dataDir, "meta.json");
if (existsSync(metaPath)) {
  const meta = JSON.parse(readFileSync(metaPath, "utf8"));
  meta.operator_site_facts = { generated_at: new Date().toISOString(), ...count, sites_read: Object.values(sites).filter((s) => s.status === "OK").length };
  writeFileSync(metaPath, JSON.stringify(meta, null, 2));
}
console.log(`운영자 홈페이지 사실: ${count.campgrounds}곳 · 전력 W ${count.w} · 주차 ${count.pk} · 불멍 ${count.fire} · 차박 ${count.cc} · 어긋남 ${count.conflicts} · 오래됨 ${count.stale} · 공용 홈페이지 제외 ${count.shared_host}`);
