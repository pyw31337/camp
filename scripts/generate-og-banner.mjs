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

  <!-- 좌측 컨텐츠 그룹 -->
  <g transform="translate(72, 70)">
    <!-- 1. 브랜드 헤더 (로고 마크 + 서비스명) -->
    <g transform="translate(0, 0)">
      <rect width="52" height="52" rx="14" fill="#0b131f" stroke="rgba(255,255,255,0.14)" stroke-width="1.5"/>
      <image href="data:image/png;base64,${faviconData}" x="5" y="5" width="42" height="42" preserveAspectRatio="xMidYMid meet"/>

      <text x="68" y="36" font-family="'Pretendard', -apple-system, BlinkMacSystemFont, 'Apple SD Gothic Neo', sans-serif" font-size="28" font-weight="900" fill="#ffffff" letter-spacing="-0.03em">렛츠 캠핑</text>
      <rect x="236" y="16" width="68" height="26" rx="13" fill="#c8ff00"/>
      <text x="270" y="34" font-family="'Pretendard', sans-serif" font-size="13" font-weight="900" fill="#080e18" text-anchor="middle">OFFICIAL</text>
    </g>

    <!-- 2. 메인 헤드카피 -->
    <text x="0" y="148" font-family="'Pretendard', sans-serif" font-size="52" font-weight="900" fill="#ffffff" letter-spacing="-0.04em">이번 주말,</text>
    <text x="0" y="214" font-family="'Pretendard', sans-serif" font-size="56" font-weight="900" fill="#ffffff" letter-spacing="-0.04em">
      <tspan fill="#c8ff00">빈자리</tspan>부터.
    </text>

    <!-- 3. 서브 카피 -->
    <text x="0" y="278" font-family="'Pretendard', sans-serif" font-size="21" font-weight="600" fill="rgba(255,255,255,0.88)" letter-spacing="-0.02em">
      공식 스펙과 후기 신호를 한눈에 비교하는 캠핑장 탐색 서비스
    </text>

    <!-- 4. 특화 피처 태그 칩들 -->
    <g transform="translate(0, 360)">
      <!-- 칩 1: 실시간 예약 오픈 -->
      <g transform="translate(0, 0)" filter="url(#badgeShadow)">
        <rect width="144" height="40" rx="20" fill="rgba(255,255,255,0.12)" stroke="rgba(255,255,255,0.25)" stroke-width="1.2"/>
        <circle cx="20" cy="20" r="5" fill="#ff4a1c"/>
        <text x="32" y="25" font-family="'Pretendard', sans-serif" font-size="15" font-weight="800" fill="#ffffff">실시간 곧 오픈</text>
      </g>
      <!-- 칩 2: 데크·전기 규격 -->
      <g transform="translate(154, 0)" filter="url(#badgeShadow)">
        <rect width="146" height="40" rx="20" fill="rgba(255,255,255,0.12)" stroke="rgba(255,255,255,0.25)" stroke-width="1.2"/>
        <circle cx="20" cy="20" r="5" fill="#c8ff00"/>
        <text x="32" y="25" font-family="'Pretendard', sans-serif" font-size="15" font-weight="800" fill="#ffffff">데크·전기 검증</text>
      </g>
      <!-- 칩 3: 긍정 후기 분석 -->
      <g transform="translate(310, 0)" filter="url(#badgeShadow)">
        <rect width="148" height="40" rx="20" fill="rgba(255,255,255,0.12)" stroke="rgba(255,255,255,0.25)" stroke-width="1.2"/>
        <circle cx="20" cy="20" r="5" fill="#38bdf8"/>
        <text x="32" y="25" font-family="'Pretendard', sans-serif" font-size="15" font-weight="800" fill="#ffffff">방문자 후기 분석</text>
      </g>
    </g>

    <!-- 5. 하단 URL & 출처 라벨 -->
    <g transform="translate(0, 444)">
      <text x="0" y="16" font-family="'Pretendard', sans-serif" font-size="16" font-weight="700" fill="rgba(255,255,255,0.55)" letter-spacing="0.02em">pyw31337.github.io/camp</text>
    </g>
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
