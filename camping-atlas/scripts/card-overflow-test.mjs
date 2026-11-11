// t55u: 카드 자손의 가로 넘침(scrollWidth>clientWidth) 회귀 테스트.
// 실행: node camping-atlas/scripts/card-overflow-test.mjs [URL]
// playwright npm가 없으면: python3 camping-atlas/scripts/card-overflow-test.py [URL]
// WIDTHS=1280,768,375,320  (기본값)
const { chromium } = await import(process.env.PW_MODULE || "playwright");
const base = (process.argv[2] || "http://127.0.0.1:8754/").replace(/#.*$/, "").replace(/\/?$/, "/");
const widths = (process.env.WIDTHS || "1280,768,375,320").split(",").map(Number);
const routes = (process.env.ROUTES || "theme/UNIQUE,list").split(",");
const CHROME = process.env.CHROME_PATH || "/usr/bin/google-chrome";
const TASTE = { types: ["AUTO"], minSize: 8, minWatts: 0 };

const CHECK = `(rootSel) => {
  const skipSel = (el) => {
    if (!el || el.nodeType !== 1) return true;
    const s = getComputedStyle(el);
    if (s.display === "none" || s.visibility === "hidden") return true;
    const r = el.getBoundingClientRect();
    if (r.width < 1 || r.height < 1) return true;
    // 가로 스크롤이 목적인 레일·캐러셀 트랙 자체는 제외(칸 안 글자는 검사).
    if (el.matches?.(".rail, .site-rail, .car-track, .car-multi, .chips, .top-taste-chips")) return true;
    return false;
  };
  const name = (e) => {
    const t = (e.textContent || "").replace(/\\s+/g, " ").trim().slice(0, 24);
    return \`\${e.tagName.toLowerCase()}\${e.id ? "#" + e.id : ""}\${e.classList?.length ? "." + [...e.classList].slice(0, 3).join(".") : ""}\${t ? ' "' + t + '"' : ""}\`;
  };
  const roots = [...document.querySelectorAll(rootSel || "article.card")];
  const hits = [];
  for (const root of roots) {
    const nodes = [root, ...root.querySelectorAll("*")];
    for (const el of nodes) {
      if (skipSel(el)) continue;
      if (el.closest?.(".rail, .site-rail, .car-track, .chips, .top-taste-chips") && (el.matches(".rail, .site-rail, .car-track, .chips, .top-taste-chips") || el.parentElement?.matches?.(".rail, .site-rail, .car-track"))) {
        if (el.matches(".rail, .site-rail, .car-track, .chips, .top-taste-chips")) continue;
      }
      // 타일·칩·스펙 칸 등 카드 안 상자는 반드시 그 상자 안에 글자가 들어가게.
      if (el.scrollWidth > el.clientWidth + 1) {
        hits.push(name(el) + " +" + Math.round(el.scrollWidth - el.clientWidth) + "px");
        if (hits.length >= 25) break;
      }
    }
    if (hits.length >= 25) break;
  }
  return { cards: document.querySelectorAll("article.card").length, hits };
}`;

const launchOpts = { executablePath: CHROME };
const browser = await chromium.launch(launchOpts);
const fails = [];
let pages = 0;
for (const w of widths) {
  const ctx = await browser.newContext({
    viewport: { width: w, height: w > 700 ? 1100 : 900 },
    deviceScaleFactor: w <= 400 ? 2 : 1,
  });
  await ctx.addInitScript((t) => { try { localStorage.setItem("camp_my_taste", JSON.stringify(t)); } catch {} }, TASTE);
  const page = await ctx.newPage();
  for (const route of routes) {
    const url = base + (route.includes("?") || route.startsWith("p=") ? route : ("?p=" + route));
    await page.goto(url, { waitUntil: "networkidle" }).catch(() => {});
    await page.waitForTimeout(2000);
    for (let i = 0; i < 6; i++) { await page.mouse.wheel(0, 800); await page.waitForTimeout(250); }
    // 더보기·타일 모달도 한 번씩
    const more = page.locator("article.card .spec-more summary").first();
    if (await more.count()) { await more.click().catch(() => {}); await page.waitForTimeout(200); }
    const r = await page.evaluate(CHECK, "article.card");
    pages++;
    const tag = `${w} ${route} cards=${r.cards}`;
    if (r.hits.length) fails.push(`${tag}: ${r.hits.length}건 넘침\n  - ${r.hits.slice(0, 12).join("\n  - ")}`);
    else console.log(`OK ${tag}`);
  }
  // modal at this width
  const tile = page.locator(".sr-tile").first();
  if (await tile.count()) {
    await tile.click().catch(() => {});
    await page.waitForTimeout(400);
    const r = await page.evaluate(CHECK, "#sp-modal .sr-modal, #sp-modal .sp-modal-content");
    pages++;
    if (r.hits.length) fails.push(`${w} modal: ${r.hits.length}건 넘침\n  - ${r.hits.slice(0, 12).join("\n  - ")}`);
    else console.log(`OK ${w} modal`);
  }
  await ctx.close();
}
await browser.close();
if (fails.length) {
  console.error(`FAIL 카드 가로 넘침 ${fails.length}건 / ${pages}회\n${fails.join("\n")}`);
  process.exit(1);
}
console.log(`OK 카드 가로 넘침 없음 — ${pages}회 × ${widths.join("/")}px`);
