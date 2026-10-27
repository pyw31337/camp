// 320px 가로 넘침 회귀 테스트(소유자 2026-10-21): 모든 화면에서 문서가 화면 폭보다 넓어지면(가로 스크롤) 실패.
// 실행: node camping-atlas/scripts/overflow-320-test.mjs [URL]   (AUDIT=1 이면 탭 크기·글자 크기·잘림도 보고만 한다, SHOTS_DIR 지정 시 화면 저장)
const { chromium } = await import(process.env.PW_MODULE || "playwright");
const base = (process.argv[2] || "http://127.0.0.1:8765/").replace(/#.*$/, "").replace(/\/?$/, "/");
const widths = (process.env.WIDTHS || "320").split(",").map(Number);
const AUDIT = process.env.AUDIT === "1", shots = process.env.SHOTS_DIR || "";
const cat = await (await fetch(`${base}explore/data/campgrounds.lite.json`)).json().catch(() => ({ camps: [] }));
const stay = cat.camps.find((c) => !c.du)?.id ?? "2931", day = cat.camps.find((c) => c.du)?.id;
const routes = ["", "list", "map", "themes", "theme/ALL", "theme/PARK", "compare", "saved", "saves-log", `place/${stay}`, ...(day ? [`place/${day}`] : []),
  "admin/", "collections/", "passport/", "themes/"];
const browser = await chromium.launch(process.env.CHROME_PATH ? { executablePath: process.env.CHROME_PATH } : {});
const fails = [], report = [];
const png = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=", "base64");
for (const w of widths) {
  const mob = w < 700;
  const ctx = await browser.newContext({ viewport: { width: w, height: mob ? 740 : 900 }, ...(mob ? { isMobile: true, hasTouch: true, deviceScaleFactor: 2 } : {}) });
  await ctx.addInitScript(() => { try { localStorage.setItem("mc-saved", JSON.stringify([])); } catch {} });
  const page = await ctx.newPage();
  await page.route(/\/media\//, async (r) => { const x = await r.fetch().catch(() => null); return x && x.ok() ? r.fulfill({ response: x }) : r.fulfill({ status: 200, contentType: "image/png", body: png }); });
  await page.route(/dapi\.kakao|map\.kakao|tile\.openstreetmap/, (r) => r.abort());
  for (const route of routes) {
    await page.goto(base + route, { waitUntil: "domcontentloaded" }).catch(() => {});
    await page.waitForTimeout(route.startsWith("#") || route === "" ? 2500 : 1500);
    const r = await page.evaluate(({ w, AUDIT }) => {
      const de = document.documentElement, out = { sw: Math.max(de.scrollWidth, document.body?.scrollWidth ?? 0), over: [], small: [], tiny: [], cut: [] };
      const vis = (e) => { const s = getComputedStyle(e); const b = e.getBoundingClientRect(); return s.visibility !== "hidden" && s.display !== "none" && b.width > 0 && b.height > 0; };
      const scrollerAnc = (e) => { for (let p = e.parentElement; p && p !== document.body; p = p.parentElement) { const s = getComputedStyle(p); if (/(auto|scroll|hidden|clip)/.test(s.overflowX)) return true; } return false; };
      const name = (e) => `${e.tagName.toLowerCase()}${e.id ? "#" + e.id : ""}${e.classList.length ? "." + [...e.classList].slice(0, 2).join(".") : ""}`;
      if (out.sw > w + 1) for (const e of document.body.querySelectorAll("*")) { const b = e.getBoundingClientRect(); if (b.right > w + 1 && b.width > 0 && vis(e) && !scrollerAnc(e)) { out.over.push(`${name(e)} r=${Math.round(b.right)}`); if (out.over.length > 6) break; } }
      if (AUDIT) {
        for (const e of document.querySelectorAll("a[href], button, input:not([type=hidden]), select, textarea, summary, [role=button]")) {
          if (!vis(e)) continue; const b = e.getBoundingClientRect(); if (b.right < 0 || b.left > w) continue;
          const pa = getComputedStyle(e, "::after"); const hw = pa.content !== "none" && pa.position === "absolute" ? Math.min(parseFloat(pa.width) || 0, parseFloat(pa.height) || 0) : 0;
          if (Math.max(Math.min(b.width, b.height), hw) < 44 && !e.closest("p, li.txt")) out.small.push(`${name(e)} ${Math.round(b.width)}x${Math.round(b.height)} "${(e.textContent || e.getAttribute("aria-label") || "").trim().slice(0, 14)}"`);
        }
        const tw = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
        const seen = new Set();
        for (let n; (n = tw.nextNode());) { const e = n.parentElement; if (!e || seen.has(e) || !n.textContent.trim() || !vis(e)) continue; seen.add(e); const fs = parseFloat(getComputedStyle(e).fontSize); if (fs < 12) out.tiny.push(`${name(e)} ${fs}px "${n.textContent.trim().slice(0, 14)}"`); }
        for (const e of document.querySelectorAll("*")) { const s = getComputedStyle(e); if (s.textOverflow === "ellipsis" && e.scrollWidth > e.clientWidth + 1 && vis(e)) out.cut.push(`${name(e)} "${e.textContent.trim().slice(0, 18)}"`); }
      }
      return out;
    }, { w, AUDIT });
    const tag = `${w} ${route || "/"}`;
    if (r.sw > w + 1) fails.push(`${tag}: 가로 넘침 ${r.sw}px > ${w}px — ${r.over.join(", ")}`);
    if (AUDIT) report.push({ w, route: route || "/", sw: r.sw, over: r.over, small: [...new Set(r.small)].slice(0, 40), smallN: r.small.length, tiny: [...new Set(r.tiny)].slice(0, 30), tinyN: r.tiny.length, cut: r.cut.slice(0, 20), cutN: r.cut.length });
    if (shots) await page.screenshot({ path: `${shots}/${process.env.SHOT_PREFIX || "ux"}-${w}-${(route || "home").replace(/[^a-z0-9]+/gi, "_").replace(/^_|_$/g, "") || "home"}.png`, fullPage: true }).catch(() => {});
  }
  await ctx.close();
}
await browser.close();
if (AUDIT) { const f = process.env.AUDIT_OUT || "/tmp/ux-audit.json"; (await import("node:fs")).writeFileSync(f, JSON.stringify(report, null, 1)); console.log(`audit → ${f}`); }
if (fails.length) { console.error(`FAIL 가로 넘침 ${fails.length}건\n${fails.join("\n")}`); if (!AUDIT) process.exit(1); }
else console.log(`OK 가로 넘침 없음 — ${routes.length}개 화면 × ${widths.join("/")}px`);
