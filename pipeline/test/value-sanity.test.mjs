import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { sanitizeCampValues, sanitizeDetailValues, RANGES } from "../lib/value-sanity.mjs";
import { isOperatorHost } from "../lib/operator-site.mjs";

const run = (c) => { const hits = []; sanitizeCampValues(c, (f) => hits.push(f)); return hits; };
test("전기 W: 400 미만·3000 초과 숨김, 600·1100 유지", () => {
  const c = { field_conditions: { power: { limit_w: 100 } }, of: { w: { v: 5000, u: "https://x.kr" } } };
  assert.deepEqual(run(c).sort(), ["전기 W", "전기 W"]);
  assert.equal(c.field_conditions.power.limit_w, null); assert.equal(c.of.w, undefined);
  assert.equal(c._hid["field_conditions.power.limit_w"].v, 100); // 원본 보관
  assert.equal(run({ field_conditions: { power: { limit_w: 600 } }, of: { w: { v: 1100, u: "https://x.kr" } } }).length, 0);
});
test("캠핑 안내 블로그(kimgoon.kr) 문장은 업장 사실이 아니다", () => {
  const c = { of: { w: { v: 1100, u: "https://camping.kimgoon.kr/guide" } } };
  assert.deepEqual(run(c), ["전기 W"]);
  assert.equal(isOperatorHost("https://camping.kimgoon.kr/guide"), false);
});
test("사이트 수·규격: 1,283개·36×5m·0개 숨김", () => {
  const c = { kinds: [["PITCH", 1283], ["GLAMPING", 9]], sizes: [[36, 5, 54], [4, 6, 8], [7, 7, 0]] };
  run(c);
  assert.deepEqual(c.kinds, [["GLAMPING", 9]]); assert.deepEqual(c.sizes, [[4, 6, 8], [7, 7, null]]);
});
test("입실 21:00·퇴실 00:00·매너타임 18:00 숨김, 14:00/11:00/22:00 유지", () => {
  const c = { ti: { i: ["21:00", "c"], o: ["00:00", "c"], m: ["18:00", "m"] } }; run(c); assert.equal(c.ti, undefined);
  const ok = { ti: { i: ["14:00", "m"], o: ["11:00", "m"], m: ["22:00", "m"] } }; assert.equal(run(ok).length, 0);
  const d = { profile: { fields: { MANNER: { value: "18:00부터" }, CHECKOUT: { value: "21:00까지" } } } };
  sanitizeDetailValues(d, {}); assert.deepEqual(Object.keys(d.profile.fields), []);
});
test("예약 상품: ‘개별화장실 10,000원’은 사이트가 아님 → 숨김, 인원 50명 숨김", () => {
  const d = { booking_sites: { sites: [{ name: "B-4(타프존)", price: 60000, people: "기준인원2인" }, { name: "개별화장실(4)", price: 10000 }, { name: "단체", price: 90000, people: "기준인원50인" }] } };
  const h = []; sanitizeDetailValues(d, { op: "PRIVATE", name: "우니메이카" }, (f, why) => h.push(why));
  assert.deepEqual(d.booking_sites.sites.map((s) => s.name), ["B-4(타프존)", "단체"]);
  assert.equal(d.booking_sites.sites[1].people, null);
  assert.ok(h.includes("사이트가 아닌 부대 상품(화장실·주차 등)"));
  const c = { op: "PRIVATE", name: "x", tq: { lo: 10000, hi: 70000 } }; run(c); assert.equal(c.tq.lo, 70000);
});
test("운영일 코드값(CL03)·편의시설 수 범위", () => { const c = { days: ["평일+주말", "CL03"], toilets: 999 }; run(c); assert.deepEqual(c.days, ["평일+주말"]); assert.equal(c.toilets, undefined); });
test("범위표가 요구 항목을 모두 정의", () => { for (const k of ["power_w", "breaker_a", "site_count", "site_m", "checkin_h", "checkout_h", "manner_start_h", "people", "pet_kg", "altitude_m", "near_m"]) assert.ok(RANGES[k], k); });
test("배포·CI 연결", () => {
  const dep = readFileSync(new URL("../../.github/workflows/deploy-pages.yml", import.meta.url), "utf8");
  const wq = readFileSync(new URL("../../.github/workflows/web-quality.yml", import.meta.url), "utf8");
  assert.ok(dep.indexOf("apply-value-sanity.mjs --data") > 0 && dep.indexOf("apply-value-sanity.mjs --data") < dep.indexOf("split-catalog.mjs"));
  assert.match(wq, /apply-value-sanity\.mjs --check --baseline/);
});
