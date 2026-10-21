// 숙박 상품 배지(글램핑·카라반·방갈로·트레일러)·필터 회귀 테스트(소유자 2026-10-21).
// 실행: node camping-atlas/scripts/stay-badges-test.mjs [URL]
// 검사: 홈·목록 카드에 배지가 보이고, 배지 글자가 같은 카드의 타입 줄에 다시 나오지 않으며(중복 금지),
//       ‘글램핑’ 타입 칩을 켜면 결과 카드가 모두 글램핑 배지를 갖고, 상세 머리·지도 칩에도 나온다. pageerror 0.
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
  // Leaflet(OSM 대체 지도)의 화면 전환 중 _leaflet_pos 경합은 배지와 무관한 라이브러리 내부 오류라 뺀다.
  page.on("pageerror", (e) => { if (!/_leaflet_pos/.test(e.message)) errs.push(e.message); });
  if (process.env.STUB_MEDIA !== "0") await page.route(/\/media\//, async (r) => { const x = await r.fetch().catch(() => null); return x && x.ok() ? r.fulfill({ response: x }) : r.fulfill({ status: 200, contentType: "image/png", body: png }); });
  const dupCheck = (where) => page.$$eval(".card", (cards) => cards.flatMap((c) => {
    const labels = [...c.querySelectorAll(".card-types [data-stay]")].map((b) => b.textContent.trim());
    const rest = c.querySelector(".card-types > span:not(.stay-bdgs)")?.textContent ?? "";
    return labels.filter((l) => rest.split(" · ").some((t) => t.replace(/\s[\d,]+$/, "") === l)).map((l) => `${c.dataset.id}:${l}`);
  })).then((d) => { if (d.length) fails.push(`${tag} ${where}: 배지와 타입 줄 중복 ${d.slice(0, 5).join(", ")}`); });
  // 1) 홈
  await page.goto(base, { waitUntil: "networkidle" });
  await page.waitForSelector(".card", { timeout: 30000 });
  if (!(await page.$(".card [data-stay]"))) fails.push(`${tag} 홈: 숙박 상품 배지 없음`);
  await dupCheck("홈");
  if (shots) { const el = await page.$(".rail .card:has(.card-types [data-stay])"); if (el) { await el.scrollIntoViewIfNeeded(); await page.waitForTimeout(400); await page.screenshot({ path: `${shots}/stay-badges-home-${tag}.png` }); } }
  // 2) 홈 ‘사이트’ 타입 칩(글램핑) → 결과 카드 전부 글램핑 배지
  const chip = await page.$('[data-stype="GLAMPING"]');
  if (!chip) fails.push(`${tag} 홈: 글램핑 타입 칩 없음`);
  else {
    await chip.scrollIntoViewIfNeeded(); await chip.click(); await page.waitForTimeout(800);
    const hr = await page.$$eval(".results .card[data-id], [data-results] .card[data-id]", (cs) => ({ n: cs.length, bad: cs.filter((c) => !c.querySelector('[data-stay="GLAMPING"]')).map((c) => c.dataset.id) })).catch(() => ({ n: 0, bad: [] }));
    if (hr.bad.length) fails.push(`${tag} 홈 칩: 배지 없는 결과 ${hr.bad.slice(0, 5).join(",")}`);
  }
  // 3) 목록 조건(상품=글램핑)
  await page.goto(`${base}list?kind=GLAMPING&strict=1`, { waitUntil: "networkidle" });
  await page.waitForSelector(".card", { timeout: 30000 });
  {
    const r = await page.$$eval(".card[data-id]", (cs) => ({ n: cs.length, bad: cs.filter((c) => !c.querySelector('[data-stay="GLAMPING"]')).map((c) => c.dataset.id) }));
    if (!r.n) fails.push(`${tag} 목록: 글램핑 칩 결과 0`);
    if (r.bad.length) fails.push(`${tag} 목록: 글램핑 칩 결과인데 배지 없음 ${r.bad.slice(0, 5).join(",")}`);
    await dupCheck("목록");
    const dupCond = await page.$$eval(".card .lrow-cond", (ps) => ps.filter((p) => /글램핑/.test(p.textContent)).length);
    if (dupCond) fails.push(`${tag} 목록: 조건 줄에 ‘글램핑’이 배지와 중복 ${dupCond}곳`);
    if (shots) await page.screenshot({ path: `${shots}/stay-badges-list-${tag}.png` });
    // 4) 상세
    const id = await page.$eval(".card[data-id]", (c) => c.dataset.id);
    await page.goto(`${base}c/${encodeURIComponent(id)}`, { waitUntil: "networkidle" });
    await page.waitForSelector(".d-bdgs", { timeout: 20000 });
    if (!(await page.$('.d-bdgs [data-stay="GLAMPING"]'))) fails.push(`${tag} 상세(${id}): 글램핑 배지 없음`);
    if (shots) await page.screenshot({ path: `${shots}/stay-badges-detail-${tag}.png` });
  }
  // 5) 지도 칩
  await page.goto(`${base}map`, { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(1500);
  for (const k of ["glamp", "caravan", "house"]) if (!(await page.$(`[data-mquick="${k}"]`))) fails.push(`${tag} 지도: ${k} 칩 없음`);
  if (errs.length) fails.push(`${tag} pageerror: ${errs.slice(0, 3).join(" | ")}`);
  await ctx.close();
}
await browser.close();
if (fails.length) { console.error("FAIL\n" + fails.join("\n")); process.exit(1); }
console.log("OK stay badges");
