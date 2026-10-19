// 전국 캠핑장 탐색 화면을 GitHub Pages(https://pyw31337.github.io/camp/)로 발행할 파일을 만든다.
// camping-atlas/public/ 및 camping-atlas/public/explore/ 아래에 index.html + data/*.json을 쓰면 Pages 빌드가 그대로 포함한다.
// 사용: (pipeline) npm run build:explore → node scripts/publish-explorer-pages.mjs
// KAKAO_JS_KEY: 브라우저에 노출되는 지도 키(카카오 개발자 콘솔의 도메인 제한으로 보호). 없으면 지도 없이 목록만.
import { cp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("../", import.meta.url));
const dataDir = `${root}pipeline/out/explore`;

// --shell-only <dir>: 데이터는 그대로 두고 화면(index.html)만 최신 디자인으로 다시 쓴다(배포 때 화면 변경을 바로 반영).
const shellIdx = process.argv.indexOf("--shell-only");
const rawTarget = shellIdx > 0 ? (process.argv[shellIdx + 1] ?? `${root}camping-atlas/dist/client/explore/`).replace(/\/?$/, "/") : null;

// out: explore 디렉토리 (camping-atlas/dist/client/explore/ 또는 camping-atlas/public/explore/)
// rootOut: 루트 디렉토리 (camping-atlas/dist/client/ 또는 camping-atlas/public/)
let out, rootOut;
if (rawTarget) {
  if (rawTarget.endsWith("/explore/")) {
    out = rawTarget;
    rootOut = rawTarget.slice(0, -"/explore/".length + 1);
  } else {
    rootOut = rawTarget;
    out = `${rawTarget}explore/`;
  }
} else {
  rootOut = `${root}camping-atlas/public/`;
  out = `${root}camping-atlas/public/explore/`;
}

if (!rawTarget && !existsSync(`${dataDir}/campgrounds.json`)) {
  console.log("::warning title=탐색 화면 발행 건너뜀::pipeline/out/explore가 없습니다(npm run build:explore 먼저).");
  process.exit(0);
}
if (rawTarget && !existsSync(`${out}data/campgrounds.json`) && !existsSync(`${rootOut}explore/data/campgrounds.json`)) {
  console.log("::notice::탐색 데이터가 아직 없어 화면만 갱신하지 않습니다.");
  process.exit(0);
}

// 공식 접수 상태는 30분마다 독립 갱신된다. 일일 카탈로그 발행이 원천 장애를
// 이유로 이 짧은 TTL 파일을 지우면 오래된 상태를 보일 수 있으므로, 성공한 새
// 파일이 없을 땐 이전 파일을 그대로 보존한다(브라우저는 expires_at 이후 무시).
const previousAvailability = !rawTarget && existsSync(`${out}data/availability.json`) ? await readFile(`${out}data/availability.json`) : null;
if (!rawTarget) {
  await rm(out, { recursive: true, force: true });
  await mkdir(`${out}data`, { recursive: true });
}

const kakaoKey = (process.env.KAKAO_JS_KEY ?? "").replace(/[^A-Za-z0-9]/g, "");
const supabaseUrl = process.env.SUPABASE_URL || "https://zgnetdxqzsnmzdvoxzbw.supabase.co";
const supabaseAnonKey = process.env.SUPABASE_ANON_KEY || process.env.SUPABASE_PUBLISHABLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY || "";

// 원본(HTML·CSS·JS)은 design/renewal 하나만 관리하며, 여기서는 경로별 산출물만 만든다.
const [renewalIndex, renewalCss, renewalApp] = await Promise.all([
  readFile(`${root}design/renewal/index.html`, "utf8"),
  readFile(`${root}design/renewal/style.css`, "utf8"),
  readFile(`${root}design/renewal/app.js`, "utf8"),
]);

// 1. 루트 메인 화면(https://pyw31337.github.io/camp/): 어떤 리다이렉트도 없이 즉시 열리는 메인 앱 셸
const rootIndex = renewalIndex.replace(
  "</head>",
  `<meta name="apple-mobile-web-app-capable" content="yes"><meta name="apple-mobile-web-app-status-bar-style" content="black-translucent"><meta name="kakao-js-key" content="${kakaoKey}"><meta name="supabase-url" content="${supabaseUrl}"><meta name="supabase-anon-key" content="${supabaseAnonKey}"></head>`
);
const rootCss = renewalCss.replaceAll('url("../images/', 'url("./images/');
await mkdir(rootOut, { recursive: true });
await writeFile(`${rootOut}index.html`, rootIndex);
await writeFile(`${rootOut}style.css`, rootCss);
await writeFile(`${rootOut}app.js`, renewalApp);

// 2. /explore/ 경로: 구 주소로 들어온 사용자를 https://pyw31337.github.io/camp/ 단일 주소로 자동 연결
const exploreRedirectScript = `<script>
  (function() {
    var target = "../" + location.search + location.hash;
    location.replace(target);
  })();
</script><meta http-equiv="refresh" content="0; url=../">`;
const exploreIndex = renewalIndex
  .replace("<head>", `<head>\n    ${exploreRedirectScript}`)
  .replace(
    "</head>",
    `<meta name="apple-mobile-web-app-capable" content="yes"><meta name="apple-mobile-web-app-status-bar-style" content="black-translucent"><meta name="kakao-js-key" content="${kakaoKey}"><meta name="supabase-url" content="${supabaseUrl}"><meta name="supabase-anon-key" content="${supabaseAnonKey}"></head>`
  )
  .replaceAll('href="./manifest.webmanifest"', 'href="../manifest.webmanifest"')
  .replaceAll('href="./favicon.svg"', 'href="../favicon.svg"')
  .replaceAll('href="./images/', 'href="../images/');

await mkdir(out, { recursive: true });
await writeFile(`${out}index.html`, exploreIndex);
await writeFile(`${out}style.css`, renewalCss);
await writeFile(`${out}app.js`, renewalApp);
await mkdir(`${out}data`, { recursive: true });
await cp(`${root}design/renewal/data/photos.json`, `${out}data/photos.json`);

// 브랜드 자산(파비콘, PWA 아이콘, 오픈그래프 배너 이미지)을 대상 디렉토리에 동기화
const copyBrandImages = async (destDir) => {
  const imgDest = `${destDir}images/`;
  await mkdir(imgDest, { recursive: true });
  for (const f of ["og-image.png", "og-image.webp", "apple-touch-icon.png", "icon-192.png", "icon-512.png"]) {
    const src = `${root}camping-atlas/public/images/${f}`;
    const dst = `${imgDest}${f}`;
    if (existsSync(src) && resolve(src) !== resolve(dst)) await cp(src, dst);
  }
  for (const f of ["favicon.svg", "favicon.png", "manifest.webmanifest"]) {
    const src = `${root}camping-atlas/public/${f}`;
    const dst = `${destDir}${f}`;
    if (existsSync(src) && resolve(src) !== resolve(dst)) await cp(src, dst);
  }
};
await copyBrandImages(rootOut);
await copyBrandImages(out);

// 보조 주소도 독립된 옛 UI를 만들지 않고, 실제 A 포스터 앱의 해시 화면으로 보낸다.
const routePage = (title, route) => `<!doctype html><html lang="ko"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover"><title>${title} · 모여라 캠핑</title><meta http-equiv="refresh" content="0; url=../${route}"><script>location.replace(${JSON.stringify(`../${route}`)})</script></head><body><a href="../${route}">${title} 보기</a></body></html>`;
const writeUtilityPages = async (baseDir) => {
  const routes = [
    ["themes/index.html", "테마로 찾기", "#/themes"],
    ["openings/index.html", "예약 오픈 일정", "#/openings"],
    ["guide/index.html", "이용 가이드", "#/guide"],
    ["passport/index.html", "내 캠핑 비교", "#/compare"],
    ["collections/index.html", "테마로 찾기", "#/themes"],
  ];
  for (const [relative, title, route] of routes) {
    const file = `${baseDir}${relative}`;
    await mkdir(file.slice(0, file.lastIndexOf("/")), { recursive: true });
    await writeFile(file, routePage(title, route));
  }
};

await writeUtilityPages(rootOut);
await writeUtilityPages(out);

if (rawTarget) {
  console.log(`메인 화면 및 탐색 화면 갱신: ${rootOut}index.html & ${out}index.html${kakaoKey ? " · 지도 키 있음" : " · 지도 키 없음"}`);
  process.exit(0);
}

await cp(`${dataDir}/campgrounds.json`, `${out}data/campgrounds.json`);
await cp(`${dataDir}/meta.json`, `${out}data/meta.json`);
if (existsSync(`${dataDir}/featured.json`)) await cp(`${dataDir}/featured.json`, `${out}data/featured.json`);
if (existsSync(`${dataDir}/openings.json`)) await cp(`${dataDir}/openings.json`, `${out}data/openings.json`);
if (existsSync(`${dataDir}/availability.json`)) await cp(`${dataDir}/availability.json`, `${out}data/availability.json`);
else if (previousAvailability) await writeFile(`${out}data/availability.json`, previousAvailability);
const galleryReg = `${root}pipeline/registry/photo-gallery.json`;
if (existsSync(galleryReg)) await cp(galleryReg, `${out}data/photo-gallery.json`);
if (existsSync(`${dataDir}/camps`)) await cp(`${dataDir}/camps`, `${out}data/camps`, { recursive: true });

// 공유용 정적 페이지: 캠핑장마다 c/{id}/ 에 오픈그래프·트위터 카드 메타를 넣고, 사람은 탐색 화면 상세로 보낸다.
const SITE = (process.env.SITE_URL ?? "https://pyw31337.github.io/camp/").replace(/\/?$/, "/");
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
  await writeFile(`${dir}index.html`, page({ url: `${SITE}c/${c.id}/`, title: `${c.name} · 모여라 캠핑`, description, image: c.img ? c.img.replace(/^http:/, "https:") : null, redirect: `../../#/c/${c.id}` }));
  // 루트 c/{id}/ 도 함께 생성하여 루트 공유 링크도 완벽 지원
  const rootCampDir = `${rootOut}c/${c.id}/`;
  await mkdir(rootCampDir, { recursive: true });
  await writeFile(`${rootCampDir}index.html`, page({ url: `${SITE}c/${c.id}/`, title: `${c.name} · 모여라 캠핑`, description, image: c.img ? c.img.replace(/^http:/, "https:") : null, redirect: `../../#/c/${c.id}` }));
  pages++;
}
console.log(`공유용 캠핑장 페이지 ${pages}개`);
console.log(`camping-atlas 루트 및 explore 발행 준비 완료${kakaoKey ? " · 지도 키 있음" : " · 지도 키 없음"}`);
