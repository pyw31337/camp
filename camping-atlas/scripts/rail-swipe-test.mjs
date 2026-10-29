// 홈 가로 레일(실시간 인기·곧 오픈·긍정 후기·테마 줄 등) 드래그/스와이프 회귀 테스트.
// ⚠️ 이 테스트가 실패하면 병합 금지. 레일/캐러셀 드래그 코드(.rail, .car-track, initDraggableRails, initCarousels)를
//    고친 에이전트는 반드시 로컬에서 실행: node camping-atlas/scripts/rail-swipe-test.mjs [URL]
// 검사: 1366 마우스 드래그, 390 터치 스와이프(카드 본문/썸네일), 세로 스와이프 통과, 탭하면 카드 열림, pageerror 0.
const pwPath = process.env.PW_MODULE || "playwright";
const { chromium } = await import(pwPath);
const url = process.argv[2] || "http://127.0.0.1:8765/";
const browser = await chromium.launch(process.env.CHROME_PATH ? { executablePath: process.env.CHROME_PATH } : {});
const fails = [];
const MAX_RAILS = Number(process.env.MAX_RAILS || 6);

async function setup(mode) {
  const ctx = await browser.newContext(mode === "touch"
    ? { viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true, deviceScaleFactor: 2 }
    : { viewport: { width: 1366, height: 900 } });
  const page = await ctx.newPage();
  const errs = [];
  page.on("pageerror", (e) => errs.push(e.message));
  // CI 정적 서버엔 사진(media/)이 없다. 깨진 사진은 카드에서 지워져 레일이 비므로, 없는 사진은 회색 PNG로 대신한다.
  if (process.env.STUB_MEDIA !== "0") {
    const png = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=", "base64");
    await page.route(/\/media\//, async (route) => {
      const r = await route.fetch().catch(() => null);
      if (r && r.ok()) return route.fulfill({ response: r });
      return route.fulfill({ status: 200, contentType: "image/png", body: png });
    });
  }
  await page.goto(url, { waitUntil: "domcontentloaded", timeout: 60000 });
  await page.waitForSelector(".rail .card, .rail .tr-card, .rail .review-pick", { timeout: 60000 });
  await page.waitForTimeout(800);
  const cdp = mode === "touch" ? await ctx.newCDPSession(page) : null;
  return { ctx, page, errs, cdp };
}
async function touchSwipe(page, cdp, x, y, dx, dy) {
  await cdp.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [{ x, y }] });
  for (let k = 1; k <= 12; k++) {
    await cdp.send("Input.dispatchTouchEvent", { type: "touchMove", touchPoints: [{ x: x + (dx * k) / 12, y: y + (dy * k) / 12 }] });
    await page.waitForTimeout(16);
  }
  await cdp.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
  await page.waitForTimeout(500);
}
async function mouseDrag(page, x, y, dx) {
  await page.mouse.move(x, y); await page.mouse.down();
  for (let k = 1; k <= 12; k++) await page.mouse.move(x + (dx * k) / 12, y);
  await page.mouse.up(); await page.waitForTimeout(500);
}
// 레일 안 첫 카드에서 '본문'(썸네일 아닌 곳)과 '썸네일' 좌표를 찾는다.
async function points(rail) {
  return rail.evaluate((r) => {
    const rb = r.getBoundingClientRect();
    const vis = (el) => { const b = el.getBoundingClientRect(); return b.width > 10 && b.left >= rb.left - 2 && b.left < rb.right - 40; };
    const items = [...r.children].filter(vis);
    const it = items[0] || r.children[0];
    if (!it) return null;
    const ib = it.getBoundingClientRect();
    const body = it.querySelector(".card-body, .tr-body, .rp-body, .mi-body") || null;
    const bb = body ? body.getBoundingClientRect() : null;
    const multi = it.querySelector(".car-multi .car-track");
    const thumb = multi || it.querySelector(".car, .tr-ph, img");
    const tb = thumb ? thumb.getBoundingClientRect() : null;
    const bodyPt = bb && bb.height > 8 ? { x: Math.min(bb.left + bb.width * 0.8, rb.right - 20), y: bb.top + Math.min(bb.height / 2, 30) }
      : { x: Math.min(ib.left + ib.width * 0.8, rb.right - 20), y: ib.bottom - Math.min(ib.height * 0.2, 20) };
    return { body: bodyPt, thumb: tb ? { x: Math.min(tb.left + tb.width * 0.7, rb.right - 20), y: tb.top + tb.height / 2, multi: !!multi } : null };
  });
}

for (const mode of ["mouse", "touch"]) {
  const { ctx, page, errs, cdp } = await setup(mode);
  const ids = await page.$$eval(".rail", (rs) => rs.map((r, i) => { r.dataset.rt = i; return r.scrollWidth - r.clientWidth > 40 && r.children.length > 1 && r.querySelector("a[href]") ? i : -1; }).filter((i) => i >= 0));
  if (!ids.length) fails.push(`${mode}: 스크롤 가능한 홈 레일이 없음`);
  let tested = 0, verticalDone = false;
  for (const i of ids.slice(0, MAX_RAILS)) {
    const rail = page.locator(`.rail[data-rt="${i}"]`);
    await rail.evaluate((r) => r.scrollIntoView({ block: "center" }));
    await rail.evaluate((r) => { r.scrollLeft = 0; r.querySelectorAll(".car-track").forEach((t) => (t.scrollLeft = 0)); });
    await page.waitForTimeout(200);
    const name = await rail.evaluate((r) => (r.closest("section")?.querySelector("h2,h3")?.textContent || `rail#${r.dataset.rt}`).trim().slice(0, 16));
    const p = await points(rail);
    if (!p) continue;
    tested++;
    if (process.env.DEBUG) console.log(name, JSON.stringify(p), await page.evaluate(([x, y]) => { const e = document.elementFromPoint(x, y); return e ? e.tagName + "." + e.className : "none"; }, [p.body.x, p.body.y]));
    // 1) 카드 본문에서 가로로 끌기 → 레일이 움직여야 함
    if (mode === "mouse") await mouseDrag(page, p.body.x, p.body.y, -260);
    else await touchSwipe(page, cdp, p.body.x, p.body.y, -220, 0);
    const s1 = await rail.evaluate((r) => r.scrollLeft);
    if (s1 < 30) fails.push(`${mode} ${name}: 카드 본문 가로 ${mode === "mouse" ? "드래그" : "스와이프"}로 레일이 안 움직임(scrollLeft=${s1})`);
    // 2) 썸네일에서 끌기 → 레일이나 썸네일 둘 중 하나는 반드시 움직여야 함(제스처가 먹히면 안 됨)
    if (p.thumb) {
      await rail.evaluate((r) => { r.scrollLeft = 0; r.querySelectorAll(".car-track").forEach((t) => (t.scrollLeft = 0)); });
      await page.waitForTimeout(150);
      const p2 = await points(rail);
      if (process.env.DEBUG) console.log("thumb", name, JSON.stringify(p2.thumb), await page.evaluate(([x, y]) => { const e = document.elementFromPoint(x, y); return e ? e.tagName + "." + e.className + " < " + e.parentElement?.className : "none"; }, [p2.thumb.x, p2.thumb.y]));
      if (mode === "mouse") await mouseDrag(page, p2.thumb.x, p2.thumb.y, -200);
      else await touchSwipe(page, cdp, p2.thumb.x, p2.thumb.y, -200, 0);
      // 사진이 여러 장(넘길 사진이 있는 트랙)이면 썸네일이 넘어가도 되고, 한 장이면 레일이 넘어가야 한다.
      // (카드 사진은 hover/터치 때 여러 장으로 채워질 수 있어서 제스처 뒤에 다시 판단)
      const r2 = await rail.evaluate((r) => {
        const tracks = [...r.querySelectorAll(".car-track")];
        return { rail: r.scrollLeft, track: Math.max(0, ...tracks.map((t) => t.scrollLeft)), multi: tracks.some((t) => t.scrollWidth - t.clientWidth > 20) };
      });
      const moved = r2.rail + (r2.multi ? r2.track : 0);
      if (moved < 30) fails.push(`${mode} ${name}: 썸네일(${r2.multi ? "여러 장" : "한 장"}) 위 가로 제스처가 ${r2.multi ? "아무것도" : "레일을"} 안 움직임`);
    }
    // 3) 세로 스와이프는 페이지를 내려야 함(레일이 막으면 안 됨)
    if (mode === "touch" && !verticalDone) {
      verticalDone = true;
      const p3 = await points(rail);
      const y0 = await page.evaluate(() => window.scrollY);
      await touchSwipe(page, cdp, p3.body.x, p3.body.y, 0, -250);
      const y1 = await page.evaluate(() => window.scrollY);
      if (y1 - y0 < 50) fails.push(`touch ${name}: 레일 위 세로 스와이프가 막힘(scrollY ${y0}→${y1})`);
    }
    console.log(`${mode} ok? ${name} scrollLeft=${s1}`);
  }
  // 4) 끌지 않고 누르면 카드가 열려야 함
  {
    const first = page.locator(`.rail[data-rt="${ids[0]}"]`);
    await first.evaluate((r) => r.scrollIntoView({ block: "center" }));
    await first.evaluate((r) => (r.scrollLeft = 0));
    await page.waitForTimeout(300);
    const p4 = await points(first);
    const h0 = await page.evaluate(() => location.pathname);
    if (mode === "touch") await page.touchscreen.tap(p4.body.x, p4.body.y); else await page.mouse.click(p4.body.x, p4.body.y);
    await page.waitForTimeout(800);
    const h1 = await page.evaluate(() => location.pathname);
    if (h1 === h0) fails.push(`${mode}: 레일 카드를 눌러도 열리지 않음`);
  }
  if (tested < Math.min(3, ids.length)) fails.push(`${mode}: 레일 테스트 수 부족(${tested})`);
  if (errs.length) fails.push(`${mode}: pageerror ${[...new Set(errs)].join(" | ")}`);
  await ctx.close();
}
await browser.close();
if (fails.length) { console.error("RAIL SWIPE TEST FAILED\n- " + fails.join("\n- ")); process.exit(1); }
console.log("RAIL SWIPE TEST PASSED");
