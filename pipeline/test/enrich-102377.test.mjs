import assert from "node:assert/strict";
import { test } from "node:test";
import { readFileSync } from "node:fs";
const camps = JSON.parse(readFileSync(new URL("../../camping-atlas/public/explore/data/campgrounds.json", import.meta.url), "utf8"));
test("평택캠핑성(102377) 보강: 고캠핑 링크·최신 요금·퇴실·출처", () => {
  const c = camps.find((x) => x.id === "102377");
  assert.match(c.gc_url, /c_no=808/);
  assert.equal(c.fee.min, 35000);
  assert.equal(c.checkout, "12:00");
  assert.ok(c.src_extra.length >= 4);
  assert.ok(c.notes.some((n) => n.includes("A-5")));
});
test("화성에코팜(102229) 보강: 운영 기관 공식 요금·휴무·반려", () => {
  const c = camps.find((x) => x.id === "102229");
  assert.equal(c.fee.grade, "OFFICIAL");
  assert.equal(c.fee.min, 35000);
  assert.equal(c.closed, "매주 월요일");
  assert.match(c.pets, /불가능/);
});
test("공식 요금이 후기 기반 요약보다 먼저 보인다", () => {
  const app = readFileSync(new URL("../../camping-atlas/public/app.js", import.meta.url), "utf8");
  assert.match(app, /pf\?\.v && !\/\^\(OFFICIAL\|OPERATOR\|CONFIRMED\)\$\//);
  assert.deepEqual(camps.find((x) => x.id === "102377").ti.o, ["12:00", "c"]);
});
