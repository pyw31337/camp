// 잘림 전수검사(2026-11-01 소유자: 글자·버튼 테두리가 영역에 갇혀 잘려 보임). 실행: node camping-atlas/scripts/clip-audit.mjs [URL]
// 접어 둔 상세 섹션(.is-folded) 아래쪽은 의도된 흐림이라 결과에 남아도 된다. CI 필수 검사는 아니고 화면을 고칠 때 돌려 본다.
// 잘림 전수검사: (1) 줄 중간이 잘린 글자(overflow hidden/clip인데 마지막 보이는 줄이 일부만 보임)
// (2) 스크롤 줄·숨김 부모가 자식의 테두리(버튼·칩) 위·아래를 자름
const { chromium } = await import(process.env.PW_MODULE || "playwright");
const base = process.argv[2] || "http://127.0.0.1:8765/";
const widths = (process.env.WIDTHS || "320,390,1366").split(",").map(Number);
const routes = (process.env.ROUTES || ",list,map,themes,theme/ALL,compare,saved,place/640,place/102373,place/101520,admin/").split(",");
const shots = process.env.SHOTS || "";
const b = await chromium.launch();
const out = {};
for (const w of widths) {
  const mob = w < 700;
  const ctx = await b.newContext({ viewport: { width: w, height: mob ? 800 : 900 }, ...(mob ? { isMobile: true, hasTouch: true, deviceScaleFactor: 2 } : {}) });
  await ctx.addInitScript(() => { try { localStorage.setItem("mc-saved", JSON.stringify(["640", "101520", "102373"])); } catch {} });
  const p = await ctx.newPage(); await p.route(/\/media\//, (r) => r.abort());
  for (const r of routes) {
    await p.goto(base + r, { waitUntil: "domcontentloaded" }).catch(() => {}); await p.waitForTimeout(2500);
    for (let y = 0; y < 12; y++) { await p.mouse.wheel(0, 1200); await p.waitForTimeout(150); }
    await p.evaluate(() => scrollTo(0, 0)); await p.waitForTimeout(600);
    const res = await p.evaluate(() => {
      const name = (e) => `${e.tagName.toLowerCase()}${e.className && typeof e.className === "string" ? "." + e.className.trim().split(/\s+/).slice(0, 2).join(".") : ""}`;
      const path = (e) => { const a = []; for (let x = e; x && a.length < 3 && x !== document.body; x = x.parentElement) a.push(name(x)); return a.join(" < "); };
      const vis = (e) => { const s = getComputedStyle(e), r = e.getBoundingClientRect(); return s.visibility !== "hidden" && s.display !== "none" && r.width > 2 && r.height > 2 && e.offsetParent !== null; };
      const textCut = [], borderCut = [];
      for (const e of document.querySelectorAll("body *")) {
        if (!vis(e)) continue;
        const s = getComputedStyle(e);
        // (1) 글자 줄 잘림: overflow-y가 보이지 않음 + 내용이 넘침 + 마지막 줄이 일부만
        if (/(hidden|clip)/.test(s.overflowY) && e.scrollHeight > e.clientHeight + 2 && [...e.childNodes].some((n) => n.nodeType === 3 && n.textContent.trim())) {
          const lh = parseFloat(s.lineHeight) || parseFloat(s.fontSize) * 1.3;
          const padT = parseFloat(s.paddingTop) || 0, padB = parseFloat(s.paddingBottom) || 0;
          const inner = e.clientHeight - padT - padB;
          const rem = inner % lh;
          if (rem > 3 && rem < lh - 3) textCut.push(`${path(e)} h=${Math.round(inner)} lh=${Math.round(lh)} "${e.textContent.trim().slice(0, 24)}"`);
        }
        // (2) 테두리·버튼이 잘린 부모 안에 일부만 보임(세로 방향)
        const boxed = (parseFloat(s.borderTopWidth) > 0 && parseFloat(s.borderBottomWidth) > 0) || (parseFloat(s.borderRadius) > 2 && (s.backgroundColor !== "rgba(0, 0, 0, 0)" || s.boxShadow !== "none"));
        if (boxed && e.getBoundingClientRect().height < 120) {
          const r = e.getBoundingClientRect();
          for (let a = e.parentElement; a && a !== document.body; a = a.parentElement) {
            const as = getComputedStyle(a);
            if (/(hidden|clip|auto|scroll)/.test(as.overflowY) || /(hidden|clip|auto|scroll)/.test(as.overflowX)) {
              const ar = a.getBoundingClientRect();
              const bt = parseFloat(as.borderTopWidth) || 0, bb = parseFloat(as.borderBottomWidth) || 0;
              if (r.top < ar.top + bt - 0.5 && r.bottom > ar.top + bt + 2) borderCut.push(`top ${path(e)} in ${name(a)} (${Math.round(ar.top + bt - r.top)}px) "${(e.textContent || "").trim().slice(0, 14)}"`);
              else if (r.bottom > ar.bottom - bb + 0.5 && r.top < ar.bottom - bb - 2) borderCut.push(`bottom ${path(e)} in ${name(a)} (${Math.round(r.bottom - ar.bottom + bb)}px) "${(e.textContent || "").trim().slice(0, 14)}"`);
              break;
            }
          }
        }
      }
      return { textCut: [...new Set(textCut)], borderCut: [...new Set(borderCut)] };
    });
    if (res.textCut.length || res.borderCut.length) out[`${w} /${r}`] = res;
    if (shots) await p.screenshot({ path: `${shots}/${w}-${(r || "home").replace(/[^a-z0-9]+/gi, "_")}.png`, fullPage: true }).catch(() => {});
  }
  await ctx.close();
}
await b.close();
const summary = {};
for (const [k, v] of Object.entries(out)) for (const kind of ["textCut", "borderCut"]) for (const x of v[kind]) { const key = `${kind} ${x.replace(/ h=\d+ lh=\d+| \(\d+px\)/g, "").replace(/"[^"]*"$/, "")}`; (summary[key] ??= []).push(k); }
for (const [k, v] of Object.entries(summary)) console.log(`${k}  ←  ${[...new Set(v)].slice(0, 6).join(" | ")}`);
console.log(`총 ${Object.keys(summary).length}종`);
