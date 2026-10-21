// 전국 캠핑장 탐색 화면을 GitHub Pages(https://pyw31337.github.io/camp/)로 발행할 파일을 만든다.
// camping-atlas/public/ 및 camping-atlas/public/explore/ 아래에 index.html + data/*.json을 쓰면 Pages 빌드가 그대로 포함한다.
// 사용: (pipeline) npm run build:explore → node scripts/publish-explorer-pages.mjs
// KAKAO_JS_KEY: 브라우저에 노출되는 지도 키(카카오 개발자 콘솔의 도메인 제한으로 보호). 없으면 지도 없이 목록만.
import { cp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { createHash } from "node:crypto";
import { dirname, resolve } from "node:path";
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
const [renewalIndex, shellCss, renewalCss, renewalApp] = await Promise.all([
  readFile(`${root}design/renewal/index.html`, "utf8"),
  readFile(`${root}design/renewal/shell.css`, "utf8"),
  readFile(`${root}design/renewal/style.css`, "utf8"),
  readFile(`${root}design/renewal/app.js`, "utf8"),
]);
// Pages CDN/PWA가 이전 CSS·JS를 계속 잡고 있어 루트에 구 UI가 남는 일을 막는다.
// 내용이 바뀔 때만 URL이 바뀌므로 캐시 효율도 유지한다.
const shellVersion = createHash("sha256").update(shellCss).update(renewalCss).update(renewalApp).digest("hex").slice(0, 12);
const versionedShell = (html) => html
  .replace('href="./shell.css"', `href="./shell.css?v=${shellVersion}"`)
  .replace('href="./style.css"', `href="./style.css?v=${shellVersion}"`)
  .replace('src="./app.js"', `src="./app.js?v=${shellVersion}"`);

// 1. 루트 메인 화면(https://pyw31337.github.io/camp/): 어떤 리다이렉트도 없이 즉시 열리는 메인 앱 셸
// 성능(2026-10-21): 첫 화면 데이터는 app.js를 받기 전부터 미리 받는다(app.js의 fetch와 같은 주소·같은 자격 → 캐시 재사용). 고캠핑 사진 호스트는 미리 연결.
const rootPreload = `<link rel="preload" href="./explore/data/campgrounds.lite.json" as="fetch" crossorigin="anonymous"><link rel="preload" href="./explore/data/photos.json" as="fetch" crossorigin="anonymous"><link rel="preconnect" href="https://gocamping.or.kr">`;
const rootIndex = versionedShell(renewalIndex).replace(
  "</head>",
  `${rootPreload}<meta name="apple-mobile-web-app-capable" content="yes"><meta name="apple-mobile-web-app-status-bar-style" content="black-translucent"><meta name="kakao-js-key" content="${kakaoKey}"><meta name="supabase-url" content="${supabaseUrl}"><meta name="supabase-anon-key" content="${supabaseAnonKey}"></head>`
);
const rootCss = renewalCss.replaceAll('url("../images/', 'url("./images/');
await mkdir(rootOut, { recursive: true });
await writeFile(`${rootOut}index.html`, rootIndex);
await writeFile(`${rootOut}style.css`, rootCss);
await writeFile(`${rootOut}shell.css`, shellCss);
await writeFile(`${rootOut}app.js`, renewalApp);

// 1-1. 공통 틀(헤더·푸터·하단 탭)을 앱 밖 쪽(/log/)에도 그대로 넣는다. 원본은 design/renewal/index.html의 shell:* 표시 사이 하나뿐.
const shellPart = (name) => {
  const m = renewalIndex.match(new RegExp(`<!-- ${name}[^>]*-->([\\s\\S]*?)<!-- /${name} -->`));
  if (!m) throw new Error(`design/renewal/index.html에 ${name} 표시가 없습니다`);
  return m[1].trim();
};
const shellIcons = () => {
  const ids = ["i-tent", "i-search", "i-map", "i-themes", "i-compare", "i-heart"];
  const syms = ids.map((id) => renewalIndex.match(new RegExp(`<symbol id="${id}"[\\s\\S]*?</symbol>`))?.[0] ?? "").join("");
  return `<svg width="0" height="0" style="position:absolute" aria-hidden="true"><defs>${syms.replaceAll('id="', 'id="shell-')}</defs></svg>`;
};
const SHELL_PAGES = [["log/index.html", "../"]];
for (const [rel, up] of SHELL_PAGES) {
  const f = `${rootOut}${rel}`;
  if (!existsSync(f)) continue;
  const fix = (h) => h.replaceAll('href="./', `href="${up}`).replaceAll('href="#i-', 'href="#shell-i-');
  let html = await readFile(f, "utf8");
  for (const name of ["shell:header", "shell:footer", "shell:tabbar"]) {
    html = html.replace(new RegExp(`<!-- ${name} -->[\\s\\S]*?<!-- /${name} -->`), `<!-- ${name} -->\n${fix(shellPart(name))}\n<!-- /${name} -->`);
  }
  html = html.replace(/<!-- shell:icons -->[\s\S]*?<!-- \/shell:icons -->/, `<!-- shell:icons -->\n${shellIcons()}\n<!-- /shell:icons -->`);
  html = html.replace(/href="\.\.\/shell\.css(\?v=[^"]*)?"/, `href="../shell.css?v=${shellVersion}"`);
  await writeFile(f, html);
}

// 2. 앱 밖 정적 페이지는 모두 같은 ‘경로 넘김’ 페이지다(2026-10-21 해시 주소 제거).
// 자기 경로(/camp/map, /camp/explore/c/1 …)를 ?p= 로 앱 루트에 넘기면 app.js가 원래 경로로 되돌리고(legacyRoute로 옛 주소 보정) 화면을 그린다.
// GitHub Pages는 서버 리라이트가 없어서 이 방식(404.html 포함)을 쓴다. 검색·공유 미리보기용 메타는 place/{id}/ 페이지에 따로 넣는다.
const STUB_JS = `<script>(function(){var B=location.pathname.indexOf("/camp/")===0?"/camp/":"/";var p=location.pathname.slice(B.length).replace(/index\\.html$/,"").replace(/\\/+$/,"");location.replace(B+"?p="+encodeURIComponent(p)+(location.search?"&q="+encodeURIComponent(location.search.slice(1)):"")+location.hash);})();</script>`;
const stubPage = (title, extraHead = "") => `<!doctype html><html lang="ko"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover"><title>${title}</title><meta name="robots" content="noindex">${extraHead}${STUB_JS}</head><body><p><a href="/camp/">모여라 캠핑으로 가기</a></p></body></html>`;
const exploreIndex = stubPage("모여라 캠핑");
await mkdir(out, { recursive: true });
await writeFile(`${out}index.html`, exploreIndex);
// 앱 복사본(explore/app.js·style.css, renewal/)은 더 쓰지 않는다 — 앱은 루트 하나뿐.
await rm(`${out}app.js`, { force: true }); await rm(`${out}style.css`, { force: true });
await cp(`${root}design/renewal/data/photos.json`, `${rootOut}data/photos.json`);
if (existsSync(`${root}design/renewal/data/vacancy.json`)) {
  await cp(`${root}design/renewal/data/vacancy.json`, `${rootOut}data/vacancy.json`);
}
await mkdir(`${out}data`, { recursive: true });
await cp(`${root}design/renewal/data/photos.json`, `${out}data/photos.json`);
if (existsSync(`${root}design/renewal/data/vacancy.json`)) {
  await cp(`${root}design/renewal/data/vacancy.json`, `${out}data/vacancy.json`);
}

// 중복 제거된 공식 카드 사진 색인이 있으면 대상 경로에 동기화
const dedupedCards = `${root}pipeline/registry/cards-deduped.json`;
if (existsSync(dedupedCards)) {
  for (const dir of [rootOut, out]) {
    const dst = `${dir}media/cards/index.json`;
    await mkdir(dirname(dst), { recursive: true });
    await cp(dedupedCards, dst);
  }
}

// 브랜드 자산(파비콘, PWA 아이콘, 오픈그래프 배너 이미지, 테마/히어로 사진)을 대상 디렉토리에 동기화
const copyBrandImages = async (destDir) => {
  const imgDest = `${destDir}images/`;
  await mkdir(imgDest, { recursive: true });
  const srcImages = `${root}camping-atlas/public/images`;
  if (existsSync(srcImages) && resolve(srcImages) !== resolve(imgDest.replace(/\/$/, ""))) {
    await cp(srcImages, imgDest, { recursive: true });
  }
  for (const f of ["favicon.svg", "favicon.png", "manifest.webmanifest"]) {
    const src = `${root}camping-atlas/public/${f}`;
    const dst = `${destDir}${f}`;
    if (existsSync(src) && resolve(src) !== resolve(dst)) await cp(src, dst);
  }
};
await copyBrandImages(rootOut);
await copyBrandImages(out);

// 화면 경로(새로고침·북마크용)와 옛 보조 주소(guide·openings·vision·passport·collections·renewal)는 모두 같은 넘김 페이지.
// 넘김 뒤 앱이 옛 주소를 새 화면으로 보정한다(openings → theme/OPEN 등). 404.html도 같은 페이지라 모르는 경로·옛 공유 링크(/explore/c/1)도 살아난다.
const themesBlock = renewalApp.slice(renewalApp.indexOf("const THEMES = ["), renewalApp.indexOf("];", renewalApp.indexOf("const THEMES = [")));
const THEME_KEYS = [...themesBlock.matchAll(/^  \["([A-Z_]+)", /gm)].map((m) => m[1]);
const ROUTE_STUBS = ["list", "map", "themes", "compare", "saved", "saves-log", ...["ALL", "OPEN", "AVAIL", "REVIEWS", ...THEME_KEYS].map((k) => `theme/${k}`),
  "guide", "openings", "vision", "passport", "collections", "renewal"];
const writeUtilityPages = async (baseDir) => {
  for (const r of ROUTE_STUBS) {
    await rm(`${baseDir}${r}`, { recursive: true, force: true });
    await mkdir(`${baseDir}${r}`, { recursive: true });
    await writeFile(`${baseDir}${r}/index.html`, stubPage("모여라 캠핑"));
  }
  await writeFile(`${baseDir}404.html`, stubPage("모여라 캠핑"));
};
await writeUtilityPages(rootOut);
// 예전 explore/ 아래 보조 주소·공유 페이지(explore/c/)는 지운다. 404.html이 explore/c/{id} → place/{id}로 보낸다.
for (const d of ["c", "themes", "openings", "guide", "vision", "passport", "collections"]) await rm(`${out}${d}`, { recursive: true, force: true });

// 3. 공유 미리보기(카카오톡·페이스북·X 등): 캠핑장마다 place/{id}/index.html 에 Open Graph·트위터 카드·canonical을 넣는다.
// 크롤러는 JS를 돌리지 않으므로 이 정적 메타를 읽고, 사람은 넘김 스크립트로 앱의 같은 주소(/camp/place/{id})를 본다(meta refresh는 쓰지 않음).
const SITE = (process.env.SITE_URL ?? "https://pyw31337.github.io/camp/").replace(/\/?$/, "/");
const attr = (v) => String(v ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
const placeSource = [`${rootOut}explore/data/campgrounds.json`, `${dataDir}/campgrounds.json`].find((f) => existsSync(f));
if (placeSource) {
  const raw = JSON.parse(await readFile(placeSource, "utf8"));
  const list = Array.isArray(raw) ? raw : raw.camps ?? [];
  const photoFile = [`${rootOut}data/photos.json`, `${root}design/renewal/data/photos.json`].find((f) => existsSync(f));
  const photos = photoFile ? JSON.parse(await readFile(photoFile, "utf8")) : {};
  const https = (u) => String(u ?? "").replace(/^http:\/\//, "https://");
  const imageOf = (c) => {
    const p = photos[c.id] ?? [];
    // 고캠핑 720px 대표 사진(jpg·약 100KB)을 먼저 — 카카오 스크래퍼가 webp·수 MB 원본을 놓칠 수 있어서.
    if (/gocamping\.or\.kr\/upload/.test(c.img ?? "")) return https(c.img);
    const full = p.find((u) => /^https?:\/\/gocamping\.or\.kr\/upload\/camp\/\d+\/[^/]+\.(jpe?g|png)$/i.test(u));
    if (full) return https(full);
    const media = p.find((u) => String(u).startsWith("media/")) ?? (c.ph ? `media/${c.ph}` : "");
    if (media) return SITE + media.replace(/-t\.webp$/, "-l.webp");
    return `${SITE}images/og-image.png`;
  };
  const typesOf = (c) => (Array.isArray(c.types) ? c.types : String(c.types ?? "").match(/[가-힣A-Za-z]+/g) ?? []).map((t) => t.replace(/야영장$/, "").replace(/^자동차$/, "오토").replace(/^카라반$/, "카라반").replace(/^글램핑$/, "글램핑")).filter(Boolean);
  const feeOf = (c) => (typeof c.fee === "object" ? c.fee?.text : String(c.fee ?? "").match(/'text': '([^']+)'/)?.[1]) ?? "";
  await rm(`${rootOut}place`, { recursive: true, force: true });
  let n = 0;
  for (const c of list) {
    if (!c.id || !c.name) continue;
    const id = String(c.id);
    const where = [c.sido, c.sigungu].filter(Boolean).join(" ");
    const kinds = typesOf(c).join("·");
    const fee = feeOf(c);
    const title = `${c.name} · 모여라 캠핑`;
    const description = [`${where}${kinds ? ` ${kinds}` : ""}${c.du ? " 당일 나들이" : " 캠핑장"}`, fee ? `1박 ${fee}` : "", "사이트 규격·전기·화로·주차·주변 정보와 공식 예약처를 한눈에"].filter(Boolean).join(" · ").slice(0, 150);
    const url = `${SITE}place/${encodeURIComponent(id)}/`;
    const image = imageOf(c);
    const head = `<meta name="description" content="${attr(description)}"><link rel="canonical" href="${attr(url)}">`
      + `<meta property="og:type" content="website"><meta property="og:site_name" content="모여라 캠핑"><meta property="og:locale" content="ko_KR">`
      + `<meta property="og:title" content="${attr(title)}"><meta property="og:description" content="${attr(description)}"><meta property="og:url" content="${attr(url)}">`
      + `<meta property="og:image" content="${attr(image)}"><meta property="og:image:secure_url" content="${attr(image)}"><meta property="og:image:alt" content="${attr(c.name)}">`
      + `<meta name="twitter:card" content="summary_large_image"><meta name="twitter:title" content="${attr(title)}"><meta name="twitter:description" content="${attr(description)}"><meta name="twitter:image" content="${attr(image)}">`;
    const html = `<!doctype html><html lang="ko"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover"><title>${attr(title)}</title>${head}${STUB_JS}</head><body><h1>${attr(c.name)}</h1><p>${attr(description)}</p><p><a href="${attr(url)}">모여라 캠핑에서 보기</a></p></body></html>`;
    // 중복 등록을 합친 옛 id(c.mg)도 같은 미리보기(canonical은 남은 곳) — 예전에 공유된 링크 보호.
    for (const pid of [id, ...(c.mg ?? []).map(String)]) {
      if (pid !== id && list.some((x) => String(x.id) === pid)) continue;
      await mkdir(`${rootOut}place/${pid}`, { recursive: true });
      await writeFile(`${rootOut}place/${pid}/index.html`, html);
      n++;
    }
  }
  console.log(`공유 미리보기 페이지 place/{id}/ ${n}개`);
  // 시·도 / 시·군·구 랜딩(t39 #40): region/{시도}/ · region/{시도}/{시군구}/ 에 제목·설명·canonical을 넣는다(검색·공유용). 사람은 앱의 같은 주소를 본다.
  await rm(`${rootOut}region`, { recursive: true, force: true });
  const groups = new Map();
  for (const c of list) {
    if (!c.id || !c.name || !c.sido || c.du || /^park-/.test(String(c.id))) continue; // 당일 나들이·공원 원장은 앱 지역 화면과 같이 뺀다
    for (const k of [c.sido, c.sigungu ? `${c.sido}/${c.sigungu}` : null].filter(Boolean)) groups.set(k, (groups.get(k) ?? 0) + 1);
  }
  let rn = 0;
  for (const [k, count] of groups) {
    const [sd, sg] = k.split("/");
    const where = sg ? `${sd} ${sg}` : sd;
    const title = `${where} 캠핑장 ${count.toLocaleString("ko-KR")}곳 · 모여라 캠핑`;
    const description = `${where} 캠핑장 ${count.toLocaleString("ko-KR")}곳을 한눈에 — 사이트 규격·전기·화로·주차·주변 정보와 공식 예약처`;
    const rel = `region/${encodeURIComponent(sd)}/${sg ? `${encodeURIComponent(sg)}/` : ""}`;
    const url = `${SITE}${rel}`;
    const head = `<meta name="description" content="${attr(description)}"><link rel="canonical" href="${attr(url)}">`
      + `<meta property="og:type" content="website"><meta property="og:site_name" content="모여라 캠핑"><meta property="og:locale" content="ko_KR">`
      + `<meta property="og:title" content="${attr(title)}"><meta property="og:description" content="${attr(description)}"><meta property="og:url" content="${attr(url)}">`
      + `<meta property="og:image" content="${attr(`${SITE}images/og-image.png`)}"><meta name="twitter:card" content="summary_large_image">`;
    const html = `<!doctype html><html lang="ko"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover"><title>${attr(title)}</title>${head}${STUB_JS}</head><body><h1>${attr(where)} 캠핑장</h1><p>${attr(description)}</p></body></html>`;
    await mkdir(`${rootOut}region/${sd}${sg ? `/${sg}` : ""}`, { recursive: true });
    await writeFile(`${rootOut}region/${sd}${sg ? `/${sg}` : ""}/index.html`, html);
    rn++;
  }
  console.log(`지역 랜딩 페이지 region/ ${rn}개`);
}

// 운영 기록(/log/) 및 탐색 화면을 위한 경량 캠핑장 ID-이름 사전 생성 (28MB campgrounds.json 대체)
const campJsonSource = existsSync(`${dataDir}/campgrounds.json`) ? `${dataDir}/campgrounds.json`
  : existsSync(`${rootOut}explore/data/campgrounds.json`) ? `${rootOut}explore/data/campgrounds.json`
  : existsSync(`${out}data/campgrounds.json`) ? `${out}data/campgrounds.json` : null;

if (campJsonSource) {
  try {
    const rawCamps = JSON.parse(await readFile(campJsonSource, "utf8"));
    const campNames = Object.fromEntries(rawCamps.filter((c) => c.id && c.name).map((c) => [c.id, c.name]));
    const campNamesJson = JSON.stringify(campNames);
    await mkdir(`${rootOut}log`, { recursive: true });
    await writeFile(`${rootOut}log/camp-names.json`, campNamesJson);
    await mkdir(`${out}data`, { recursive: true });
    await writeFile(`${out}data/camp-names.json`, campNamesJson);
    console.log(`경량 캠핑장 사전(camp-names.json) 발행 완료 (${Object.keys(campNames).length}개 · ${Math.round(campNamesJson.length / 1024)}KB)`);
  } catch (err) {
    console.warn("camp-names.json 생성 중 오류:", err.message);
  }
}

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

const camps = JSON.parse(await readFile(`${dataDir}/campgrounds.json`, "utf8"));
// (예전 c/{id}/ 공유 페이지는 place/{id}/ 로 바뀌었다 — 위 3번)

// 운영 기록(/log/) 및 탐색 화면을 위한 경량 캠핑장 ID-이름 사전 생성 (28MB campgrounds.json 대체)
const campNames = Object.fromEntries(camps.filter((c) => c.id && c.name).map((c) => [c.id, c.name]));
const campNamesJson = JSON.stringify(campNames);
await mkdir(`${rootOut}log`, { recursive: true });
await writeFile(`${rootOut}log/camp-names.json`, campNamesJson);
await writeFile(`${out}data/camp-names.json`, campNamesJson);
console.log(`경량 캠핑장 사전(camp-names.json) 발행 완료 (${Object.keys(campNames).length}개 · ${Math.round(campNamesJson.length / 1024)}KB)`);

console.log(`camping-atlas 루트 및 explore 발행 준비 완료${kakaoKey ? " · 지도 키 있음" : " · 지도 키 없음"}`);
