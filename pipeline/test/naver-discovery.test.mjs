import assert from "node:assert/strict";
import test from "node:test";
import { localUrl, matchNaver, naverXY, queryOf } from "../lib/naver-discovery.mjs";
import { factsOf, validateFacts } from "../lib/fact-store.mjs";

const c = { id: "1", name: "[가평] 별빛오토캠핑장", sigungu: "가평군", tel: "031-123-4567", lat: 37.8, lng: 127.5, gc_url: "https://gc/x", modified_at: "2026-10-01" };

test("검색어·URL·좌표 변환", () => {
  assert.equal(queryOf(c), "별빛오토캠핑장 가평군");
  assert.match(localUrl("/search/v1/local", queryOf(c)), /^https:\/\/naverapihub\.apigw\.ntruss\.com\/search\/v1\/local\?query=/);
  assert.deepEqual(naverXY("1275000000", "378000000"), { lng: 127.5, lat: 37.8 });
  assert.equal(naverXY("314000", "552000"), null); // KATECH는 쓰지 않음
});

test("맞춤: 전화 일치 우선, 먼 동명 업소는 버리고, 운영자 링크 여부를 표시", () => {
  const items = [
    { title: "<b>별빛</b>펜션", category: "숙박>펜션", telephone: "", link: "", mapx: "1290000000", mapy: "355000000" },
    { title: "<b>별빛오토캠핑장</b>", category: "여행,명소>캠핑,야영장", telephone: "031-123-4567", link: "http://byeolbit-camp.com", mapx: "1275001000", mapy: "378001000" },
  ];
  const p = matchNaver(c, items);
  assert.equal(p.name, "별빛오토캠핑장");
  assert.equal(p.match.phone, true);
  assert.equal(p.link_is_operator, true);
  assert.ok(p.match.distance_m < 200);
  assert.equal(matchNaver(c, [items[0]]), null);
  const blog = matchNaver(c, [{ ...items[1], link: "https://blog.naver.com/byeolbit" }]);
  assert.equal(blog.link_is_operator, false);
});

test("사실: 네이버 등록 링크·전화는 CONFIRMED(naver_local)로 들어간다", () => {
  const naver = { checked_at: "2026-10-16", query: "별빛오토캠핑장 가평군", place: { link: "http://byeolbit-camp.com", phone: "031-123-4567", category: "캠핑,야영장" } };
  const f = factsOf(c, null, { naver }).filter((x) => x.src === "naver_local");
  assert.deepEqual(f.map((x) => x.attr).sort(), ["HOMEPAGE", "PHONE"]);
  assert.deepEqual(validateFacts(f), []);
});
