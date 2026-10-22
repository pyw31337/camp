// 찜 비교 화면 회귀 테스트(소유자 2026-10-21): 제목·설명, 칩·열 머리의 채운 하트로 찜 해제(저장소·숫자·칩·열·내비 배지 갱신),
// ×는 비교에서만 빼고 찜은 유지, 되돌리기 토스트, 찜 0곳 빈 화면. 실행: node camping-atlas/scripts/compare-fav-test.mjs [URL]
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
  const saved = () => page.evaluate(() => { for (let i = 0; i < localStorage.length; i++) { const k = localStorage.key(i); if (/mc-saved/.test(k)) return JSON.parse(localStorage.getItem(k)); } return []; });
  await page.goto(`${base}compare`, { waitUntil: "networkidle" });
  await page.waitForSelector("[data-sample], .cmp-table", { timeout: 30000 });
  // 빈 화면
  if (!(await page.$("[data-cmp-empty]"))) fails.push(`${tag}: 찜 0곳 빈 화면 없음`);
  if (!/찜한 캠핑장/.test(await page.$eval(".cmp-page h1", (e) => e.textContent))) fails.push(`${tag}: 제목에 ‘찜한 캠핑장’ 없음`);
  await page.click("[data-sample]"); await page.waitForSelector(".cmp-table");
  const s0 = await saved();
  if (s0.length < 4) fails.push(`${tag}: 예시 찜 ${s0.length}곳`);
  if (shots) await page.screenshot({ path: `${shots}/compare-${tag}.png` });
  const cols0 = await page.$$eval(".cmp-table thead th:not(.corner)", (t) => t.length);
  // × = 비교에서만 빼기
  await page.click(".cmp-table thead .ch-x"); await page.waitForTimeout(300);
  const s1 = await saved(), cols1 = await page.$$eval(".cmp-table thead th:not(.corner)", (t) => t.length);
  if (s1.length !== s0.length) fails.push(`${tag}: ×가 찜까지 지움`);
  if (cols1 !== cols0 - 1) fails.push(`${tag}: ×로 열이 안 빠짐 ${cols0}→${cols1}`);
  // 표 열 머리에는 하트를 두지 않는다(소유자 2026-10-22: 표에서는 × 빼기만). 찜 해제는 위 칩 하트로.
  if (await page.$(".cmp-table thead .heart")) fails.push(`${tag}: 표 열 머리에 찜 하트가 남음`);
  const hid = await page.$eval(".picks .pick-wrap.on .heart.on", (b) => b.dataset.save);
  await page.click(`.picks .heart[data-save="${hid}"]`); await page.waitForTimeout(300);
  const s2 = await saved();
  if (s2.includes(hid) || s2.length !== s0.length - 1) fails.push(`${tag}: 칩 하트로(비교 중인 곳) 찜 해제 안 됨`);
  if (await page.$(`.cmp-table [data-save="${hid}"], .picks [data-save="${hid}"]`)) fails.push(`${tag}: 해제한 곳이 칩·열에 남음`);
  // 내비 숫자: 찜 수만 표시한다. 비교 선택 수는 화면 안에서만 확인한다.
  const badge = await page.$eval("[data-saved-count]", (e) => e.textContent.trim()).catch(() => "");
  if (badge !== String(s2.length)) fails.push(`${tag}: ‘찜’ 내비 숫자 ${badge} ≠ ${s2.length}`);
  const cols2 = await page.$$eval(".cmp-table thead th:not(.corner)", (t) => t.length);
  if (await page.$("[data-compare-count]")) fails.push(`${tag}: ‘비교’ 내비 숫자 뱃지가 남아 있음`);
  if (!new RegExp(`찜\\s*${s2.length}\\s*곳`).test(await page.$eval("[data-cmp-count]", (e) => e.textContent))) fails.push(`${tag}: 설명 숫자 미갱신`);
  // 되돌리기
  const undo = await page.$("#toast [data-undo]");
  if (!undo) fails.push(`${tag}: 되돌리기 토스트 없음`);
  else {
    if (shots) await page.screenshot({ path: `${shots}/compare-undo-${tag}.png` });
    await undo.click(); await page.waitForTimeout(300);
    if (!(await saved()).includes(hid)) fails.push(`${tag}: 되돌리기 후 찜 복구 안 됨`);
  }
  // 칩 하트 = 찜 해제
  const cid = await page.$eval(".picks .heart.on", (b) => b.dataset.save);
  await page.click(`.picks .heart[data-save="${cid}"]`); await page.waitForTimeout(300);
  if ((await saved()).includes(cid) || (await page.$(`.picks [data-pick="${cid}"]`))) fails.push(`${tag}: 칩 하트로 찜 해제 안 됨`);
  if (errs.length) fails.push(`${tag} pageerror: ${errs.slice(0, 3).join(" | ")}`);
  await ctx.close();
}
await browser.close();
if (fails.length) { console.error("FAIL\n" + fails.join("\n")); process.exit(1); }
console.log("OK compare favorites");
