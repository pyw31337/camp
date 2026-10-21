// UX 2차 회귀 테스트(소유자 2026-10-21 승인 ux-proposals #1·#2·#3·#8·#11·#13).
// 실행: node camping-atlas/scripts/ux2-test.mjs [URL]
// 1) ‘어디로’ 칸 아무 곳이나 탭 → 입력칸 포커스, 모바일 입력 글자 ≥16px
// 2) 카드 정보 3줄(.rows-3 li 3개), 카드 안 ‘…’ 잘림 0(320px), 사진 배지로 보인 전기 W를 줄에서 반복하지 않음
// 3) 모바일 목록: 칩 줄 숨김 + 보이는 ‘조건’ 버튼 1개 → 조건 시트, 고른 요금·사이트는 지울 수 있는 알약 / PC는 칩 줄 그대로
// 4) 상세 바로가기 막대: 스크롤 뒤 화면 위에 붙고(top 0), 지금 읽는 칸 표시가 따라온다, 탭하면 그 칸이 막대 아래에 온다
// 5) guide/ → 홈, openings/ → 곧 오픈 목록, vision/ → 홈(옛 시안 공개 중단)
const { chromium } = await import(process.env.PW_MODULE || "playwright");
const base = (process.argv[2] || "http://127.0.0.1:8765/").replace(/#.*$/, "").replace(/\/?$/, "/");
const browser = await chromium.launch(process.env.CHROME_PATH ? { executablePath: process.env.CHROME_PATH } : {});
const fails = [];
const png = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=", "base64");
const cat = await (await fetch(`${base}explore/data/campgrounds.lite.json`)).json();
const detailId = cat.camps.find((c) => String(c.id) === "483")?.id ?? cat.camps.find((c) => !c.du)?.id;
for (const [w, h] of [[320, 740], [390, 844], [1366, 900]]) {
  const mob = w < 700, tag = String(w);
  const ctx = await browser.newContext({ viewport: { width: w, height: h }, ...(mob ? { isMobile: true, hasTouch: true, deviceScaleFactor: 2 } : {}) });
  const page = await ctx.newPage();
  const errs = []; page.on("pageerror", (e) => { if (!/_leaflet_pos/.test(e.message)) errs.push(e.message); });
  await page.route(/\/media\//, async (r) => { const x = await r.fetch().catch(() => null); return x && x.ok() ? r.fulfill({ response: x }) : r.fulfill({ status: 200, contentType: "image/png", body: png }); });
  // 1) 히어로 ‘어디로’
  await page.goto(base, { waitUntil: "domcontentloaded" });
  await page.waitForSelector(".hero .finder-destination", { timeout: 30000 });
  await page.waitForSelector(".card", { timeout: 30000 });
  const fd = await page.$(".hero .finder-destination"); const bb = await fd.boundingBox();
  if (mob) await page.touchscreen.tap(bb.x + bb.width - 6, bb.y + 6); else await page.mouse.click(bb.x + bb.width - 6, bb.y + 6);
  const focus = await page.evaluate(() => ({ ok: document.activeElement?.matches(".hero .finder-destination input") ?? false, fs: parseFloat(getComputedStyle(document.querySelector(".hero .finder-destination input")).fontSize) }));
  if (!focus.ok) fails.push(`${tag} 히어로: ‘어디로’ 칸 모서리 탭 → 입력칸 포커스 안 됨`);
  if (mob && focus.fs < 16) fails.push(`${tag} 히어로: 입력 글자 ${focus.fs}px < 16px(아이폰 확대)`);
  await page.evaluate(() => document.activeElement?.blur());
  // 2) 카드 3줄·잘림·중복
  const cardCheck = async (where) => {
    const r = await page.$$eval(".card[data-id]", (cards) => cards.slice(0, 24).map((c) => {
      const rows = c.querySelectorAll(".rows-3 > li").length;
      const cut = [...c.querySelectorAll(".card-body *")].filter((e) => { const s = getComputedStyle(e); return s.textOverflow === "ellipsis" && e.scrollWidth > e.clientWidth + 1 && e.getBoundingClientRect().width > 0; }).map((e) => e.className || e.tagName);
      const volt = c.querySelector(".bdgs .bdg-volt"); const fac = c.querySelector(".r-fac .rv")?.textContent ?? "";
      return { id: c.dataset.id, rows, cut, dupW: Boolean(volt && /\d+\s*W/.test(fac)), hasRows: Boolean(c.querySelector(".rows")) };
    }));
    for (const x of r) {
      if (x.hasRows && x.rows !== 3) fails.push(`${tag} ${where} #${x.id}: 카드 정보 줄 ${x.rows}개(3줄이어야 함)`);
      if (w === 320 && x.cut.length) fails.push(`${tag} ${where} #${x.id}: ‘…’ 잘림 ${x.cut.slice(0, 3).join(", ")}`);
      if (x.dupW) fails.push(`${tag} ${where} #${x.id}: 사진 배지의 전기 W를 시설 줄에서 반복`);
    }
    if (!r.length) fails.push(`${tag} ${where}: 카드 없음`);
  };
  await cardCheck("홈");
  // 3) 목록 조건
  await page.goto(`${base}#/list?fee=3to5&stype=DECK`); await page.waitForTimeout(2500);
  await page.waitForSelector(".lrows .card", { timeout: 30000 });
  await cardCheck("목록");
  const lst = await page.evaluate(() => {
    const vis = (e) => e && getComputedStyle(e).display !== "none" && e.getBoundingClientRect().width > 0;
    return { filters: vis(document.querySelector(".list-page .list-filters")), cond: [...document.querySelectorAll(".list-page [data-open-cond]")].filter(vis).length, pills: [...document.querySelectorAll(".list-page .cond-pill.m-only")].filter(vis).map((e) => e.textContent.replace("×", "").trim()) };
  });
  if (mob) {
    if (lst.filters) fails.push(`${tag} 목록: 모바일에서 칩 줄이 펼쳐져 있음`);
    if (lst.cond !== 1) fails.push(`${tag} 목록: 보이는 ‘조건’ 버튼 ${lst.cond}개(1개여야 함)`);
    if (!lst.pills.includes("3~5만원") || !lst.pills.includes("데크")) fails.push(`${tag} 목록: 고른 요금·사이트 알약 없음 (${lst.pills.join(",")})`);
    await page.click(".list-tools [data-open-cond]"); await page.waitForTimeout(500);
    if (!(await page.evaluate(() => document.querySelector("#cond-dialog")?.open))) fails.push(`${tag} 목록: ‘조건’ → 조건 시트가 안 열림`);
    await page.keyboard.press("Escape");
    await page.click('.list-page .cond-pill[data-cond-x="feeBand"]'); await page.waitForTimeout(1200);
    if (/fee=/.test(await page.evaluate(() => location.hash))) fails.push(`${tag} 목록: 요금 알약 × 로 지워지지 않음`);
  } else {
    if (!lst.filters) fails.push(`${tag} 목록: PC 칩 줄이 사라짐`);
    if (lst.pills.length) fails.push(`${tag} 목록: PC에 알약이 칩 줄과 중복`);
  }
  // 4) 상세 바로가기
  await page.goto(`${base}#/c/${detailId}`); await page.waitForSelector(".d-jump-bar", { timeout: 30000 }); await page.waitForTimeout(2500);
  await page.evaluate(() => scrollTo(0, document.getElementById("sec-rules")?.getBoundingClientRect().top + scrollY - 40)); await page.waitForTimeout(700);
  const j1 = await page.evaluate(() => ({ top: Math.round(document.querySelector(".d-jump-bar").getBoundingClientRect().top), cur: document.querySelector(".d-jump-bar [aria-current]")?.dataset.jump }));
  if (j1.top > 1) fails.push(`${tag} 상세: 바로가기 막대가 위에 붙지 않음(top ${j1.top})`);
  if (j1.cur === "sec-price") fails.push(`${tag} 상세: 스크롤해도 지금 칸 표시가 ‘요금’에 멈춤`);
  const nb = await page.$('.d-jump-bar [data-jump="sec-nearby"]:not([hidden])');
  if (nb) {
    await nb.click(); await page.waitForTimeout(1500);
    const j2 = await page.evaluate(() => ({ cur: document.querySelector(".d-jump-bar [aria-current]")?.dataset.jump, gap: Math.round(document.getElementById("sec-nearby").getBoundingClientRect().top - document.querySelector(".d-jump-bar").getBoundingClientRect().bottom) }));
    if (j2.cur !== "sec-nearby") fails.push(`${tag} 상세: ‘주변’ 탭 뒤 표시 ${j2.cur}`);
    if (j2.gap < -2 || j2.gap > 40) fails.push(`${tag} 상세: ‘주변’ 칸이 막대 아래 ${j2.gap}px에 멈춤(0~40)`);
  }
  if (errs.length) fails.push(`${tag} pageerror: ${errs.slice(0, 3).join(" | ")}`);
  await ctx.close();
}
// 5) 정리한 주소
{
  const page = await browser.newPage();
  for (const [path, want] of [["guide/", /#\/$/], ["openings/", /#\/theme\/OPEN$/], ["vision/", /#\/$/]]) {
    await page.goto(base + path); await page.waitForTimeout(1500);
    const u = page.url();
    if (!want.test(u)) fails.push(`${path}: ${u} 로 감(기대 ${want})`);
  }
  await page.close();
}
await browser.close();
if (fails.length) { console.error(`FAIL UX2 ${fails.length}건\n${fails.join("\n")}`); process.exit(1); }
console.log("OK UX2 — 히어로 입력·카드 3줄·목록 조건 시트·상세 바로가기·정리한 주소");
