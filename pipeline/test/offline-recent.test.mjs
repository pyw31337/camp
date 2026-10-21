import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
const rd = (f) => readFileSync(new URL(`../../${f}`, import.meta.url), "utf8");
// t39 #42 최근 본 캠핑장 + 오프라인 보관
test("#42 상세를 열면 최근 본 목록에 쌓이고 찜 화면에 보인다", () => {
  for (const f of ["camping-atlas/public/app.js", "design/renewal/app.js"]) {
    const s = rd(f);
    assert.match(s, /if \(c\) pushRecent\(id\);/);
    assert.match(s, /const RECENT_KEY = "mc-recent", RECENT_MAX = 12;/);
    assert.equal((s.match(/\$\{recentHtml\(\)\}/g) || []).length, 2); // 빈 찜·찜 있는 화면 둘 다
    assert.match(s, /serviceWorker\.register\(`\$\{APP_BASE\}sw\.js`/);
  }
});
test("#42 sw.js는 네트워크 먼저, 끊겼을 때만 사본(같은 출처 GET)", () => {
  const s = rd("camping-atlas/public/sw.js");
  assert.match(s, /const res = await fetch\(req\);[\s\S]*catch[\s\S]*cache\.match\(key\)/);
  assert.match(s, /req\.method !== "GET"/);
  assert.match(s, /u\.origin === self\.location\.origin/);
});
