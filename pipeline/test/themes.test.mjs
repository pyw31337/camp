import assert from "node:assert/strict";
import test from "node:test";
import { THEMES, themeCatalog, themesOf } from "../lib/themes.mjs";

test("테마: 고캠핑 원천 필드로만 판정", () => {
  const c = { environment: ["계곡", "산"], themes: ["가을단풍명소", "여름물놀이"], amenities: ["전기", "온수", "장작판매", "마트.편의점", "트렘폴린", "무선인터넷"],
    pets: "가능(소형견)", products: [{ kind: "AUTO_PITCH" }], operator_type: "LOCAL_GOVERNMENT", reservation: { methods: ["온라인실시간예약"] }, trailer_allowed: false, caravan_allowed: null };
  const th = themesOf(c);
  for (const id of ["valley", "mountain", "autumn", "summer", "kids", "pet", "auto", "comfort", "wifi", "public", "realtime"]) assert.ok(th.includes(id), id);
  for (const id of ["sea", "glamping", "trailer", "winter"]) assert.ok(!th.includes(id), id);
  assert.deepEqual(themesOf({ pets: "불가능" }), []);
  assert.equal(new Set(THEMES.map((t) => t.id)).size, THEMES.length);
  assert.equal("test" in themeCatalog()[0], false);
});
