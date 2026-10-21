// 운영 DB 쓰기 금지 회귀 테스트(소유자 2026-10-21): 자동 테스트가 찜·해제·한마디·운영자 제보를 해도
// Supabase에 POST/PATCH/DELETE가 한 건도 나가지 않아야 한다(읽기 RPC safe_save_log_feed 제외).
// 이 테스트 자신도 쓰기 요청은 막는다(route.abort) — 회귀가 생겨도 운영 기록은 더러워지지 않는다.
// 실행: node camping-atlas/scripts/no-prod-write-test.mjs [URL]
const { chromium } = await import(process.env.PW_MODULE || "playwright");
const base = (process.argv[2] || "http://127.0.0.1:8765/").replace(/#.*$/, "").replace(/\/?$/, "/");
const browser = await chromium.launch(process.env.CHROME_PATH ? { executablePath: process.env.CHROME_PATH } : {});
const writes = [];
for (const [w, h] of [[1366, 900], [390, 844]]) {
  const ctx = await browser.newContext({ viewport: { width: w, height: h }, ...(w < 500 ? { isMobile: true, hasTouch: true } : {}) });
  await ctx.route(/supabase\.co\//, (r) => {
    const m = r.request().method();
    if (m !== "GET" && m !== "HEAD" && m !== "OPTIONS" && !/\/rpc\/safe_save_log_feed/.test(r.request().url())) { writes.push(`${w} ${m} ${r.request().url().replace(/\?.*/, "")}`); return r.abort(); }
    return r.continue();
  });
  const page = await ctx.newPage();
  await page.goto(base, { waitUntil: "domcontentloaded" });
  await page.waitForSelector(".card [data-save]", { timeout: 30000 });
  const tap = async (sel) => { const el = await page.$(sel); if (el) { await el.scrollIntoViewIfNeeded().catch(() => {}); await el.click({ force: true }).catch(() => {}); await page.waitForTimeout(500); } };
  await tap(".card [data-save]"); await tap(".card [data-save]");
  const id = await page.$eval(".card[data-id]", (e) => e.dataset.id).catch(() => null);
  const num = await page.$$eval(".card[data-id]", (cs) => cs.map((c) => c.dataset.id).find((x) => /^\d+$/.test(x))).catch(() => null);
  await page.goto(`${base}#/c/${num ?? id}`); await page.waitForTimeout(2500);
  await tap(".d-head [data-save], [data-save]"); await tap(".d-head [data-save], [data-save]");
  const form = await page.$("form.cmt-form");
  if (form) { await page.fill("form.cmt-form [name=nickname]", "테스트").catch(() => {}); await page.fill("form.cmt-form [name=content]", "테스트(전송 안 됨)").catch(() => {}); await page.$eval("form.cmt-form", (f) => f.requestSubmit()).catch(() => {}); await page.waitForTimeout(800); }
  await page.goto(`${base}#/compare`); await page.waitForTimeout(1500); await tap(".heart.on");
  await page.goto(`${base}#/saves-log`); await page.waitForTimeout(1500);
  await ctx.close();
}
await browser.close();
if (writes.length) { console.error(`FAIL 운영 DB 쓰기 ${writes.length}건(막음)\n${writes.join("\n")}`); process.exit(1); }
console.log("OK 운영 DB 쓰기 0건 — 찜·해제·한마디·비교·찜 기록 화면");
