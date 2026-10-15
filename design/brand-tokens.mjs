// 모여라캠핑 브랜드 토큰 v3 “Moss & Canvas” (2026-10-15). 홈(React)·탐색·보조 페이지가 모두 이 한 곳의 값을 쓴다.
// 근거: Taste ‘Camp’ 컬렉션 분석(docs/DESIGN_SYSTEM.md v3) — 사진 중심, 탁한 흙·이끼·캔버스 톤, 유리 패널, 큰 글자, 알약형 조작.
// 이름 규칙: --mc-*(moyeora camp). 페이지별 옛 변수(--green, --may-*, --g …)는 이 값을 가리키게만 바꾼다.
export const BRAND_CSS = `
:root {
  --mc-canvas: #f3efe7; --mc-paper: #fffcf6; --mc-sand: #e9e2d5; --mc-sand-2: #ddd4c4; --mc-line: #dcd3c4;
  --mc-ink: #1a1d18; --mc-ink-2: #555b51; --mc-ink-3: #6b6e64;
  --mc-moss: #3e5d3a; --mc-moss-press: #2f4a2c; --mc-moss-tint: #e2e9db; --mc-on-moss: #ffffff;
  --mc-sage: #98bfa2; --mc-night: #151b14; --mc-on-night: #ede6d9;
  /* 채운 주 버튼·선택 상태: 라이트는 밤 숲, 다크는 세이지(어두운 바탕에서도 보이게) */
  --mc-solid: #151b14; --mc-on-solid: #ede6d9;
  --mc-ember: #c4561f; --mc-ember-tint: #f6e2d4;
  --mc-sky: #4d7391; --mc-sky-tint: #e1ebf1;
  --mc-glass: rgba(21, 27, 20, .46); --mc-glass-line: rgba(255, 252, 246, .22); --mc-glass-ink: #fffcf6;
  --mc-scrim: rgba(12, 16, 11, .5);
  --mc-shadow-1: 0 1px 2px rgba(26, 29, 24, .06), 0 2px 8px -4px rgba(26, 29, 24, .08);
  --mc-shadow-2: 0 18px 40px -16px rgba(26, 29, 24, .28);
  --mc-r-1: 12px; --mc-r-2: 20px; --mc-r-3: 28px; --mc-r-4: 36px;
  --mc-font: "Pretendard Variable", Pretendard, -apple-system, BlinkMacSystemFont, "Apple SD Gothic Neo", "Malgun Gothic", system-ui, sans-serif;
  --mc-display: clamp(1.75rem, 1.2rem + 2.6vw, 3.25rem);
}
@media (prefers-color-scheme: dark) { :root:not([data-theme="light"]) {
  --mc-canvas: #0f120e; --mc-paper: #171b16; --mc-sand: #20261e; --mc-sand-2: #2a3127; --mc-line: #2e352b;
  --mc-ink: #ede6d9; --mc-ink-2: #b5ae9f; --mc-ink-3: #8e9085;
  --mc-moss: #9cc4a4; --mc-moss-press: #b9d8bf; --mc-moss-tint: #1f2c1e; --mc-on-moss: #0f1a10;
  --mc-night: #0a0d09; --mc-solid: #b9d8bf; --mc-on-solid: #0f1a10; --mc-ember: #ee8a55; --mc-ember-tint: #3a2416; --mc-sky: #8fb4cf; --mc-sky-tint: #1c2731;
  --mc-glass: rgba(10, 13, 9, .55); --mc-scrim: rgba(0, 0, 0, .62);
  --mc-shadow-1: 0 1px 2px rgba(0, 0, 0, .4); --mc-shadow-2: 0 18px 40px -16px rgba(0, 0, 0, .7);
  color-scheme: dark; } }
:root[data-theme="dark"] {
  --mc-canvas: #0f120e; --mc-paper: #171b16; --mc-sand: #20261e; --mc-sand-2: #2a3127; --mc-line: #2e352b;
  --mc-ink: #ede6d9; --mc-ink-2: #b5ae9f; --mc-ink-3: #8e9085;
  --mc-moss: #9cc4a4; --mc-moss-press: #b9d8bf; --mc-moss-tint: #1f2c1e; --mc-on-moss: #0f1a10;
  --mc-night: #0a0d09; --mc-solid: #b9d8bf; --mc-on-solid: #0f1a10; --mc-ember: #ee8a55; --mc-ember-tint: #3a2416; --mc-sky: #8fb4cf; --mc-sky-tint: #1c2731;
  --mc-glass: rgba(10, 13, 9, .55); --mc-scrim: rgba(0, 0, 0, .62);
  --mc-shadow-1: 0 1px 2px rgba(0, 0, 0, .4); --mc-shadow-2: 0 18px 40px -16px rgba(0, 0, 0, .7);
  color-scheme: dark; }
`;
// 브라우저 주소창 색(모바일). 라이트 캔버스 / 다크 밤 숲.
export const THEME_COLOR_META = `<meta name="theme-color" content="#f3efe7" media="(prefers-color-scheme: light)"><meta name="theme-color" content="#0f120e" media="(prefers-color-scheme: dark)">`;
