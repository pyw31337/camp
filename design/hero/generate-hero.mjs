// 모여라캠핑 히어로 일러스트 생성기(2026-10-16, 소유자 요청: 사진을 찾지 말고 서비스 콘셉트에 맞게 만들 것).
// 한국 풍경 모티프 — 겹겹의 산 능선과 운무, 소나무, 해 질 녘, 불 켜진 텐트와 오토캠핑 차 — 를 SVG로 그린 뒤
// Chromium으로 webp로 굽는다. 레이아웃 규칙: 왼쪽(또는 모바일 위쪽)은 큰 제목 자리라 하늘·운무만 두고,
// 주인공(텐트)은 오른쪽 아래, 맨 아래는 페이지 바탕색(#f5f6f4)으로 녹아 들게 한다.
// 사용: node design/hero/generate-hero.mjs  → camping-atlas/public/images/hero-campsite(.webp|-m.webp)
import { mkdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";

const out = fileURLToPath(new URL("../../camping-atlas/public/images/", import.meta.url));

// 결정적 난수(같은 그림이 다시 나오게)
function rng(seed) { let s = seed >>> 0; return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296); }
// 1차원 값 잡음: 여러 옥타브를 더해 능선을 만든다
function ridge(r, W, base, amp, oct = 5, rough = 0.5) {
  const pts = [], n = 160;
  const layers = Array.from({ length: oct }, (_, o) => Array.from({ length: 2 ** (o + 2) + 1 }, () => r()));
  for (let i = 0; i <= n; i++) {
    const x = i / n; let y = 0, a = 1, norm = 0;
    for (let o = 0; o < oct; o++) {
      const L = layers[o], k = x * (L.length - 1), j = Math.floor(k), t = k - j, s = t * t * (3 - 2 * t);
      y += a * (L[j] * (1 - s) + L[Math.min(j + 1, L.length - 1)] * s); norm += a; a *= rough;
    }
    pts.push([x * W, base - (y / norm - 0.35) * amp]);
  }
  return pts;
}
const path = (pts, W, H) => `M0 ${H} L${pts.map(([x, y]) => `${x.toFixed(1)} ${y.toFixed(1)}`).join(" L")} L${W} ${H} Z`;

// 소나무(한국 적송 실루엣): 비스듬히 휜 줄기, 가지 끝마다 납작한 구름 모양 잎 덩어리
function pine(r, x, y, h, color, lean = 0) {
  const top = [x + lean * h * 0.3, y - h];
  const mid = [x + lean * h * 0.05 + (r() - 0.5) * h * 0.08, y - h * 0.5];
  const at = (t) => { const u = 1 - t; return [u * u * x + 2 * u * t * mid[0] + t * t * top[0], u * u * y + 2 * u * t * mid[1] + t * t * top[1]]; };
  let g = `<path d="M${x} ${y} Q${mid[0].toFixed(1)} ${mid[1].toFixed(1)} ${top[0].toFixed(1)} ${top[1].toFixed(1)}" stroke="${color}" stroke-width="${(h * 0.04).toFixed(1)}" fill="none" stroke-linecap="round"/>`;
  const cloud = (cx, cy, w) => {
    const hgt = w * 0.34;
    return [[0, 0, 1], [-0.42, 0.12, 0.62], [0.4, 0.1, 0.66], [0.05, -0.28, 0.6]]
      .map(([dx, dy, k]) => `<ellipse cx="${(cx + dx * w).toFixed(1)}" cy="${(cy + dy * hgt).toFixed(1)}" rx="${(w * 0.5 * k).toFixed(1)}" ry="${(hgt * 0.62 * k).toFixed(1)}" fill="${color}"/>`).join("");
  };
  // 꼭대기 덩어리 + 옆가지 2~3개(좌우 번갈아)
  g += cloud(top[0], top[1], h * 0.42);
  const n = 2 + Math.floor(r() * 2);
  for (let i = 0; i < n; i++) {
    const t = 0.5 + i * 0.16 + r() * 0.06, [bx, by] = at(t), side = i % 2 ? 1 : -1, len = h * (0.22 + r() * 0.12);
    const ex = bx + side * len, ey = by - len * 0.18;
    g += `<path d="M${bx.toFixed(1)} ${by.toFixed(1)} Q${((bx + ex) / 2).toFixed(1)} ${(by + 4).toFixed(1)} ${ex.toFixed(1)} ${ey.toFixed(1)}" stroke="${color}" stroke-width="${(h * 0.018).toFixed(1)}" fill="none" stroke-linecap="round"/>`;
    g += cloud(ex, ey, h * (0.3 + r() * 0.08));
  }
  return g;
}

function scene({ W, H, tentX, tentY, scale, textSide }) {
  const r = rng(20261016);
  const horizon = H * 0.56;
  // 산 겹: 먼 곳은 옅은 청록 안개, 가까울수록 진한 초록
  const layers = [
    { base: horizon - H * 0.10, amp: H * 0.30, color: "#d7e6df", op: 1 },
    { base: horizon - H * 0.02, amp: H * 0.26, color: "#bcd6c9", op: 1 },
    { base: horizon + H * 0.07, amp: H * 0.22, color: "#94c1aa", op: 1 },
    { base: horizon + H * 0.16, amp: H * 0.18, color: "#5f9f7e", op: 1 },
    { base: horizon + H * 0.26, amp: H * 0.12, color: "#3d8461", op: 1 },
  ];
  let mountains = "";
  layers.forEach((l, i) => {
    mountains += `<path d="${path(ridge(r, W, l.base, l.amp, 5, 0.55), W, H)}" fill="${l.color}"/>`;
    // 층 사이 운무
    mountains += `<rect x="0" y="${(l.base - l.amp * 0.15).toFixed(0)}" width="${W}" height="${(H * 0.14).toFixed(0)}" fill="url(#mist)" opacity="${(0.75 - i * 0.12).toFixed(2)}"/>`;
  });
  // 앞 언덕(초원)
  const meadow = ridge(r, W, tentY + H * 0.02, H * 0.05, 3, 0.4);
  // 소나무 무리: 텐트 쪽(오른쪽) 언덕 위
  let pines = "";
  const pineColor = "#24563d";
  for (let i = 0; i < 9; i++) {
    const px = tentX + (r() - 0.25) * W * 0.32 * scale + (i % 2 ? W * 0.06 : -W * 0.04);
    if (textSide === "left" && px < W * 0.5) continue;
    const ph = H * (0.16 + r() * 0.16) * scale;
    pines += pine(r, px, tentY + H * 0.03 - r() * H * 0.03, ph, pineColor, (r() < 0.5 ? -1 : 1) * (0.15 + r() * 0.35));
  }
  // 텐트(리빙쉘) + 불빛 + 타프 + 차 + 전구 줄
  const s = scale, tx = tentX, ty = tentY;
  const tent = `
  <g>
    <ellipse cx="${tx}" cy="${ty + 6 * s}" rx="${260 * s}" ry="${26 * s}" fill="#2c6b4b" opacity=".35"/>
    <path d="M${tx - 150 * s} ${ty} Q${tx - 120 * s} ${ty - 120 * s} ${tx - 20 * s} ${ty - 150 * s} Q${tx + 110 * s} ${ty - 130 * s} ${tx + 150 * s} ${ty} Z" fill="#f4ead8"/>
    <path d="M${tx - 20 * s} ${ty - 150 * s} Q${tx + 110 * s} ${ty - 130 * s} ${tx + 150 * s} ${ty} L${tx + 40 * s} ${ty} Q${tx + 30 * s} ${ty - 90 * s} ${tx - 20 * s} ${ty - 150 * s} Z" fill="#e2d4bc"/>
    <path d="M${tx - 70 * s} ${ty} Q${tx - 60 * s} ${ty - 85 * s} ${tx - 10 * s} ${ty - 95 * s} Q${tx + 30 * s} ${ty - 80 * s} ${tx + 35 * s} ${ty} Z" fill="url(#glow)"/>
    <path d="M${tx - 20 * s} ${ty - 150 * s} L${tx - 20 * s} ${ty - 165 * s}" stroke="#7b6a52" stroke-width="${3 * s}"/>
    <path d="M${tx + 150 * s} ${ty - 70 * s} L${tx + 330 * s} ${ty - 105 * s} L${tx + 340 * s} ${ty} M${tx + 150 * s} ${ty - 70 * s} L${tx + 330 * s} ${ty - 105 * s} L${tx + 200 * s} ${ty - 60 * s} Z" fill="#c9d9cf" stroke="#9fb4a8" stroke-width="${2 * s}"/>
    <g transform="translate(${tx + 220 * s} ${ty - 70 * s}) scale(${s})">
      <path d="M0 70 L0 34 Q4 18 22 14 L64 6 Q80 4 96 16 L132 40 Q150 42 158 52 L160 70 Z" fill="#5d6b66"/>
      <path d="M40 16 L66 10 Q78 9 90 18 L110 34 L40 34 Z" fill="#b9d3e0"/>
      <circle cx="34" cy="70" r="15" fill="#2a302e"/><circle cx="128" cy="70" r="15" fill="#2a302e"/>
      <circle cx="34" cy="70" r="6" fill="#8d9692"/><circle cx="128" cy="70" r="6" fill="#8d9692"/>
    </g>
    <circle cx="${tx - 210 * s}" cy="${ty - 4 * s}" r="${46 * s}" fill="url(#fire)"/>
    <path d="M${tx - 222 * s} ${ty} L${tx - 210 * s} ${ty - 26 * s} L${tx - 198 * s} ${ty} Z" fill="#ff8a3c"/>
    <path d="M${tx - 214 * s} ${ty} L${tx - 207 * s} ${ty - 16 * s} L${tx - 202 * s} ${ty} Z" fill="#ffd36b"/>
    <path d="M${tx - 175 * s} ${ty - 95 * s} Q${tx - 60 * s} ${ty - 40 * s} ${tx + 60 * s} ${ty - 120 * s}" fill="none" stroke="#7b6a52" stroke-width="${1.4 * s}"/>
    ${Array.from({ length: 9 }, (_, i) => { const t = i / 8, x = (1 - t) ** 2 * (tx - 175 * s) + 2 * (1 - t) * t * (tx - 60 * s) + t * t * (tx + 60 * s), y = (1 - t) ** 2 * (ty - 95 * s) + 2 * (1 - t) * t * (ty - 40 * s) + t * t * (ty - 120 * s); return `<circle cx="${x.toFixed(1)}" cy="${(y + 3 * s).toFixed(1)}" r="${4 * s}" fill="#ffe2a0"/><circle cx="${x.toFixed(1)}" cy="${(y + 3 * s).toFixed(1)}" r="${12 * s}" fill="#ffd27a" opacity=".25"/>`; }).join("")}
  </g>`;
  // 새 몇 마리
  const birds = Array.from({ length: 4 }, (_, i) => { const bx = W * (0.62 + i * 0.035), by = H * (0.18 + (i % 2) * 0.03); return `<path d="M${bx} ${by} q8 -8 16 0 q8 -8 16 0" stroke="#7a8c84" stroke-width="2" fill="none"/>`; }).join("");
  const sunX = textSide === "left" ? W * 0.7 : W * 0.68, sunY = horizon - H * 0.17;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
  <defs>
    <linearGradient id="sky" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#eaf2ee"/><stop offset=".45" stop-color="#fbeedb"/><stop offset=".62" stop-color="#ffdcb5"/><stop offset="1" stop-color="#f7e9d6"/></linearGradient>
    <radialGradient id="sun" cx=".5" cy=".5" r=".5"><stop offset="0" stop-color="#fff6dc"/><stop offset=".35" stop-color="#ffe2a8" stop-opacity=".9"/><stop offset="1" stop-color="#ffd59a" stop-opacity="0"/></radialGradient>
    <linearGradient id="mist" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#ffffff" stop-opacity="0"/><stop offset=".5" stop-color="#ffffff" stop-opacity=".85"/><stop offset="1" stop-color="#ffffff" stop-opacity="0"/></linearGradient>
    <linearGradient id="meadow" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#4f9a6f"/><stop offset=".55" stop-color="#8cc29c"/><stop offset="1" stop-color="#f5f6f4"/></linearGradient>
    <radialGradient id="glow" cx=".45" cy=".7" r=".7"><stop offset="0" stop-color="#fff1c4"/><stop offset=".6" stop-color="#ffc768"/><stop offset="1" stop-color="#f0a447"/></radialGradient>
    <radialGradient id="fire" cx=".5" cy=".5" r=".5"><stop offset="0" stop-color="#ffcf7a" stop-opacity=".9"/><stop offset="1" stop-color="#ffcf7a" stop-opacity="0"/></radialGradient>
    <linearGradient id="fade" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#f5f6f4" stop-opacity="0"/><stop offset="1" stop-color="#f5f6f4"/></linearGradient>
  </defs>
  <rect width="${W}" height="${H}" fill="url(#sky)"/>
  <circle cx="${sunX}" cy="${sunY}" r="${H * 0.42}" fill="url(#sun)"/>
  <circle cx="${sunX}" cy="${sunY}" r="${H * 0.05}" fill="#fff8e6"/>
  ${birds}
  ${mountains}
  ${pines}
  <path d="${path(meadow, W, H)}" fill="url(#meadow)"/>
  ${tent}
  <rect x="0" y="${H * 0.86}" width="${W}" height="${H * 0.14 + 1}" fill="url(#fade)"/>
</svg>`;
}

const { chromium } = await import("/opt/node22/lib/node_modules/playwright/index.mjs").catch(() => import("playwright"));
mkdirSync(out, { recursive: true });
const browser = await chromium.launch();
for (const v of [
  { name: "hero-campsite", W: 2400, H: 1000, tentX: 1720, tentY: 800, scale: 1.25, textSide: "left" },
  { name: "hero-campsite-m", W: 900, H: 1100, tentX: 470, tentY: 880, scale: 0.95, textSide: "top" },
  // 홈: 검색 카드가 아래를 덮으므로 텐트를 화면 가운데 높이로 올린다
  { name: "hero-home", W: 2400, H: 1040, tentX: 1820, tentY: 600, scale: 1.15, textSide: "left" },
  { name: "hero-home-m", W: 900, H: 1300, tentX: 520, tentY: 640, scale: 0.9, textSide: "top" },
]) {
  const svg = scene(v);
  const page = await browser.newPage({ viewport: { width: v.W, height: v.H } });
  await page.setContent(`<html><body style="margin:0">${svg}</body></html>`);
  const png = await page.screenshot({ type: "png" });
  await page.close();
  // sharp는 camping-atlas 의존성에 있다(design에는 없음).
  const sharp = createRequire(new URL("../../camping-atlas/package.json", import.meta.url))("sharp");
  await sharp(png).webp({ quality: 86 }).toFile(`${out}${v.name}.webp`);
  console.log(`${v.name}.webp ${v.W}×${v.H}`);
}
await browser.close();
