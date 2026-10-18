// 탐색 화면 조립: explore/_base.css(시안 토큰) + _page.css + _v3.css + _v4.css(마지막) + _body.html + _app.js → explore/src.html → build.mjs(아이콘 스프라이트)
// 글꼴은 실데이터의 모든 한글을 덮도록 Pretendard 동적 서브셋(CDN)을 쓴다.
import { execFileSync } from "node:child_process";
import { readFile, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { THEME_COLOR_META } from "./brand-tokens.mjs";
import { SITE_HEADER_CSS, SITE_HEADER_JS, SITE_HEADER_SCRIPT, siteHeader, siteTabbar } from "./site-header.mjs";

const here = (p) => fileURLToPath(new URL(p, import.meta.url));
const [base, page, v3, v4, rawBody, app] = await Promise.all(["_base.css", "_page.css", "_v3.css", "_v4.css", "_body.html", "_app.js"].map((f) => readFile(here(`./explore/${f}`), "utf8")));
// 공통 헤더·하단 탭(홈·보조 페이지와 같은 코드). 홈 React용 CSS도 같은 원본에서 쓴다.
const body = rawBody.replace("<!--SITE_HEADER-->", siteHeader("../", "explore", { wide: true }) + SITE_HEADER_SCRIPT).replace("<!--SITE_TABBAR-->", siteTabbar("../", "explore"));
await writeFile(here("../camping-atlas/app/site-header.css"), `/* design/site-header.mjs에서 생성 — 직접 고치지 말 것 */\n${SITE_HEADER_CSS}`);
// 홈(React)도 같은 헤더 HTML·스크립트를 그대로 넣는다.
await writeFile(here("../camping-atlas/app/site-header.generated.ts"), `// design/site-header.mjs에서 생성 — 직접 고치지 말 것\nexport const SITE_HEADER_HTML = ${JSON.stringify(siteHeader("./", "home"))};\nexport const SITE_TABBAR_HTML = ${JSON.stringify(siteTabbar("./", "home"))};\nexport const SITE_HEADER_JS = ${JSON.stringify(SITE_HEADER_JS)};\n`);
const src = `<title>모여라 캠핑 · 전국 캠핑장 찾기</title>
${THEME_COLOR_META}
<link rel="manifest" href="../manifest.webmanifest">
<meta name="apple-mobile-web-app-capable" content="yes">
<meta name="apple-mobile-web-app-status-bar-style" content="default">
<link rel="stylesheet" href="https://cdn.jsdelivr.net/gh/orioncactus/pretendard@v1.3.9/dist/web/variable/pretendardvariable-dynamic-subset.min.css">
<style>
${base}
${page}
${SITE_HEADER_CSS}
${v3}
${v4}
</style>
<!--{{SPRITE}}-->
${body}
<script type="module">
${app}
</script>
`;
await writeFile(here("./explore/src.html"), src);
execFileSync("node", [here("./build.mjs"), here("./explore/src.html"), here("./explore/index.html")], { stdio: "inherit" });
