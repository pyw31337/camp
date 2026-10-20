#!/usr/bin/env node
// 사이트 크기·주차·방문객·당일이용·물놀이 기간을 운영자 홈페이지에서 채운다.
// node scripts/fill-gaps.mjs [--limit 60] [--offset 0]
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { extractSiteFacts, guideLinks, htmlToText, isClosedHost, isOperatorHost, parseRobots, relevantSentences, robotsAllows } from "../lib/operator-site.mjs";

const root = resolve(fileURLToPath(import.meta.url), "../../..");
const camps = JSON.parse(readFileSync(join(root, "camping-atlas/public/explore/data/campgrounds.json"), "utf8"));
const outPath = join(root, "pipeline/registry/gap-fill.json");
const arg = (k, d) => { const i = process.argv.indexOf(k); return i > 0 ? process.argv[i + 1] : d; };
const limit = Number(arg("--limit", 60));
const offset = Number(arg("--offset", 0));
const UA = "MoyeoraCampBot/1.0 (+https://github.com/pyw31337/camp; operator-published facts)";

const st = (c, k) => (c.field_conditions ?? {})[k]?.state;
const need = (c) => (st(c, "site_size") ?? "UNKNOWN") === "UNKNOWN" || (st(c, "parking") ?? "UNKNOWN") === "UNKNOWN";
const targets = camps.filter((c) => need(c) && c.homepage && isOperatorHost(c.homepage) && !isClosedHost(c.homepage));
const batch = targets.slice(offset, offset + limit);
console.log(`대상 ${targets.length}곳 중 ${offset}~${offset + batch.length}`);

async function fetchText(url, timeout = 12000) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), timeout);
  try {
    const r = await fetch(url, { headers: { "user-agent": UA, accept: "text/html" }, signal: ctrl.signal, redirect: "follow" });
    if (!r.ok) return { ok: false, status: r.status };
    if (!/html|text/i.test(r.headers.get("content-type") || "")) return { ok: false, status: r.status };
    return { ok: true, url: r.url, html: await r.text() };
  } catch (e) { return { ok: false, error: String(e.message || e) }; }
  finally { clearTimeout(t); }
}

const prev = existsSync(outPath) ? JSON.parse(readFileSync(outPath, "utf8")) : { results: {} };
const results = prev.results ?? {};
let hits = 0;

for (const c of batch) {
  const id = String(c.id);
  if (results[id]?.status === "ok") continue;
  const home = c.homepage.startsWith("http") ? c.homepage : `http://${c.homepage}`;
  const page = await fetchText(home);
  if (!page.ok) { results[id] = { name: c.name, status: "fail", url: home, error: page.error || page.status }; continue; }
  let text = htmlToText(page.html);
  for (const u of guideLinks(page.html, page.url).slice(0, 2)) {
    const sub = await fetchText(u);
    if (sub.ok) text += "\n" + htmlToText(sub.html);
  }
  const lines = relevantSentences(text, 100);
  const facts = extractSiteFacts(lines);
  const size = text.match(/(\d{1,2}(?:\.\d)?)\s*[x×*]\s*(\d{1,2}(?:\.\d)?)\s*(?:m|미터)/i);
  const park = facts.PARKING ? { value: facts.PARKING.value, quote: facts.PARKING.quote } : (/사이트\s*(옆|내)\s*주차/.test(text) ? { value: "SITE_SIDE", quote: "사이트 옆 주차" } : null);
  const visitor = /방문객\s*(입실\s*)?(가능|허용|환영)/.test(text) && !/방문객[^.]{0,8}(불가|금지)/.test(text) ? "ok" : (/방문객[^.]{0,8}(불가|금지)/.test(text) ? "no" : null);
  const day = /당일\s*(이용|캠핑|사용)\s*(가능|됩니다)|캠프닉|캠크닉|데이\s*캠핑/.test(text) ? true : null;
  const water = /물놀이|수영장/.test(text) ? (/(\d{1,2})\s*월[^.]{0,16}(\d{1,2})\s*월[^.]{0,12}(운영|개장)/.exec(text)?.[0] ?? (/여름[^.]{0,8}(한정|시즌|운영)/.test(text) ? "여름 한정" : null)) : null;
  const row = { name: c.name, status: "ok", url: page.url, size: size ? `${size[1]}x${size[2]}` : null, park, visitor, day, water, checked_at: new Date().toISOString() };
  results[id] = row;
  if (row.size || row.park || row.visitor || row.day) hits++;
  console.log(`${row.size || row.park || row.visitor || row.day ? "hit" : "empty"} ${id} ${c.name} size=${row.size ?? "-"} park=${row.park?.value ?? "-"} vis=${row.visitor ?? "-"} day=${row.day ?? "-"}`);
  await new Promise((r) => setTimeout(r, 300));
}
writeFileSync(outPath, JSON.stringify({ generated_at: new Date().toISOString(), targets: targets.length, results }, null, 2));
console.log(`저장 · 이번 ${hits}곳`);
