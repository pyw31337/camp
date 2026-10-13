const { chromium } = require(process.env.PW);
(async () => { const b = await chromium.launch(); const base = 'file://' + process.argv[2] + '/preview.html';
for (const w of [320, 360, 390, 768, 1024, 1440]) { const p = await b.newPage({ viewport: { width: w, height: 900 } });
  for (const s of ['home','search','detail','calendar']) { await p.goto(base + '#' + s); await p.waitForTimeout(250);
    const t = await p.evaluate(() => [...document.querySelectorAll('body *')].filter(el => { const cs = getComputedStyle(el); return cs.textOverflow === 'ellipsis' && el.getClientRects().length && !el.closest('[hidden]') && el.scrollWidth > el.clientWidth + 1; }).map(el => `${el.tagName.toLowerCase()}.${el.className} «${el.textContent.trim().slice(0,28)}»`));
    if (t.length) console.log(w, s, '\n  ' + [...new Set(t)].join('\n  ')); }
  await p.close(); }
await b.close(); })();
