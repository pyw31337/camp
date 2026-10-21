// 카탈로그 나누기 동일성 회귀 테스트(소유자 2026-10-21): 가벼운 판(campgrounds.lite.json + catx 샤드)으로 그린 화면이
// 원본(campgrounds.json)으로 그린 화면과 글자 하나까지 같은지 본다 — 홈(지연 줄 포함)·목록·검색·조건(상품·겨울·반려견·요금·전기)·조건 창 개수·테마·지도 목록·상세 3곳·비교.
// 실행: node scripts/split-catalog.mjs && node camping-atlas/scripts/catalog-split-test.mjs [URL]
const { chromium } = await import(process.env.PW_MODULE || "playwright");
const url = (process.argv[2] || "http://127.0.0.1:8765/").replace(/#.*$/, "");
const PAGES = ["#/", "#/list", "#/list?kind=GLAMPING", "#/list?kind=HOUSE,RV", "#/list?win=1&pet=1", "#/list?fee=3to5&w=600", "#/list?q=가평", "#/list?q=숲속 전기", "#/list?sido=강원&fire=1&park=1", "#/theme/WINTER", "#/theme/FAMILY", "#/map"];
const b = await chromium.launch(process.env.CHROME_PATH ? { executablePath: process.env.CHROME_PATH } : {});
const clean = (h) => h.replace(/ (data-(drag-?init|init|h)|style)="[^"]*"/g, "").replace(/<img[^>]*>/g, (m) => m.replace(/ (loading|fetchpriority)="[^"]*"/g, ""));
async function run(useLite, ids) {
  const ctx = await b.newContext({ viewport: { width: 1366, height: 900 } }); const p = await ctx.newPage(); p.setDefaultTimeout(30000);
  const errs = []; p.on("pageerror", (e) => { if (!/_leaflet_pos/.test(e.message)) errs.push(e.message); });
  let liteHits = 0, shardHits = 0;
  await p.route(/campgrounds\.lite\.json/, (r) => (useLite ? (liteHits++, r.continue()) : r.fulfill({ status: 404, body: "" })));
  await p.route(/\/catx\//, (r) => { shardHits++; return r.continue(); });
  await p.route(/(\/media\/|supabase|gocamping\.or\.kr|kakao|daumcdn|tile|open-meteo)/, (r) => r.abort());
  await p.goto(url, { waitUntil: "domcontentloaded" }); await p.waitForSelector(".card");
  const out = {};
  if (!ids) ids = await p.evaluate(() => [...new Set([...document.querySelectorAll(".card[data-id]")].map((c) => c.dataset.id))].slice(0, 3));
  for (const h of PAGES) {
    await p.evaluate((x) => { history.pushState(null, "", x); dispatchEvent(new PopStateEvent("popstate")); }, new URL(h.replace(/^#\//, ""), url).href); await p.waitForTimeout(h === "#/map" ? 2500 : 900);
    if (h === "#/") for (let i = 0; i < 25; i++) { await p.mouse.wheel(0, 1600); await p.waitForTimeout(60); }
    out[h] = clean(await p.$eval(h === "#/map" ? ".map-panel" : "#view", (e) => e.innerHTML));
    if (h.startsWith("#/list?win")) { await p.click("[data-open-cond]"); await p.waitForTimeout(500); out[`${h} 조건창`] = clean(await p.$eval("#cond-dialog", (e) => e.innerHTML)); await p.keyboard.press("Escape"); }
  }
  if (ids.length < 3) throw new Error("카드 id를 못 찾음");
  for (const id of ids) { await p.evaluate((x) => { history.pushState(null, "", x); dispatchEvent(new PopStateEvent("popstate")); }, new URL(`place/${id}`, url).href); await p.waitForSelector(".d-title"); await p.waitForTimeout(1200); out[`상세 ${id}`] = clean(await p.$eval("#view", (e) => e.innerHTML)); }
  await p.addInitScript((x) => { localStorage.setItem("mc-saved", JSON.stringify(x)); localStorage.setItem("mc-pick", JSON.stringify(x)); }, ids);
  await p.goto(url + "compare", { waitUntil: "domcontentloaded" }); await p.reload(); await p.waitForSelector("[data-cmp-count]", { state: "attached", timeout: 15000 }).catch(async (e) => { console.error(p.url(), ids, await p.evaluate(() => [localStorage.getItem("mc-saved"), document.querySelectorAll(".card").length])); throw e; }); await p.waitForTimeout(1200);
  out["비교"] = clean(await p.$eval("#view", (e) => e.innerHTML));
  await ctx.close();
  return { out, ids, errs, liteHits, shardHits };
}
const full = await run(false);
const lite = await run(true, full.ids);
const fails = [];
if (!lite.liteHits) fails.push("가벼운 판(campgrounds.lite.json)을 받지 않음 — scripts/split-catalog.mjs 실행 필요");
if (!lite.shardHits) fails.push("상세·비교에서 원본 샤드(catx)를 받지 않음");
for (const k of Object.keys(full.out)) if (full.out[k] !== lite.out[k]) {
  const a = full.out[k], z = lite.out[k] ?? ""; let i = 0; while (a[i] === z[i]) i++;
  fails.push(`${k}: 원본과 다름 … 원본 «${a.slice(Math.max(0, i - 60), i + 60)}» / 가벼운 판 «${z.slice(Math.max(0, i - 60), i + 60)}»`);
}
if (lite.errs.length || full.errs.length) fails.push(`pageerror: ${[...full.errs, ...lite.errs].slice(0, 3).join(" | ")}`);
await b.close();
if (fails.length) { console.error("FAIL\n" + fails.join("\n")); process.exit(1); }
console.log(`OK catalog split — ${Object.keys(full.out).length}개 화면 동일 (상세 ${full.ids.join(",")})`);
