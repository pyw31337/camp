import assert from "node:assert/strict";
import { test } from "node:test";
import { effectForTheme, validateHeroThemes } from "../lib/hero-theme-guard.mjs";

test("히어로 테마는 고유 배경과 명시적 효과를 갖는다", () => {
  const themes = [
    { id: "sunset-coast", image: "hero-sunset-coast.webp", effect: "sunset-coast" },
    { id: "uq-horse", image: "hero-horse.webp", effect: "green-meadow" },
  ];
  assert.deepEqual(validateHeroThemes(themes), []);
  assert.equal(effectForTheme(themes[1]), "green-meadow");
});

test("배열 순서나 잘못된 효과 키로 다른 테마 효과를 빌릴 수 없다", () => {
  assert.equal(effectForTheme({ id: "uq-horse", image: "hero-horse.webp", effect: "sunset-coast" }), "sunset-coast");
  assert.equal(effectForTheme({ id: "uq-horse", image: "hero-horse.webp", effect: "seagulls" }), null);
  assert.equal(validateHeroThemes([{ id: "a", image: "x.webp", effect: "sunset-coast" }, { id: "a", image: "x.webp", effect: "sunset-coast" }]).length, 2);
});
