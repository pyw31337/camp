#!/usr/bin/env node
// 히어로 기능이 포함된 발행 소스에서 배경과 Canvas 효과를 같은 테마 키로 묶는지 검사한다.
// 현재 main처럼 히어로 기능이 아직 병합되지 않은 소스는 경고만 남기고 통과한다.
import { readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { EXPECTED_HERO_EFFECTS, validateHeroThemes } from "../lib/hero-theme-guard.mjs";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const file = resolve(root, process.argv[2] || "design/renewal/app.js");
const source = await readFile(file, "utf8");
if (!source.includes("HERO_THEMES")) {
  console.warn(`::warning::${file}에 HERO_THEMES가 없어 동적 히어로 검사를 건너뜁니다(배포 기준 브랜치 확인 필요)`);
  process.exit(0);
}
if (/setTheme\(\s*theme\.id\s*\)/.test(source)) {
  console.error("히어로 효과를 theme.id로 추론하고 있습니다. 반드시 theme.effect를 사용하세요.");
  process.exit(1);
}
if (!/setTheme\(\s*theme\.effect(?:\s*\|\|\s*theme\.id)?\s*\)/.test(source)) {
  console.error("히어로 테마 적용 지점에서 명시적 effect 키를 찾지 못했습니다.");
  process.exit(1);
}
// 배열 전체를 실행하지 않고도 중복 id/image와 허용되지 않은 effect를 빠르게 잡는다.
const block = source.match(/const HERO_THEMES\s*=\s*\[(<!--[\s\S]*?-->)?[\s\S]*?^\];/m)?.[0] || "";
const ids = [...block.matchAll(/\bid:\s*["']([^"']+)["']/g)].map((m) => m[1]);
const images = [...block.matchAll(/\bimage:\s*["']([^"']+)["']/g)].map((m) => m[1]);
const effects = [...block.matchAll(/\beffect:\s*["']([^"']+)["']/g)].map((m) => m[1]);
const errors = [];
if (new Set(ids).size !== ids.length) errors.push("중복 theme id");
if (new Set(images).size !== images.length) errors.push("중복 theme image");
if (effects.some((e) => !["night-sky","autumn-maple","rainy-camp","snowy-winter","lush-forest","riverside","warm-bonfire","sunset-coast","cherry-blossom","green-meadow","steam","bubbles","confetti"].includes(e))) errors.push("허용되지 않은 theme effect");
if (errors.length) { console.error(errors.join(", ")); process.exit(1); }
for (const [id, effect] of Object.entries(EXPECTED_HERO_EFFECTS)) {
  const i = ids.indexOf(id);
  if (i !== -1 && effects[i] !== effect) errors.push(`effect mismatch '${id}': expected ${effect}, got ${effects[i]}`);
}
if (errors.length) { console.error(errors.join(", ")); process.exit(1); }
console.log(`히어로 테마 매핑 OK: ${ids.length}개`);
