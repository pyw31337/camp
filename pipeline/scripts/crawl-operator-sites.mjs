#!/usr/bin/env node
// 운영자 자체 홈페이지·예약 페이지에서 이용 안내 문장을 모아 registry/operator-site-snippets.json에 쓴다.
// - 고캠핑에 등록된 홈페이지·예약 URL 중 플랫폼(네이버·캠핏·인스타그램 등)이 아닌 운영자 소유 도메인만 읽는다.
// - robots.txt를 지키고, 호스트마다 순서대로 1초 간격, 사이트당 최대 8쪽만 읽는다.
// - 전문은 저장하지 않는다. 선택에 필요한 짧은 문장과 원문 URL·확인 시각만 남긴다.
// - v2(2026-10-16): 접속 실패 시 주소 변형(https↔http, www 유무)으로 다시 시도하고, --render면 자바스크립트로 그리는
//   사이트(imweb·wix·cafe24 등)와 403/5xx/시간 초과 사이트를 Chromium으로 열어 화면 글자를 읽는다(봇 이름을 밝힌다).
//   운영이 끝난 빌더(modoo!)는 SERVICE_CLOSED로 표시만 한다.
// 사용: node scripts/crawl-operator-sites.mjs [--limit N] [--only id,id] [--concurrency 12] [--max-age-days 14] [--render] [--retry-failed]
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { validatesAsOperatorSite } from "../lib/kakao-discovery.mjs";
import { guideLinks, htmlToText, isClosedHost, isOperatorHost, noticeLinks, parseRobots, relevantSentences, robotsAllows } from "../lib/operator-site.mjs";

const root = resolve(fileURLToPath(import.meta.url), "../../..");
const camps = JSON.parse(readFileSync(join(root, "camping-atlas/public/explore/data/campgrounds.json"), "utf8"));
const registryPath = join(root, "pipeline/registry/operator-site-snippets.json");
// 카카오 공식 API로 발굴한 홈페이지(registry/kakao-places.json, discover-kakao.mjs). 고캠핑 등록 사이트가 없거나 죽은 곳에만 쓴다.
const kakaoPath = join(root, "pipeline/registry/kakao-places.json");
const kakao = existsSync(kakaoPath) ? JSON.parse(readFileSync(kakaoPath, "utf8")).campgrounds ?? {} : {};
// 네이버 지역 검색에 업장이 등록한 링크(운영자 호스트일 때, registry/naver-places.json)를 웹 검색 후보보다 먼저 쓴다.
const naverPath = join(root, "pipeline/registry/naver-places.json");
const naver = existsSync(naverPath) ? JSON.parse(readFileSync(naverPath, "utf8")).campgrounds ?? {} : {};
// 네이버 웹문서 검색으로 찾은 새 홈페이지(죽은 등록 주소 대체, discover-naver.mjs --web-homepage)도 후보에 넣는다.
const discoveredOf = (c) => (naver[c.id]?.place?.link_is_operator ? naver[c.id].place.link : null) ?? kakao[c.id]?.homepage?.url ?? naver[c.id]?.web_homepage?.url ?? null;
const flag = (k) => process.argv.includes(k);
const arg = (k, d) => { const i = process.argv.indexOf(k); return i > 0 ? process.argv[i + 1] : d; };
const limit = Number(arg("--limit", 0)) || Infinity;
const only = arg("--only", "") ? new Set(arg("--only", "").split(",")) : null;
const concurrency = Number(arg("--concurrency", 12));
const maxAgeDays = Number(arg("--max-age-days", 14));
const RENDER = flag("--render");
const RETRY_FAILED = flag("--retry-failed");
// --ocr: 글이 거의 없는(요금표·이용안내가 이미지인) 운영자 페이지의 안내 이미지를 tesseract(kor)로 읽는다. 운영자 자체 이미지만.
const OCR = flag("--ocr");
// --out: 긴 수집 중에는 레지스트리 대신 다른 파일에 써 두고, 끝난 뒤 옮긴다(작업 트리가 계속 바뀌지 않게).
const outPath = resolve(arg("--out", registryPath));
// --since: 이 시각 이후 이미 다시 읽은 곳은 건너뛴다(중단된 수집 이어 하기).
const SINCE = arg("--since", "");
const MAX_PAGES = 8;
const UA = "MoyeoraCampBot/1.0 (+https://github.com/pyw31337/camp; operator-published facts only)";
const BROWSER_UA = `Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0 Safari/537.36 ${UA}`;

const prev = existsSync(outPath) ? JSON.parse(readFileSync(outPath, "utf8")) : existsSync(registryPath) ? JSON.parse(readFileSync(registryPath, "utf8")) : { campgrounds: {} };
const result = { ...prev, campgrounds: { ...prev.campgrounds } };

function decode(buf, ctype) {
  const head = buf.subarray(0, 4096).toString("latin1");
  const cs = (ctype.match(/charset=([\w-]+)/i)?.[1] ?? head.match(/<meta[^>]+charset\s*=\s*["']?([\w-]+)/i)?.[1] ?? "utf-8").toLowerCase();
  const label = /euc-?kr|ks_c_5601|cp949|x-windows-949/.test(cs) ? "euc-kr" : "utf-8";
  try { return new TextDecoder(label).decode(buf); } catch { return buf.toString("utf8"); }
}
async function get(url) {
  const ctl = new AbortController();
  const t = setTimeout(() => ctl.abort(), 20000); // 지자체·소규모 서버가 느린 곳이 많다(2026-10-19: 12초 → 20초)
  try {
    const r = await fetch(url, { headers: { "user-agent": UA, accept: "text/html,*/*;q=0.5", "accept-language": "ko" }, redirect: "follow", signal: ctl.signal });
    const ctype = r.headers.get("content-type") ?? "";
    if (!r.ok || (ctype && !/html|text/.test(ctype))) return { ok: false, status: r.status, error: String(r.status), url: r.url };
    const buf = Buffer.from(await r.arrayBuffer());
    return { ok: true, url: r.url, html: decode(buf.subarray(0, 1_500_000), ctype) };
  } catch (e) { return { ok: false, error: e.name === "AbortError" ? "timeout" : String(e.cause?.code ?? e.message) }; }
  finally { clearTimeout(t); }
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
// 어떤 사이트도 전체 흐름을 막지 못하게 시간 상한을 둔다.
const within = (ms, p, label) => Promise.race([p, new Promise((_, rej) => setTimeout(() => rej(new Error(`timeout:${label}`)), ms))]);
const robotsCache = new Map();
async function robotsFor(u) {
  const origin = new URL(u).origin;
  if (!robotsCache.has(origin)) {
    const r = await get(`${origin}/robots.txt`);
    robotsCache.set(origin, r.ok && !/<html/i.test(r.html) ? parseRobots(r.html) : []);
  }
  return robotsCache.get(origin);
}
const withProto = (u) => (/^[a-z]+:\/\//i.test(u) ? u : `http://${u}`);
// 낡은 등록 주소를 살린다: https↔http, www 붙이기/떼기, 경로를 뺀 첫 화면
function variants(u) {
  const x = new URL(withProto(u)), out = new Set([x.toString()]);
  const hosts = [x.hostname, x.hostname.startsWith("www.") ? x.hostname.slice(4) : `www.${x.hostname}`];
  for (const proto of ["https:", "http:"]) for (const h of hosts) { out.add(`${proto}//${h}${x.pathname}${x.search}`); out.add(`${proto}//${h}/`); }
  return [...out];
}

// ---------- 브라우저 렌더링(선택) ----------
let browserP = null, browser = null;
// 여러 작업자가 동시에 불러도 브라우저는 하나만 띄운다.
function renderer() {
  browserP ??= import("playwright").then(({ chromium }) => chromium.launch()).then((b) => (browser = b));
  return browserP;
}
async function renderSite(start, rules) {
  const b = await renderer();
  const ctx = await b.newContext({ userAgent: BROWSER_UA, locale: "ko-KR", viewport: { width: 1280, height: 900 } });
  ctx.setDefaultTimeout(20000);
  const page = await ctx.newPage();
  await page.route("**/*", (r) => (/\.(png|jpe?g|gif|webp|mp4|woff2?|ttf)(\?|$)/i.test(r.request().url()) ? r.abort() : r.continue()));
  const pages = [];
  const readPage = async (url) => {
    try {
      await page.goto(url, { waitUntil: "domcontentloaded" });
      await page.waitForTimeout(2500);
      const texts = [];
      for (const f of page.frames().slice(0, 6)) { try { texts.push(await within(5000, f.evaluate(() => document.body?.innerText ?? ""), "frame")); } catch {} }
      const html = await within(5000, page.content(), "content");
      // OCR 후보: 지연 로딩이 끝난 실제 그림 주소와 크기(작은 아이콘 거르기)
      const imgs = await within(5000, page.evaluate(() => [...document.images].map((i) => ({ src: i.currentSrc || i.src, alt: i.alt || "", w: i.naturalWidth, h: i.naturalHeight }))), "imgs").catch(() => []);
      return { url: page.url(), text: texts.join("\n"), html, imgs };
    } catch (e) { return null; }
  };
  try {
    const first = await readPage(start);
    if (!first) return { ok: false, error: "render_failed" };
    if (!isOperatorHost(first.url)) return { ok: false, error: "platform_redirect", url: first.url };
    pages.push(first);
    const links = guideLinks(first.html, first.url, 12);
    for (const l of links) {
      if (pages.length >= MAX_PAGES) break;
      const u = new URL(l);
      if (!robotsAllows(rules, u.pathname + u.search)) continue;
      await sleep(1000);
      const p = await readPage(l);
      if (p && !pages.some((x) => x.url === p.url)) pages.push(p);
    }
    return { ok: true, url: first.url, pages };
  } finally { await ctx.close(); }
}

async function staticSite(start, rules) {
  let first = null, lastErr = null;
  for (const v of variants(start)) {
    if (!robotsAllows(rules, new URL(v).pathname)) { lastErr = "robots"; continue; }
    const r = await get(v);
    if (r.ok) { first = r; break; }
    lastErr = r.error;
    if (!/ENOTFOUND|EAI_AGAIN|ECONNREFUSED|CERT|SSL|EPROTO|ECONNRESET/i.test(String(r.error))) break; // 404·403 등은 변형해도 같다
    await sleep(300);
  }
  if (!first) return { ok: false, error: lastErr };
  if (!isOperatorHost(first.url)) return { ok: false, error: "platform_redirect", url: first.url };
  const pages = [{ url: first.url, text: htmlToText(first.html), html: first.html }];
  const queue = guideLinks(first.html, first.url, 10);
  for (const link of queue) {
    if (pages.length >= MAX_PAGES) break;
    const u = new URL(link);
    if (!robotsAllows(rules, u.pathname + u.search)) continue;
    await sleep(1000);
    const p = await get(link);
    if (!p.ok || pages.some((x) => x.url === p.url)) continue;
    pages.push({ url: p.url, text: htmlToText(p.html), html: p.html });
    if (pages.length < 4) for (const l of guideLinks(p.html, p.url, 3)) if (!queue.includes(l)) queue.push(l);
  }
  return { ok: true, url: first.url, pages };
}

// ---------- 이미지 안내문 OCR(선택) ----------
// 요금표·이용안내가 이미지인 운영자 페이지: 안내 이미지를 골라 전처리(확대·흑백·정규화) 후 tesseract(kor)로 읽고,
// 표는 lib/ocr.mjs가 칸 이름이 붙은 문장으로 바꾼다. 운영자 자체 이미지만, robots 준수, 이미지당 1초 간격.
const OCR_HINT = /요금|가격|이용|안내|규정|규칙|공지|시설|사이트|배치|객실|price|fee|charge|pay|guide|info|rule|notice|use|room|sub|page|con|img_?\d/i;
const OCR_PRICE_HINT = /요금|가격|이용료|price|fee|charge|pay/i;
const OCR_SKIP = /logo|icon|btn|button|bullet|arrow|blank|spacer|sns|kakao|naver|facebook|insta|youtube|roughmap|staticmap|maps?\.(google|kakao|naver)|map_|_map|banner_?s|\.(gif|svg|ico)(\?|$)/i;
function guideImages(pages, max = 8) {
  const out = new Map();
  const add = (src, alt, page, w = 0, h = 0) => {
    if (!src || src.startsWith("data:") || OCR_SKIP.test(src)) return;
    let u; try { u = new URL(src, page).toString(); } catch { return; }
    if (!isOperatorHost(u) || out.has(u)) return;
    if (w && h && (w < 300 || h < 120)) return; // 렌더링에서 크기를 알면 작은 그림은 뺀다
    const hint = `${alt} ${src}`;
    out.set(u, { url: u, page, score: (OCR_HINT.test(hint) ? 2 : 0) + (OCR_PRICE_HINT.test(hint) ? 3 : 0) + (OCR_PRICE_HINT.test(page) ? 2 : 0) + (w * h > 400000 ? 1 : 0) });
  };
  for (const p of pages) {
    for (const im of p.imgs ?? []) add(im.src, im.alt ?? "", p.url, im.w, im.h);
    const html = String(p.html ?? "");
    for (const m of html.matchAll(/<img\b[^>]*>/gi)) {
      const tag = m[0], alt = tag.match(/\balt\s*=\s*["']([^"']*)["']/i)?.[1] ?? "";
      for (const a of tag.matchAll(/\b(?:src|data-src|data-original|data-lazy-src|data-url)\s*=\s*["']([^"']+)["']/gi)) add(a[1], alt, p.url);
      const set = tag.match(/\b(?:srcset|data-srcset)\s*=\s*["']([^"']+)["']/i)?.[1];
      if (set) add(set.split(",").map((x) => x.trim().split(/\s+/)[0]).pop(), alt, p.url); // 가장 큰 후보
    }
    for (const m of html.matchAll(/background(?:-image)?\s*:\s*url\(\s*["']?([^"')]+)/gi)) add(m[1], "", p.url);
  }
  return [...out.values()].sort((a, b) => b.score - a.score).slice(0, max);
}
let tesseractOk = null, sharpMod = null;
// 결과는 넘겨받은 out에 바로 쌓는다(시간이 다 되어도 읽은 이미지 결과는 남는다). deadline이 지나면 다음 이미지를 읽지 않는다.
async function ocrImages(picked, rules, out = [], deadline = Date.now() + 150000) {
  const { execFile } = await import("node:child_process");
  const { writeFile, rm, mkdtemp } = await import("node:fs/promises");
  const { tmpdir } = await import("node:os");
  const { ocrScore, ocrSentences } = await import("../lib/ocr.mjs");
  // OMP_THREAD_LIMIT=1: tesseract가 프로세스마다 여러 스레드를 띄우면 동시 OCR끼리 서로 느려져 시간 초과로 0줄이 된다.
  const run = (args) => new Promise((ok) => execFile("tesseract", args, { timeout: 90000, maxBuffer: 4e6, env: { ...process.env, OMP_THREAD_LIMIT: "1" } }, (e, out) => ok(e ? null : String(out))));
  tesseractOk ??= (await run(["--version"])) !== null;
  if (!tesseractOk) return [];
  sharpMod ??= await import("sharp").then((m) => m.default).catch(() => false);
  const dir = await mkdtemp(join(tmpdir(), "ocr-"));
  const left = () => deadline - Date.now();
  try {
    if (process.env.CRAWL_DEBUG) console.log("  ocr candidates", picked.length, picked.slice(0, 3).map((x) => x.url).join(" "));
    for (const [n, img] of picked.entries()) {
      if (left() < 15000) break;
      const u = new URL(img.url);
      if (!robotsAllows(rules, u.pathname)) continue;
      await sleep(1000);
      try {
        const r = await fetch(img.url, { headers: { "user-agent": UA, referer: img.page }, signal: AbortSignal.timeout(20000) });
        if (!r.ok || !/image\/(png|jpe?g|webp)/i.test(r.headers.get("content-type") ?? "")) continue;
        const buf = Buffer.from(await r.arrayBuffer());
        if (buf.length < 3000 || buf.length > 8e6) continue; // 아이콘·초대형 제외(작은 표 이미지는 파일이 가벼워도 픽셀 크기로 거른다)
        const raw = join(dir, `r${n}.png`), pre = join(dir, `p${n}.png`);
        if (sharpMod) {
          const meta = await sharpMod(buf).metadata();
          if ((meta.width ?? 0) < 300 || (meta.height ?? 0) < 120) continue;
          const scale = Math.min(3, Math.max(1, 1800 / meta.width));
          await sharpMod(buf).flatten({ background: "#ffffff" }).png().toFile(raw);
          await sharpMod(buf).flatten({ background: "#ffffff" }).resize({ width: Math.round(meta.width * scale) }).grayscale().normalize().sharpen().png().toFile(pre);
        } else await writeFile(raw, buf);
        // 원본 psm6 · 전처리 psm6 · 전처리 psm4 중 요금·시간 단서가 가장 많은 결과를 쓴다.
        // 원본 결과에 요금 단서가 충분하면(점수 15↑) 전처리 판독은 건너뛴다(시간 절약).
        const texts = [await run([raw, "-", "-l", "kor+eng", "--psm", "6"])];
        if (sharpMod && !(ocrScore(texts[0] ?? "") >= 15)) for (const psm of ["6", "4"]) if (left() > 20000) texts.push(await run([pre, "-", "-l", "kor+eng", "--psm", psm]));
        texts.splice(0, texts.length, ...texts.filter(Boolean));
        const best = texts.sort((a, b) => ocrScore(b) - ocrScore(a))[0] ?? "";
        if (process.env.CRAWL_DEBUG) console.log("  ocr", img.url, "runs", texts.length, "len", best.length);
        const priceLine = /\d[\d,]*\s*(만\s*)?원/;
        for (const s of ocrSentences(best)) {
          const keep = priceLine.test(s) ? [s] : relevantSentences(s, 2);
          for (const k of keep) if (k.length >= 6 && /[가-힣]{2}/.test(k)) out.push({ text: k, url: img.page, image: img.url, ocr: true });
        }
      } catch {}
    }
  } finally { await rm(dir, { recursive: true, force: true }); }
  return out;
}

const snippetsOf = (pages) => {
  const out = [];
  for (const p of pages) for (const s of relevantSentences(p.text, 80)) if (!out.some((x) => x.text === s)) out.push({ text: s, url: p.url });
  return out.slice(0, 160);
};

async function crawlOne(c) {
  const checked_at = new Date().toISOString();
  const starts = startsOf(c);
  const uniq = [...new Map(starts.map((u) => [new URL(withProto(u)).hostname.replace(/^www\./, ""), u])).values()];
  if (!uniq.length) return { status: isClosedHost(c.homepage ?? "") ? "SERVICE_CLOSED" : "NO_OPERATOR_SITE", url: c.homepage ?? null, checked_at };
  const all = [], urls = [], errors = [], ocrQueue = [], notices = [];
  let renderedAny = false;
  for (const start of uniq) {
    const rules = await robotsFor(withProto(start)).catch(() => []);
    if (!robotsAllows(rules, new URL(withProto(start)).pathname)) { errors.push("ROBOTS_DISALLOWED"); continue; }
    let r = await staticSite(start, rules);
    let rendered = null; // 렌더링한 페이지(이미지 태그가 자바스크립트로 그려지는 사이트의 OCR용)
    const thin = r.ok && snippetsOf(r.pages).length < 3;
    const retriable = !r.ok && /^(403|429|5\d\d|timeout|UND_ERR|render)/.test(String(r.error));
    if (RENDER && (thin || retriable)) {
      const rr = await within(120000, renderSite(r.ok ? r.url : withProto(start), rules), "render").catch((e) => ({ ok: false, error: `render:${e.message}` }));
      if (process.env.CRAWL_DEBUG) console.log("  render", start, rr.ok, rr.error ?? "", rr.ok ? snippetsOf(rr.pages).length : 0);
      if (rr.ok) rendered = rr;
      if (rr.ok && snippetsOf(rr.pages).length > (r.ok ? snippetsOf(r.pages).length : 0)) { r = rr; renderedAny = true; }
    }
    if (!r.ok) { errors.push(String(r.error)); continue; }
    urls.push(...r.pages.map((p) => p.url));
    for (const s of snippetsOf(r.pages)) if (!all.some((x) => x.text === s.text)) all.push(s);
    // 공지 게시판 글 제목·링크·날짜(이용자가 원문을 바로 열 수 있게)
    for (const p of r.pages) for (const n of noticeLinks(p.html, p.url)) if (!notices.some((x) => x.url === n.url)) notices.push(n);
    // 글이 적거나, 요금 문장이 하나도 없으면(요금표가 이미지인 곳) 안내 이미지를 OCR 대기열에 올린다.
    // OCR은 크롤이 끝난 뒤 따로 읽는다 — 동시 크롤과 CPU를 다투면 사이트 시간 안에 끝나지 못해 결과가 0이 되었다(2026-10-19).
    if (OCR && (all.length < 8 || !all.some((x) => /\d[\d,]*\s*(만\s*)?원/.test(x.text)))) {
      for (const img of guideImages([...r.pages, ...(rendered?.pages ?? [])])) if (!ocrQueue.some((q) => q.url === img.url)) ocrQueue.push(img);
    }
  }
  if (!urls.length) return { status: errors.includes("ROBOTS_DISALLOWED") ? "ROBOTS_DISALLOWED" : errors.some((e) => /platform_redirect/.test(e)) ? "REDIRECTED_TO_PLATFORM" : "FETCH_FAILED", url: withProto(uniq[0]), checked_at, error: errors.join(",") || null };
  const discovered = Boolean(discoveredOf(c) && uniq.includes(discoveredOf(c))) || undefined;
  // 발굴 주소만으로 읽은 곳은 정말 이 캠핑장 운영자 사이트인지 확인한다(기사·소개 글이면 문장을 버린다).
  if (discovered && uniq.length === 1 && all.length) {
    const v = validatesAsOperatorSite(c, all);
    if (!v.ok) return { status: "DISCOVERED_NOT_OPERATOR", url: urls[0], checked_at, discovered, check: v };
  }
  return { status: all.length ? "OK" : "NO_RELEVANT_TEXT", url: urls[0], checked_at, rendered: renderedAny || undefined, discovered, pages: urls, snippets: all.slice(0, 160), ...(notices.length ? { notices: notices.slice(0, 12) } : {}), ...(ocrQueue.length ? { _ocr: ocrQueue.slice(0, 8) } : {}) };
}

const fresh = (r) => r?.checked_at && Date.now() - Date.parse(r.checked_at) < maxAgeDays * 864e5;
// 이전 실패·빈 결과·문장이 적은 곳은 --retry-failed로 다시 읽는다(ENOTFOUND도 www 유무 변형으로 살아날 수 있다).
const retryable = (r) => RETRY_FAILED && r && (r.status === "NO_RELEVANT_TEXT" || r.status === "FETCH_FAILED" || r.status === "ERROR" || (r.status === "OK" && (r.snippets?.length ?? 0) < 8));
// 시작 주소: 고캠핑 등록 홈페이지·예약 URL(운영자 호스트) + 카카오 발굴 홈페이지(등록 사이트가 없거나 지난 실행에서 죽은 곳)
function startsOf(c) {
  // 지자체·공단 예약 사이트(공공 운영자)와 자체 홈페이지 채널도 시작 주소로 쓴다(2026-10-19).
  // 여러 캠핑장이 같은 첫 화면을 쓰는 통합 포털(숲나들e·국립공원 예약)은 isOperatorHost에서 걸러진다.
  const channels = (c.booking?.channels ?? []).filter((ch) => ["public-site", "homepage"].includes(ch.platform_id)).map((ch) => ch.url);
  const own = [...new Set([c.homepage, c.booking?.url, ...channels])].filter((u) => u && isOperatorHost(u) && !isClosedHost(u));
  const dead = ["FETCH_FAILED", "SERVICE_CLOSED", "NO_OPERATOR_SITE"].includes(prev.campgrounds[c.id]?.status);
  const found = discoveredOf(c);
  return found && (!own.length || dead) ? [...own, found] : own;
}
const hasSite = (c) => startsOf(c).length > 0;
// 죽은 사이트였는데 새로 발굴된 홈페이지가 생긴 곳은 확인 주기와 무관하게 바로 읽는다.
const newlyFound = (c) => { const r = prev.campgrounds[c.id]; return Boolean(discoveredOf(c) && r && r.status !== "OK" && !r.discovered && startsOf(c).includes(discoveredOf(c))); };
const doneSince = (r) => SINCE && (r?.last_attempt?.at ?? r?.checked_at ?? "") >= SINCE;
const targets = camps.filter((c) => hasSite(c) && (!only || only.has(String(c.id))) && !doneSince(prev.campgrounds[c.id]) && (only || !fresh(prev.campgrounds[c.id]) || retryable(prev.campgrounds[c.id]) || newlyFound(c))).slice(0, limit);
console.log(`운영자 사이트 대상 ${targets.length}곳 (동시 ${concurrency}${RENDER ? " · 렌더링 폴백" : ""})`);
let done = 0;
const stat = {};
const byHost = new Map();
for (const c of targets) { const h = new URL(withProto(startsOf(c)[0])).hostname; (byHost.get(h) ?? byHost.set(h, []).get(h)).push(c); }
const hosts = [...byHost.values()];
async function worker() {
  while (hosts.length) {
    const group = hosts.shift();
    for (const c of group) {
      const r = await within(240000, crawlOne(c), "site").catch((e) => ({ status: "ERROR", error: String(e.message), checked_at: new Date().toISOString() }));
      if (process.env.CRAWL_DEBUG) console.log(c.id, r.status, r.error ?? "", r.snippets?.length ?? 0);
      // 이전에 문장을 얻었는데 이번에 실패했다면 이전 결과를 지우지 않는다(일시 장애).
      const old = prev.campgrounds[c.id];
      if (r.status !== "OK" && old?.status === "OK" && old.snippets?.length && !r._ocr) result.campgrounds[c.id] = { ...old, last_attempt: { at: r.checked_at, status: r.status, error: r.error ?? null } };
      else result.campgrounds[c.id] = { name: c.name, ...r };
      stat[r.status] = (stat[r.status] ?? 0) + 1;
      if (++done % 25 === 0) { console.log(`  ${done}/${targets.length}`, JSON.stringify(stat)); save(); }
      await sleep(800);
    }
  }
}
function save() {
  result.generated_at = new Date().toISOString();
  result.policy = "운영자 자체 홈페이지·예약 페이지만, robots.txt 준수, 봇 이름 공개, 문장(≤140자)·원문 URL·확인 시각만 저장. 플랫폼 페이지는 수집하지 않음.";
  writeFileSync(outPath, JSON.stringify(result, (k, v) => (k === "_ocr" ? undefined : v), 1));
}
await Promise.all(Array.from({ length: concurrency }, worker));
save();
// OCR 단계: 크롤이 끝난 뒤 대기열의 안내 이미지를 적은 동시성으로 읽는다(전체 --ocr-minutes, 캠핑장당 120초).
if (OCR) {
  const queue = Object.entries(result.campgrounds).filter(([, r]) => r._ocr?.length);
  const until = Date.now() + Number(arg("--ocr-minutes", 60)) * 60000;
  const ocrStat = { camps: 0, withText: 0, lines: 0 };
  console.log(`OCR 단계: ${queue.length}곳 · 이미지 ${queue.reduce((n, [, r]) => n + r._ocr.length, 0)}개`);
  // OCR로도 글을 못 얻었는데 이전에 문장이 있던 곳은 이전 결과를 지키고 시도 기록만 남긴다(워커와 같은 규칙).
  const keepOld = (id, r) => { const old = prev.campgrounds[id]; if (r.status !== "OK" && old?.status === "OK" && old.snippets?.length) result.campgrounds[id] = { ...old, last_attempt: { at: r.checked_at, status: r.status, error: null } }; };
  const ocrWorker = async () => {
    while (queue.length && Date.now() < until - 30000) {
      const [id, r] = queue.shift();
      const rules = await robotsFor(r._ocr[0].url).catch(() => []);
      const out = [];
      await within(130000, ocrImages(r._ocr, rules, out, Math.min(until, Date.now() + 120000)), "ocr").catch(() => {});
      delete r._ocr;
      ocrStat.camps++;
      const add = out.filter((s) => !(r.snippets ?? []).some((x) => x.text === s.text));
      if (add.length) {
        ocrStat.withText++; ocrStat.lines += add.length;
        r.snippets = [...(r.snippets ?? []), ...add].slice(0, 160);
        if (r.status === "NO_RELEVANT_TEXT") { r.status = "OK"; r.url ??= add[0].url; }
      }
      keepOld(id, r);
      if (ocrStat.camps % 10 === 0) { console.log("  OCR", JSON.stringify(ocrStat)); save(); }
      if (process.env.CRAWL_DEBUG) console.log("  ocr", id, add.length);
    }
  };
  await Promise.all(Array.from({ length: Number(arg("--ocr-workers", 2)) }, ocrWorker));
  for (const [id, r] of queue) { delete r._ocr; keepOld(id, r); } // 시간 안에 못 읽은 곳은 다음 실행에서
  console.log("OCR 완료", JSON.stringify(ocrStat), queue.length ? `미처리 ${queue.length}곳` : "");
  save();
}
await browser?.close();
console.log("완료", JSON.stringify(stat));
