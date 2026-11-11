#!/usr/bin/env node
// 운영자 홈페이지의 사이트·객실(상품) 사진 후보를 모은다 → registry/operator-site-photos.json (2026-11-11 t55).
// - 대상: crawl-operator-sites가 운영자 홈페이지로 확인한 곳(status OK·NO_RELEVANT_TEXT). 여러 캠핑장이 같은 호스트를 쓰는
//   소개·모음 사이트(4곳 이상 공유)는 운영자 소유가 아닐 수 있어 뺀다.
// - robots.txt 준수, 호스트별 1초 간격, 캠핑장당 첫 화면 + 상품 안내로 보이는 쪽 최대 10쪽, 사진 후보 최대 80장.
// - 사진 파일은 받지 않는다. 주소·짧은 설명(alt·바로 앞 글·쪽 이름)·쪽 주소·확인 시각만 남긴다.
// 사용: node scripts/collect-operator-site-photos.mjs [--only id,id] [--limit N] [--concurrency 12] [--max-age-days 30]
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { hostOf, isClosedHost, isOperatorHost, parseRobots, robotsAllows } from "../lib/operator-site.mjs";
import { pageImages, siteLinks } from "../lib/operator-photos.mjs";

const root = resolve(fileURLToPath(import.meta.url), "../../..");
const arg = (k, d) => { const i = process.argv.indexOf(k); return i > 0 ? process.argv[i + 1] : d; };
const only = arg("--only", "") ? new Set(arg("--only", "").split(",")) : null;
const limit = Number(arg("--limit", 0)) || Infinity;
const CONC = Number(arg("--concurrency", 12));
const MAX_AGE = Number(arg("--max-age-days", 30)) * 864e5;
const MAX_PAGES = 10, MAX_IMGS = 80;
const UA = "MoyeoraCampBot/1.0 (+https://github.com/[REDACTED]/camp; operator-published facts only)";
const outPath = join(root, "pipeline/registry/operator-site-photos.json");
const snippets = JSON.parse(readFileSync(join(root, "pipeline/registry/operator-site-snippets.json"), "utf8")).campgrounds ?? {};
const prev = existsSync(outPath) ? JSON.parse(readFileSync(outPath, "utf8")) : { campgrounds: {} };
const result = { note: "운영자 홈페이지 사이트·객실 사진 후보(주소·설명만). collect-site-photos가 판정한다.", generated_at: null, campgrounds: { ...prev.campgrounds } };

const hostCount = new Map();
for (const v of Object.values(snippets)) { const h = hostOf(v.url)?.replace(/^www\./, ""); if (h) hostCount.set(h, (hostCount.get(h) ?? 0) + 1); }
const targets = Object.entries(snippets).filter(([id, v]) => {
  if (only && !only.has(id)) return false;
  if (!/^(OK|NO_RELEVANT_TEXT)$/.test(v.status ?? "") || !v.url) return false;
  if (!isOperatorHost(v.url) || isClosedHost(v.url)) return false;
  if ((hostCount.get(hostOf(v.url)?.replace(/^www\./, "")) ?? 0) > 3) return false;
  const p = result.campgrounds[id];
  return only || !p?.checked_at || Date.now() - Date.parse(p.checked_at) > MAX_AGE;
}).slice(0, limit);

function decode(buf, ctype) {
  const head = buf.subarray(0, 4096).toString("latin1");
  const cs = (ctype.match(/charset=([\w-]+)/i)?.[1] ?? head.match(/<meta[^>]+charset\s*=\s*["']?([\w-]+)/i)?.[1] ?? "utf-8").toLowerCase();
  try { return new TextDecoder(/euc-?kr|ks_c_5601|cp949/.test(cs) ? "euc-kr" : "utf-8").decode(buf); } catch { return buf.toString("utf8"); }
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const hostNext = new Map();
async function politeGet(url) {
  const h = hostOf(url);
  for (;;) { const t = hostNext.get(h) ?? 0; if (Date.now() >= t) break; await sleep(t - Date.now()); }
  hostNext.set(h, Date.now() + 1100);
  const ctl = new AbortController(); const timer = setTimeout(() => ctl.abort(), 20000);
  try {
    const r = await fetch(url, { headers: { "user-agent": UA, accept: "text/html,*/*;q=0.5", "accept-language": "ko" }, redirect: "follow", signal: ctl.signal });
    const ctype = r.headers.get("content-type") ?? "";
    if (!r.ok || (ctype && !/html|text/.test(ctype))) return { ok: false, error: String(r.status) };
    return { ok: true, url: r.url, html: decode(Buffer.from(await r.arrayBuffer()).subarray(0, 2_000_000), ctype) };
  } catch (e) { return { ok: false, error: e.name === "AbortError" ? "timeout" : String(e.cause?.code ?? e.message) }; }
  finally { clearTimeout(timer); }
}
const robots = new Map();
async function allowed(u) {
  const o = new URL(u).origin;
  if (!robots.has(o)) { const r = await politeGet(`${o}/robots.txt`); robots.set(o, r.ok && !/<html/i.test(r.html) ? parseRobots(r.html) : []); }
  const p = new URL(u); return robotsAllows(robots.get(o), p.pathname + p.search);
}

async function crawl(id, v) {
  const start = /^https?:/i.test(v.url) ? v.url : `http://${v.url}`;
  if (!(await allowed(start))) return { status: "ROBOTS_DISALLOWED", source: start };
  const first = await politeGet(start);
  if (!first.ok) return { status: "FETCH_FAILED", source: start, error: first.error };
  const queue = [{ url: first.url, text: "", html: first.html }];
  for (const p of v.pages ?? []) if (p !== start) queue.push({ url: p, text: "" });
  for (const l of siteLinks(first.html, first.url, MAX_PAGES)) queue.push(l);
  const seenPages = new Set(), images = [], seenImg = new Set();
  for (const q of queue) {
    if (seenPages.size >= MAX_PAGES || images.length >= MAX_IMGS) break;
    if (seenPages.has(q.url)) continue;
    seenPages.add(q.url);
    let html = q.html, url = q.url;
    if (!html) { if (!(await allowed(q.url))) continue; const r = await politeGet(q.url); if (!r.ok) continue; html = r.html; url = r.url; }
    // 프레임으로 감싼 첫 화면이면 안쪽 쪽의 상품 링크도 이어 본다.
    if (seenPages.size <= 2) for (const l of siteLinks(html, url, 6)) if (!queue.some((x) => x.url === l.url)) queue.push(l);
    for (const im of pageImages(html, url, { linkText: q.text })) {
      if (seenImg.has(im.url)) continue;
      seenImg.add(im.url);
      images.push({ ...im, page: url });
      if (images.length >= MAX_IMGS) break;
    }
  }
  return { status: images.length ? "OK" : "NO_IMAGES", source: first.url, pages: [...seenPages], images };
}

let done = 0, withImgs = 0, nImgs = 0;
const save = () => { result.generated_at = new Date().toISOString(); writeFileSync(outPath, JSON.stringify(result) + "\n"); };
console.log(`운영자 홈페이지 상품 사진 후보: 대상 ${targets.length}곳`);
let next = 0;
await Promise.all(Array.from({ length: CONC }, async () => {
  while (next < targets.length) {
    const [id, v] = targets[next++];
    let r;
    try { r = await Promise.race([crawl(id, v), sleep(240000).then(() => ({ status: "TIMEOUT", source: v.url }))]); } catch (e) { r = { status: "ERROR", source: v.url, error: e.message }; }
    result.campgrounds[id] = { name: v.name, checked_at: new Date().toISOString(), ...r };
    done++; if (r.images?.length) { withImgs++; nImgs += r.images.length; }
    if (done % 50 === 0) { console.log(`  ${done}/${targets.length} · 사진 있는 곳 ${withImgs} · 후보 ${nImgs}장`); save(); }
  }
}));
save();
console.log(`완료: ${done}곳 · 사진 있는 곳 ${withImgs} · 후보 ${nImgs}장 → ${outPath}`);
