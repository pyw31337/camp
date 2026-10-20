#!/usr/bin/env node
// 전기·온수 정보가 없는 업장의 운영자 홈페이지를 읽고 값을 채운다.
// 사용: node scripts/fill-power-hot.mjs [--limit 40] [--offset 0]
// 플랫폼(네이버·캠핏 등)은 읽지 않는다. robots.txt를 지킨다.
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { extractSiteDetails, extractSiteFacts, guideLinks, htmlToText, isClosedHost, isOperatorHost, parseRobots, relevantSentences, robotsAllows } from "../lib/operator-site.mjs";

const root = resolve(fileURLToPath(import.meta.url), "../../..");
const camps = JSON.parse(readFileSync(join(root, "camping-atlas/public/explore/data/campgrounds.json"), "utf8"));
const outPath = join(root, "pipeline/registry/power-hot-fill.json");
const arg = (k, d) => { const i = process.argv.indexOf(k); return i > 0 ? process.argv[i + 1] : d; };
const limit = Number(arg("--limit", 40));
const offset = Number(arg("--offset", 0));
const UA = "MoyeoraCampBot/1.0 (+https://github.com/pyw31337/camp; operator-published facts)";

const powerKnown = (c) => {
  const p = (c.field_conditions ?? {}).power ?? {};
  return p.available === true || (c.amenities ?? []).some((a) => /전기/.test(a ?? ""));
};
const hotKnown = (c) => {
  const h = (c.field_conditions ?? {}).sanitary?.hot_water;
  return (h != null && h !== "None" && h !== "") || (c.amenities ?? []).some((a) => /온수/.test(a ?? ""));
};

const targets = camps.filter((c) => (!powerKnown(c) || !hotKnown(c)) && c.homepage && isOperatorHost(c.homepage) && !isClosedHost(c.homepage));
const batch = targets.slice(offset, offset + limit);
console.log(`대상 ${targets.length}곳 중 ${offset}~${offset + batch.length} (${batch.length}곳)`);

async function fetchText(url, timeout = 12000) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), timeout);
  try {
    const r = await fetch(url, { headers: { "user-agent": UA, accept: "text/html" }, signal: ctrl.signal, redirect: "follow" });
    if (!r.ok) return { ok: false, status: r.status };
    const ctype = r.headers.get("content-type") || "";
    if (!/html|text/i.test(ctype)) return { ok: false, status: r.status, ctype };
    return { ok: true, url: r.url, html: await r.text() };
  } catch (e) {
    return { ok: false, error: String(e.message || e) };
  } finally { clearTimeout(t); }
}

const prev = existsSync(outPath) ? JSON.parse(readFileSync(outPath, "utf8")) : { generated_at: null, results: {} };
const results = prev.results ?? {};
let filled = 0, failed = 0;

for (const c of batch) {
  const id = String(c.id);
  if (results[id]?.power || results[id]?.hot) { console.log(`skip ${id} ${c.name}`); continue; }
  const home = c.homepage.startsWith("http") ? c.homepage : `http://${c.homepage}`;
  let robotsOk = true;
  try {
    const u = new URL(home);
    const rr = await fetchText(`${u.origin}/robots.txt`);
    if (rr.ok) {
      const rules = parseRobots(rr.html);
      robotsOk = robotsAllows(rules, u.pathname || "/");
    }
  } catch { /* robots 없으면 진행 */ }
  if (!robotsOk) { results[id] = { name: c.name, status: "robots", url: home, checked_at: new Date().toISOString() }; failed++; continue; }
  const page = await fetchText(home);
  if (!page.ok) { results[id] = { name: c.name, status: "fail", url: home, error: page.error || page.status, checked_at: new Date().toISOString() }; failed++; console.log(`fail ${id} ${c.name}`); continue; }
  let text = htmlToText(page.html);
  const more = guideLinks(page.html, page.url).slice(0, 3);
  for (const u of more) {
    const sub = await fetchText(u);
    if (sub.ok) text += "\n" + htmlToText(sub.html);
  }
  const lines = relevantSentences(text, 120);
  const facts = extractSiteFacts(lines);
  const details = extractSiteDetails(lines);
  const powerHit = text.match(/전기\s*(사용\s*)?(가능|제공|있음|됩니다)|전원\s*(사용|제공)|콘센트|릴\s*선|(\d{3,4})\s*(?:w|와트)/i);
  const power = facts.POWER_W
    ? { ok: true, w: facts.POWER_W.value, quote: facts.POWER_W.quote, src: page.url }
    : (powerHit ? { ok: true, quote: powerHit[0], src: page.url } : null);
  const hotAmen = (details.AMENITIES ?? []).find((a) => a.code === "HOT_WATER");
  const hotHit = text.match(/온수\s*(샤워|사용|제공|가능|나옴|있음)|샤워실|보일러/i);
  const hot = hotAmen ? { ok: true, quote: hotAmen.quote, src: page.url } : (hotHit ? { ok: true, quote: hotHit[0], src: page.url } : null);
  results[id] = { name: c.name, status: "ok", url: page.url, need_power: !powerKnown(c), need_hot: !hotKnown(c), power, hot, checked_at: new Date().toISOString() };
  if (power || hot) filled++;
  console.log(`${power || hot ? "hit" : "empty"} ${id} ${c.name} power=${Boolean(power)} hot=${Boolean(hot)}`);
  await new Promise((r) => setTimeout(r, 400));
}

const out = { generated_at: new Date().toISOString(), targets: targets.length, results };
writeFileSync(outPath, JSON.stringify(out, null, 2));
const hits = Object.values(results).filter((r) => r.power || r.hot).length;
console.log(`저장 ${outPath} · 이번 ${filled}곳 채움 · 누적 ${hits}곳 · 실패 ${failed}`);
