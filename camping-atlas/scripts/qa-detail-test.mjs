// 상세 화면 상식 회귀 테스트(QA 2026-10-20). 실패하면 병합 금지.
// 검사: 공원 상세에 캠핑장용 요금(2.5만~4만원)·입실 14:00·600W·'캠퍼 한마디'(문자 id는 저장 불가)가 없어야 한다.
//       명학산 캠핑장(1066)에 관광공사 광고 요금 185,000원이 없어야 한다. 휴양림(483) 숯 문구 모순 없음. pageerror 0.
// 실행: node camping-atlas/scripts/qa-detail-test.mjs [URL]
const { chromium } = await import(process.env.PW_MODULE || "playwright");
const url = (process.argv[2] || "http://127.0.0.1:8765/").replace(/\/?$/, "/");
const browser = await chromium.launch(process.env.CHROME_PATH ? { executablePath: process.env.CHROME_PATH } : {});
const fails = [];
const cases = [
  { id: "osm-w25979109", no: [/2\.5만~4만원|25,000~40,000/, /입실\s*14:00/, /600W/, /캠퍼 한마디/] },
  { id: "hangang-jamwon", no: [/입실\s*14:00/, /캠퍼 한마디/] },
  { id: "1066", no: [/185,000|18\.5만/] },
  { id: "483", no: [/숯만 가능/], has: [/금원산/] },
  // 2026-10-21: 표준 조례 일괄 입실·퇴실은 참고값으로 표시, 시·도 짧은 이름, 중복 합친 곳은 남은 곳으로 이동, 좌표 오류는 지도에 안 찍음
  { id: "2931", has: [/조례 기준 참고|업장 미공지/] },
  { id: "8074", has: [/광주 광산구/] },
  { id: "102082", go: "102142", has: [/팔봉야영장/] },
  { id: "100714", has: [/연화동권역/], no: [/제주/] },
];
for (const vp of [{ width: 1366, height: 900 }, { width: 390, height: 844 }]) {
  const ctx = await browser.newContext({ viewport: vp });
  const page = await ctx.newPage();
  const errs = [];
  page.on("pageerror", (e) => errs.push(e.message));
  await page.route(/supabase\.co|open-meteo\.com|dapi\.kakao|daumcdn/, (r) => r.abort());
  for (const c of cases) {
    await page.goto(`${url}place/${c.id}`, { waitUntil: "domcontentloaded" });
    await page.waitForFunction(() => document.querySelector(".d-sec, [class*=detail]") && document.body.innerText.length > 400, null, { timeout: 30000 }).catch(() => fails.push(`${vp.width} ${c.id}: 상세가 열리지 않음`));
    await page.waitForTimeout(1200);
    const t = await page.evaluate(() => document.body.innerText);
    for (const r of c.no ?? []) if (r.test(t)) fails.push(`${vp.width} ${c.id}: 있으면 안 되는 문구 ${r}`);
    for (const r of c.has ?? []) if (!r.test(t)) fails.push(`${vp.width} ${c.id}: 있어야 할 문구 없음 ${r}`);
    if (c.go && !page.url().endsWith(`/place/${c.go}`)) fails.push(`${vp.width} ${c.id}: 합친 곳(${c.go})으로 옮겨지지 않음 — ${page.url()}`);
  }
  if (errs.length) fails.push(`${vp.width} pageerror: ${errs.slice(0, 3).join(" | ")}`);
  await ctx.close();
}
await browser.close();
if (fails.length) { console.log(fails.map((f) => `::error::${f}`).join("\n")); process.exit(1); }
console.log("상세 화면 상식 검사 통과");
