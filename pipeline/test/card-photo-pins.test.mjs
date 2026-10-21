import assert from "node:assert/strict";
import { test } from "node:test";
import { readFileSync } from "node:fs";

const read = (p) => JSON.parse(readFileSync(new URL(p, import.meta.url), "utf8"));
const pins = read("../registry/card-photo-pins.json").camps;
const fb = read("../registry/card-fallback.json").camps;
const camps = read("../../camping-atlas/public/explore/data/campgrounds.json");
const src = readFileSync(new URL("../scripts/pick-card-fallback.mjs", import.meta.url), "utf8");

test("고정 사진(pin)은 카드 대체 사진과 목록에 그대로 반영된다", () => {
  for (const [id, p] of Object.entries(pins)) {
    if (!p.pin) continue;
    assert.equal(fb[id]?.t, p.pin.t, `${id} card-fallback`);
    const c = camps.find((x) => String(x.id) === id);
    if (c && !c.img && !c.ph) assert.equal(c.pt?.t, p.pin.t, `${id} campgrounds.pt`);
  }
});
test("제외(reject)한 사진은 다시 고르지 않는다", () => {
  for (const [id, p] of Object.entries(pins)) for (const r of p.reject ?? []) assert.notEqual(fb[id]?.t, r);
  assert.match(src, /card-photo-pins\.json/);
  assert.match(src, /rejected\.has/);
});
test("화성에코팜(102229) 대표 사진이 로컬푸드 매장 사진이 아니다", () => {
  assert.notEqual(fb["102229"].t, "https://search3.kakaocdn.net/argon/130x130_85_c/Apxspld2pru");
});
