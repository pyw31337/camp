// 홈 히어로 개수 회귀 테스트(소유자 2026-10-21): 화면 숫자 == 배포된 목록 카탈로그(explore/data/campgrounds.lite.json) 개수.
// 실행: node camping-atlas/scripts/hero-count-test.mjs [URL]
const { chromium } = await import(process.env.PW_MODULE || "playwright");
const base = (process.argv[2] || "http://127.0.0.1:8765/").replace(/#.*$/, "").replace(/\/?$/, "/");
const cat = await (await fetch(`${base}explore/data/campgrounds.lite.json`)).json();
const day = cat.camps.filter((c) => c.du).length, total = cat.camps.length, stay = total - day;
const browser = await chromium.launch(process.env.CHROME_PATH ? { executablePath: process.env.CHROME_PATH } : {});
const page = await browser.newPage();
await page.goto(base, { waitUntil: "domcontentloaded" });
await page.waitForSelector("[data-hero-total]", { timeout: 30000 });
const num = (sel) => page.$eval(sel, (e) => Number(e.textContent.replace(/[^\d]/g, "")));
const got = { total: await num("[data-hero-total]"), stay: await num("[data-hero-stay]"), day: await num("[data-hero-day]") };
await browser.close();
const want = { total, stay, day };
const bad = Object.keys(want).filter((k) => got[k] !== want[k]);
if (bad.length || got.total !== got.stay + got.day) { console.error(`FAIL 히어로 개수 불일치 화면=${JSON.stringify(got)} 데이터=${JSON.stringify(want)}`); process.exit(1); }
console.log(`OK 히어로 개수 = 데이터 ${JSON.stringify(want)}`);
