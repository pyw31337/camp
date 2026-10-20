#!/usr/bin/env node
// 요금 없는 업장 홈페이지에서 1박 요금 문장을 찾는다.
// node scripts/fill-fees.mjs [--limit 40] [--offset 0]
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { htmlToText, isClosedHost, isOperatorHost } from "../lib/operator-site.mjs";

const root = resolve(fileURLToPath(import.meta.url), "../../..");
const camps = JSON.parse(readFileSync(join(root, "camping-atlas/public/explore/data/campgrounds.json"), "utf8"));
const outPath = join(root, "pipeline/registry/fee-fill.json");
const arg = (k, d) => { const i = process.argv.indexOf(k); return i > 0 ? process.argv[i + 1] : d; };
const limit = Number(arg("--limit", 40));
const offset = Number(arg("--offset", 0));
const UA = "MoyeoraCampBot/1.0 (+https://github.com/pyw31337/camp; operator-published fees)";

const targets = camps.filter((c) => (c.fee?.min == null) && c.fee?.g !== "FREE" && c.homepage && isOperatorHost(c.homepage) && !isClosedHost(c.homepage));
const batch = targets.slice(offset, offset + limit);
console.log(`대상 ${targets.length}곳 중 ${offset}~${offset + batch.length}`);

const FEE = /(\d{1,3}(?:,\d{3})+|\d{4,6})\s*원/g;
async function fetchText(url) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), 10000);
  try {
    const r = await fetch(url, { headers: { "user-agent": UA, accept: "text/html" }, signal: ctrl.signal, redirect: "follow" });
    if (!r.ok) return null;
    if (!/html|text/i.test(r.headers.get("content-type") || "")) return null;
    return htmlToText(await r.text());
  } catch { return null; }
  finally { clearTimeout(t); }
}

const prev = existsSync(outPath) ? JSON.parse(readFileSync(outPath, "utf8")) : { results: {} };
const results = prev.results ?? {};
let hits = 0;
for (const c of batch) {
  const id = String(c.id);
  if (results[id]?.status === "ok") continue;
  const home = c.homepage.startsWith("http") ? c.homepage : `http://${c.homepage}`;
  const text = await fetchText(home);
  if (!text) { results[id] = { name: c.name, status: "fail", url: home }; console.log("fail", id, c.name); continue; }
  const amounts = [...text.matchAll(FEE)].map((m) => Number(m[1].replace(/,/g, ""))).filter((n) => n >= 10000 && n <= 500000);
  const night = /1\s*박|1박|평일|주말|성수기/.test(text);
  const min = amounts.length ? Math.min(...amounts) : null;
  results[id] = { name: c.name, status: "ok", url: home, min, night, samples: amounts.slice(0, 4), checked_at: new Date().toISOString() };
  if (min && night) { hits++; console.log("hit", id, c.name, min); }
  else console.log("empty", id, c.name, min ?? "-");
  await new Promise((r) => setTimeout(r, 250));
}
writeFileSync(outPath, JSON.stringify({ generated_at: new Date().toISOString(), targets: targets.length, results }, null, 2));
console.log(`저장 · 이번 1박 요금 ${hits}곳`);
