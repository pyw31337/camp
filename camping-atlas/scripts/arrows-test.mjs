// 좌우 화살표(사진 캐러셀·라이트박스) 공통 스타일 회귀 테스트(소유자 2026-10-21): 흰 원 배경·박스 그림자 없이 꺾쇠만.
const { chromium } = await import(process.env.PW_MODULE || "playwright");
const base = (process.argv[2] || "http://127.0.0.1:8765/").replace(/#.*$/, "");
const shots = process.env.SHOTS_DIR || "";
const browser = await chromium.launch(process.env.CHROME_PATH ? { executablePath: process.env.CHROME_PATH } : {});
const fails = [];
const png = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=", "base64");
const check = (page, sel, where) => page.$$eval(sel, (bs) => bs.slice(0, 20).map((b) => { const s = getComputedStyle(b); return [s.backgroundColor, s.boxShadow]; })).then((r) => {
  if (!r.length) fails.push(`${where}: ${sel} 없음`);
  const bad = r.filter(([bg, sh]) => !/rgba\(0, 0, 0, 0\)|transparent/.test(bg) || sh !== "none");
  if (bad.length) fails.push(`${where}: ${sel} 배경/그림자 남음 ${JSON.stringify(bad[0])}`);
});
for (const [w, h, tag] of [[1366, 900, "1366"], [390, 844, "390"]]) {
  const ctx = await browser.newContext({ viewport: { width: w, height: h }, ...(w < 500 ? { isMobile: true, hasTouch: true, deviceScaleFactor: 2 } : {}) });
  const page = await ctx.newPage();
  if (process.env.STUB_MEDIA !== "0") await page.route(/\/media\//, async (r) => { const x = await r.fetch().catch(() => null); return x && x.ok() ? r.fulfill({ response: x }) : r.fulfill({ status: 200, contentType: "image/png", body: png }); });
  await page.goto(base, { waitUntil: "networkidle" });
  await page.waitForSelector(".card .car-nav", { state: "attached", timeout: 30000 });
  await check(page, ".car-nav", `${tag} 홈`);
  if (shots) { const el = await page.$(".rail .card"); await el.scrollIntoViewIfNeeded(); await el.hover(); await page.waitForTimeout(300); await el.screenshot({ path: `${shots}/arrows-card-${tag}.png` }); }
  const id = await page.$eval(".card[data-id]", (c) => c.dataset.id);
  await page.goto(`${base}#/c/${encodeURIComponent(id)}`, { waitUntil: "networkidle" });
  const cell = await page.waitForSelector(".gal-cell, [data-gal]", { timeout: 20000 }).catch(() => null);
  if (cell) { await cell.click(); await page.waitForTimeout(600); if (await page.$(".lb-nav")) { await check(page, ".lb-nav", `${tag} 사진 크게 보기`); if (shots) await page.screenshot({ path: `${shots}/arrows-lightbox-${tag}.png` }); } }
  await ctx.close();
}
await browser.close();
if (fails.length) { console.error("FAIL\n" + fails.join("\n")); process.exit(1); }
console.log("OK arrows");
