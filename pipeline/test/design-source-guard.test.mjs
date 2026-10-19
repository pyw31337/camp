import { test } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { readFileSync, statSync } from "node:fs";

// 화면 원본(design/renewal)은 매일 발행이 /explore/로 그대로 복사한다. 원본이 자리표시자·잘린 파일로 덮이면
// 다음 발행에서 라이브 사이트 전체가 빈 화면이 된다(2026-10-19 14:43 “PLACEHOLDER” 커밋). 여기서 막는다.
const src = (f) => new URL(`../../design/renewal/${f}`, import.meta.url);
test("화면 원본 app.js·style.css가 자리표시자나 잘린 파일이 아니다", () => {
  const js = readFileSync(src("app.js"), "utf8"), css = readFileSync(src("style.css"), "utf8");
  for (const [name, text] of [["app.js", js], ["style.css", css]]) assert.ok(!/PLACEHOLDER/i.test(text.slice(0, 2000)), `${name}에 PLACEHOLDER가 있습니다`);
  assert.ok(statSync(src("app.js")).size > 100_000, "app.js가 100KB보다 작습니다(잘린 파일?)");
  assert.ok(statSync(src("style.css")).size > 40_000, "style.css가 40KB보다 작습니다(잘린 파일?)");
  for (const fn of ["function homeView", "async function detailView", "function listView", "async function route"]) assert.ok(js.includes(fn), `app.js에 ${fn}이 없습니다`);
  execFileSync(process.execPath, ["--check", src("app.js").pathname]); // 문법 오류면 여기서 실패
});
