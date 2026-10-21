// 지도 엔진 회귀 테스트(소유자 2026-10-21: 지도 메뉴가 카카오 대신 OpenStreetMap으로 보임).
// 카카오 SDK를 가짜로 바꿔(네트워크·키 없이) 지도 화면이 카카오를 고르는지 본다.
//  ① SDK가 뜨고 타일이 그려지면 카카오  ② 타일이 늦게(12초) 와도 카카오 유지(예전엔 10초 뒤 OSM으로 바뀜)
//  ③ 상세 지도 다음 지도 탭도 카카오  ④ SDK 로드 실패면 OSM  ⑤ 타일이 전부 오류면 OSM
// 실행: node camping-atlas/scripts/map-engine-test.mjs [URL]
const { chromium } = await import(process.env.PW_MODULE || "playwright");
const base = (process.argv[2] || "http://127.0.0.1:8765/").replace(/#.*$/, "").replace(/\/?$/, "/");
const browser = await chromium.launch(process.env.CHROME_PATH ? { executablePath: process.env.CHROME_PATH } : {});
const fails = [];
const png = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAIAAAACCAYAAABytg0kAAAAEklEQVR42mNk+M9Qz0AEYBxVSF8ADKQB/0wNpGMAAAAASUVORK5CYII=", "base64");
const FAKE_SDK = `(() => {
  const LatLng = function (a, b) { this.a = a; this.b = b; }; LatLng.prototype.getLat = function () { return this.a; }; LatLng.prototype.getLng = function () { return this.b; };
  const Bounds = function () { this.p = []; }; Bounds.prototype.extend = function (x) { this.p.push(x); }; Bounds.prototype.getSouthWest = function () { return new LatLng(33, 124); }; Bounds.prototype.getNorthEast = function () { return new LatLng(39, 132); };
  const lis = [];
  const Map = function (el, o) { this.el = el; this.lv = o.level || 8; for (let i = 0; i < 6; i++) { const im = document.createElement("img"); im.src = "https://mts.kakaocdn.net/api/v1/tile/PNGSD02/fake/latest/7/" + i + "/0.png?t=" + Date.now(); el.append(im); } setTimeout(() => lis.filter((l) => l[0] === this && l[1] === "tilesloaded").forEach((l) => l[2]()), 200); setTimeout(() => lis.filter((l) => l[0] === this && l[1] === "idle").forEach((l) => l[2]()), 250); };
  Object.assign(Map.prototype, { setZoomable() {}, addControl() {}, relayout() {}, setCenter() {}, getLevel() { return this.lv; }, setLevel(v) { this.lv = v; }, setMinLevel() {}, setMaxLevel() {}, setBounds() {}, getBounds() { return new Bounds(); }, getProjection() { return { containerPointFromCoords: () => ({ x: 0, y: 0 }) }; } });
  const Ov = function () {}; Ov.prototype.setMap = function () {};
  window.kakao = { maps: { load: (f) => f(), LatLng, LatLngBounds: Bounds, Map, ZoomControl: function () {}, ControlPosition: {}, CustomOverlay: Ov, event: { addListener: (m, e, f) => lis.push([m, e, f]) } } };
})();`;
async function run(name, { sdk = "ok", tileDelay = 0, tileFail = false, path = "#/map", via = null, wait = 4000 }) {
  const ctx = await browser.newContext({ viewport: { width: 1366, height: 900 } });
  const page = await ctx.newPage();
  await page.route(/supabase\.co/, (r) => (r.request().method() === "GET" ? r.continue() : r.abort()));
  // 로컬 발행에는 지도 키가 없으므로 테스트용 키 메타를 넣는다(실제 키 아님).
  await page.route((u) => u.origin + "/" === new URL(base).origin + "/" && /\/(index\.html)?$/.test(u.pathname), async (r) => { const res = await r.fetch(); const body = (await res.text()).replace(/<meta name="kakao-js-key" content="[^"]*">/, "").replace("</head>", '<meta name="kakao-js-key" content="test0000test0000test0000test0000"></head>'); return r.fulfill({ response: res, body }); });
  await page.route(/dapi\.kakao\.com\/v2\/maps\/sdk\.js/, (r) => (sdk === "ok" ? r.fulfill({ status: 200, contentType: "application/javascript", body: FAKE_SDK }) : r.abort()));
  await page.route(/mts\.kakaocdn\.net/, async (r) => { if (tileDelay) await new Promise((z) => setTimeout(z, tileDelay)); return tileFail ? r.fulfill({ status: 400, contentType: "image/png", body: "" }) : r.fulfill({ status: 200, contentType: "image/png", body: png }); });
  await page.route(/tile\.openstreetmap\.org/, (r) => r.fulfill({ status: 200, contentType: "image/png", body: png }));
  if (via) { await page.goto(base + via); await page.waitForSelector("#detail-map", { timeout: 30000 }); await page.waitForTimeout(wait); }
  await page.goto(base + path); await page.waitForSelector("#map", { timeout: 30000 }); await page.waitForTimeout(wait);
  const engine = await page.evaluate(() => document.querySelector("#map")?.dataset.engine);
  await ctx.close();
  return engine;
}
const cat = await (await fetch(`${base}explore/data/campgrounds.lite.json`)).json();
const anyId = cat.camps.find((c) => c.lat && !c.du)?.id;
const cases = [
  ["SDK·타일 정상 → 카카오", { }, "kakao"],
  ["타일 12초 늦음 → 카카오 유지", { tileDelay: 12000, wait: 14000 }, "kakao"],
  ["상세 지도 다음 지도 탭 → 카카오", { via: `#/c/${anyId}` }, "kakao"],
  ["SDK 로드 실패 → OSM", { sdk: "fail", wait: 3000 }, "osm"],
  ["타일 전부 오류 → OSM", { tileFail: true, wait: 4000 }, "osm"],
];
for (const [name, o, want] of cases) { const got = await run(name, o); if (got !== want) fails.push(`${name}: ${got}`); else console.log(`  ✓ ${name}`); }
await browser.close();
if (fails.length) { console.error(`FAIL 지도 엔진 ${fails.length}건\n${fails.join("\n")}`); process.exit(1); }
console.log("OK 지도 엔진 — 카카오 기본, 실제 오류에서만 OSM");
