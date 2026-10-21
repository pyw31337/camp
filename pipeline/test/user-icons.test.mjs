import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
const js = readFileSync(new URL("../../camping-atlas/public/app.js", import.meta.url), "utf8");
const IDS = ["amenity", "hotwater", "playground", "experience", "restarea", "tour", "food", "weather", "company", "sitetype", "phone"];
for (const f of ["../../camping-atlas/public/index.html", "../../design/renewal/index.html"]) {
  const h = readFileSync(new URL(f, import.meta.url), "utf8");
  test(`${f}: 영우 님 제공 아이콘 11종이 스프라이트에 한 번씩`, () => {
    for (const id of IDS) assert.equal((h.match(new RegExp(`<symbol id="i-${id}"`, "g")) ?? []).length, 1, id);
    assert.match(h, /<symbol id="i-phone" viewBox="0 0 24 24"><path d="M9\.928 3\.629/);
  });
}
test("제공 아이콘이 해당 자리에 쓰인다 + ‘업체 소개’", () => {
  for (const s of ['iconTitle("amenity", "편의시설")', 'return ic("hotwater")', 'return ic("playground")', 'iconTitle("experience", "특징·체험")', 'REST_AREA: ["휴게소", "restarea"]', 'TOUR: ["관광", "tour"], FOOD: ["맛집", "food"]', 'iconTitle("weather", "주간 날씨 예보")', 'iconTitle("company", "업체 소개")', 'iconTitle("sitetype", "사이트 타입")'])
    assert.ok(js.includes(s), s);
  assert.doesNotMatch(js, /업장 소개/);
});
test("상세 ‘주간 날씨’ 칸(conditions/card.js) 제목에 제공 날씨 아이콘", () => {
  assert.match(readFileSync(new URL("../../camping-atlas/public/conditions/card.js", import.meta.url), "utf8"), /<svg class="ic line"><use href="#i-weather"\/><\/svg><h2>주간 날씨<\/h2>/);
});
