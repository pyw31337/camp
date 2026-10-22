// UI 3차 회귀 테스트(소유자 2026-10-21). 실행: node camping-atlas/scripts/ui3-test.mjs [URL]
// 1 실시간 인기 썸네일에 순위·순위 변동 배지 없음  2 칩·배지 오른쪽 숫자는 왼쪽 글자보다 작고 흐림
// 3 조건 시트로 고른 조건은 ‘조건’ 버튼 왼쪽에 × 달린 칩(PC·모바일)  4 조건 시트 도움말 문구 없음
// 5 정렬(추천순·요금 낮은 순·이름순) 없음  6 캡슐 버튼: 기본 투명+회색 테두리, 선택 검정+흰 글자
// 7 카드 정보 6줄(규격·전기·화로·주차·주변·요금) 같은 높이, 320px ‘…’ 없음, 사진 배지와 중복 없음  8 테마 아이콘(소유자 제공 SVG)
const { chromium } = await import(process.env.PW_MODULE || "playwright");
const base = (process.argv[2] || "http://127.0.0.1:8765/").replace(/#.*$/, "").replace(/\/?$/, "/");
const browser = await chromium.launch(process.env.CHROME_PATH ? { executablePath: process.env.CHROME_PATH } : {});
const fails = [];
const png = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=", "base64");
const HELP = ["여러 곳 선택", "시·군 이름과 반경", "하나라도 있으면", "600W로 봐요", "긴 변 기준", "규격 미등록", "운영기간 기준", "근거로 맞는 곳"];
const ROWS = ["규격", "전기", "화로", "주차", "주변", "요금"];
const ICONS = { WINTER: "0 0 50 50", FOREST: "0 0 24 24", BEACH: "0 0 16 16", VISITOR: "0 0 14 14", PICNIC: "0 0 24 24", PARK: "0 0 15 15", WATER_PLAY: "0 0 256 256" };
const capCheck = (page, sel, where, tag) => page.evaluate(([sel]) => {
  const out = [];
  for (const b of document.querySelectorAll(sel)) {
    if (!b.getBoundingClientRect().width || b.closest(".hero")) continue;
    const s = getComputedStyle(b), on = b.getAttribute("aria-pressed") === "true";
    const bg = s.backgroundColor, a = bg === "transparent" ? 0 : Number((bg.match(/rgba?\(([^)]+)\)/)?.[1].split(",")[3] ?? 1));
    if (on && !(bg === "rgb(17, 17, 17)" && s.color === "rgb(255, 255, 255)")) out.push(`선택 ${b.textContent.trim().slice(0, 12)} ${bg}/${s.color}`);
    if (!on && (a > 0 || parseFloat(s.borderTopWidth) < 1 || /255, 255, 255/.test(s.borderTopColor))) out.push(`기본 ${b.textContent.trim().slice(0, 12)} ${bg}/${s.borderTopColor}`);
  }
  return out.slice(0, 3);
}, [sel]).then((r) => r.forEach((x) => fails.push(`${tag} ${where} 캡슐: ${x}`)));
const countCheck = (page, sel, where, tag) => page.evaluate(([sel]) => {
  const out = []; let n = 0;
  for (const i of document.querySelectorAll(sel)) {
    const p = i.parentElement; if (!i.getBoundingClientRect().width) continue; n++;
    const si = getComputedStyle(i), sp = getComputedStyle(p);
    const muted = Number(si.opacity) < 1 || si.color !== sp.color;
    if (!(parseFloat(si.fontSize) < parseFloat(sp.fontSize)) || !muted || Number(si.fontWeight) >= Number(sp.fontWeight)) out.push(`${p.textContent.trim().slice(0, 14)} ${si.fontSize}/${sp.fontSize} w${si.fontWeight}/${sp.fontWeight} o${si.opacity}`);
  }
  return { out: out.slice(0, 3), n };
}, [sel]).then((r) => { r.out.forEach((x) => fails.push(`${tag} ${where} 숫자 글자: ${x}`)); return r.n; });
for (const [w, h] of [[320, 740], [390, 844], [1366, 900]]) {
  const mob = w < 700, tag = String(w);
  const ctx = await browser.newContext({ viewport: { width: w, height: h }, ...(mob ? { isMobile: true, hasTouch: true } : {}) });
  const page = await ctx.newPage();
  const errs = []; page.on("pageerror", (e) => { if (!/_leaflet_pos/.test(e.message)) errs.push(e.message); });
  await page.route(/\/media\//, async (r) => { const x = await r.fetch().catch(() => null); return x && x.ok() ? r.fulfill({ response: x }) : r.fulfill({ status: 200, contentType: "image/png", body: png }); });
  // 홈
  await page.goto(base); await page.waitForSelector(".card", { timeout: 30000 });
  await page.waitForSelector(".trending-rail .tr-card:not(.tr-skel)", { timeout: 20000 }).catch(() => {});
  const tr = await page.evaluate(() => ({ n: document.querySelectorAll(".trending-rail .tr-card:not(.tr-skel)").length, rank: document.querySelectorAll(".trending-rail .tr-rank, .trending-rail .tr-tr").length }));
  if (tr.rank) fails.push(`${tag} 실시간 인기: 순위·변동 배지 ${tr.rank}개 남음`);
  if (!tr.n) console.warn(`${tag} 실시간 인기 카드 없음(데이터 없음) — 배지 검사만`);
  if (await page.$("[data-sort], [data-list-sort], [data-theme-sort]")) fails.push(`${tag} 홈: 정렬 선택 남음`);
  await countCheck(page, ".c-rv-pill > i", "후기 알약", tag);
  // 카드 6줄
  const cards = await page.$$eval(".card[data-id]", (cs) => cs.slice(0, 30).map((c) => {
    const lis = [...c.querySelectorAll(".rows-6 > li")];
    const hs = lis.map((li) => Math.round(li.getBoundingClientRect().height));
    const cut = [...c.querySelectorAll(".card-body *")].filter((e) => { const s = getComputedStyle(e); return s.textOverflow === "ellipsis" && e.scrollWidth > e.clientWidth + 1 && e.getBoundingClientRect().width > 0; }).map((e) => e.className || e.tagName);
    const bd = [...c.querySelectorAll(".bdgs .bdg")].map((b) => b.className + ":" + b.textContent.trim());
    return { id: c.dataset.id, labels: lis.map((li) => li.querySelector(".rl")?.textContent.trim()), hs, cut, vis: lis.length && lis[0].getBoundingClientRect().width > 0,
      // 2026-10-22 소유자: 사진 배지는 윗줄 긍정(초대가능·600W·장작 등)·아랫줄 부정(불가). 정보 줄과 겹쳐도 된다(10-21 중복 금지 규칙 대체).
      order: bd.findIndex((x) => /bdg-no/.test(x)) >= 0 && bd.slice(bd.findIndex((x) => /bdg-no/.test(x))).some((x) => !/bdg-no|bdg-wx|w-alert/.test(x)) ? bd : [] };
  }));
  for (const c of cards.filter((x) => x.vis)) {
    if (c.labels.join() !== ROWS.join()) fails.push(`${tag} 카드 #${c.id}: 줄 ${c.labels.join("·")} (기대 ${ROWS.join("·")})`);
    if (Math.max(...c.hs) - Math.min(...c.hs) > 1) fails.push(`${tag} 카드 #${c.id}: 줄 높이 다름 ${c.hs.join("/")}`);
    if (w === 320 && c.cut.length) fails.push(`${tag} 카드 #${c.id}: ‘…’ 잘림 ${c.cut.slice(0, 2).join(",")}`);
    if (c.order.length) fails.push(`${tag} 카드 #${c.id}: 부정 배지 뒤에 긍정 배지 ${c.order.join(",")}`);
  }
  if (!cards.some((x) => x.vis)) fails.push(`${tag} 홈: 보이는 카드 없음`);
  // 목록 + 조건 칩
  await page.goto(`${base}list?sido=${encodeURIComponent("인천")}&w=600`); await page.waitForSelector(".lrow", { timeout: 30000 }); await page.waitForTimeout(800);
  if (await page.$("[data-sort], [data-list-sort], [data-theme-sort]")) fails.push(`${tag} 목록: 정렬 선택 남음`);
  const pills = await page.evaluate(() => {
    const cond = [...document.querySelectorAll(".list-tools [data-open-cond]")].find((b) => b.getBoundingClientRect().width > 0);
    const cr = cond?.getBoundingClientRect();
    return [...document.querySelectorAll(".list-page [data-cond-pills] .cond-pill")].filter((p) => p.getBoundingClientRect().width > 0).map((p) => { const r = p.getBoundingClientRect(); return { t: p.textContent.replace("×", "").trim(), x: /×/.test(p.textContent), left: r.right <= cr.left + 1 || r.bottom <= cr.top + 1, before: Boolean(p.compareDocumentPosition(cond) & Node.DOCUMENT_POSITION_FOLLOWING) }; });
  });
  for (const want of ["인천", "600W 이상"]) {
    const p = pills.find((x) => x.t === want);
    if (!p) fails.push(`${tag} 목록: ‘${want} ×’ 칩 없음 (${pills.map((x) => x.t).join(",")})`);
    else if (!p.x || !p.left || !p.before) fails.push(`${tag} 목록: ‘${want}’ 칩이 ×·‘조건’ 왼쪽 조건을 못 지킴 ${JSON.stringify(p)}`);
  }
  await page.click('.list-page .cond-pill[data-cond-x="w"]'); await page.waitForTimeout(1000);
  if (/[?&]w=/.test(await page.evaluate(() => (location.pathname + location.search)))) fails.push(`${tag} 목록: ‘600W 이상 ×’로 조건이 안 지워짐`);
  if (!mob) { await capCheck(page, ".list-page .filter-zone .chip", "목록 칩", tag); await countCheck(page, ".list-page .type-chip > i", "사이트 칩", tag); }
  // 조건 시트
  await page.click(".list-tools [data-open-cond]"); await page.waitForSelector("#cond-dialog[open]");
  const sheet = await page.evaluate((HELP) => { const d = document.querySelector("#cond-dialog"); return { help: HELP.filter((t) => d.textContent.includes(t)), small: d.querySelectorAll("h3 small").length }; }, HELP);
  if (sheet.help.length || sheet.small) fails.push(`${tag} 조건 시트: 도움말 남음 ${sheet.help.join(",")} (small ${sheet.small})`);
  await capCheck(page, "#cond-dialog .chip", "조건 시트", tag);
  if (!(await countCheck(page, "#cond-dialog .cond-chips .chip > i", "조건 시트", tag))) fails.push(`${tag} 조건 시트: 숫자 칩 없음`);
  await page.keyboard.press("Escape");
  // 테마 화면: 정렬 없음 + 아이콘
  await page.goto(`${base}theme/FOREST`); await page.waitForTimeout(1500);
  if (await page.$("[data-sort], [data-list-sort], [data-theme-sort]")) fails.push(`${tag} 테마: 정렬 선택 남음`);
  if (await page.evaluate(() => /추천순|이름순|요금 낮은/.test(document.querySelector("#view").textContent))) fails.push(`${tag} 테마: 정렬 글자 남음`);
  if (w === 1366) {
    await page.goto(`${base}themes`); await page.waitForSelector(".theme-card");
    const ics = await page.evaluate(() => Object.fromEntries([...document.querySelectorAll(".theme-card")].map((a) => [decodeURIComponent(a.getAttribute("href").split("/").pop()), { vb: a.querySelector("svg.th-ic")?.getAttribute("viewBox"), fill: a.querySelector("svg.th-ic") ? getComputedStyle(a.querySelector("svg.th-ic path, svg.th-ic g")).fill : "", ink: getComputedStyle(a.querySelector("svg.th-ic")?.parentElement ?? a).color }])));
    for (const [k, vb] of Object.entries(ICONS)) {
      if (!ics[k]) { fails.push(`테마 ${k}: 카드 없음`); continue; }
      if (ics[k].vb !== vb) fails.push(`테마 ${k}: 아이콘 viewBox ${ics[k].vb} (소유자 SVG ${vb})`);
      if (ics[k].fill !== ics[k].ink) fails.push(`테마 ${k}: 아이콘 색 ${ics[k].fill} ≠ 글자색 ${ics[k].ink}(currentColor)`);
    }
  }
  if (errs.length) fails.push(`${tag} pageerror: ${errs.slice(0, 3).join(" | ")}`);
  await ctx.close();
}
await browser.close();
if (fails.length) { console.error(`FAIL UI3 ${fails.length}건\n${fails.join("\n")}`); process.exit(1); }
console.log("OK UI3 — 인기 배지 없음·숫자 글자·조건 칩·도움말 없음·정렬 없음·캡슐·카드 6줄·테마 아이콘");
