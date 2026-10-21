// 겨울 기능 회귀 테스트(소유자 2026-10-21): 홈 ‘겨울 캠핑’ 줄, 겨울 운영 조건, 난방 글램핑·카라반 배지, 눈·영하 예보 배지.
// 실행: node camping-atlas/scripts/winter-test.mjs [URL]  (가로 스와이프는 rail-swipe-test.mjs가 같은 줄까지 검사)
const { chromium } = await import(process.env.PW_MODULE || "playwright");
const base = (process.argv[2] || "http://127.0.0.1:8765/").replace(/#.*$/, "");
const shots = process.env.SHOTS_DIR || "";
const browser = await chromium.launch(process.env.CHROME_PATH ? { executablePath: process.env.CHROME_PATH } : {});
const fails = [];
const png = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=", "base64");
for (const [w, h, tag] of [[1366, 900, "1366"], [390, 844, "390"]]) {
  const ctx = await browser.newContext({ viewport: { width: w, height: h }, ...(w < 500 ? { isMobile: true, hasTouch: true, deviceScaleFactor: 2 } : {}) });
  const page = await ctx.newPage();
  const errs = [];
  page.on("pageerror", (e) => { if (!/_leaflet_pos/.test(e.message)) errs.push(e.message); });
  if (process.env.STUB_MEDIA !== "0") await page.route(/\/media\//, async (r) => { const x = await r.fetch().catch(() => null); return x && x.ok() ? r.fulfill({ response: x }) : r.fulfill({ status: 200, contentType: "image/png", body: png }); });
  await page.goto(base, { waitUntil: "networkidle" });
  await page.waitForSelector(".card", { timeout: 30000 });
  const cat = await page.evaluate(async () => { const r = await fetch("./explore/data/campgrounds.json"); const a = await r.json(); return Object.fromEntries(a.map((c) => [String(c.id), [c.win ?? null, c.heat ?? []]])); });
  // 1) 홈 겨울 줄: 카드가 3장 이상이고 모두 겨울 운영
  const row = await page.$('.trow[aria-label="겨울 캠핑"]');
  if (!row) fails.push(`${tag} 홈: 겨울 캠핑 줄 없음`);
  else {
    const ids = await row.$$eval(".card[data-id]", (cs) => cs.map((c) => c.dataset.id));
    if (ids.length < 3) fails.push(`${tag} 홈 겨울 줄: 카드 ${ids.length}장`);
    const bad = ids.filter((id) => cat[id]?.[0] !== 1);
    if (bad.length) fails.push(`${tag} 홈 겨울 줄: 겨울 운영 아님 ${bad.slice(0, 5)}`);
    if (shots) { await row.scrollIntoViewIfNeeded(); await page.waitForTimeout(400); await page.screenshot({ path: `${shots}/winter-home-${tag}.png` }); }
  }
  // 2) 눈·영하 예보 배지: 예보에 해당하는 곳이 있으면 카드 어딘가에 보여야
  const wx = await page.$$eval(".card [data-wx]", (b) => b.length);
  const expect = await page.evaluate(async () => { const r = await fetch("./conditions/forecast.json"); if (!r.ok) return false; const j = await r.json(); return Object.values(j.short?.grids ?? {}).some((g) => Object.entries(g).some(([d, v]) => d >= j.today && ((v[2] != null && v[2] < 0) || /눈/.test(`${v[0]} ${v[1]}`)))); });
  if (expect && !wx) fails.push(`${tag} 홈: 눈·영하 예보 배지 없음`);
  // 3) 목록 겨울 운영(확인된 곳만) → 모두 c.win=1, 조건 줄에 같은 글자 중복 허용(조건 확인 표시)
  await page.goto(`${base}list?win=1&strict=1`, { waitUntil: "networkidle" });
  await page.waitForSelector(".card", { timeout: 30000 });
  const lids = await page.$$eval(".card[data-id]", (cs) => cs.map((c) => c.dataset.id));
  const lbad = lids.filter((id) => cat[id]?.[0] !== 1);
  if (!lids.length || lbad.length) fails.push(`${tag} 목록 겨울 운영: ${lids.length}곳 중 아님 ${lbad.slice(0, 5)}`);
  const noWinter = await page.$$eval(".card .bdg-no", (b) => b.filter((x) => /동계 휴장/.test(x.textContent)).length);
  if (noWinter) fails.push(`${tag} 목록 겨울 운영: 동계 휴장 배지가 함께 보임 ${noWinter}`);
  if (shots) await page.screenshot({ path: `${shots}/winter-list-${tag}.png` });
  // 4) 난방 글램핑 상세
  const hid = Object.entries(cat).find(([, v]) => v[1].includes("g"))?.[0];
  if (hid) {
    await page.goto(`${base}place/${encodeURIComponent(hid)}`, { waitUntil: "networkidle" });
    await page.waitForSelector(".d-bdgs", { timeout: 20000 });
    const t = await page.$eval(".d-bdgs", (e) => e.textContent);
    if (!/난방 글램핑/.test(t)) fails.push(`${tag} 상세(${hid}): 난방 글램핑 배지 없음`);
    if (shots) await page.screenshot({ path: `${shots}/winter-detail-${tag}.png` });
  }
  if (errs.length) fails.push(`${tag} pageerror: ${errs.slice(0, 3).join(" | ")}`);
  await ctx.close();
}
await browser.close();
if (fails.length) { console.error("FAIL\n" + fails.join("\n")); process.exit(1); }
console.log("OK winter");
