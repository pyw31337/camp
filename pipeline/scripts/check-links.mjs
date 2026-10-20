#!/usr/bin/env node
// 화면에 보이는 예약·홈페이지 링크를 하나씩 열어 살아 있는지 본다 → registry/link-health.json
// - robots.txt를 지키고 봇 이름을 밝힌다. 호스트별로 차례로, 1초 간격. 자동 확인이 막힌 플랫폼은 열지 않는다(UNVERIFIED).
// - DEAD: DNS 없음·연결 거부·404/410·없는 페이지 안내 · 시간 초과·5xx 등은 두 번 연속일 때만 DEAD.
// 사용: node scripts/check-links.mjs [--max-age-days 7] [--limit N]
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { judge, merge, noCheck } from "../lib/link-check.mjs";
import { parseRobots, robotsAllows } from "../lib/operator-site.mjs";

const root = resolve(fileURLToPath(import.meta.url), "../../..");
const camps = JSON.parse(readFileSync(join(root, "camping-atlas/public/explore/data/campgrounds.json"), "utf8"));
const outPath = join(root, "pipeline/registry/link-health.json");
const arg = (k, d) => { const i = process.argv.indexOf(k); return i > 0 ? process.argv[i + 1] : d; };
const maxAge = Number(arg("--max-age-days", 7)) * 864e5;
const limit = Number(arg("--limit", 0)) || Infinity;
const UA = "MoyeoraCampBot/1.0 (+https://github.com/pyw31337/camp; link check)";
const prev = existsSync(outPath) ? JSON.parse(readFileSync(outPath, "utf8")) : { urls: {} };
const urls = { ...(prev.urls ?? {}) };

// 화면에 보이는 링크: 예약 채널(온라인·홈페이지)·등록 예약 주소·홈페이지
const want = new Map();
for (const c of camps) {
  const add = (u) => { if (/^https?:\/\//i.test(u ?? "")) (want.get(u) ?? want.set(u, new Set()).get(u)).add(String(c.id)); };
  for (const ch of c.booking?.channels ?? []) if (ch.kind === "online" || ch.kind === "homepage") add(ch.url);
  add(c.booking?.url); add(c.homepage);
}
const now = Date.now();
const todo = [];
for (const u of want.keys()) {
  if (noCheck(u)) { urls[u] = { s: "UNVERIFIED", why: "자동 확인 차단 플랫폼", at: urls[u]?.at ?? null }; continue; }
  const p = urls[u];
  if (p?.at && now - Date.parse(p.at) < maxAge && p.s === "OK") continue;
  todo.push(u);
}
// 더는 화면에 없는 링크는 지운다
for (const u of Object.keys(urls)) if (!want.has(u)) delete urls[u];
console.log(`링크 ${want.size}개 · 확인 대상 ${Math.min(todo.length, limit)}개`);

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
async function get(url) {
  const ctl = new AbortController(), t = setTimeout(() => ctl.abort(), 15000);
  try {
    const r = await fetch(url, { headers: { "user-agent": UA, accept: "text/html,*/*;q=0.5", "accept-language": "ko" }, redirect: "follow", signal: ctl.signal });
    const ctype = r.headers.get("content-type") ?? "";
    let html = "";
    if (/html|text/.test(ctype)) { const buf = Buffer.from(await r.arrayBuffer()); html = buf.subarray(0, 200000).toString("utf8"); }
    else r.body?.cancel?.();
    return { status: r.status, url: r.url, html };
  } catch (e) { return { error: e.name === "AbortError" ? "timeout" : String(e.cause?.code ?? e.message) }; }
  finally { clearTimeout(t); }
}
const robots = new Map();
async function allowed(u) {
  const x = new URL(u);
  if (!robots.has(x.origin)) {
    const r = await get(`${x.origin}/robots.txt`);
    robots.set(x.origin, r.status === 200 && !/<html/i.test(r.html) ? parseRobots(r.html) : r.error && /ENOTFOUND|ECONNREFUSED/.test(r.error) ? "DOWN" : []);
  }
  const rules = robots.get(x.origin);
  return rules === "DOWN" ? "DOWN" : robotsAllows(rules, x.pathname + x.search);
}
const byHost = new Map();
for (const u of todo.slice(0, limit)) { const h = new URL(u).hostname; (byHost.get(h) ?? byHost.set(h, []).get(h)).push(u); }
const hosts = [...byHost.values()];
const stat = {};
let done = 0;
const save = () => {
  writeFileSync(outPath, `${JSON.stringify({ updated_at: new Date().toISOString(), policy: "robots.txt 준수·봇 이름 공개·호스트별 1초 간격. 자동 확인이 막힌 플랫폼은 열지 않음(UNVERIFIED).", urls }, null, 1)}\n`);
};
async function worker() {
  while (hosts.length) {
    for (const u of hosts.shift()) {
      const ok = await allowed(u).catch(() => true);
      let r;
      if (ok === "DOWN") r = { s: "DEAD", why: "서버 없음(DNS·연결 거부)" };
      else if (!ok) r = { s: "UNVERIFIED", why: "robots.txt 차단" };
      else r = merge(urls[u], judge(await get(u)));
      urls[u] = { ...r, at: new Date().toISOString(), camps: [...want.get(u)].slice(0, 5) };
      stat[r.s] = (stat[r.s] ?? 0) + 1;
      if (++done % 100 === 0) { console.log(`  ${done}`, JSON.stringify(stat)); save(); }
      await sleep(1000);
    }
  }
}
await Promise.all(Array.from({ length: 16 }, worker));
save();
const all = Object.values(urls).reduce((a, x) => ((a[x.s] = (a[x.s] ?? 0) + 1), a), {});
console.log("이번 확인", JSON.stringify(stat), "· 전체", JSON.stringify(all));
