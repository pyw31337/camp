// 성능 예산(소유자 2026-10-21 “빠르고 쾌적하게”) — 넘으면 CI 실패.
// 1) 크기: app.js·style.css(원본), 첫 화면 데이터(campgrounds.lite·photos·forecast, gzip 추정) 상한.
// 2) 홈: DOM 노드·첫 화면 원격 원본 사진(고캠핑 11MB급 원본) 수, 카드 표시 시간, 아래로 내리면 늦게 채우는 테마 줄이 모두 채워지는지.
// 실행: node camping-atlas/scripts/perf-budget.mjs [URL]
import { readFileSync, statSync } from "node:fs";
import { gzipSync } from "node:zlib";
import { fileURLToPath } from "node:url";
const root = fileURLToPath(new URL("../../", import.meta.url));
const fails = [];
const KB = (n) => Math.round(n / 1024);
// 2026-10-31: 오늘의 캠핑장 덱·출발지 이동시간·예약 오픈 알림·익명 지표·내리기 요청(소유자 요청 7가지)으로 app.js·css 예산을 각각 +40KB·+20KB 올렸다.
const BUDGET = { appJs: 600, css: 280, dataGz: 2600, nodes: 12000, cardsMs: 8000, origImgs: 0 };
const app = statSync(`${root}design/renewal/app.js`).size, css = statSync(`${root}design/renewal/style.css`).size;
import { existsSync } from "node:fs";
const liteP = existsSync(`${root}camping-atlas/public/explore/data/campgrounds.lite.json`) ? "camping-atlas/public/explore/data/campgrounds.lite.json" : null;
if (!liteP) fails.push("campgrounds.lite.json 없음(node scripts/split-catalog.mjs 먼저)");
const dataGz = [liteP ?? "camping-atlas/public/explore/data/campgrounds.json", "camping-atlas/public/explore/data/photos.json", "camping-atlas/public/conditions/forecast.json"].reduce((a, f) => a + gzipSync(readFileSync(`${root}${f}`), { level: 6 }).length, 0);
console.log(`app.js ${KB(app)}KB · style.css ${KB(css)}KB · 첫 데이터 gzip ${KB(dataGz)}KB`);
if (KB(app) > BUDGET.appJs) fails.push(`app.js ${KB(app)}KB > ${BUDGET.appJs}KB`);
if (KB(css) > BUDGET.css) fails.push(`style.css ${KB(css)}KB > ${BUDGET.css}KB`);
if (KB(dataGz) > BUDGET.dataGz) fails.push(`첫 화면 데이터 gzip ${KB(dataGz)}KB > ${BUDGET.dataGz}KB`);
const url = process.argv[2];
if (url) {
  const { chromium } = await import(process.env.PW_MODULE || "playwright");
  const b = await chromium.launch(process.env.CHROME_PATH ? { executablePath: process.env.CHROME_PATH } : {});
  const p = await b.newPage({ viewport: { width: 1366, height: 900 } });
  const orig = [];
  // 원격 사진은 받지 않고(주소만 기록) 회색 PNG로 대신한다 — CI가 외부 호스트에 기대지 않게.
  const png = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=", "base64");
  await p.route(/gocamping\.or\.kr\/upload\//, (r) => { if (!/\/thumb\//.test(r.request().url())) orig.push(r.request().url()); return r.fulfill({ status: 200, contentType: "image/png", body: png }); });
  await p.route(/\/media\//, async (r) => { const x = await r.fetch().catch(() => null); return x && x.ok() ? r.fulfill({ response: x }) : r.fulfill({ status: 200, contentType: "image/png", body: png }); });
  const t0 = Date.now();
  await p.goto(url, { waitUntil: "domcontentloaded" });
  await p.waitForSelector(".rail .card", { timeout: 30000 });
  const cardsMs = Date.now() - t0;
  await p.waitForLoadState("networkidle").catch(() => {});
  const nodes = await p.evaluate(() => document.getElementsByTagName("*").length);
  console.log(`홈 카드 ${cardsMs}ms · DOM ${nodes} · 고캠핑 원본 사진 ${orig.length}장`);
  if (nodes > BUDGET.nodes) fails.push(`홈 DOM ${nodes} > ${BUDGET.nodes}`);
  if (cardsMs > BUDGET.cardsMs) fails.push(`홈 카드 표시 ${cardsMs}ms > ${BUDGET.cardsMs}ms`);
  if (orig.length > BUDGET.origImgs) fails.push(`첫 화면에서 고캠핑 원본 사진 ${orig.length}장(썸네일 대신): ${orig.slice(0, 2).join(", ")}`);
  // 메인은 테마 줄 6개만 먼저 보이고 나머지는 ‘테마 더 보기’로 펼친다(2026-10-31). 펼친 뒤 모든 줄이 채워지는지 본다.
  await p.click("[data-rows-more]", { timeout: 5000 }).catch(() => {});
  for (let y = 0; y < 40; y++) { await p.mouse.wheel(0, 1600); await p.waitForTimeout(120); }
  const empty = await p.$$eval(".trow", (s) => s.filter((x) => !x.querySelector(".card")).map((x) => x.getAttribute("aria-label")));
  if (empty.length) fails.push(`내려도 비어 있는 테마 줄: ${empty.join(", ")}`);
  await b.close();
}
if (fails.length) { console.error("FAIL\n" + fails.join("\n")); process.exit(1); }
console.log("OK perf budget");
