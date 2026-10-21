// 경로 주소·옛 주소 넘김·상세 공유·공유 미리보기(OG) 회귀 테스트(소유자 2026-10-21).
// 실행: node camping-atlas/scripts/routes-share-test.mjs [URL]  (public을 발행 스크립트 --shell-only 로 만든 뒤)
// 1 화면 어디에도 '#/' 링크 없음  2 /map·/themes 등 새로고침 가능  3 옛 주소(#/c/1, explore/, renewal/, guide/, openings/, explore/c/1/)는 새 경로로
// 4 상세 ‘공유’는 ‘찜’ 오른쪽, 누르면 place/{id}/ 복사 + ‘링크를 복사했어요’  5 place/{id}/ 정적 페이지에 https og:image·og:title·og:description·canonical
const { chromium } = await import(process.env.PW_MODULE || "playwright");
const base = (process.argv[2] || "http://127.0.0.1:8765/").replace(/#.*$/, "").replace(/\/?$/, "/");
const root = new URL(base).pathname;
const browser = await chromium.launch(process.env.CHROME_PATH ? { executablePath: process.env.CHROME_PATH } : {});
const fails = [];
const png = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=", "base64");
const ctx = await browser.newContext({ viewport: { width: 1366, height: 900 }, permissions: ["clipboard-read", "clipboard-write"] });
await ctx.route(/^https?:\/\/(?!127\.0\.0\.1|localhost)/, (r) => r.request().resourceType() === "image" ? r.fulfill({ body: png, contentType: "image/png" }) : r.abort());
// GitHub Pages처럼 없는 경로 문서 요청에는 404.html을 돌려준다(로컬 python 서버는 이걸 못 함).
const notFound = await (await fetch(`${base}404.html`)).text();
await ctx.route((u) => u.href.startsWith(base), async (r) => {
  if (r.request().resourceType() !== "document") return r.continue();
  const res = await r.fetch();
  return res.status() === 404 ? r.fulfill({ status: 404, body: notFound, contentType: "text/html" }) : r.fulfill({ response: res });
});
const page = await ctx.newPage();
const pathOf = () => { const u = new URL(page.url()); return decodeURIComponent(u.pathname.slice(root.length) + u.search); };
const settle = () => page.waitForFunction(() => (document.querySelector("#view")?.innerHTML.length ?? 0) > 200, null, { timeout: 20000 }).catch(() => fails.push(`화면 안 뜸: ${page.url()}`)).then(() => page.waitForTimeout(500));
const noHash = async (where) => {
  const bad = await page.evaluate(() => [...document.querySelectorAll("a[href]")].map((a) => a.getAttribute("href")).filter((h) => /^(\.\.?\/)*#\/|\/#\//.test(h)));
  if (bad.length) fails.push(`${where}: '#/' 링크 ${bad.length}개 (${bad.slice(0, 3).join(", ")})`);
};
const camps = await (await fetch(`${base}explore/data/campgrounds.json`)).json().catch(() => []);
const id = String((Array.isArray(camps) ? camps : camps.camps ?? [])[0]?.id ?? "483");

for (const r of ["", "map", "themes", "compare", "saved", "list?sido=강원", `place/${id}`]) {
  await page.goto(base + r, { waitUntil: "domcontentloaded" }); await settle();
  if (pathOf().replace(/\/$/, "") !== r.replace(/\/$/, "")) fails.push(`/${r} 새로고침 → ${pathOf()}`);
  await noHash(`/${r}`);
}
const legacy = [["#/c/" + id, `place/${id}`], ["#/map", "map"], [`explore/#/c/${id}`, `place/${id}`], ["explore/", ""], ["renewal/", ""], ["renewal/#/themes", "themes"],
  ["guide/", ""], ["vision/", ""], ["openings/", "theme/OPEN"], [`explore/c/${id}/`, `place/${id}`], [`c/${id}/`, `place/${id}`], ["passport/", "compare"]];
for (const [from, to] of legacy) {
  await page.goto(base + from, { waitUntil: "domcontentloaded" }); await settle();
  await page.waitForTimeout(300);
  if (pathOf() !== to || new URL(page.url()).hash) fails.push(`옛 주소 ${from} → ${pathOf()}${new URL(page.url()).hash} (기대 ${to})`);
}
// 화면 안 이동은 pushState(새로 불러오지 않음), 뒤로 가기 동작
await page.goto(base, { waitUntil: "domcontentloaded" }); await settle();
await page.evaluate(() => { window.__stay = 1; });
await page.click('.top-nav a[data-nav="map"], header a[data-nav="map"]');
await page.waitForTimeout(600);
if (pathOf() !== "map" || !(await page.evaluate(() => window.__stay))) fails.push(`지도 메뉴 이동: ${pathOf()} (새로 불러옴?)`);
await page.goBack(); await page.waitForTimeout(600);
if (pathOf() !== "") fails.push(`뒤로 가기 → ${pathOf()}`);
// 상세 공유
await page.goto(`${base}place/${id}`, { waitUntil: "domcontentloaded" }); await settle();
const pos = await page.evaluate(() => {
  const h = document.querySelector(".d-bar .heart-label"), s = document.querySelector(".d-bar [data-share-place]");
  return h && s ? { h: h.getBoundingClientRect().right, s: s.getBoundingClientRect().left, t: s.textContent.trim() } : null;
});
if (!pos) fails.push("상세 상단에 공유 버튼 없음");
else if (!(pos.s >= pos.h) || pos.t !== "공유") fails.push(`공유 버튼 위치·이름: ${JSON.stringify(pos)}`);
if (pos) {
  await page.click(".d-bar [data-share-place]");
  await page.waitForTimeout(300);
  const toastTxt = await page.textContent("#toast");
  const clip = await page.evaluate(() => navigator.clipboard.readText()).catch(() => "");
  if (!/링크를 복사했어요/.test(toastTxt ?? "")) fails.push(`공유 토스트: ${toastTxt}`);
  if (!clip.endsWith(`${root}place/${id}/`)) fails.push(`복사된 주소: ${clip}`);
}
await browser.close();
// 공유 미리보기 정적 페이지(크롤러는 JS를 실행하지 않음)
const html = await (await fetch(`${base}place/${id}/`)).text();
const meta = (p) => html.match(new RegExp(`<meta (?:property|name)="${p}" content="([^"]*)"`))?.[1];
const name = (Array.isArray(camps) ? camps : camps.camps ?? []).find((c) => String(c.id) === id)?.name;
if (!meta("og:title")?.includes(name ?? "§")) fails.push(`og:title: ${meta("og:title")}`);
if (!(meta("og:description")?.length >= 30)) fails.push(`og:description: ${meta("og:description")}`);
if (!/^https:\/\/.+\.(jpe?g|png|webp)(\?|$)/i.test(meta("og:image") ?? "")) fails.push(`og:image(https 절대주소): ${meta("og:image")}`);
if (!/<link rel="canonical" href="https:\/\/[^"]+\/place\/[^"]+\/">/.test(html)) fails.push("canonical 없음");
if (meta("twitter:card") !== "summary_large_image") fails.push("twitter:card 없음");
if (/http-equiv="refresh"/i.test(html)) fails.push("place 페이지에 meta refresh(크롤러가 따라가 미리보기를 잃음)");
const nf = await fetch(`${base}404.html`); if (!nf.ok || !/\?p=/.test(await nf.text())) fails.push("404.html 경로 넘김 없음");
if (fails.length) { console.error("실패:\n- " + fails.join("\n- ")); process.exit(1); }
console.log(`통과: 경로 주소·옛 주소 ${legacy.length}종 넘김·공유 버튼·place/${id}/ 미리보기 메타`);
