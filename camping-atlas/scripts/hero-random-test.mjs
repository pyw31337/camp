// 홈 히어로 테마 회귀 테스트: 새로고침할 때마다 저장된 고정값 없이 10개 테마 중 다시 고른다.
// 실행: node camping-atlas/scripts/hero-random-test.mjs [URL]
const { chromium } = await import(process.env.PW_MODULE || "playwright");
const base = (process.argv[2] || "http://127.0.0.1:8765/").replace(/#.*$/, "").replace(/\/?$/, "/");
const browser = await chromium.launch(process.env.CHROME_PATH ? { executablePath: process.env.CHROME_PATH } : {});
const context = await browser.newContext();
const page = await context.newPage();
const themes = new Set();
for (let i = 0; i < 8; i++) {
  await page.goto(base, { waitUntil: "domcontentloaded" });
  await page.waitForSelector("[data-hero-section][data-hero-current-theme]", { timeout: 30000 });
  themes.add(await page.$eval("[data-hero-section]", (el) => el.dataset.heroCurrentTheme));
}
const forced = await context.newPage();
await forced.goto(`${base}?hero=rainy-camp`, { waitUntil: "domcontentloaded" });
await forced.waitForSelector("[data-hero-section][data-hero-current-theme]", { timeout: 30000 });
const forcedTheme = await forced.$eval("[data-hero-section]", (el) => el.dataset.heroCurrentTheme);
await browser.close();

if (themes.size < 2) {
  throw new Error(`새로고침 8회 동안 히어로 테마가 ${themes.size}개만 선택됨: ${[...themes].join(", ")}`);
}
if (forcedTheme !== "rainy-camp") {
  throw new Error(`?hero=rainy-camp 직통 테마가 ${forcedTheme}로 나옴`);
}
console.log(`OK 히어로 새로고침 무작위 선택: ${themes.size}개 테마 확인, 직통 테마도 유지`);
