// 찜 낙관적 UI·이 기기 보관 회귀 테스트(소유자 2026-10-23: “찜했는데 하트가 꺼져 있어 또 찜하기를 눌렀다”).
// 운영 Supabase에는 절대 닿지 않는다: 모든 supabase.co 요청을 가짜 서버(메모리)로 받는다. 쓰기 금지 플래그(webdriver)는 이 테스트에서만 끈다.
//  1) 서버 저장이 실패해도 누른 하트는 켜진 채, 새로고침해도 켜져 있다(대기 동작 mc-save-ops로 보완).
//  2) 서버가 살아나면 대기 동작을 다시 보내 공용 찜에 들어가고, 대기 동작은 지워지며, 기록은 한 번만 남는다.
//  3) 서버에 이미 찜이 있으면(다른 기기에서 찜) 또 눌러도 ‘찜’ 기록이 늘지 않는다 — 처음부터 하트가 켜져 보인다.
//  4) 비교(mc-pick)는 이 기기에만 있고 서버로 가지 않는다.
// 실행: node camping-atlas/scripts/save-optimistic-test.mjs [URL]
const { chromium } = await import(process.env.PW_MODULE || "playwright");
const base = (process.argv[2] || "http://127.0.0.1:8765/").replace(/#.*$/, "").replace(/\/?$/, "/");
const browser = await chromium.launch(process.env.CHROME_PATH ? { executablePath: process.env.CHROME_PATH } : {});
const fails = [];
const server = { shared: new Set(), logs: [], down: true, other: [] };
const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
await ctx.addInitScript(() => { Object.defineProperty(Navigator.prototype, "webdriver", { get: () => false }); });
await ctx.route(/supabase\.co\//, async (r) => {
  const req = r.request(), url = new URL(req.url()), m = req.method(), path = url.pathname;
  const json = (body, status = 200) => r.fulfill({ status, contentType: "application/json", body: JSON.stringify(body) });
  if (path.endsWith("/shared_save")) {
    const id = (url.searchParams.get("campground_id") || "").replace(/^eq\./, "");
    if (m === "GET") return json([...server.shared].filter((x) => !id || x === id).map((x) => ({ campground_id: x, created_at: new Date().toISOString() })));
    if (server.down) return json({ message: "down" }, 503);
    if (m === "POST") { const b = JSON.parse(req.postData() || "{}"); if (server.shared.has(String(b.campground_id))) return json({ code: "23505" }, 409); server.shared.add(String(b.campground_id)); return r.fulfill({ status: 201, body: "" }); }
    if (m === "DELETE") { const had = server.shared.delete(id); return json(had ? [{ campground_id: id }] : []); }
  }
  if (path.endsWith("/save_log")) { if (m === "POST") { if (server.down) return json({}, 503); server.logs.push(JSON.parse(req.postData() || "{}")); return r.fulfill({ status: 201, body: "" }); } return json([]); }
  if (m !== "GET" && m !== "HEAD") server.other.push(`${m} ${path}`);
  return m === "GET" ? json([]) : json({}, 404);
});
const page = await ctx.newPage();
const heartOf = (id) => page.$eval(`.card[data-id="${id}"] [data-save]`, (b) => b.classList.contains("on")).catch(() => null);
const ls = (k) => page.evaluate((key) => JSON.parse(localStorage.getItem(key) || "null"), k);

await page.goto(base, { waitUntil: "domcontentloaded" });
await page.waitForSelector(".card[data-id] [data-save]", { timeout: 30000 });
const id = await page.$eval(".card[data-id] [data-save]", (b) => b.dataset.save);
// 1) 서버가 죽은 상태에서 찜
await page.click(`.card[data-id="${id}"] [data-save]`);
await page.waitForTimeout(800);
if (!(await heartOf(id))) fails.push("1: 누른 직후 하트가 켜지지 않음");
if (!(await ls("mc-save-ops"))?.some((o) => o.id === id && o.action === "add")) fails.push("1: 대기 동작(mc-save-ops)이 남지 않음");
if (server.logs.length) fails.push("1: 서버 실패인데 기록이 먼저 감");
await page.reload({ waitUntil: "domcontentloaded" });
await page.waitForSelector(`.card[data-id="${id}"] [data-save]`, { timeout: 30000 });
await page.waitForTimeout(2500);
if (!(await heartOf(id))) fails.push("1: 새로고침 뒤(서버 목록엔 없음) 하트가 꺼짐 — 이 기기 찜이 덮어써짐");
// 2) 서버가 살아나고 연결 복구 → 다시 보냄
server.down = false;
await page.evaluate(() => dispatchEvent(new Event("online")));
await page.waitForTimeout(2500);
if (!server.shared.has(id)) fails.push("2: 서버 복구 뒤 공용 찜에 들어가지 않음");
if ((await ls("mc-save-ops"))?.some((o) => o.id === id)) fails.push("2: 반영 뒤에도 대기 동작이 남음");
const adds = () => server.logs.filter((l) => String(l.campground_id) === id && l.action === "add").length;
if (adds() !== 1) fails.push(`2: ‘찜’ 기록이 ${adds()}건(1건이어야)`);
// 3) 다시 불러와도 하트 켜짐, 이미 찜이면 또 누를 수 없으니(누르면 해제) 기록이 늘지 않음 — 해제→다른 기기에서 이미 해제된 경우 기록 없음
await page.reload({ waitUntil: "domcontentloaded" });
await page.waitForSelector(`.card[data-id="${id}"] [data-save]`, { timeout: 30000 });
await page.waitForTimeout(2000);
if (!(await heartOf(id))) fails.push("3: 서버에 찜이 있는데 하트가 꺼져 보임");
server.shared.delete(id); // 다른 기기에서 해제했다고 가정
await page.click(`.card[data-id="${id}"] [data-save]`);
await page.waitForTimeout(1500);
const removes = server.logs.filter((l) => String(l.campground_id) === id && l.action === "remove").length;
if (removes !== 0) fails.push(`3: 이미 해제된 곳을 해제했는데 ‘해제’ 기록이 ${removes}건 남음`);
if (adds() !== 1) fails.push(`3: ‘찜’ 기록이 늘어남(${adds()})`);
// 4) 비교는 서버로 가지 않는다
if (server.other.some((x) => /pick|compare/i.test(x))) fails.push("4: 비교 상태가 서버로 감");
await browser.close();
if (fails.length) { console.error(`FAIL 찜 낙관적 UI\n- ${fails.join("\n- ")}`); process.exit(1); }
console.log("OK 찜 낙관적 UI — 서버 실패에도 하트 유지·복구 시 재전송·기록 1건·이미 같은 상태면 기록 없음·비교는 기기에만");
