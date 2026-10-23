import assert from "node:assert/strict";
import { test } from "node:test";
import { isKakaoPost, normPostUrl, pickPostImage, thumbQuery } from "../lib/review-thumbs.mjs";

test("카카오 후기 썸네일: 원문 주소가 같은 이미지 검색 결과만 쓴다", () => {
  const post = "https://cafe.daum.net/withandfree/BC0j/896";
  const docs = [
    { doc_url: "https://cafe.daum.net/other/AAAA/1", thumbnail_url: "https://search1.kakaocdn.net/argon/130x130_85_c/x", image_url: "https://t1.daumcdn.net/x.jpg" },
    { doc_url: "http://m.cafe.daum.net/withandfree/BC0j/896?svc=x", thumbnail_url: "https://search2.kakaocdn.net/argon/130x130_85_c/y", image_url: "https://t1.daumcdn.net/y.jpg" },
  ];
  assert.deepEqual(pickPostImage(docs, post), { thumb: "https://search2.kakaocdn.net/argon/130x130_85_c/y", img: "https://t1.daumcdn.net/y.jpg" });
  assert.equal(pickPostImage(docs.slice(0, 1), post), null);
  assert.equal(normPostUrl("https://abc.tistory.com/m/12/"), normPostUrl("http://abc.tistory.com/12"));
  assert.equal(isKakaoPost("https://abc.tistory.com/12"), true);
  assert.equal(isKakaoPost("https://blog.naver.com/x/1"), false);
  assert.equal(thumbQuery({ title: "<b>두리캠핑장</b> [후기] 아라뱃길" }), "두리캠핑장 후기 아라뱃길");
});

test("공공시설 공식 사진: 400m 안·이름 겹침일 때만", async () => {
  const { matchTourPhoto } = await import("../lib/public-poi.mjs");
  const tour = [{ id: "1", title: "유명산자연휴양림", lat: 37.581, lng: 127.481, image: "http://tong.visitkorea.or.kr/a.jpg" }, { id: "2", title: "근처 카페", lat: 37.5801, lng: 127.4801, image: "x" }];
  assert.equal(matchTourPhoto({ name: "국립 유명산자연휴양림", lat: 37.58, lng: 127.48 }, tour).contentid, "1");
  assert.equal(matchTourPhoto({ name: "국립 유명산자연휴양림", lat: 37.60, lng: 127.48 }, tour), null); // 2km 밖
  assert.equal(matchTourPhoto({ name: "가평체육센터 수영장", lat: 37.58, lng: 127.48 }, tour), null); // 이름 안 겹침
});

test("주변 사진 판독: 가게 모습이 뚜렷하고 시설 종류와 맞을 때만", async () => {
  const { decideNearby, fitsKind, NPOS, NNEG } = await import("../lib/nearby-photo-judge.mjs");
  const ok = decideNearby([{ label: NPOS[0], score: 0.5 }, { label: NPOS[1], score: 0.25 }, { label: NNEG[0], score: 0.05 }]);
  assert.equal(ok.ok, true);
  assert.equal(decideNearby([{ label: NNEG[4], score: 0.6 }, { label: NPOS[0], score: 0.3 }]).ok, false); // 배너
  assert.equal(decideNearby([{ label: NPOS[0], score: 0.4 }, { label: NPOS[1], score: 0.3 }, { label: NNEG[1], score: 0.15 }]).ok, false); // 인물 섞임
  assert.equal(fitsKind("fuel", "a photo of a gas station"), true);
  assert.equal(fitsKind("fuel", "a photo of a public toilet building"), false);
  assert.equal(fitsKind("vet", "a photo of a hospital, clinic or pharmacy building"), true);
});
