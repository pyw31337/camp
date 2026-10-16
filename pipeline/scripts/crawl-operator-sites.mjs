#!/usr/bin/env node
// 운영자 자체 홈페이지에서 이용 안내 문장을 모아 registry/operator-site-snippets.json에 쓴다.
// - 고캠핑에 등록된 홈페이지 중 플랫폼(네이버·캠핏·인스타그램 등)이 아닌 운영자 소유 도메인만 읽는다.
// - robots.txt를 지키고, 호스트마다 순서대로 1초 간격, 사이트당 최대 6쪽만 읽는다.
// - 전문은 저장하지 않는다. 선택에 필요한 짧은 문장과 원문 URL·확인 시각만 남긴다.
// 사용: node scripts/crawl-operator-sites.mjs [--limit N] [--only id,id] [--concurrency 12] [--max-age-days 14]
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { guideLinks, htmlToText, isOperatorHost, parseRobots, relevantSentences, robotsAllows } from "../lib/operator-site.mjs";

const root = resolve(fileURLToPath(import.meta.url), "../../..");
const camps = JSON.parse(readFileSync(join(root, "camping-atlas/public/explore/data/campgrounds.json"), "utf8"));
const outPath = join(root, "pipeline/registry/operator-site-snippets.json");
const arg = (k, d) => { const i = process.argv.indexOf(k); return i > 0 ? process.argv[i + 1] : d; };
const limit = Number(arg("--limit", 0)) || Infinity;
const only = arg("--only", "") ? new Set(arg("--only", "").split(",")) : null;
const concurrency = Number(arg("--concurrency", 12));
const maxAgeDays = Number(arg("--max-age-days", 14));
const UA = "MoyeoraCampBot/1.0 (+https://github.com/pyw31337/camp; operator-published facts only)";

const prev = existsSync(outPath) ? JSON.parse(readFileSync(outPath, "utf8")) : { campgrounds: {} };
const result = { ...prev, campgrounds: { ...prev.campgrounds } };

function decode(buf, ctype) {
  const head = buf.subarray(0, 4096).toString("latin1");
  const cs = (ctype.match(/charset=([\w-]+)/i)?.[1] ?? head.match(/<meta[^>]+charset\s*=\s*["']?([\w-]+)/i)?.[1] ?? "utf-8").toLowerCase();
  const label = /euc-?kr|ks_c_5601|cp949|x-windows-949/.test(cs) ? "euc-kr" : "utf-8";
  try { return new TextDecoder(label).decode(buf); } catch { return buf.toString("utf8"); }
}
async function get(url) {
  const ctl = new AbortController();
  const t = setTimeout(() => ctl.abort(), 12000);
  try {
    const r = await fetch(url, { headers: { "user-agent": UA, accept: "text/html,*/*;q=0.5", "accept-language": "ko" }, redirect: "follow", signal: ctl.signal });
    const ctype = r.headers.get("content-type") ?? "";
    if (!r.ok || (ctype && !/html|text/.test(ctype))) return { ok: false, status: r.status, url: r.url };
    const buf = Buffer.from(await r.arrayBuffer());
    return { ok: true, url: r.url, html: decode(buf.subarray(0, 1_500_000), ctype) };
  } catch (e) { return { ok: false, error: e.name === "AbortError" ? "timeout" : String(e.cause?.code ?? e.message) }; }
  finally { clearTimeout(t); }
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const robotsCache = new Map();
async function robotsFor(u) {
  const origin = new URL(u).origin;
  if (!robotsCache.has(origin)) {
    const r = await get(`${origin}/robots.txt`);
    robotsCache.set(origin, r.ok && !/<html/i.test(r.html) ? parseRobots(r.html) : []);
  }
  return robotsCache.get(origin);
}

async function crawlOne(c) {
  const start = /^[a-z]+:\/\//i.test(c.homepage) ? c.homepage : `http://${c.homepage}`;
  const checked_at = new Date().toISOString();
  const rules = await robotsFor(start).catch(() => []);
  if (!robotsAllows(rules, new URL(start).pathname)) return { status: "ROBOTS_DISALLOWED", url: start, checked_at };
  const first = await get(start);
  if (!first.ok) return { status: "FETCH_FAILED", url: start, checked_at, error: first.error ?? first.status ?? null };
  if (!isOperatorHost(first.url)) return { status: "REDIRECTED_TO_PLATFORM", url: first.url, checked_at };
  const pages = [{ url: first.url, html: first.html }];
  const queue = guideLinks(first.html, first.url, 8);
  for (const link of queue) {
    if (pages.length >= 6) break;
    if (!robotsAllows(rules, new URL(link).pathname + new URL(link).search)) continue;
    await sleep(1000);
    const p = await get(link);
    if (!p.ok || pages.some((x) => x.url === p.url)) continue;
    pages.push({ url: p.url, html: p.html });
    if (pages.length < 4) for (const l of guideLinks(p.html, p.url, 3)) if (!queue.includes(l)) queue.push(l);
  }
  const snippets = [];
  for (const p of pages) for (const s of relevantSentences(htmlToText(p.html), 40)) if (!snippets.some((x) => x.text === s)) snippets.push({ text: s, url: p.url });
  return { status: snippets.length ? "OK" : "NO_RELEVANT_TEXT", url: first.url, checked_at, pages: pages.map((p) => p.url), snippets: snippets.slice(0, 80) };
}

const fresh = (r) => r?.checked_at && Date.now() - Date.parse(r.checked_at) < maxAgeDays * 864e5;
const targets = camps.filter((c) => c.homepage && isOperatorHost(c.homepage) && (!only || only.has(String(c.id))) && (only || !fresh(prev.campgrounds[c.id]))).slice(0, limit);
console.log(`운영자 홈페이지 대상 ${targets.length}곳 (동시 ${concurrency})`);
let done = 0;
const stat = {};
const byHost = new Map();
for (const c of targets) { const h = new URL(/^[a-z]+:\/\//i.test(c.homepage) ? c.homepage : `http://${c.homepage}`).hostname; (byHost.get(h) ?? byHost.set(h, []).get(h)).push(c); }
const hosts = [...byHost.values()];
async function worker() {
  while (hosts.length) {
    const group = hosts.shift();
    for (const c of group) {
      const r = await crawlOne(c).catch((e) => ({ status: "ERROR", error: String(e.message), checked_at: new Date().toISOString() }));
      result.campgrounds[c.id] = { name: c.name, ...r };
      stat[r.status] = (stat[r.status] ?? 0) + 1;
      if (++done % 50 === 0) { console.log(`  ${done}/${targets.length}`, JSON.stringify(stat)); save(); }
      await sleep(1000);
    }
  }
}
function save() {
  result.generated_at = new Date().toISOString();
  result.policy = "운영자 자체 홈페이지만, robots.txt 준수, 문장(≤140자)·원문 URL·확인 시각만 저장. 플랫폼 페이지는 수집하지 않음.";
  writeFileSync(outPath, JSON.stringify(result, null, 1));
}
await Promise.all(Array.from({ length: concurrency }, worker));
save();
console.log("완료", JSON.stringify(stat));
