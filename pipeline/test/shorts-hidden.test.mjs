import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
const rd = (f) => readFileSync(new URL(`../../${f}`, import.meta.url), "utf8");
test("#36 100278 진천 더빌리지 숏츠는 화면에서만 숨김(데이터 유지)", () => {
  for (const f of ["camping-atlas/public/app.js", "design/renewal/app.js"]) { const s = rd(f); assert.match(s, /const HIDDEN_VIDEOS = \{ "100278": \["MwVOrtKjy9M"\] \}/); assert.match(s, /\.filter\(\(x\) => !HIDDEN_VIDEOS\[String\(c\.id\)\]\?\.includes\(x\.yt\)\)/); }
  assert.deepEqual(JSON.parse(rd("pipeline/registry/shorts-exclude.json"))["100278"].map((x) => x.yt), ["MwVOrtKjy9M"]);
});
