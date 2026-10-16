import assert from "node:assert/strict";
import test from "node:test";
import { homepageCandidates, matchPlace, nameKey, nameSimilarity, pickHomepages } from "../lib/kakao-discovery.mjs";

test("이름 핵심은 업종어·괄호·법인 표기를 뺀다", () => {
  assert.equal(nameKey("[가평] 별빛오토캠핑장(1캠)"), "별빛");
  assert.equal(nameKey("주식회사 라하 글램핑"), "라하");
  assert.equal(nameSimilarity("별빛오토캠핑장", "별빛캠핑장"), 1);
  assert.ok(nameSimilarity("별빛캠핑장", "달빛캠핑장") < 0.6);
});

test("장소 맞춤: 전화 일치 우선, 이름만 비슷하고 먼 곳은 버린다", () => {
  const c = { name: "별빛오토캠핑장", tel: "031-123-4567" };
  const docs = [
    { id: "1", place_name: "별빛펜션", category_name: "여행 > 숙박 > 펜션", phone: "031-999-0000", distance: "4500" },
    { id: "2", place_name: "별빛오토캠핑장", category_name: "여행 > 숙박 > 야영,캠핑장", phone: "031-123-4567", distance: "120", place_url: "http://place.map.kakao.com/2" },
  ];
  const p = matchPlace(c, docs);
  assert.equal(p.id, "2");
  assert.equal(p.match.phone, true);
  assert.equal(matchPlace(c, [docs[0]]), null);
});

test("홈페이지 후보: 플랫폼·뉴스는 빼고, 이름이 제목에 있는 루트 주소를 고른다", () => {
  const c = { name: "별빛오토캠핑장" };
  const docs = [
    { url: "https://blog.naver.com/x/1", title: "별빛오토캠핑장 후기" },
    { url: "https://www.yna.co.kr/view/1", title: "별빛캠핑장 개장" },
    { url: "https://byeolbit-camp.com/", title: "<b>별빛</b>오토캠핑장 - 홈" },
    { url: "https://byeolbit-camp.com/reserve", title: "예약 안내 | 별빛오토캠핑장" },
    { url: "https://other.com/", title: "전혀 다른 곳" },
  ];
  const list = homepageCandidates(c, docs);
  assert.equal(list.length, 1);
  assert.equal(list[0].url, "https://byeolbit-camp.com/");
  assert.equal(list[0].hits, 2);
});

test("여러 캠핑장에 공통으로 나오는 호스트는 홈페이지로 쓰지 않는다", () => {
  const e = (host) => ({ host, url: `https://${host}/`, score: 20, evidence: [] });
  const { picked, shared } = pickHomepages({ a: [e("portal.kr"), e("a-camp.kr")], b: [e("portal.kr")], c: [e("c-camp.kr")] });
  assert.deepEqual(shared, ["portal.kr"]);
  assert.equal(picked.a.host, "a-camp.kr");
  assert.equal(picked.b, null);
  assert.equal(picked.c.host, "c-camp.kr");
});
