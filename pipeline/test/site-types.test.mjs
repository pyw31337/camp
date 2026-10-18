import assert from "node:assert/strict";
import test from "node:test";
import { siteTypesOf, typesInText } from "../lib/site-types.mjs";

const codes = (list) => list.map((t) => t.code);

test("소개글 문장에서 타입을 찾고 부정 문장은 버린다", () => {
  assert.deepEqual(typesInText("파쇄석과 데크로 이루어진 캠핑존, 차박존과 방갈로 등 다양한 스타일").map((x) => x[0]).sort(), ["CAR_CAMP", "HOUSE"]);
  assert.equal(typesInText("복층데크 사이트 10면을 운영합니다")[0][0], "DUPLEX_DECK");
  assert.deepEqual(typesInText("카라반 입장 불가, 차박 금지"), []);
  assert.equal(typesInText("방갈로 5동과 캐빈")[0][1], "방갈로");
});

test("고캠핑 등록 수가 문장보다 앞서고, 운영자 문장은 OPERATOR로 남는다", () => {
  const c = { id: "1", gc_url: "https://gc/1", kinds: [["GLAMPING", 22], ["CARAVAN_RENTAL", 7]], floors: [["DECK", 14]], trailer: false };
  const d = { intro: "글램핑과 카라반, 타프존을 갖춘 캠핑장" };
  const s = { url: "https://op.example/", checked_at: "2026-10-18", snippets: [{ text: "반려견 전용 사이트 5면 운영", url: "https://op.example/site" }] };
  const list = siteTypesOf(c, d, { snippets: s, kakao: { category: "여행 > 숙박 > 야영,캠핑장 > 글램핑장", url: "http://place.map.kakao.com/1" } });
  assert.deepEqual(codes(list), ["DECK", "TARP_ZONE", "GLAMPING", "CARAVAN", "PET_SITE"]);
  const g = list.find((t) => t.code === "GLAMPING");
  assert.equal(g.count, 22); assert.equal(g.src, "gocamping");
  const pet = list.find((t) => t.code === "PET_SITE");
  assert.equal(pet.grade, "OPERATOR"); assert.equal(pet.url, "https://op.example/site");
});
