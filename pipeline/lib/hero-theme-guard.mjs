// 히어로 배경·효과는 배열 위치가 아니라 명시적인 effect 키로만 연결한다.
// 배경 전환 중 이전 캔버스 입자가 남아 다른 테마처럼 보이는 것도 함께 차단한다.
export const HERO_EFFECTS = new Set([
  "night-sky", "autumn-maple", "rainy-camp", "snowy-winter", "lush-forest", "riverside",
  "warm-bonfire", "sunset-coast", "cherry-blossom", "green-meadow", "steam", "bubbles", "confetti",
]);

export function validateHeroThemes(themes = []) {
  const errors = [];
  const ids = new Set();
  const images = new Set();
  for (const [i, theme] of themes.entries()) {
    if (!theme || typeof theme !== "object") { errors.push(`theme[${i}] is not an object`); continue; }
    if (!theme.id || ids.has(theme.id)) errors.push(`duplicate/missing id at ${i}`);
    if (theme.id) ids.add(theme.id);
    if (!theme.image || images.has(theme.image)) errors.push(`duplicate/missing image at ${theme.id || i}`);
    if (theme.image) images.add(theme.image);
    if (!HERO_EFFECTS.has(theme.effect)) errors.push(`unknown effect '${theme.effect}' at ${theme.id || i}`);
  }
  return errors;
}

// 렌더러는 이 함수만 호출해야 한다. index → effect 변환은 금지한다.
export function effectForTheme(theme) {
  if (!theme || !HERO_EFFECTS.has(theme.effect)) return null;
  return theme.effect;
}
