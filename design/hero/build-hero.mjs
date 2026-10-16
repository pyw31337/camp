// 히어로 사진 굽기(2026-10-16). 소유자 요청: 일러스트가 아니라 실제 한국 캠핑장 사진, 레이아웃에 맞는 구도.
// 생성 사진이 준비되기 전까지 한국관광공사 고캠핑 공식 등록 사진(일곱식구 캠핑장, 전북 정읍, c_no=8114)을 쓴다.
// 출처는 화면의 (i) 말풍선에만 표시한다(design/explore/_body.html, camping-atlas/app/home.tsx).
// 레이아웃별로 잘라 굽는다: hero-campsite(탐색 PC) · hero-campsite-m(탐색 모바일) · hero-home(홈 PC) · hero-home-m(홈 모바일).
// 사용: node design/hero/build-hero.mjs [원본 경로 또는 URL]
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";

const SOURCE = process.argv[2] ?? "https://gocamping.or.kr/upload/camp/8114/7407LaClr0SP0qt4COskTug0.jpg";
const out = fileURLToPath(new URL("../../camping-atlas/public/images/", import.meta.url));
const sharp = createRequire(new URL("../../camping-atlas/package.json", import.meta.url))("sharp");

const input = /^https?:/.test(SOURCE) ? Buffer.from(await (await fetch(SOURCE)).arrayBuffer()) : SOURCE;
const meta = await sharp(input).metadata();
const W = meta.width, H = meta.height; // 2000×1125
// 해 질 녘 사진이라 그림자를 조금 들고(감마), 채도를 살짝 올려 불빛을 살린다.
const tone = (img) => img.gamma(1.18).modulate({ brightness: 1.06, saturation: 1.12 }).sharpen({ sigma: 0.6 });
const crops = [
  // 넓은 화면: 위 하늘(글자 자리)과 텐트 줄을 함께, 아래 돌담은 덜어 낸다
  { name: "hero-campsite", left: 0, top: Math.round(H * 0.04), width: W, height: Math.round(H * 0.8), resize: 2000 },
  { name: "hero-home", left: 0, top: 0, width: W, height: Math.round(H * 0.86), resize: 2000 },
  // 세로 화면: 가운데 텐트(불빛)를 중심으로
  { name: "hero-campsite-m", left: Math.round(W * 0.34), top: 0, width: Math.round(H * 0.82), height: H, resize: 900 },
  // 홈 모바일은 위에 제목·예약 오픈 카드, 아래에 검색 카드가 있어 텐트가 그 사이(가운데)에 오도록 하늘을 덜어 낸다
  { name: "hero-home-m", left: Math.round(W * 0.32), top: Math.round(H * 0.24), width: Math.round(H * 0.6), height: Math.round(H * 0.76), resize: 900 },
];
for (const c of crops) {
  await tone(sharp(input).extract({ left: c.left, top: c.top, width: Math.min(c.width, W - c.left), height: Math.min(c.height, H - c.top) }))
    .resize({ width: c.resize, withoutEnlargement: true }).webp({ quality: 84 }).toFile(`${out}${c.name}.webp`);
  console.log(`${c.name}.webp`);
}
