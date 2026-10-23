#!/usr/bin/env node
// 예약 링크 정밀 검수 → registry/booking-verify.json (lib/booking-verify.mjs 판정)
// 화면의 예약 버튼·예약처 목록에 나오는 주소(예약 채널·등록 예약 주소·홈페이지·땡큐캠핑 연결)를 업장별로 열어,
// 그 페이지가 정말 이 업장 예약 페이지인지 본다. 404만 보는 check-links.mjs와 짝.
// - robots.txt 준수·봇 이름 공개·호스트별 1초 간격. 자동 확인을 막은 플랫폼(네이버·카카오·캠핏 등)은 열지 않는다.
// - 글이 거의 없는(스크립트로 그리는) 페이지는 Playwright로 그려서 다시 읽는다(있을 때만).
// 사용: node scripts/verify-booking-links.mjs [--max-age-days 14] [--limit N] [--only id,id] [--no-render]
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { isPlatformRoot, judgePage, nameIndex, signalsOf } from "../lib/booking-verify.mjs";
import { noCheck } from "../lib/link-check.mjs";
import { parseRobots, robotsAllows } from "../lib/operator-site.mjs";

const root = resolve(fileURLToPath(import.meta.url), "../../..");
const camps = JSON.parse(readFileSync(join(root, "camping-atlas/public/explore/data/campgrounds.json"), "utf8"));
const outPath = join(root, "pipeline/registry/booking-verify.json");
const read = (p, d) => (existsSync(p) ? JSON.parse(readFileSync(p, "utf8")) : d);
const health = read(join(root, "pipeline/registry/link-health.json"), { urls: {} }).urls ?? {};
const naver = read(join(root, "pipeline/registry/naver-places.json"), { campgrounds: {} }).campgrounds ?? {};
const kakao = read(join(root, "pipeline/registry/kakao-places.json"), { campgrounds: {} }).campgrounds ?? {};
const arg = (k, d) => { const i = process.argv.indexOf(k); return i > 0 ? process.argv[i + 1] : d; };
const maxAge = Number(arg("--max-age-days", 14)) * 864e5;
const limit = Number(arg("--limit", 0)) || Infinity;
const only = arg("--only", "") ? new Set(arg("--only", "").split(",")) : null;
const RENDER = !process.argv.includes("--no-render");
const UA = "MoyeoraCampBot/1.0 (+https://github.com/pyw31337/camp; booking link check)";
const THANKQ_VIEW = (cseq) => `https://m.thankqcamping.com/resv/view.hbb?cseq=${encodeURIComponent(cseq)}`;

const prev = read(outPath, { pairs: {} });
const pairs = { ...(prev.pairs ?? {}) };
const index = nameIndex(camps);
// 사이트(호스트)별로 그 사이트를 쓰는 업장 — 같은 운영자·같은 예약 엔진 첫 화면은 ‘다른 업장’으로 보지 않는다
const hostOf = (u) => { try { return new URL(u).hostname.replace(/^(www|m)\./, ""); } catch { return ""; } };
const idsByHost = new Map();
for (const c of camps) for (const u of [c.homepage, c.booking?.url, ...(c.booking?.channels ?? []).map((x) => x.url)]) { const h = hostOf(u); if (h) (idsByHost.get(h) ?? idsByHost.set(h, new Set()).get(h)).add(String(c.id)); }

// 화면에 보이는 (업장, 주소) 쌍 — app.js bookingChannels·getAllBookingChannels와 같은 출처
const want = new Map();
for (const c of camps) {
  if (only && !only.has(String(c.id))) continue;
  const add = (u, kind) => { if (/^https?:\/\//i.test(u ?? "")) want.set(`${c.id}|${u}`, { c, u, kind }); };
  for (const ch of c.booking?.channels ?? []) if (ch.kind === "online" || ch.kind === "homepage") add(ch.url, ch.platform_id ?? ch.kind);
  add(c.booking?.url, "booking.url"); add(c.homepage, "homepage");
  if (c.tq?.s && !(c.booking?.channels ?? []).some((x) => /thankqcamping|camperstory/.test(x?.url ?? ""))) add(THANKQ_VIEW(c.tq.s), "thankq");
}
const now = Date.now();
const todo = [];
for (const [k, x] of want) {
  if (isPlatformRoot(x.u)) { pairs[k] = { v: "PLATFORM_ROOT", why: "예약 플랫폼 첫 화면(업장 페이지 아님)", kind: x.kind, at: new Date().toISOString() }; continue; }
  if (noCheck(x.u)) { pairs[k] = { v: "UNVERIFIED", why: "자동 확인 차단 플랫폼", at: pairs[k]?.at ?? null }; continue; }
  if (health[x.u]?.s === "DEAD") { pairs[k] = { v: "DEAD", why: health[x.u].why, at: health[x.u].at }; continue; }
  const p = pairs[k];
  if (p?.at && now - Date.parse(p.at) < maxAge && !["THIN", "ERROR", "LEFT_SITE", undefined].includes(p.v)) continue;
  todo.push(k);
}
if (!only) for (const k of Object.keys(pairs)) if (!want.has(k)) delete pairs[k];
console.log(`예약 링크 쌍 ${want.size}개 · 확인 대상 ${Math.min(todo.length, limit)}개`);

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const strip = (h) => h.replace(/<(script|style|noscript)[\s\S]*?<\/\1>/gi, " ").replace(/<[^>]+>/g, " ").replace(/&nbsp;|&#160;/g, " ").replace(/&amp;/g, "&").replace(/\s+/g, " ").trim();
async function get(url) {
  try {
    const r = await fetch(url, { headers: { "user-agent": UA, accept: "text/html,*/*;q=0.5", "accept-language": "ko" }, redirect: "follow", signal: AbortSignal.timeout(15000) });
    const ctype = r.headers.get("content-type") ?? "";
    if (!/html|text/.test(ctype)) { r.body?.cancel?.(); return { status: r.status, final: r.url, html: "" }; }
    const buf = Buffer.from(await r.arrayBuffer()).subarray(0, 400000);
    let html = buf.toString("utf8");
    if (/euc-kr|ks_c_5601/i.test(ctype) || /charset=["']?(euc-kr|ks_c_5601)/i.test(html.slice(0, 3000))) html = new TextDecoder("euc-kr").decode(buf);
    return { status: r.status, final: r.url, html };
  } catch (e) { return { error: e.name === "TimeoutError" ? "timeout" : String(e.cause?.code ?? e.message) }; }
}
const robots = new Map();
async function allowed(u) {
  const x = new URL(u);
  if (!robots.has(x.origin)) { const r = await get(`${x.origin}/robots.txt`); robots.set(x.origin, r.status === 200 && !/<html/i.test(r.html) ? parseRobots(r.html) : []); }
  return robotsAllows(robots.get(x.origin), x.pathname + x.search);
}
let browserP = null;
async function render(url) {
  browserP ??= import("playwright").then(({ chromium }) => chromium.launch()).catch(() => null);
  const b = await browserP; if (!b) return null;
  const ctx = await b.newContext({ userAgent: UA, locale: "ko-KR" });
  try {
    const p = await ctx.newPage();
    await p.goto(url, { waitUntil: "load", timeout: 25000 });
    await p.waitForLoadState("networkidle", { timeout: 8000 }).catch(() => {});
    await p.waitForTimeout(1500); // 프레임 안 예약 엔진이 늦게 그린다(캠퍼스토리 main.hbb)
    // 프레임(옛 예약 엔진은 iframe 안에 그린다)까지 글을 모은다
    const texts = [];
    for (const f of p.frames()) texts.push(await f.evaluate(() => document.body?.innerText ?? "").catch(() => ""));
    return { title: await p.title().catch(() => ""), text: texts.join(" ").replace(/\s+/g, " "), final: p.url() };
  } catch { return null; } finally { await ctx.close().catch(() => {}); }
}

async function check(k, url = null, depth = 0) {
  const { c } = want.get(k);
  const u = url ?? want.get(k).u;
  if (!(await allowed(u).catch(() => true))) return { v: "UNVERIFIED", why: "robots.txt 차단" };
  const r = await get(u);
  if (r.error) return { v: "ERROR", why: r.error.slice(0, 60) };
  if (r.status >= 400) return { v: r.status === 404 || r.status === 410 ? "DEAD" : "ERROR", why: `HTTP ${r.status}` };
  let page = { url: u, final: r.final, title: (r.html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1] ?? "").trim(), text: strip(r.html).slice(0, 60000) };
  const n = naver[c.id]?.place, kk = kakao[c.id]?.place;
  const sig = signalsOf(c, [n?.name, kk?.name], [n?.phone, kk?.phone]);
  const sameSiteIds = idsByHost.get(hostOf(u));
  let res = judgePage({ camp: c, sig, page, index, sameSiteIds });
  // 스크립트로 그리는 화면·프레임 화면은 그려서 다시 본다(이름을 못 찾았을 때만)
  if (RENDER && !["MATCH", "PARKED", "GEO_BLOCK", "PORTAL", "CLOSED", "HIJACKED", "MOVED"].includes(res.v) && (await allowed(r.final).catch(() => true))) {
    const rp = await render(u);
    if (rp) { page = { url: u, final: rp.final, title: rp.title || page.title, text: rp.text.slice(0, 60000), rendered: true }; res = judgePage({ camp: c, sig, page, index, sameSiteIds }); }
  }
  const out = { ...res, title: page.title.slice(0, 80) || undefined, final: page.final !== u ? page.final : undefined, rendered: page.rendered || undefined };
  // 주소 변경 안내면 새 주소를 한 번 더 열어 이 업장인지 본다(then: 새 주소 판정)
  if (res.v === "MOVED" && res.to && depth < 1 && /^https?:\/\//.test(res.to)) out.then = (await check(k, res.to, depth + 1)).v;
  return out;
}

const byHost = new Map();
for (const k of todo.slice(0, limit)) { const h = new URL(want.get(k).u).hostname; (byHost.get(h) ?? byHost.set(h, []).get(h)).push(k); }
const hosts = [...byHost.values()];
const stat = {};
let done = 0;
const save = () => writeFileSync(outPath, `${JSON.stringify({ updated_at: new Date().toISOString(), policy: "robots.txt 준수·봇 이름 공개·호스트별 1초 간격. 자동 확인이 막힌 플랫폼은 열지 않음(UNVERIFIED). 판정: lib/booking-verify.mjs", pairs }, null, 1)}\n`);
async function worker() {
  while (hosts.length) {
    for (const k of hosts.shift()) {
      const r = await check(k).catch((e) => ({ v: "ERROR", why: String(e.message).slice(0, 60) }));
      pairs[k] = { ...r, kind: want.get(k).kind, at: new Date().toISOString() };
      stat[r.v] = (stat[r.v] ?? 0) + 1;
      if (++done % 100 === 0) { console.log(`  ${done}`, JSON.stringify(stat)); save(); }
      await sleep(1000);
    }
  }
}
await Promise.all(Array.from({ length: 8 }, worker));
save();
(await browserP)?.close?.();
const all = Object.values(pairs).reduce((a, x) => ((a[x.v] = (a[x.v] ?? 0) + 1), a), {});
console.log("이번 확인", JSON.stringify(stat), "· 전체", JSON.stringify(all));
