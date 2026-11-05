import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";

// t45u: 이색 13분류 칩(계곡 포함)·모든 테마 정렬(넓은순/가까운순/저렴한순)·히어로 12종·이색 썸네일이 사라지지 않게 막는다.
const p = (f) => fileURLToPath(new URL(`../../${f}`, import.meta.url));
const js = readFileSync(p("design/renewal/app.js"), "utf8");
test("두 app.js·style.css 사본이 같다", () => {
  assert.equal(js, readFileSync(p("camping-atlas/public/app.js"), "utf8"));
  assert.equal(readFileSync(p("design/renewal/style.css"), "utf8"), readFileSync(p("camping-atlas/public/style.css"), "utf8"));
});
test("이색 분류 칩 13종(계곡 포함)", () => {
  const m = js.match(/const UNIQUE_SUBS = (\[.*?\]\]);/);
  assert.ok(m); const subs = JSON.parse(m[1]);
  assert.deepEqual(subs.map((x) => x[1]), ["노천탕", "스파", "사계절온수풀", "수영장", "승마", "동물체험", "키즈카페", "실내놀이", "트리하우스", "이색숙소", "레포츠", "체험", "계곡"]);
});
test("정렬 바는 모든 테마에, 정렬은 테마 무관 적용", () => {
  for (const k of ["area", "near", "fee"]) assert.ok(js.includes(`data-uq-sort="${k}"`));
  assert.ok(!/themeKey === "UNIQUE" \? `<div class="theme-uq-bar/.test(js), "정렬 바가 이색 테마에만 묶여 있습니다");
  assert.ok(js.includes("if (uqSort) {"));
  assert.ok(js.includes("libraries=services"), "카카오 장소 검색 라이브러리");
  assert.ok(js.includes("mc-near-pt") && js.includes("mc-uq-sort"), "선택 저장");
});
test("이색 썸네일·히어로 12종", () => {
  assert.ok(/UNIQUE: "unique-onsen\.webp"/.test(js), "이색 썸네일은 노천탕 전용 이미지(t47u)");
  assert.ok(!/UNIQUE: "glamping\.webp"/.test(js), "글램핑과 같은 썸네일 금지");
  const ids = [...js.matchAll(/id: "(uq-[a-z]+)"/g)].map((m) => m[1]);
  assert.equal(new Set(ids).size, 12);
  for (const d of ["design/renewal", "camping-atlas/public"]) {
    assert.ok(existsSync(p(`${d}/images/themes/unique-onsen.webp`)));
  }
});
