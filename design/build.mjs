// 디자인 시안 빌드.
// src.html 안의 아이콘 참조(#l-이름 = Lucide, #t-이름 = Tabler outline)를 모아 SVG 스프라이트를 만들고,
// 사용된 글자만 담은 Pretendard 서브셋(woff2, base64)을 인라인해 외부 의존 없는 단일 HTML을 만든다.
// 사용: npm install && npm run build [-- src.html out.html]
// 서브셋에는 Python fonttools + brotli가 필요하다(pip install fonttools brotli).
import { execFileSync } from "node:child_process";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";

const here = (p) => fileURLToPath(new URL(p, import.meta.url));
const [srcPath = here("./mockup-v2/src.html"), outPath = here("./mockup-v2/index.html")] = process.argv.slice(2);
const src = await readFile(srcPath, "utf8");

const ICON_DIRS = { l: here("./node_modules/lucide-static/icons/"), t: here("./node_modules/@tabler/icons/icons/outline/") };
const refs = [...new Set([...src.matchAll(/#([lt])-([a-z0-9]+(?:-[a-z0-9]+)*)/g)].map((m) => `${m[1]}-${m[2]}`))].sort();
const missing = [];
const symbols = [];
for (const ref of refs) {
  const [set, ...rest] = ref.split("-");
  const name = rest.join("-");
  let svg;
  try {
    svg = await readFile(`${ICON_DIRS[set]}${name}.svg`, "utf8");
  } catch {
    missing.push(ref);
    continue;
  }
  const inner = svg
    .replace(/<!--[\s\S]*?-->/g, "")
    .replace(/^[\s\S]*?<svg[^>]*>/, "")
    .replace(/<\/svg>\s*$/, "")
    .replace(/<path stroke="none" d="M0 0h24v24H0z" fill="none"\s*\/>/, "")
    .replace(/\s+/g, " ")
    .trim();
  symbols.push(`<symbol id="${ref}" viewBox="0 0 24 24">${inner}</symbol>`);
}
if (missing.length) {
  console.error(`아이콘을 찾을 수 없음: ${missing.join(", ")}`);
  process.exit(1);
}
const sprite = `<svg width="0" height="0" style="position:absolute" aria-hidden="true">${symbols.join("")}</svg>`;

// Pretendard 서브셋: 파일에 나오는 모든 글자 + 기본 ASCII
const cache = here("./.cache/");
await mkdir(cache, { recursive: true });
let ascii = "";
for (let c = 32; c < 127; c++) ascii += String.fromCharCode(c);
const chars = [...new Set([...src, ...ascii, "·", "–", "—", "→", "×", "₩", "°", "…", "‘", "’", "“", "”"])].join("");
await writeFile(`${cache}chars.txt`, chars);
const fontOut = `${cache}pretendard-subset.woff2`;
execFileSync("pyftsubset", [
  here("./node_modules/pretendard/dist/web/variable/woff2/PretendardVariable.woff2"),
  `--text-file=${cache}chars.txt`,
  "--flavor=woff2",
  "--layout-features=*",
  "--no-hinting",
  `--output-file=${fontOut}`,
]);
const font = (await readFile(fontOut)).toString("base64");
const fontFace = `@font-face{font-family:"Pretendard Variable";font-weight:45 920;font-style:normal;font-display:swap;src:url(data:font/woff2;base64,${font}) format("woff2");}`;

const out = src.replace("/*{{FONT_FACE}}*/", fontFace).replace("<!--{{SPRITE}}-->", sprite);
await writeFile(outPath, out);
console.log(`아이콘 ${refs.length}개 (Lucide ${refs.filter((r) => r.startsWith("l-")).length}, Tabler ${refs.filter((r) => r.startsWith("t-")).length}), 글자 ${chars.length}자, 폰트 ${Math.round(font.length * 0.75 / 1024)}KB → ${outPath}`);
