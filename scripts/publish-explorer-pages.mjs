// 전국 캠핑장 탐색 화면을 GitHub Pages(https://pyw31337.github.io/camp/explore/)로 발행할 파일을 만든다.
// camping-atlas/public/explore/ 아래에 index.html + data/*.json을 쓰면 Pages 빌드가 그대로 포함한다.
// 사용: (pipeline) npm run build:explore → node scripts/publish-explorer-pages.mjs
// KAKAO_JS_KEY: 브라우저에 노출되는 지도 키(카카오 개발자 콘솔의 도메인 제한으로 보호). 없으면 지도 없이 목록만.
import { cp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("../", import.meta.url));
const dataDir = `${root}pipeline/out/explore`;
if (!existsSync(`${dataDir}/campgrounds.json`)) { console.log("::warning title=탐색 화면 발행 건너뜀::pipeline/out/explore가 없습니다(npm run build:explore 먼저)."); process.exit(0); }
const out = `${root}camping-atlas/public/explore/`;
await rm(out, { recursive: true, force: true });
await mkdir(`${out}data`, { recursive: true });
const kakaoKey = (process.env.KAKAO_JS_KEY ?? "").replace(/[^A-Za-z0-9]/g, "");
const body = await readFile(`${root}design/explore/index.html`, "utf8");
await writeFile(`${out}index.html`, `<!doctype html>
<html lang="ko">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">
<meta name="description" content="전국 캠핑장을 지도와 목록으로 찾고, 사이트 크기·시설·주변 화장실을 비교해 공식 예약처로 바로 예약하세요.">
<meta name="theme-color" content="#1f9d5c">
<meta name="kakao-js-key" content="${kakaoKey}">
<link rel="icon" href="../favicon.svg">
</head>
<body>
${body}
</body>
</html>
`);
await cp(`${dataDir}/campgrounds.json`, `${out}data/campgrounds.json`);
await cp(`${dataDir}/meta.json`, `${out}data/meta.json`);
if (existsSync(`${dataDir}/texts.json`)) await cp(`${dataDir}/texts.json`, `${out}data/texts.json`);
console.log(`camping-atlas/public/explore 발행 준비 완료${kakaoKey ? " · 지도 키 있음" : " · 지도 키 없음"}`);
