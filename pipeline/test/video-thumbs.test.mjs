import assert from "node:assert/strict";
import { test } from "node:test";
import { readFileSync } from "node:fs";
const app = readFileSync(new URL("../../camping-atlas/public/app.js", import.meta.url), "utf8");
test("SNS 영상 썸네일: 유튜브 1280px, 실패 시 480px → 캠핑장 사진", () => {
  assert.match(app, /\/hq720\.jpg/);
  assert.match(app, /data-alt=.*data-fb=/s);
  assert.match(app, /bigByUrl\.get\(x\.url\) \|\| hiThumb\(x\.thumb\) \|\| fb/);
});
test("썸네일 없는 글도 빈칸 없이 캠핑장 사진으로", () => {
  assert.match(app, /const thumbPool = \[/);
  assert.match(app, /thumbPool\[i % thumbPool\.length\]/);
});
