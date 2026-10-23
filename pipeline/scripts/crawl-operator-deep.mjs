#!/usr/bin/env node
// 운영자 자체 홈페이지를 페이지마다 더 깊게 읽고, 이용 안내 문장과 시설·배치도 이미지 URL을 모은다.
// - 플랫폼(네이버·캠핏·ticketplay 등)은 읽지 않는다. robots.txt를 지킨다.
// - 전문은 저장하지 않는다. 관련 문장(≤140자)과 이미지 URL·원문 쪽만 남긴다.
// - 사용: node scripts/crawl-operator-deep.mjs --only id,id [--limit 20] [--max-pages 16]
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { guideLinks, htmlToText, isClosedHost, isOperatorHost, parseRobots, relevantSentences, robotsAllows } from "../lib/operator-site.mjs";

const root = resolve(fileURLToPath(import.meta.url), "../../..");
const camps = JSON.parse(readFileSync(join(root, "camping-atlas/public/explore/data/campgrounds.json"), "utf8"));
const outPath = join(root, "pipeline/registry/operator-deep.json");
const arg = (k, d) => { const i = process.argv.indexOf(k); return i > 0 ? process.argv[i + 1] : d; };
const only = new Set((arg("--only", "") || "").split(",").filter(Boolean));
const limit = Number(arg("--limit", only.size || 10));
const MAX_PAGES = Number(arg("--max-pages", 16));
const UA = "MoyeoraCampBot/1.0 (+https://github.com/pyw31337/camp; operator-published facts and photos)";

const LAYOUT_HINT = /배치|안내도|사이트\s*맵|사이트맵|layout|map|facility|시설|안내/i;
const IMG_SKIP = /logo|icon|btn|button|spacer|blank|sns|kakao|naver|facebook|insta|youtube|pixel|1x1|\.gif(\?|$)/i;

async function fetchText(url, timeout = 15000) {
  const tryOne = async (u, ua) => {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), timeout);
    try {
      const r = await fetch(u, { headers: { "user-agent": ua, accept: "text/html,image/*" }, signal: ctrl.signal, redirect: "follow" });
      if (!r.ok) return { ok: false, status: r.status, url: u };
      const ctype = r.headers.get("content-type") || "";
      if (!/html|text|xml/i.test(ctype)) return { ok: false, status: r.status, ctype, url: u };
      return { ok: true, url: r.url, html: await r.text(), status: r.status };
    } catch (e) {
      return { ok: false, error: String(e.message || e), url: u };
    } finally { clearTimeout(t); }
  };
  const browser = "Mozilla/5.0 (compatible; MoyeoraCampBot/1.0; +https://github.com/pyw31337/camp)";
  let res = await tryOne(url, UA);
  if (!res.ok && url.startsWith("http://")) res = await tryOne(url.replace("http://", "https://"), UA);
  if (!res.ok && (res.status === 403 || /reset|refused|timed out/i.test(res.error || ""))) res = await tryOne(res.url || url, browser);
  return res;
}

function imagesOf(html, pageUrl) {
  const base = new URL(pageUrl);
  const out = [];
  for (const m of String(html).matchAll(/<img\b[^>]*>/gi)) {
    const tag = m[0];
    const src = tag.match(/(?:src|data-src)\s*=\s*["']([^"']+)/i)?.[1];
    const alt = tag.match(/alt\s*=\s*["']([^"']*)/i)?.[1] ?? "";
    if (!src || src.startsWith("data:") || IMG_SKIP.test(src)) continue;
    let u; try { u = new URL(src, base); } catch { continue; }
    if (!/^https?:$/.test(u.protocol)) continue;
    const hint = `${alt} ${u.pathname}`;
    out.push({ url: u.toString(), page: pageUrl, alt: alt.slice(0, 80), layout: LAYOUT_HINT.test(hint) });
  }
  return out;
}

async function crawlCamp(c) {
  const start = c.homepage || (c.booking?.channels || []).find((x) => x.kind === "homepage")?.url;
  if (!start || !isOperatorHost(start) || isClosedHost(start)) return { status: "SKIPPED", reason: "not operator host", url: start || null };
  const origin = new URL(/^[a-z]+:/i.test(start) ? start : `http://${start}`).origin;
  const robotsTxt = await fetchText(`${origin}/robots.txt`).then((r) => r.ok ? r.html : "");
  const rules = parseRobots(robotsTxt);
  const seen = new Set();
  const queue = [start];
  const pages = [];
  const images = [];
  const snippets = [];
  while (queue.length && pages.length < MAX_PAGES) {
    const url = queue.shift();
    if (seen.has(url)) continue;
    seen.add(url);
    if (!robotsAllows(rules, new URL(url).pathname)) continue;
    const res = await fetchText(url);
    if (!res.ok) continue;
    pages.push(url);
    const text = htmlToText(res.html);
    for (const s of relevantSentences(text, 40)) if (!snippets.some((x) => x.text === s)) snippets.push({ text: s, url });
    for (const img of imagesOf(res.html, res.url)) if (!images.some((x) => x.url === img.url)) images.push(img);
    for (const link of guideLinks(res.html, res.url, 8)) if (!seen.has(link) && queue.length < 40) queue.push(link);
    await new Promise((r) => setTimeout(r, 800));
  }
  return {
    status: pages.length ? "OK" : "FETCH_FAILED",
    name: c.name,
    url: start,
    checked_at: new Date().toISOString(),
    pages,
    snippets: snippets.slice(0, 120),
    images: images.slice(0, 24),
  };
}

const targets = camps.filter((c) => only.size ? only.has(String(c.id)) : c.homepage && isOperatorHost(c.homepage)).slice(0, limit);
const prev = existsSync(outPath) ? JSON.parse(readFileSync(outPath, "utf8")) : { campgrounds: {} };
const result = { generated_at: new Date().toISOString(), policy: "operator hosts only, robots respected, sentences and image urls", campgrounds: { ...prev.campgrounds } };
// 맥미니 야간 작업용(2026-10-23): 끝낼 시각(NIGHTSHIFT_DEADLINE) 전에 멈추고, 10곳마다 저장한다.
// 다시 읽기가 실패하면 예전에 읽어 둔 내용을 지우지 않는다(docs/DATA_MERGE_POLICY.md) — 실패 시각만 남긴다.
const DEADLINE = Number(process.env.NIGHTSHIFT_DEADLINE) || Infinity;
const save = () => writeFileSync(outPath, JSON.stringify(result, null, 2));
let n = 0;
for (const c of targets) {
  if (Date.now() > DEADLINE - 120e3) { console.log("시간 다 됨 — 다음에 이어서"); break; }
  process.stdout.write(`crawl ${c.id} ${c.name}\n`);
  const got = await crawlCamp(c), old = result.campgrounds[c.id];
  result.campgrounds[c.id] = got.status !== "OK" && old?.status === "OK" ? { ...old, last_failed_at: got.checked_at } : got;
  process.stdout.write(`  ${got.status} pages=${got.pages?.length || 0} images=${got.images?.length || 0} snippets=${got.snippets?.length || 0}\n`);
  if (++n % 10 === 0) save();
}
save();
console.log("wrote", outPath, "camps", targets.length);
