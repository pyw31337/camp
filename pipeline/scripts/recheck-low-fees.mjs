#!/usr/bin/env node
// t41u-1: 1박 요금이 하한 미만인 업장을 업장 공식 홈페이지에서 다시 확인한다(robots 준수, 공개 페이지 1~3장만).
// 결과는 pipeline/registry/fee-recheck.json — build 단계에서 OFFICIAL 출처로 덮어쓴다(원본은 fee_raw로 보관).
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { htmlToText, isClosedHost, isOperatorHost, parseRobots, robotsAllows, guideLinks } from "../lib/operator-site.mjs";
import { sanitizeFee, plausibleFee } from "../lib/fee-sanity.mjs";

const root = resolve(fileURLToPath(import.meta.url), "../../..");
const camps = JSON.parse(readFileSync(join(root, "camping-atlas/public/explore/data/campgrounds.json"), "utf8"));
const outPath = join(root, "pipeline/registry/fee-recheck.json");
const UA = "MoyeoraCampBot/1.0 (+https://github.com/pyw31337/camp; operator-published fees)";
const BAD = /(추가|인원|전기|주차|당일|대여|장작|숯|보증|입장료|샤워|개당|1인|인당|마리|애견|반려|차량|체험|입장)/;
const NIGHT = /(1\s*박|박당|평일|주말|금요일|토요일|비수기|성수기|사이트|데크|파쇄석|오토|글램핑|카라반)/;
async function get(url) {
  const ctrl = new AbortController(); const t = setTimeout(() => ctrl.abort(), 12000);
  try { const r = await fetch(url, { headers: { "user-agent": UA }, signal: ctrl.signal, redirect: "follow" }); return r.ok ? await r.text() : null; }
  catch { return null; } finally { clearTimeout(t); }
}
export function nightFees(text) {
  const out = [];
  for (const line of text.split(/\n|(?<=[.!?])\s|·|\|/)) {
    if (!NIGHT.test(line) || BAD.test(line)) continue;
    for (const m of line.matchAll(/(\d{1,3}(?:,\d{3})+|\d{5,6})\s*원/g)) out.push({ won: Number(m[1].replace(/,/g, "")), quote: line.trim().slice(0, 90) });
  }
  return out;
}
if (process.argv[1] === fileURLToPath(import.meta.url)) await main();
async function main() {
const targets = camps.filter((c) => sanitizeFee(c).changed);
const prev = existsSync(outPath) ? JSON.parse(readFileSync(outPath, "utf8")).results : {};
const results = { ...prev };
for (const c of targets) {
  const id = String(c.id);
  if (!c.homepage || !isOperatorHost(c.homepage) || isClosedHost(c.homepage)) { results[id] = { name: c.name, status: "no_official_site" }; continue; }
  const home = c.homepage.startsWith("http") ? c.homepage : `http://${c.homepage}`;
  const robots = parseRobots((await get(new URL("/robots.txt", home).href)) ?? "");
  if (!robotsAllows(robots, new URL(home).pathname)) { results[id] = { name: c.name, status: "robots_disallow", url: home }; continue; }
  const html = await get(home);
  if (!html) { results[id] = { name: c.name, status: "fail", url: home }; continue; }
  let fees = nightFees(htmlToText(html)).map((x) => ({ ...x, url: home }));
  for (const u of guideLinks(html, home, 3)) {
    if (!robotsAllows(robots, new URL(u).pathname)) continue;
    const h = await get(u); if (h) fees.push(...nightFees(htmlToText(h)).map((x) => ({ ...x, url: u })));
    await new Promise((r) => setTimeout(r, 400));
  }
  fees = fees.filter((x) => plausibleFee(c, x.won));
  results[id] = { name: c.name, status: fees.length ? "ok" : "no_fee_text", url: home, fees: fees.slice(0, 8), checked_at: new Date().toISOString().slice(0, 10) };
  console.log(results[id].status, id, c.name, fees.map((x) => x.won).join(","));
}
writeFileSync(outPath, JSON.stringify({ _note: "t41u-1 하한 미만 1박 요금 재확인(업장 공식 홈페이지). build가 OFFICIAL로 덮어씀, 원본은 fee_raw", generated_at: new Date().toISOString(), targets: targets.length, results }, null, 2) + "\n");
console.log("targets", targets.length, "ok", Object.values(results).filter((r) => r.status === "ok").length);
}
