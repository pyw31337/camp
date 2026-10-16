// 모여라캠핑 브랜드 토큰 v4.1 “Ink & Leaf” (2026-10-16, v3 “Moss & Canvas”를 대체). 홈(React)·탐색·보조 페이지가 모두 이 한 곳의 값을 쓴다.
// 근거: Taste ‘Camp’ 컬렉션 + 소유자 피드백(docs/DESIGN_SYSTEM.md v4) — C 스펙북 기반, 흐린 유리 히어로, 강한 굵기 대비, 제한된 비비드 4색, 밝은 화면만.
// 이름 규칙: --mc-*(moyeora camp). 페이지별 옛 변수(--green, --may-*, --g …)는 이 값을 가리키게만 바꾼다.
export const BRAND_CSS = `
:root {
  /* v4.1 “Ink & Leaf”(2026-10-16): 밝은 화면만. 글자는 잉크/흰 강약, 액센트는 초록 하나, 배지 색은 뜻 하나씩.
     경계는 선보다 면·그림자로 부드럽게(소유자: 검정·흰색만 있어 심심하고 테두리가 딱딱함). */
  color-scheme: light;
  --mc-canvas: #f5f6f4; --mc-paper: #ffffff; --mc-sand: #eff1ee; --mc-sand-2: #e6e9e5; --mc-line: #e8ebe7;
  --mc-ink: #101414; --mc-ink-2: #4b5350; --mc-ink-3: #69716d;
  /* 이름은 v3 그대로: moss = 액센트(초록), solid = 선택·주 버튼(잉크) */
  --mc-moss: #00875a; --mc-moss-press: #006c48; --mc-moss-tint: #e4f4ea; --mc-on-moss: #ffffff;
  --mc-sage: #7fcf9f; --mc-night: #101414; --mc-on-night: #ffffff;
  --mc-solid: #101414; --mc-on-solid: #ffffff;
  --mc-ember: #c2410c; --mc-ember-tint: #fdeee4;
  --mc-sky: #00875a; --mc-sky-tint: #e4f4ea;
  /* 액센트·배지: 초록=예약·시간·행동, 라임=전기(잉크 글자), 주황=불멍(흰 굵은 글자), 잉크=주차·차박 (소유자 확정 2026-10-16) */
  --mc-accent: #00875a; --mc-accent-ink: #0a6e45; --mc-accent-tint: #e4f4ea; --mc-leaf: #34c27a;
  --mc-volt: #c8ff00; --mc-flame: #ff4a1c; --mc-cobalt: #00875a;
  --mc-soft: #eef1ed; --mc-soft-2: #e4e8e3;
  --mc-glass: rgba(255, 255, 255, .9); --mc-glass-line: rgba(255, 255, 255, .9); --mc-glass-ink: #101414;
  --mc-scrim: rgba(16, 20, 20, .4);
  --mc-shadow-1: 0 1px 2px rgba(16, 20, 20, .04), 0 4px 16px rgba(16, 20, 20, .06);
  --mc-shadow-2: 0 8px 28px rgba(16, 20, 20, .12);
  --mc-shadow-float: 0 2px 10px rgba(16, 20, 20, .14);
  --mc-r-1: 12px; --mc-r-2: 16px; --mc-r-3: 22px; --mc-r-4: 28px;
  --mc-font: "Pretendard Variable", Pretendard, -apple-system, BlinkMacSystemFont, "Apple SD Gothic Neo", "Malgun Gothic", system-ui, sans-serif;
  --mc-display: clamp(2rem, 1.2rem + 3.4vw, 4.5rem);
}
`;
// 브라우저 주소창 색(모바일). 라이트 캔버스 / 다크 밤 숲.
export const THEME_COLOR_META = `<meta name="theme-color" content="#f5f6f4">`;
