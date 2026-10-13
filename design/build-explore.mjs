// 탐색 화면 조립: explore/_base.css(시안 토큰) + _page.css + _body.html + _app.js → explore/src.html → build.mjs(아이콘 스프라이트)
// 글꼴은 실데이터의 모든 한글을 덮도록 Pretendard 동적 서브셋(CDN)을 쓴다.
import { execFileSync } from "node:child_process";
import { readFile, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";

const here = (p) => fileURLToPath(new URL(p, import.meta.url));
const [base, page, body, app] = await Promise.all(["_base.css", "_page.css", "_body.html", "_app.js"].map((f) => readFile(here(`./explore/${f}`), "utf8")));
const src = `<title>모여라 캠핑 · 전국 캠핑장 찾기</title>
<link rel="stylesheet" href="https://cdn.jsdelivr.net/gh/orioncactus/pretendard@v1.3.9/dist/web/variable/pretendardvariable-dynamic-subset.min.css">
<style>
${base}
${page}
</style>
<!--{{SPRITE}}-->
${body}
<script type="module">
${app}
</script>
`;
await writeFile(here("./explore/src.html"), src);
execFileSync("node", [here("./build.mjs"), here("./explore/src.html"), here("./explore/index.html")], { stdio: "inherit" });
