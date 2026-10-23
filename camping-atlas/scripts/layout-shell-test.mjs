// 공통 틀 회귀 테스트(소유자 2026-10-21: “헤더·푸터·여백이 화면마다 다르다”).
// 모든 경로(+ /log/)가 320·390·1366에서 같은 헤더(높이·로고 위치·메뉴), 같은 푸터(하나, 같은 폭·여백·문구), 같은 본문 좌우 여백을 쓰는지 본다.
// (지도 화면은 전체 화면 도구라 본문 여백 검사만 뺀다.) 실행: node camping-atlas/scripts/layout-shell-test.mjs [URL]
const { chromium } = await import(process.env.PW_MODULE || "playwright");
const base = (process.argv[2] || "http://127.0.0.1:8765/").replace(/#.*$/, "").replace(/\/?$/, "/");
const browser = await chromium.launch(process.env.CHROME_PATH ? { executablePath: process.env.CHROME_PATH } : {});
const png = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=", "base64");
const camps = await (await fetch(`${base}explore/data/campgrounds.json`)).json().catch(() => []);
const id = String((Array.isArray(camps) ? camps : camps.camps ?? [])[0]?.id ?? "483");
const ROUTES = ["", "list", "map", "themes", "theme/FOREST", "compare", "saved", "saves-log", `place/${id}`, "log/"];
const NO_HEAD = ["map", "themes", "compare", "saved"];
const fails = [];
for (const w of [320, 390, 1366]) {
  const ctx = await browser.newContext({ viewport: { width: w, height: 800 } });
  await ctx.route(/^https?:\/\/(?!127\.0\.0\.1|localhost)/, (r) => r.request().resourceType() === "image" ? r.fulfill({ body: png, contentType: "image/png" }) : r.abort());
  const page = await ctx.newPage();
  const seen = [];
  for (const r of ROUTES) {
    await page.goto(base + r, { waitUntil: "domcontentloaded" });
    await page.waitForFunction(() => document.querySelector(".site-footer") && (document.querySelector("main")?.innerText.length ?? 0) > 20, null, { timeout: 30000 }).catch(() => {});
    await page.waitForTimeout(800);
    const m = await page.evaluate(() => {
      const rect = (e) => e && (({ left, top, width, height }) => ({ left: Math.round(left), top: Math.round(top), width: Math.round(width), height: Math.round(height) }))(e.getBoundingClientRect());
      const hd = document.querySelectorAll("header.top"), ft = document.querySelectorAll("footer.site-footer");
      const brand = document.querySelector("header.top .brand");
      const fin = ft[0]?.querySelector(".site-footer-inner");
      const nav = [...document.querySelectorAll("header.top .top-nav a, .tabbar a")].map((a) => a.textContent.trim().replace(/\d+$/, "").trim()).join("|");
      const bl = brand ? brand.getBoundingClientRect().left : -1;
      // 본문 좌우 여백: main 안에 내용 시작점이 로고와 같은 줄에 서는 상자가 하나 이상 있어야 한다.
      const main = document.querySelector("main");
      let aligned = 0;
      for (const e of main ? main.querySelectorAll("*") : []) {
        const rr = e.getBoundingClientRect(); if (!rr.width || rr.top > 4000) continue;
        const cs = getComputedStyle(e);
        if (Math.abs(rr.left + parseFloat(cs.paddingLeft) + parseFloat(cs.borderLeftWidth) - bl) <= 1) { aligned++; if (aligned > 2) break; }
      }
      return {
        headers: hd.length, footers: ft.length, head: rect(hd[0]), brand: rect(brand), nav,
        finLeft: fin ? Math.round(fin.getBoundingClientRect().left + parseFloat(getComputedStyle(fin).paddingLeft)) : null,
        finW: rect(fin)?.width, ftW: rect(ft[0])?.width, ftText: ft[0]?.innerText.replace(/\s+/g, " ").trim(),
        tab: !!document.querySelector(".tabbar") && getComputedStyle(document.querySelector(".tabbar")).display !== "none",
        aligned, vw: document.documentElement.clientWidth, sw: document.documentElement.scrollWidth,
      };
    });
    const tag = `${w} /${r}`;
    if (m.headers !== 1) fails.push(`${tag}: 헤더 ${m.headers}개`);
    if (m.footers !== 1) fails.push(`${tag}: 푸터 ${m.footers}개`);
    if (m.sw > m.vw) fails.push(`${tag}: 가로 넘침 ${m.sw}>${m.vw}`);
    // 모바일 상세는 로고 머리 줄을 숨긴다(영우 님 2026-10-21, t39 #12) — 숨겨졌는지만 본다.
    // 모바일 지도·테마·비교·찜도 머리 줄을 숨긴다(소유자 2026-10-23: 머리 줄은 ‘찾기’에서만, 메뉴는 하단 탭).
    const mDetail = w < 760 && (r.startsWith("place/") || NO_HEAD.includes(r));
    if (mDetail && m.head?.height) fails.push(`${tag}: 모바일 ${r}에 로고 머리 줄이 보임`);
    // 모바일 지도·테마·비교·찜은 푸터도 숨긴다(소유자 2026-10-23)
    if (w < 760 && NO_HEAD.includes(r) && m.ftW) fails.push(`${tag}: 모바일 ${r}에 푸터가 보임`);
    if (!m.aligned && r !== "map" && !mDetail) fails.push(`${tag}: 본문 왼쪽 여백이 로고(${m.brand?.left}px)와 맞는 상자가 없음`);
    if (w < 760 && !r.startsWith("place/") && !m.tab) fails.push(`${tag}: 하단 탭 없음`);
    seen.push([tag, m]);
  }
  const [t0, ref] = seen[0];
  for (const [tag, m] of seen.slice(1)) {
    if (!(w < 760 && (/ \/place\//.test(tag) || NO_HEAD.includes(tag.split(" /")[1])))) for (const k of ["head", "brand"]) if (JSON.stringify(m[k]) !== JSON.stringify(ref[k])) fails.push(`${tag}: ${k} ${JSON.stringify(m[k])} ≠ ${t0} ${JSON.stringify(ref[k])}`);
    const noFoot = w < 760 && NO_HEAD.includes(tag.split(" /")[1]);
    for (const k of noFoot ? ["nav"] : ["nav", "finLeft", "finW", "ftW", "ftText"]) if (m[k] !== ref[k]) fails.push(`${tag}: 푸터/메뉴 ${k} ${m[k]} ≠ ${t0} ${ref[k]}`);
  }
  if (ref.finLeft !== ref.brand?.left) fails.push(`${w}: 푸터 내용 시작(${ref.finLeft}) ≠ 로고(${ref.brand?.left})`);
  await ctx.close();
}
await browser.close();
if (fails.length) { console.error("FAIL 공통 틀\n- " + [...new Set(fails)].join("\n- ")); process.exit(1); }
console.log(`OK 공통 틀 — ${ROUTES.length}개 경로 × 320·390·1366 헤더·푸터·본문 여백 동일`);
