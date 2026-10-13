// 전국 캠핑장 탐색 화면을 GitHub Pages(https://pyw31337.github.io/camp/explore/)로 발행할 파일을 만든다.
// camping-atlas/public/explore/ 아래에 index.html + data/*.json을 쓰면 Pages 빌드가 그대로 포함한다.
// 사용: (pipeline) npm run build:explore → node scripts/publish-explorer-pages.mjs
// KAKAO_JS_KEY: 브라우저에 노출되는 지도 키(카카오 개발자 콘솔의 도메인 제한으로 보호). 없으면 지도 없이 목록만.
import { cp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { utilityPages } from "../design/explore/utility-pages.mjs";

const root = fileURLToPath(new URL("../", import.meta.url));
const dataDir = `${root}pipeline/out/explore`;
// --shell-only <dir>: 데이터는 그대로 두고 화면(index.html)만 최신 디자인으로 다시 쓴다(배포 때 화면 변경을 바로 반영).
const shellIdx = process.argv.indexOf("--shell-only");
const shellOnly = shellIdx > 0 ? (process.argv[shellIdx + 1] ?? `${root}camping-atlas/dist/client/explore/`).replace(/\/?$/, "/") : null;
if (!shellOnly && !existsSync(`${dataDir}/campgrounds.json`)) { console.log("::warning title=탐색 화면 발행 건너뜀::pipeline/out/explore가 없습니다(npm run build:explore 먼저)."); process.exit(0); }
const out = shellOnly ?? `${root}camping-atlas/public/explore/`;
if (shellOnly && !existsSync(`${out}data/campgrounds.json`)) { console.log("::notice::탐색 데이터가 아직 없어 화면만 갱신하지 않습니다."); process.exit(0); }
if (!shellOnly) { await rm(out, { recursive: true, force: true }); await mkdir(`${out}data`, { recursive: true }); }
const kakaoKey = (process.env.KAKAO_JS_KEY ?? "").replace(/[^A-Za-z0-9]/g, "");
// 댓글(giscus) 설정: 저장소 변수 GISCUS_CONFIG = {"repo":"pyw31337/camp","repoId":"…","category":"…","categoryId":"…"}
let giscus = "";
try { const g = JSON.parse(process.env.GISCUS_CONFIG || "null"); if (g?.repoId && g?.categoryId) giscus = JSON.stringify({ repo: g.repo, repoId: g.repoId, category: g.category, categoryId: g.categoryId }).replace(/"/g, "&quot;"); } catch {}
const body = await readFile(`${root}design/explore/index.html`, "utf8");
await writeFile(`${out}index.html`, `<!doctype html>
<html lang="ko">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">
<meta name="description" content="전국 캠핑장을 지도와 목록으로 찾고, 사이트 크기·시설·주변 화장실을 비교해 공식 예약처로 바로 예약하세요.">
<meta name="theme-color" content="#1f9d5c">
<meta name="kakao-js-key" content="${kakaoKey}">
<meta name="giscus" content="${giscus}">
<link rel="icon" href="../favicon.svg">
</head>
<body>
${body}
</body>
</html>
`);
const writeUtilityPages = async () => {
  for (const [relative, html] of utilityPages()) {
    const file = `${out}${relative}`;
    await mkdir(file.slice(0, file.lastIndexOf("/")), { recursive: true });
    await writeFile(file, html);
  }
};
if (shellOnly) {
  await writeUtilityPages();
  console.log(`탐색 화면·보조 페이지 갱신: ${out}index.html${kakaoKey ? " · 지도 키 있음" : " · 지도 키 없음"}`);
  process.exit(0);
}
await cp(`${dataDir}/campgrounds.json`, `${out}data/campgrounds.json`);
await cp(`${dataDir}/meta.json`, `${out}data/meta.json`);
if (existsSync(`${dataDir}/featured.json`)) await cp(`${dataDir}/featured.json`, `${out}data/featured.json`);
if (existsSync(`${dataDir}/openings.json`)) await cp(`${dataDir}/openings.json`, `${out}data/openings.json`);
if (existsSync(`${dataDir}/camps`)) await cp(`${dataDir}/camps`, `${out}data/camps`, { recursive: true });
await writeUtilityPages();

// 공유용 정적 페이지: 캠핑장마다 c/{id}/ 에 오픈그래프·트위터 카드 메타를 넣고, 사람은 탐색 화면 상세로 보낸다.
// 카카오톡·메신저 미리보기는 자바스크립트를 실행하지 않으므로 메타가 HTML에 들어 있어야 한다.
const SITE = (process.env.SITE_URL ?? "https://pyw31337.github.io/camp/explore/").replace(/\/?$/, "/");
const attr = (v) => String(v ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
const camps = JSON.parse(await readFile(`${dataDir}/campgrounds.json`, "utf8"));
const KIND = { AUTO_PITCH: "오토캠핑", PITCH: "일반 캠핑", GLAMPING: "글램핑", CARAVAN_RENTAL: "카라반", RV_PITCH: "개인 카라반" };
const page = ({ url, title, description, image, redirect }) => `<!doctype html>
<html lang="ko"><head><meta charset="utf-8">
<title>${attr(title)}</title>
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="description" content="${attr(description)}">
<link rel="canonical" href="${attr(url)}">
<meta property="og:type" content="website"><meta property="og:site_name" content="모여라 캠핑"><meta property="og:locale" content="ko_KR">
<meta property="og:title" content="${attr(title)}"><meta property="og:description" content="${attr(description)}"><meta property="og:url" content="${attr(url)}">
${image ? `<meta property="og:image" content="${attr(image)}"><meta name="twitter:image" content="${attr(image)}">` : ""}
<meta name="twitter:card" content="${image ? "summary_large_image" : "summary"}"><meta name="twitter:title" content="${attr(title)}"><meta name="twitter:description" content="${attr(description)}">
<meta http-equiv="refresh" content="0; url=${attr(redirect)}">
<script>location.replace(${JSON.stringify(redirect)});</script>
</head><body><p><a href="${attr(redirect)}">${attr(title)} 보기</a></p></body></html>
`;
let pages = 0;
for (const c of camps) {
  const where = [c.sido, c.sigungu].filter(Boolean).join(" ");
  const kinds = (c.kinds ?? []).map(([k]) => KIND[k]).filter(Boolean).join("·");
  const description = [c.line, where, kinds, "사이트 크기·시설·주변 정보와 공식 예약처 바로가기"].filter(Boolean).join(" · ").slice(0, 160);
  const dir = `${out}c/${c.id}/`;
  await mkdir(dir, { recursive: true });
  await writeFile(`${dir}index.html`, page({ url: `${SITE}c/${c.id}/`, title: `${c.name} · 모여라 캠핑`, description, image: c.img ? c.img.replace(/^http:/, "https:") : null, redirect: `../../#c=${c.id}` }));
  pages++;
}
console.log(`공유용 캠핑장 페이지 ${pages}개`);
console.log(`camping-atlas/public/explore 발행 준비 완료${kakaoKey ? " · 지도 키 있음" : " · 지도 키 없음"}`);
