// 상세 화면 소유자 요청 회귀 테스트(2026-10-21): 1) 섹션 제목 아이콘 녹색 네모 없음
const { chromium } = await import(process.env.PW_MODULE || "playwright");
const base = (process.argv[2] || "http://127.0.0.1:8765/").replace(/#.*$/, "");
const id = process.env.DETAIL_ID || "7253";
const browser = await chromium.launch(process.env.CHROME_PATH ? { executablePath: process.env.CHROME_PATH } : {});
const fails = [];
// 배포 원본(design/renewal)도 확인: 서비스 화면은 여기서 만들어진다.
{
  const { readFileSync } = await import("node:fs");
  const root = new URL("../../", import.meta.url);
  const html = readFileSync(new URL("design/renewal/index.html", root), "utf8");
  const css = readFileSync(new URL("design/renewal/style.css", root), "utf8");
  if (/<path d="M0 0h\d+v\d+H0z" fill="none"\/>/.test(html)) fails.push("design/renewal/index.html: 아이콘에 투명 크기 사각형이 남아 있음");
  if (!css.includes('.ic path[d^="M0 0h"][fill="none"] { stroke: none; }')) fails.push("design/renewal/style.css: 아이콘 사각형 선 끄기 규칙 없음");
}
for (const [w, h, tag] of [[1366, 900, "1366"], [320, 800, "320"]]) {
  const page = await browser.newPage({ viewport: { width: w, height: h } });
  await page.goto(`${base}place/${id}`, { waitUntil: "networkidle" });
  await page.waitForSelector(".d-sec .sec-title .ic", { timeout: 30000 });
  // 아래 섹션은 화면에 들어올 때 그려지므로 끝까지 내린다.
  for (let i = 0; i < 40; i++) { await page.mouse.wheel(0, 800); await page.waitForTimeout(120); }
  await page.waitForSelector("#sec-info .sec-title .ic", { timeout: 15000 }).catch(() => fails.push(`${tag}: 업체 정보 섹션 없음`));
  // 1) 크기 맞춤용 투명 사각형(fill="none")에 선이 그려지면 녹색 네모가 된다.
  const boxed = await page.$$eval(".ic use", (us) => {
    const out = [];
    for (const u of us) {
      const sym = document.querySelector(u.getAttribute("href"));
      if (!sym) continue;
      const svg = u.closest("svg");
      const clone = sym.cloneNode(true); // 실제 렌더 규칙과 같게 svg 안에서 계산
      const g = document.createElementNS("http://www.w3.org/2000/svg", "g");
      for (const n of [...clone.childNodes]) g.appendChild(n);
      svg.appendChild(g);
      for (const p of g.querySelectorAll('path[fill="none"]')) if (/^M0 0h\d+v\d+H0z$/.test(p.getAttribute("d") || "")) { const s = getComputedStyle(p).stroke; if (s && s !== "none") out.push(`${u.getAttribute("href")} stroke=${s}`); }
      g.remove();
    }
    return [...new Set(out)];
  });
  if (boxed.length) fails.push(`${tag}: 아이콘 투명 사각형에 테두리 ${boxed.slice(0, 3).join(", ")}`);
  await page.close();
}
await browser.close();
if (fails.length) { console.error("FAIL\n" + fails.join("\n")); process.exit(1); }
console.log("OK detail-fixes");
