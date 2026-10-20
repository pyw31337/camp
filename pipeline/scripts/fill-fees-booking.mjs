#!/usr/bin/env node
// 예약 페이지에서 1박 요금을 읽는다.
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { htmlToText } from "../lib/operator-site.mjs";

const root = resolve(fileURLToPath(import.meta.url), "../../..");
const pages = JSON.parse(readFileSync("/tmp/fee-pages.json", "utf8"));
const outPath = join(root, "pipeline/registry/fee-booking.json");
const arg = (k, d) => { const i = process.argv.indexOf(k); return i > 0 ? process.argv[i + 1] : d; };
const limit = Number(arg("--limit", 40));
const offset = Number(arg("--offset", 0));
const UA = "MoyeoraCampBot/1.0 (+https://github.com/pyw31337/camp; operator-published fees)";
const batch = pages.slice(offset, offset + limit);
console.log(`대상 ${pages.length}곳 중 ${offset}~${offset + batch.length}`);

const FEE = /(\d{1,3}(?:,\d{3})+|\d{4,6})\s*원/g;
async function fetchText(url) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), 10000);
  try {
    const r = await fetch(url, { headers: { "user-agent": UA, accept: "text/html" }, signal: ctrl.signal, redirect: "follow" });
    if (!r.ok) return null;
    return htmlToText(await r.text());
  } catch { return null; }
  finally { clearTimeout(t); }
}

const prev = existsSync(outPath) ? JSON.parse(readFileSync(outPath, "utf8")) : { results: {} };
const results = prev.results ?? {};
let hits = 0;
for (const p of batch) {
  const text = await fetchText(p["예약페이지"]);
  if (!text) { results[p.id] = { name: p["이름"], status: "fail", url: p["예약페이지"] }; console.log("fail", p.id, p["이름"]); continue; }
  const amounts = [...text.matchAll(FEE)].map((m) => Number(m[1].replace(/,/g, ""))).filter((n) => n >= 15000 && n <= 400000);
  const night = /1\s*박|1박|평일|주말|성수기|비수기/.test(text);
  const min = amounts.length ? Math.min(...amounts) : null;
  results[p.id] = { name: p["이름"], status: "ok", url: p["예약페이지"], min, night, samples: [...new Set(amounts)].slice(0, 5) };
  if (min && night) { hits++; console.log("hit", p.id, p["이름"], min, results[p.id].samples.join("/")); }
  else console.log("empty", p.id, p["이름"], min ?? "-");
  await new Promise((r) => setTimeout(r, 200));
}
writeFileSync(outPath, JSON.stringify({ generated_at: new Date().toISOString(), results }, null, 2));
console.log(`저장 · 1박 요금 ${hits}곳`);
