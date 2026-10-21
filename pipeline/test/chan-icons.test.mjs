import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
const js = readFileSync(new URL("../../camping-atlas/public/app.js", import.meta.url), "utf8");
for (const f of ["../../camping-atlas/public/index.html", "../../design/renewal/index.html"]) {
  const html = readFileSync(new URL(f, import.meta.url), "utf8");
  test(`${f}: 네이버 N·전화(phone-call) 아이콘이 채움형으로 있다`, () => {
    const nv = html.match(/<symbol id="i-naver"[^>]*>(.*?)<\/symbol>/)?.[1];
    assert.ok(nv && !/stroke/.test(nv));
    const ph = html.match(/<symbol id="i-phone"[^>]*>(.*?)<\/symbol>/)?.[1] ?? "";
    assert.equal((ph.match(/<path /g) ?? []).length, 3, "손수화기 + 전파 두 줄");
    assert.doesNotMatch(ph, /stroke/);
  });
}
test("예약 방법·예약 목록에서 네이버는 N 아이콘, 전화 문의는 phone 아이콘", () => {
  assert.match(js, /class="chan" href="\$\{esc\(main\.url\)\}" target="_blank" rel="noopener">\$\{ic\(\/네이버\/\.test\(bookingLabel\(main\)\) \? "naver"/);
  assert.match(js, /\? ic\("naver"\)/);
  assert.match(js, /\$\{ic\("phone"\)\}<b>전화 문의<\/b>/);
});
