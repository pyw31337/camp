const { chromium } = require(process.env.PW);
const AUDIT = () => {
  const W = document.documentElement.clientWidth, out = { wraps: [], over: [], strip: [] };
  const vis = (el) => { const cs = getComputedStyle(el); return cs.display !== 'none' && cs.visibility !== 'hidden' && el.getClientRects().length; };
  const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
  let n; while ((n = walker.nextNode())) {
    const el = n.parentElement; if (!el || !n.textContent.trim() || el.closest('[hidden],script,style,svg,[data-wrap-ok]') || !vis(el)) continue;
    const r = document.createRange(); r.selectNodeContents(n);
    const tops = [...new Set([...r.getClientRects()].filter(x => x.width > 0).map(x => Math.round(x.top / 4)))];
    if (tops.length > 1) out.wraps.push(`${el.tagName.toLowerCase()}.${el.className} «${n.textContent.trim().slice(0, 30)}»`);
  }
  document.querySelectorAll('body *').forEach(el => { if (el.closest('.scroller,.strip,.cond-pills,.d-tabs,[hidden],.provider-quick') || !vis(el)) return; const b = el.getBoundingClientRect(); if (b.width && (b.right > W + 1 || b.left < -1)) out.over.push(el.tagName + '.' + (el.className.baseVal ?? el.className)); });
  document.querySelectorAll('.strip').forEach(st => { if (!vis(st)) return; [...st.children].forEach((c, i) => { if (c.getBoundingClientRect().width > st.clientWidth + 1) out.strip.push('card' + i + ' wider than strip'); }); });
  if (document.documentElement.scrollWidth > W) out.over.unshift('PAGE scrollWidth ' + document.documentElement.scrollWidth);
  return out;
};
(async () => {
  const b = await chromium.launch(); const base = 'file://' + process.argv[2] + '/preview.html'; let bad = 0;
  for (const w of [320, 344, 360, 375, 390, 412, 480, 640, 700, 768, 900, 1024, 1180, 1280, 1440, 1920]) {
    const p = await b.newPage({ viewport: { width: w, height: 900 } }); const errs = []; p.on('pageerror', e => errs.push(e.message));
    const runs = [['home'], ['search'], ['detail'], ['calendar'], ['saved']];
    if (w <= 412 || w === 1440) for (const sh of ['region', 'date', 'people', 'gear', 'filter']) runs.push(['search', sh]);
    if (w <= 412 || w === 1440) runs.push(['calendar', 'subscribe']);
    for (const [s, sh] of runs) {
      await p.goto(base + '#' + s); await p.waitForTimeout(250);
      if (sh) { await p.locator(`[data-sheet="${sh}"]:visible`).first().click(); await p.waitForTimeout(150); }
      const r = await p.evaluate(AUDIT);
      if (sh) await p.keyboard.press('Escape');
      const issues = [...r.wraps.map(x => 'WRAP ' + x), ...r.over.slice(0, 4).map(x => 'OVER ' + x), ...r.strip];
      if (issues.length) { bad += issues.length; console.log(`${w} ${s}${sh ? '+' + sh : ''}:\n  ` + [...new Set(issues)].slice(0, 12).join('\n  ')); }
    }
    if (errs.length) console.log(w, 'ERR', errs);
    await p.close();
  }
  console.log('TOTAL ISSUES', bad); await b.close();
})();
