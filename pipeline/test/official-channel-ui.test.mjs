import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const R = new URL("../../", import.meta.url);
const rd = (f) => readFileSync(new URL(f, R), "utf8");
const app = rd("design/renewal/app.js");
const css = rd("design/renewal/style.css");

test("design와 public 앱·스타일이 같다", () => {
  assert.equal(app, rd("camping-atlas/public/app.js"));
  assert.equal(css.replaceAll('url("../images/', 'url("./images/'), rd("camping-atlas/public/style.css"));
});

test("제목 옆과 업체 정보에 공식 채널 배지가 있고 새 창으로 연다", () => {
  assert.match(app, /officialBadgesHtml\(c\)/);
  assert.match(app, /class="d-official"/);
  assert.match(app, /\["공식 채널"/);
  assert.match(app, /class="info-official"/);
  assert.match(app, /class="d-official-badge[^"]*"[^>]*href="\$\{esc\(ch\.u\)\}" target="_blank" rel="noopener"/);
  assert.match(app, /official-channels\.json/);
});

test("공식 채널 배지는 줄바꿈되고 칸 밖으로 넘치지 않는다", () => {
  assert.match(css, /\.d-official, \.info-official \{[^}]*flex-wrap: wrap/);
  assert.match(css, /\.d-official-badge \{[^}]*max-width: 100%/);
  assert.match(css, /\.d-official-lab \{[^}]*overflow-wrap: anywhere/);
  assert.match(css, /\.d-official-ic \.plat-ic/);
  assert.doesNotMatch(css, /\.d-official[^{]*\{[^}]*overflow:\s*hidden/);
});
