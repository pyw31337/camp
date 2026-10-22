// 찜·비교 역할 회귀 테스트(2026-10-21 소유자 요청). 실행: node camping-atlas/scripts/saved-roles-test.mjs [URL]
// 찜(#/saved): 찜한 카드 목록·하트로 빼기·상세 열기, 비교로 가는 길은 위쪽 ‘비교하기’ 하나뿐, 비교 고르기 UI 없음.
// 비교(#/compare): 고르기 칩·열·찜 하트. 찜 기록(#/saves-log)의 ‘찜 목록 보기’는 #/saved로.
const { chromium } = await import(process.env.PW_MODULE || "playwright");
const base = (process.argv[2] || "http://127.0.0.1:8765/").replace(/#.*$/, "").replace(/\/?$/, "/");
const browser = await chromium.launch(process.env.CHROME_PATH ? { executablePath: process.env.CHROME_PATH } : {});
const fails = [];
const cat = await (await fetch(`${base}explore/data/campgrounds.lite.json`)).json();
const ids = cat.camps.slice(0, 7).map((c) => String(c.id));
for (const [w, h] of [[320, 740], [390, 844], [1366, 900]]) {
  const mob = w < 700, tag = String(w);
  const ctx = await browser.newContext({ viewport: { width: w, height: h }, ...(mob ? { isMobile: true, hasTouch: true } : {}) });
  const page = await ctx.newPage();
  await page.route(/supabase\.co/, (r) => r.request().method() === "GET" ? r.continue() : r.abort());
  await page.goto(base); await page.waitForSelector(".card", { timeout: 30000 });
  await page.evaluate((ids) => { for (const k of Object.keys(localStorage)) if (/mc-(saved|pick)/.test(k)) localStorage.removeItem(k); localStorage.setItem("mc-saved", JSON.stringify(ids)); localStorage.setItem("mc-pick", "[]"); }, ids);
  await page.goto(`${base}saved`); await page.reload(); await page.waitForSelector(".saved-grid .card", { timeout: 30000 });
  { // 내비 숫자: 찜 수만 표시하고 비교 수는 노출하지 않는다.
    const nb = await page.evaluate(() => { const g = (sel) => [...document.querySelectorAll(sel)].filter((b) => b.closest("a").getBoundingClientRect().width > 0).map((b) => (b.hidden ? "" : b.textContent.trim())); return { saved: g("[data-saved-count]") }; });
    if (!nb.saved.length || nb.saved.some((t) => t !== String(ids.length))) fails.push(`${tag} 메뉴: ‘찜’ 숫자 ${nb.saved} (찜 ${ids.length})`);
    await page.evaluate((p) => localStorage.setItem("mc-pick", JSON.stringify(p)), ids.slice(1, 3)); await page.reload(); await page.waitForSelector(".saved-grid .card", { timeout: 30000 });
    if (await page.$("[data-compare-count]")) fails.push(`${tag} 메뉴: 비교 숫자 뱃지가 남아 있음`);
  }
  const r = await page.evaluate(() => {
    const vis = (e) => e.getBoundingClientRect().width > 0 && getComputedStyle(e).visibility !== "hidden";
    const v = document.querySelector("#view");
    const cmpLinks = [...v.querySelectorAll('a[href$="/compare"], [data-compare-submit]')].filter(vis);
    const cmpText = [...v.querySelectorAll("a,button")].filter((e) => vis(e) && /비교/.test(e.textContent));
    return { cards: v.querySelectorAll(".saved-grid .card").length, links: cmpLinks.length, texts: cmpText.length, inHead: cmpLinks[0]?.closest(".sec-head") != null,
      picks: v.querySelectorAll("[data-pick], .saved-floating-dock, .saved-control-bar").length, hearts: v.querySelectorAll(".saved-grid .card [data-save]").length };
  });
  if (r.cards !== ids.length) fails.push(`${tag} 찜: 카드 ${r.cards}개(찜 ${ids.length})`);
  if (r.links !== 1 || r.texts !== 1) fails.push(`${tag} 찜: 비교로 가는 버튼 ${r.links}개/‘비교’ 글자 버튼 ${r.texts}개(1개여야 함)`);
  if (!r.inHead) fails.push(`${tag} 찜: ‘비교하기’가 맨 위에 없음`);
  if (r.picks) fails.push(`${tag} 찜: 비교 고르기 UI ${r.picks}개가 남음(비교 화면 역할)`);
  if (r.hearts < ids.length) fails.push(`${tag} 찜: 카드 하트(빼기) 부족 ${r.hearts}`);
  const ov = await page.evaluate(() => document.documentElement.scrollWidth - innerWidth);
  if (ov > 0) fails.push(`${tag} 찜: 가로 넘침 ${ov}px`);
  // 하트로 빼기
  const first = ids[0];
  await page.click(`.saved-grid .card [data-save="${first}"]`); await page.waitForTimeout(900);
  if (await page.$(`.saved-grid .card[data-id="${first}"]`)) fails.push(`${tag} 찜: 하트를 꺼도 목록에 남음`);
  // 상세 열기
  await page.$eval(".saved-grid .card a[href*='/place/']", (a) => a.click()); await page.waitForTimeout(800);
  if (!(await page.evaluate(() => location.pathname.includes("/place/")))) fails.push(`${tag} 찜: 카드를 눌러도 상세가 안 열림`);
  // 비교하기 → 비교 화면(미리 골라진 채)
  await page.goto(`${base}saved`); await page.waitForSelector("[data-saved-compare]");
  await page.click("[data-saved-compare]"); await page.waitForSelector(".cmp-table", { timeout: 20000 });
  const c = await page.evaluate(() => ({ hash: location.pathname, chips: document.querySelectorAll(".picks [data-pick]").length, cols: document.querySelectorAll(".cmp-table thead th:not(.corner)").length, hearts: document.querySelectorAll(".picks .heart, .cmp-table .heart").length }));
  if (!c.hash.endsWith("/compare")) fails.push(`${tag} 비교하기 → ${c.hash}`);
  if (c.chips !== ids.length - 1) fails.push(`${tag} 비교: 고르기 칩 ${c.chips}개(찜 ${ids.length - 1})`);
  if (c.cols < 2 || c.cols > 5) fails.push(`${tag} 비교: 미리 골라진 열 ${c.cols}개(2~5)`);
  if (!c.hearts) fails.push(`${tag} 비교: 찜 하트 없음`);
  await page.goto(`${base}saves-log`); await page.waitForTimeout(1500);
  if (!(await page.$('.slog-links a[href$="/saved"]')) || await page.$('.slog-links a[href$="/compare"]')) fails.push(`${tag} 찜 기록: ‘찜 목록 보기’가 #/saved로 가지 않음`);
  await ctx.close();
}
await browser.close();
if (fails.length) { console.error(`FAIL 찜·비교 역할 ${fails.length}건\n${fails.join("\n")}`); process.exit(1); }
console.log("OK 찜·비교 역할 — 찜: 목록·하트 빼기·상세, 비교 입구 1개 / 비교: 칩·열·하트");
