#!/usr/bin/env node
// 운영자 홈페이지의 사이트·객실(상품) 사진 후보를 모은다 → registry/operator-site-photos.json (2026-11-11 t55, t58 보강).
// - 대상: crawl-operator-sites가 운영자 홈페이지로 확인한 곳(status OK·NO_RELEVANT_TEXT) + 고캠핑/TourAPI 홈페이지가
//   비어 있는 캠핑장의 카카오·네이버 장소(운영자 호스트) 주소. 여러 캠핑장이 같은 호스트를 쓰는 소개·모음 사이트(4곳 이상)는 뺀다.
// - robots.txt 준수, 호스트별 1.1초 간격. 정적 HTML을 먼저 읽고(https 변형 우선), imweb·wix·예약 위젯·403·빈 페이지는
//   Chromium으로 열어 지연 로딩된 사진까지 모은다. 캠핑장당 첫 화면 + 상품 안내 쪽 최대 14쪽, 사진 후보 최대 160장.
// - 사진 파일은 받지 않는다. 주소·짧은 설명(alt·바로 앞 글·쪽 이름)·쪽 주소·확인 시각만 남긴다. 기존 결과는 합치기만 한다.
// 사용: node scripts/collect-operator-site-photos.mjs [--only id,id] [--limit N] [--concurrency 8]
//   [--render-concurrency 3] [--no-render] [--retry-failed] [--recrawl-ok] [--discover kakao,naver,web] [--max-age-days 30] [--out PATH]
import { existsSync, readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { hostOf, isClosedHost, isOperatorHost, parseRobots, robotsAllows } from "../lib/operator-site.mjs";
import { htmlLooksJsHeavy, imagesFromRendered, isJsBuilderUrl, mergePhotoCrawl, pageImages, siteLinks, urlVariants } from "../lib/operator-photos.mjs";

const root = resolve(fileURLToPath(import.meta.url), "../../..");
const arg = (k, d) => { const i = process.argv.indexOf(k); return i > 0 ? process.argv[i + 1] : d; };
const flag = (k) => process.argv.includes(k);
const only = arg("--only", "") ? new Set(arg("--only", "").split(",")) : null;
const limit = Number(arg("--limit", 0)) || Infinity;
const CONC = Number(arg("--concurrency", 8));
const RENDER_CONC = Number(arg("--render-concurrency", 3));
const MAX_AGE = Number(arg("--max-age-days", 30)) * 864e5;
const RENDER = !flag("--no-render");
const RETRY_FAILED = flag("--retry-failed") || !flag("--no-retry-failed");
const RECRAWL_OK = flag("--recrawl-ok");
const DISCOVER = new Set((arg("--discover", "kakao,naver") || "").split(",").filter(Boolean));
const MAX_PAGES = Number(arg("--max-pages", 14));
const MAX_IMGS = Number(arg("--max-imgs", 160));
const UA = "MoyeoraCampBot/1.0 (+https://github.com/pyw31337/camp; operator-published facts only)";
// 봇 이름은 밝히되, UA에 긴 설명·URL을 붙이면 imweb 등이 ‘접근 제한’으로 막는다. 연락처는 From 헤더에 둔다.
const BROWSER_UA = "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Safari/537.36 MoyeoraCampBot/1.0";
const outPath = resolve(arg("--out", join(root, "pipeline/registry/operator-site-photos.json")));
const snippets = JSON.parse(readFileSync(join(root, "pipeline/registry/operator-site-snippets.json"), "utf8")).campgrounds ?? {};
const campsPath = join(root, "camping-atlas/public/explore/data/campgrounds.json");
const camps = existsSync(campsPath) ? JSON.parse(readFileSync(campsPath, "utf8")) : [];
const byId = new Map(camps.map((c) => [String(c.id), c]));
const kakao = existsSync(join(root, "pipeline/registry/kakao-places.json"))
  ? JSON.parse(readFileSync(join(root, "pipeline/registry/kakao-places.json"), "utf8")).campgrounds ?? {} : {};
const naver = existsSync(join(root, "pipeline/registry/naver-places.json"))
  ? JSON.parse(readFileSync(join(root, "pipeline/registry/naver-places.json"), "utf8")).campgrounds ?? {} : {};
const prev = existsSync(outPath) ? JSON.parse(readFileSync(outPath, "utf8")) : { campgrounds: {} };
const result = { note: "운영자 홈페이지 사이트·객실 사진 후보(주소·설명만). collect-site-photos가 판정한다. 기존 후보는 지우지 않고 합친다.", generated_at: null, campgrounds: { ...prev.campgrounds } };

const hostCount = new Map();
const bumpHost = (u) => { const h = hostOf(u)?.replace(/^www\./, ""); if (h) hostCount.set(h, (hostCount.get(h) ?? 0) + 1); };
for (const v of Object.values(snippets)) if (v.url) bumpHost(v.url);
const shared = (u) => (hostCount.get(hostOf(u)?.replace(/^www\./, "")) ?? 0) > 3;
const catalogOpUrl = (c) => {
  const hp = (c?.homepage || "").trim();
  return hp && isOperatorHost(hp) && !isClosedHost(hp) ? hp : "";
};
function discoveredUrls(id) {
  const out = [];
  const push = (u) => { if (u && isOperatorHost(u) && !isClosedHost(u) && !shared(u)) out.push(u); };
  if (DISCOVER.has("kakao")) push(kakao[id]?.homepage?.url);
  const np = naver[id]?.place;
  if (DISCOVER.has("naver") && np?.link_is_operator) push(np.link);
  if (DISCOVER.has("web")) push(naver[id]?.web_homepage?.url);
  return [...new Set(out)];
}

function targetOf(id) {
  if (only && !only.has(id)) return null;
  const sn = snippets[id], c = byId.get(id), old = result.campgrounds[id];
  const starts = [];
  if (sn?.url && /^(OK|NO_RELEVANT_TEXT)$/.test(sn.status ?? "") && isOperatorHost(sn.url) && !isClosedHost(sn.url) && !shared(sn.url)) {
    starts.push(sn.url);
    for (const p of sn.pages ?? []) if (p && p !== sn.url) starts.push(p);
  }
  // 고캠핑/TourAPI 홈페이지가 없는 곳은 허용된 발굴 주소만 추가한다.
  if (!catalogOpUrl(c)) for (const u of discoveredUrls(id)) starts.push(u);
  const uniq = [...new Set(starts.filter(Boolean))];
  if (!uniq.length) return null;
  if (shared(uniq[0])) return null;
  const stale = !old?.checked_at || Date.now() - Date.parse(old.checked_at) > MAX_AGE;
  const failed = ["FETCH_FAILED", "ERROR", "TIMEOUT", "NO_IMAGES"].includes(old?.status);
  if (only) return { id, name: sn?.name ?? c?.name, url: uniq[0], pages: uniq.slice(1), via: sn?.url ? "snippets" : "discovered" };
  if (!old) return { id, name: sn?.name ?? c?.name, url: uniq[0], pages: uniq.slice(1), via: sn?.url ? "snippets" : "discovered" };
  if (RETRY_FAILED && failed) return { id, name: sn?.name ?? c?.name ?? old.name, url: uniq[0], pages: uniq.slice(1), via: "retry" };
  if (RECRAWL_OK && (old.status === "OK" || stale)) return { id, name: sn?.name ?? c?.name ?? old.name, url: uniq[0], pages: uniq.slice(1), via: "recrawl" };
  if (stale) return { id, name: sn?.name ?? c?.name ?? old.name, url: uniq[0], pages: uniq.slice(1), via: "stale" };
  return null;
}

const ids = new Set([...Object.keys(snippets), ...Object.keys(kakao), ...Object.keys(naver), ...[...byId.keys()]]);
const targets = [];
for (const id of ids) {
  const t = targetOf(id);
  if (t) targets.push(t);
  if (targets.length >= limit) break;
}
// 다시 시도·이미 있는 곳을 새로 발굴한 곳보다 앞에 둔다.
const rank = { retry: 0, recrawl: 1, stale: 2, snippets: 3, discovered: 4 };
targets.sort((a, b) => (rank[a.via] ?? 9) - (rank[b.via] ?? 9));

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
    const opts = { headers: { "user-agent": BROWSER_UA, accept: "text/html,*/*;q=0.5", "accept-language": "ko", from: "https://github.com/pyw31337/camp" }, redirect: "follow", signal: ctl.signal };
    const r = await fetch(url, opts);
    const ctype = r.headers.get("content-type") ?? "";
    if (!r.ok || (ctype && !/html|text/.test(ctype))) return { ok: false, error: String(r.status) };
    return { ok: true, url: r.url, html: decode(Buffer.from(await r.arrayBuffer()).subarray(0, 2_000_000), ctype) };
  } catch (e) {
    const msg = e.name === "AbortError" ? "timeout" : String(e.cause?.code ?? e.message);
    return { ok: false, error: msg };
  } finally { clearTimeout(timer); }
}
async function getWithVariants(start) {
  let last = { ok: false, error: "no-url" };
  for (const v of urlVariants(start)) {
    const r = await politeGet(v);
    if (r.ok) return r;
    last = r;
    // http 500(프록시)은 바로 다음 https 변형으로
    if (v.startsWith("http://") && String(r.error) === "500") continue;
    if (!/ENOTFOUND|EAI_AGAIN|ECONNREFUSED|CERT|SSL|EPROTO|ECONNRESET|500|403|timeout/i.test(String(r.error))) break;
  }
  return last;
}

const robots = new Map();
async function allowed(u) {
  let o; try { o = new URL(u).origin; } catch { return false; }
  if (!robots.has(o)) {
    const r = await politeGet(`${o}/robots.txt`);
    robots.set(o, r.ok && !/<html/i.test(r.html ?? "") ? parseRobots(r.html) : []);
  }
  const p = new URL(u); return robotsAllows(robots.get(o), p.pathname + p.search);
}

// ---------- Chromium 렌더 ----------
let browserP = null, browser = null, renderActive = 0, renderWait = [], renderDisabled = false;
async function launchBrowser() {
  const { chromium } = await import("playwright");
  const args = ["--disable-dev-shm-usage", "--no-sandbox"];
  const exe = process.env.PLAYWRIGHT_CHROME || ["/usr/bin/google-chrome", "/usr/bin/chromium", "/usr/bin/chromium-browser"].find((x) => existsSync(x));
  if (exe) return chromium.launch({ executablePath: exe, args });
  return chromium.launch({ args });
}
function renderer() {
  if (renderDisabled) return Promise.reject(new Error("render-disabled"));
  browserP ??= launchBrowser().then((b) => (browser = b)).catch((e) => { renderDisabled = true; browserP = null; throw e; });
  return browserP;
}
async function withRenderSlot(fn) {
  while (renderActive >= RENDER_CONC) await new Promise((r) => renderWait.push(r));
  renderActive++;
  try { return await fn(); }
  finally { renderActive--; renderWait.shift()?.(); }
}

async function extractRendered(page) {
  return page.evaluate(() => {
    const nearby = (el) => {
      let t = "", n = el;
      for (let i = 0; i < 6 && n; i++, n = n.parentElement) {
        const h = n.querySelector && n.querySelector("h1,h2,h3,h4,figcaption,legend,.title,.name,.room-name,.site-name");
        if (h && h.innerText) { t = h.innerText; break; }
        const prev = n.previousElementSibling;
        if (prev && /H[1-4]|FIGCAPTION|P|STRONG|SPAN/.test(prev.tagName) && prev.innerText) { t = prev.innerText; break; }
      }
      return (t || "").replace(/\s+/g, " ").trim().slice(0, 80);
    };
    const images = [];
    for (const i of document.images) {
      const src = i.currentSrc || i.src || i.getAttribute("data-src") || i.getAttribute("data-original") || i.getAttribute("data-lazy-src") || "";
      images.push({ src, alt: i.alt || i.title || "", w: i.naturalWidth, h: i.naturalHeight, near: nearby(i) });
    }
    for (const el of document.querySelectorAll("[style*='background'],[class*='bg'],[class*='visual'],[class*='slide'],[class*='hero'],[class*='photo'],section,article")) {
      const bg = getComputedStyle(el).backgroundImage;
      const m = bg && bg.match(/url\(["']?([^"')]+)/);
      if (m) images.push({ src: m[1], alt: "", w: el.clientWidth, h: el.clientHeight, near: nearby(el) });
    }
    for (const a of document.querySelectorAll("a[href]")) {
      const href = a.getAttribute("href") || "";
      if (/\.(jpe?g|png|webp)(\?|$)/i.test(href)) images.push({ src: href, alt: a.innerText || "", near: nearby(a) });
    }
    return { title: document.title || "", url: location.href, html: document.documentElement.outerHTML.slice(0, 1500000), images };
  });
}

async function renderPage(start, linkText = "") {
  const h = hostOf(start);
  for (;;) { const t = hostNext.get(h) ?? 0; if (Date.now() >= t) break; await sleep(t - Date.now()); }
  hostNext.set(h, Date.now() + 1100);
  await renderer();
  return withRenderSlot(async () => {
    const ctx = await browser.newContext({ userAgent: BROWSER_UA, locale: "ko-KR", viewport: { width: 1280, height: 900 }, ignoreHTTPSErrors: true, extraHTTPHeaders: { from: "https://github.com/pyw31337/camp" } });
    ctx.setDefaultTimeout(25000);
    const page = await ctx.newPage();
    await page.route("**/*", (r) => (/\.(mp4|webm|woff2?|ttf|otf)(\?|$)/i.test(r.request().url()) ? r.abort() : r.continue()));
    try {
      await page.goto(start, { waitUntil: "domcontentloaded", timeout: 25000 });
      await page.waitForTimeout(isJsBuilderUrl(start) ? 3500 : 2000);
      await page.evaluate(async () => {
        const n = Math.min(document.body?.scrollHeight ?? 0, 8000);
        for (let y = 0; y <= n; y += 900) { window.scrollTo(0, y); await new Promise((r) => setTimeout(r, 120)); }
      });
      await page.waitForTimeout(isJsBuilderUrl(start) ? 1500 : 700);
      const data = await extractRendered(page);
      if (data.url && !isOperatorHost(data.url)) return { ok: false, error: "platform_redirect", url: data.url };
      const imgs = imagesFromRendered(data.images, data.url || start, { linkText, title: data.title });
      return { ok: true, url: data.url || start, html: data.html, title: data.title, images: imgs };
    } catch (e) { return { ok: false, error: String(e.message || e).slice(0, 80) }; }
    finally { await ctx.close(); }
  });
}

async function crawl(t) {
  const start = /^https?:/i.test(t.url) ? t.url : `http://${t.url}`;
  if (!(await allowed(urlVariants(start)[0] || start))) {
    // robots를 첫 변형 기준으로 확인하고, 허용되는 변형이 있으면 그걸로
    const okVar = (await Promise.all(urlVariants(start).map(async (u) => (await allowed(u)) ? u : null))).find(Boolean);
    if (!okVar) return { status: "ROBOTS_DISALLOWED", source: start };
  }
  let first = await getWithVariants(start);
  let rendered = false;
  const needRender = RENDER && (!first.ok || isJsBuilderUrl(first.url || start) || htmlLooksJsHeavy(first.html) || (first.ok && pageImages(first.html, first.url).length < 2));
  if (needRender) {
    let rr; try { rr = await renderPage(first.ok ? first.url : urlVariants(start)[0] || start); } catch (e) { rr = { ok: false, error: String(e.message || e).slice(0, 80) }; }
    const staticN = first.ok ? pageImages(first.html, first.url).length : -1;
    const renderN = rr.ok ? Math.max(rr.images?.length ?? 0, pageImages(rr.html || "", rr.url).length) : -1;
    if (rr.ok && !/접근\s*제한|Access Denied|403 Forbidden|Just a moment|접속이 차단|비정상적 접근/i.test(`${rr.title || ""} ${rr.html || ""}`.slice(0, 2000)) && (renderN > staticN || !first.ok)) {
      first = { ok: true, url: rr.url, html: rr.html, rendered: { ...rr, images: rr.images?.length ? rr.images : pageImages(rr.html, rr.url, { title: rr.title }) } };
      rendered = true;
    }
  }
  if (process.env.CRAWL_DEBUG) console.log("  debug", t.id, "first", first.ok, first.url, "html", first.html?.length, "rendImgs", first.rendered?.images?.length, "pageImgs", first.ok ? pageImages(first.html, first.url).length : 0, "title", (first.rendered?.title || "").slice(0,60));
  if (!first.ok) return { status: "FETCH_FAILED", source: start, error: first.error };
  if (first.url && !isOperatorHost(first.url)) return { status: "REDIRECTED_TO_PLATFORM", source: first.url, error: "platform_redirect" };

  const queue = [{ url: first.url, text: "", html: first.html, renderedImgs: first.rendered?.images }];
  for (const p of t.pages ?? []) if (p !== start && p !== first.url) queue.push({ url: p, text: "" });
  for (const l of siteLinks(first.html, first.url, MAX_PAGES)) queue.push(l);
  const seenPages = new Set(), images = [], seenImg = new Set();
  const addImgs = (list, page) => {
    for (const im of list) {
      if (seenImg.has(im.url) || images.length >= MAX_IMGS) continue;
      seenImg.add(im.url);
      images.push({ ...im, page: im.page || page });
    }
  };
  for (const q of queue) {
    if (seenPages.size >= MAX_PAGES || images.length >= MAX_IMGS) break;
    if (seenPages.has(q.url)) continue;
    if (!(await allowed(q.url))) continue;
    seenPages.add(q.url);
    let html = q.html, url = q.url, renderedImgs = q.renderedImgs;
    if (!html) {
      let r = await getWithVariants(q.url);
      const subRender = RENDER && (!r.ok || isJsBuilderUrl(r.url || q.url) || htmlLooksJsHeavy(r.html) || (r.ok && pageImages(r.html, r.url).length < 2));
      if (subRender) {
        let rr; try { rr = await renderPage(r.ok ? r.url : q.url, q.text || ""); } catch (e) { rr = { ok: false }; }
        if (rr.ok) { r = { ok: true, url: rr.url, html: rr.html }; renderedImgs = rr.images; rendered = true; }
      }
      if (!r.ok) continue;
      html = r.html; url = r.url;
    }
    if (seenPages.size <= 2) for (const l of siteLinks(html, url, 8)) if (!queue.some((x) => x.url === l.url)) queue.push(l);
    if (renderedImgs?.length) addImgs(renderedImgs, url);
    addImgs(pageImages(html, url, { linkText: q.text }), url);
  }
  if (process.env.CRAWL_DEBUG) console.log("  debug done", t.id, "pages", seenPages.size, "images", images.length, "rendered", rendered, "queue", queue.length);
  return { status: images.length ? "OK" : "NO_IMAGES", source: first.url, pages: [...seenPages], images, ...(rendered ? { rendered: true } : {}) };
}

let done = 0, withImgs = 0, nImgs = 0, nAdded = 0, nNewCamps = 0;
const save = () => {
  result.generated_at = new Date().toISOString();
  mkdirSync(dirname(outPath), { recursive: true });
  writeFileSync(outPath, JSON.stringify(result) + "\n");
};
const byVia = {};
for (const t of targets) byVia[t.via] = (byVia[t.via] ?? 0) + 1;
console.log(`운영자 홈페이지 상품 사진 후보: 대상 ${targets.length}곳`, JSON.stringify(byVia), RENDER ? "· Chromium 폴백" : "· 정적만");
let next = 0;
await Promise.all(Array.from({ length: CONC }, async () => {
  while (next < targets.length) {
    const t = targets[next++];
    let r;
    try {
      let tid; const fb = new Promise((res) => { tid = setTimeout(() => res({ status: "TIMEOUT", source: t.url }), 300000); });
      r = await Promise.race([crawl(t).finally(() => clearTimeout(tid)), fb]);
    } catch (e) { r = { status: "ERROR", source: t.url, error: String(e.message || e).slice(0, 200) }; }
    const merged = mergePhotoCrawl(result.campgrounds[t.id], { name: t.name, checked_at: new Date().toISOString(), ...r, via: t.via });
    const was = result.campgrounds[t.id];
    if (!was) nNewCamps++;
    result.campgrounds[t.id] = merged;
    done++;
    if (merged.images?.length) { withImgs++; nImgs += merged.images.length; }
    nAdded += merged.added ?? 0;
    if (done % 20 === 0) { console.log(`  ${done}/${targets.length} · 사진 있는 곳 ${withImgs} · 누적 후보 ${nImgs} · 이번 추가 ${nAdded}`); save(); }
  }
}));
save();
await browser?.close();
console.log(`완료: ${done}곳 · 새로 추가된 캠핑장 ${nNewCamps} · 사진 있는 곳 ${withImgs} · 후보 누적 ${nImgs}장 · 이번 추가 ${nAdded}장 → ${outPath}`);
