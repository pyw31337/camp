import { readFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);
const sharp = require("../pipeline/node_modules/sharp");

const root = fileURLToPath(new URL("../", import.meta.url));
const bgPath = `${root}assets/branding/lets-camp-og-background.png`;
const outDir = `${root}camping-atlas/public/images/`;
const faviconData = (await readFile(`${root}assets/branding/lets-camp-favicon-source.png`)).toString("base64");

// 1200 x 630 비율에 맞게 배경 리사이즈 및 크롭
const baseImage = await sharp(bgPath)
  .resize(1200, 630, { fit: "cover", position: "center" })
  .toBuffer();

// 감각적인 오버레이 SVG (좌측 어두운 그라디언트 + 렛츠 캠핑 로고 + 타이포그래피 + 칩)
const overlaySvg = Buffer.from(`
<svg width="1200" height="630" viewBox="0 0 1200 630" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <!-- 좌측 가독성을 위한 깊이감 있는 비네팅 그라디언트 -->
    <linearGradient id="vignette" x1="0%" y1="0%" x2="100%" y2="0%">
      <stop offset="0%" stop-color="#050d18" stop-opacity="0.94"/>
      <stop offset="35%" stop-color="#071322" stop-opacity="0.82"/>
      <stop offset="60%" stop-color="#09182a" stop-opacity="0.45"/>
      <stop offset="85%" stop-color="#0a1a2e" stop-opacity="0.08"/>
      <stop offset="100%" stop-color="#0a1a2e" stop-opacity="0"/>
    </linearGradient>
    <linearGradient id="bottomShadow" x1="0%" y1="0%" x2="0%" y2="100%">
      <stop offset="60%" stop-color="#000" stop-opacity="0"/>
      <stop offset="100%" stop-color="#050d18" stop-opacity="0.75"/>
    </linearGradient>
    <linearGradient id="voltGrad" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="#d9ff26"/>
      <stop offset="100%" stop-color="#a3e635"/>
    </linearGradient>
    <linearGradient id="fireGrad" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="#ff7b39"/>
      <stop offset="100%" stop-color="#ff3e14"/>
    </linearGradient>
    <filter id="badgeShadow" x="-20%" y="-20%" width="140%" height="140%">
      <feDropShadow dx="0" dy="4" stdDeviation="6" flood-color="#000000" flood-opacity="0.3"/>
    </filter>
  </defs>

  <!-- 그라디언트 오버레이 -->
  <rect width="1200" height="630" fill="url(#vignette)"/>
  <rect width="1200" height="630" fill="url(#bottomShadow)"/>

  <!-- 좌측 컨텐츠 그룹: 작은 미리보기에서도 읽히는 최소 구성 -->
  <g transform="translate(72, 86)">
    <g transform="translate(0, 0)">
      <rect width="58" height="58" rx="16" fill="#0b131f" stroke="rgba(255,255,255,0.18)" stroke-width="1.5"/>
      <image href="data:image/png;base64,${faviconData}" x="5" y="5" width="48" height="48" preserveAspectRatio="xMidYMid meet"/>
    </g>
    <text x="0" y="190" font-family="'TmonMonsori', 'NanumSquare Neo OTF', sans-serif" font-size="78" font-weight="900" fill="#ffffff" stroke="#c8ff00" stroke-opacity="0.22" stroke-width="4" paint-order="stroke" letter-spacing="-0.06em">Let's 캠핑</text>
    <rect x="2" y="218" width="478" height="3" rx="1.5" fill="#c8ff00" opacity="0.9"/>
    <text x="0" y="266" font-family="'Gmarket Sans TTF', 'Pretendard', 'Apple SD Gothic Neo', sans-serif" font-size="28" font-weight="800" fill="#ffffff" letter-spacing="-0.04em">스펙과 후기를 한눈에 비교탐색</text>
  </g>
</svg>
`);

// 최종 합성
const finalImage = await sharp(baseImage)
  .composite([{ input: overlaySvg, top: 0, left: 0 }])
  .png({ quality: 92, compressionLevel: 8 });

// PNG 및 WebP 저장
await finalImage.toFile(`${outDir}og-image.png`);
await sharp(baseImage)
  .composite([{ input: overlaySvg, top: 0, left: 0 }])
  .webp({ quality: 90 })
  .toFile(`${outDir}og-image.webp`);

console.log("✓ og-image.png (1200x630) 생성 완료");
console.log("✓ og-image.webp (1200x630) 생성 완료");
