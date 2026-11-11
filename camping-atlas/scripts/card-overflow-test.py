#!/usr/bin/env python3
# t55u: 카드 자손의 가로 넘침(scrollWidth > clientWidth) 회귀 테스트.
# 실행: python3 camping-atlas/scripts/card-overflow-test.py [URL]
# WIDTHS=1280,768,375,320  ROUTES=theme/UNIQUE,list
# Node 대안: camping-atlas/scripts/card-overflow-test.mjs (playwright npm 필요)
import asyncio, json, os, sys
from playwright.async_api import async_playwright

BASE = (sys.argv[1] if len(sys.argv) > 1 else "http://127.0.0.1:8754/camp-preview/t54-cards/camp/").split("#")[0].rstrip("/") + "/"
WIDTHS = [int(x) for x in os.environ.get("WIDTHS", "1280,768,375,320").split(",")]
ROUTES = os.environ.get("ROUTES", "theme/UNIQUE,list").split(",")
TASTE = {"types": ["AUTO"], "minSize": 8, "minWatts": 0}
CHROME = os.environ.get("CHROME_PATH", "/usr/bin/google-chrome")

CHECK = """(rootSel) => {
  const skipSelf = (el) => {
    if (!el || el.nodeType !== 1) return true;
    const s = getComputedStyle(el);
    if (s.display === "none" || s.visibility === "hidden") return true;
    const r = el.getBoundingClientRect();
    if (r.width < 1 || r.height < 1) return true;
    // 가로 스크롤이 의도된 레일·칩만 자기 자신은 건너뛴다. 안쪽 타일·글자는 검사한다.
    if (el.matches?.(".rail, .site-rail, .car-track, .car-multi, .chips, .top-taste-chips")) return true;
    return false;
  };
  const name = (e) => {
    const t = (e.textContent || "").replace(/\\s+/g, " ").trim().slice(0, 28);
    return `${e.tagName.toLowerCase()}${e.id ? "#" + e.id : ""}${e.classList?.length ? "." + [...e.classList].slice(0, 3).join(".") : ""}${t ? ' "' + t + '"' : ""}`;
  };
  const roots = [...document.querySelectorAll(rootSel)];
  const hits = [];
  for (const root of roots) {
    if (skipSelf(root) && rootSel.includes("article")) continue;
    for (const el of [root, ...root.querySelectorAll("*")]) {
      if (skipSelf(el)) continue;
      if (el.scrollWidth > el.clientWidth + 1) {
        hits.push(name(el) + " +" + Math.round(el.scrollWidth - el.clientWidth) + "px");
        if (hits.length >= 25) break;
      }
    }
    if (hits.length >= 25) break;
  }
  return { cards: document.querySelectorAll("article.card").length, roots: roots.length, hits };
}"""

async def run():
    fails, pages = [], 0
    async with async_playwright() as p:
        b = await p.chromium.launch(executable_path=CHROME)
        for w in WIDTHS:
            ctx = await b.new_context(viewport={"width": w, "height": 1100 if w > 700 else 900}, device_scale_factor=2 if w <= 400 else 1)
            await ctx.add_init_script("localStorage.setItem('camp_my_taste', %s)" % json.dumps(json.dumps(TASTE)))
            page = await ctx.new_page()
            for route in ROUTES:
                url = BASE + ("?p=" + route if not route.startswith("?") else route)
                await page.goto(url, wait_until="networkidle")
                await page.wait_for_timeout(2000)
                for i in range(6):
                    await page.mouse.wheel(0, 800)
                    await page.wait_for_timeout(250)
                more = page.locator("article.card .spec-more summary").first
                if await more.count():
                    await more.click()
                    await page.wait_for_timeout(200)
                r = await page.evaluate(CHECK, "article.card")
                pages += 1
                tag = f"{w} {route} cards={r['cards']}"
                if r["hits"]:
                    fails.append(f"{tag}: {len(r['hits'])}건 넘침\n  - " + "\n  - ".join(r["hits"][:12]))
                    print("FAIL", tag, len(r["hits"]))
                else:
                    print("OK", tag)
            tile = page.locator(".sr-tile").first
            if await tile.count():
                await tile.click()
                await page.wait_for_timeout(400)
                await page.locator("#sp-modal, .sr-modal").first.wait_for(state="visible", timeout=3000)
                r = await page.evaluate(CHECK, "#sp-modal .sr-modal, #sp-modal .sp-modal-content")
                pages += 1
                if r["hits"]:
                    fails.append(f"{w} modal: {len(r['hits'])}건 넘침\n  - " + "\n  - ".join(r["hits"][:12]))
                    print("FAIL", w, "modal", len(r["hits"]))
                else:
                    print("OK", w, "modal")
            await ctx.close()
        await b.close()
    if fails:
        print(f"FAIL 카드 가로 넘침 {len(fails)}건 / {pages}회\n" + "\n".join(fails), file=sys.stderr)
        sys.exit(1)
    print(f"OK 카드 가로 넘침 없음 — {pages}회 × {'/'.join(map(str, WIDTHS))}px")

asyncio.run(run())
