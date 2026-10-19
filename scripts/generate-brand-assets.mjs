import { writeFile, mkdir } from "node:fs/promises";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);
const sharp = require("../pipeline/node_modules/sharp");

const root = fileURLToPath(new URL("../", import.meta.url));
const publicDir = `${root}camping-atlas/public/`;
const imagesDir = `${root}camping-atlas/public/images/`;

// 모여라캠핑 공식 파비콘 SVG
// 다크 나이트 스퀘어 + 네온 볼트 텐트 + 따스한 앰비언트 모닥불 조명
const faviconSvg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512" width="512" height="512">
  <defs>
    <linearGradient id="bgGrad" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="#141c2b"/>
      <stop offset="100%" stop-color="#080e18"/>
    </linearGradient>
    <linearGradient id="tentGrad" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="#d9ff26"/>
      <stop offset="100%" stop-color="#9ce622"/>
    </linearGradient>
    <linearGradient id="fireGrad" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="#ff7b39"/>
      <stop offset="100%" stop-color="#ff3e14"/>
    </linearGradient>
    <filter id="glow" x="-20%" y="-20%" width="140%" height="140%">
      <feGaussianBlur stdDeviation="8" result="blur"/>
      <feComposite in="SourceGraphic" in2="blur" operator="over"/>
    </filter>
  </defs>
  <!-- 둥근 배경 (스퀘어클) -->
  <rect width="512" height="512" rx="124" fill="url(#bgGrad)"/>
  <rect width="504" height="504" x="4" y="4" rx="120" fill="none" stroke="rgba(255,255,255,0.08)" stroke-width="6"/>

  <!-- 은은한 밤하늘 별 -->
  <circle cx="390" cy="120" r="9" fill="#c8ff00" opacity="0.85"/>
  <circle cx="125" cy="145" r="6" fill="#ffffff" opacity="0.6"/>
  <circle cx="330" cy="80" r="5" fill="#ffffff" opacity="0.45"/>
  <polygon points="390,102 393,117 408,120 393,123 390,138 387,123 372,120 387,117" fill="#d9ff26" opacity="0.95"/>

  <!-- 텐트 심볼 -->
  <path d="M236 82 h40 l-8 14 L440 405 H72 L244 96 Z" fill="url(#tentGrad)" filter="url(#glow)"/>
  <!-- 텐트 입구 그늘 -->
  <path d="M256 226 L182 388 H330 Z" fill="#080e18"/>
  <!-- 텐트 속 따뜻한 온기 (불꽃 형상) -->
  <path d="M256 288 C265 324 286 342 286 368 A30 30 0 0 1 226 368 C226 342 247 324 256 288 Z" fill="url(#fireGrad)"/>
</svg>`;

await mkdir(publicDir, { recursive: true });
await mkdir(imagesDir, { recursive: true });

// 1. SVG 파비콘 저장
await writeFile(`${publicDir}favicon.svg`, faviconSvg);
console.log("✓ favicon.svg 생성 완료");

// 2. PNG 아이콘들 생성
const svgBuffer = Buffer.from(faviconSvg);

await sharp(svgBuffer)
  .resize(180, 180)
  .png()
  .toFile(`${imagesDir}apple-touch-icon.png`);
console.log("✓ apple-touch-icon.png (180x180) 생성 완료");

await sharp(svgBuffer)
  .resize(192, 192)
  .png()
  .toFile(`${imagesDir}icon-192.png`);
console.log("✓ icon-192.png (192x192) 생성 완료");

await sharp(svgBuffer)
  .resize(512, 512)
  .png()
  .toFile(`${imagesDir}icon-512.png`);
console.log("✓ icon-512.png (512x512) 생성 완료");

await sharp(svgBuffer)
  .resize(32, 32)
  .png()
  .toFile(`${publicDir}favicon.png`);
console.log("✓ favicon.png (32x32) 생성 완료");
