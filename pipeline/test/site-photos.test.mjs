import test from "node:test";
import assert from "node:assert/strict";
import { decideSite, summarize, typesFromText, nonProductText, floorFromText, verdictFor, LABELS, SITE, OTHER } from "../lib/site-photo-classify.mjs";
import { pageImages, siteLinks } from "../lib/operator-photos.mjs";

const sum = (pairs, site) => ({ t: pairs, site });

test("모든 문장은 부류 하나에 속한다", () => {
  assert.equal(LABELS.length, [...Object.values(SITE), ...Object.values(OTHER)].flat().length);
  assert.equal(new Set(LABELS).size, LABELS.length);
});

test("summarize: 같은 부류 문장 확률을 더한다", () => {
  const r = summarize([{ label: SITE.glamping[0], score: 0.3 }, { label: SITE.glamping[1], score: 0.3 }, { label: OTHER.food[0], score: 0.4 }]);
  assert.deepEqual(r.t[0], ["glamping", 0.6]);
  assert.equal(r.site, 0.6);
});

test("decideSite: 1위 사이트 부류가 뚜렷할 때만 ok", () => {
  assert.equal(decideSite(sum([["glamping", 0.7], ["landscape", 0.1]], 0.8)).ok, true);
  assert.equal(decideSite(sum([["landscape", 0.6], ["glamping", 0.3]], 0.3)).ok, false);
  assert.equal(decideSite(sum([["glamping", 0.4], ["caravan", 0.36]], 0.8)).ok, false); // 2위와 차이 없음
});

test("typesFromText·floorFromText·nonProductText", () => {
  assert.deepEqual(typesFromText("A구역 글램핑 (데크)"), ["GLAMPING", "DECK", "AUTO"]);
  assert.deepEqual(typesFromText("카라반 4인"), ["CARAVAN"]);
  assert.deepEqual(typesFromText(""), []);
  assert.equal(floorFromText("오토캠핑 파쇄석 사이트"), "파쇄석");
  assert.equal(nonProductText("캠핑장 배치도"), true);
  assert.equal(nonProductText("매점 운영 안내"), true);
  assert.equal(nonProductText("글램핑 내부"), false);
});

const both = (cls, s, other = 0.05) => ({ b: sum([[cls, s], ["landscape", other]], s), l: sum([[cls, s], ["landscape", other]], s), w: 1000, h: 666, d: "0" });

test("verdictFor: 두 모델이 같은 부류이고 캠핑장에 그 유형이 있을 때만 쓴다", () => {
  assert.equal(verdictFor({ src: "gocamping" }, both("glamping", 0.8), ["GLAMPING", "AUTO"]).type, "GLAMPING");
  assert.equal(verdictFor({ src: "gocamping" }, both("glamping", 0.8), ["AUTO"]).no, "type-not-in-camp");
  assert.equal(verdictFor({ src: "gocamping" }, both("gravel", 0.7), ["PITCH", "AUTO"]).type, "AUTO");
  assert.equal(verdictFor({ src: "gocamping" }, both("gravel", 0.7), ["PITCH", "AUTO"]).floor, "파쇄석");
  // 모델끼리 다른 부류
  const split = { b: sum([["glamping", 0.8]], 0.9), l: sum([["caravan", 0.8]], 0.9) };
  assert.equal(verdictFor({ src: "gocamping" }, split, ["GLAMPING", "CARAVAN"]).no, "not-product");
  // ‘상품 아님’ 확률이 높으면 버림
  assert.equal(verdictFor({ src: "gocamping" }, both("glamping", 0.6, 0.3), ["GLAMPING"]).no, "not-product");
  // 작은 모델이 이미 상품 아님으로 본 사진
  assert.equal(verdictFor({ src: "gocamping" }, { b: sum([["food", 0.9]], 0.05), lskip: 1 }, ["GLAMPING"]).no, "not-product");
});

test("verdictFor: 글 단서", () => {
  assert.equal(verdictFor({ src: "operator", cap: "캠핑장 배치도" }, both("deck", 0.7), ["DECK"]).no, "caption-nonproduct");
  assert.equal(verdictFor({ src: "tourapi", cap: "글램핑 A동" }, both("caravan", 0.8), ["GLAMPING", "CARAVAN"]).no, "caption-conflict");
  const v = verdictFor({ src: "tourapi", cap: "카라반 4인실" }, both("caravan", 0.8), ["CARAVAN", "AUTO"]);
  assert.equal(v.type, "CARAVAN"); assert.equal(v.by, "caption+image");
  // 쪽·블록 이름(ctx)은 유형 고르기에만 쓴다
  assert.equal(verdictFor({ src: "gocamping", ctx: "반려견 사이트" }, both("lawn", 0.7), ["AUTO", "PET_SITE"]).type, "PET_SITE");
});

test("verdictFor: 건물·실내는 더 높은 문턱", () => {
  assert.equal(verdictFor({ src: "gocamping" }, both("pension", 0.9), ["HOUSE"]).no, "not-product"); // 방갈로(cabin) 근거 없음
  assert.equal(verdictFor({ src: "gocamping" }, both("cabin", 0.7), ["BUNGALOW", "HOUSE"]).type, "BUNGALOW");
  assert.equal(verdictFor({ src: "gocamping" }, both("caravan_in", 0.5), ["CARAVAN"]).no, "not-product");
  const v = verdictFor({ src: "gocamping" }, both("caravan_in", 0.8), ["CARAVAN"]);
  assert.equal(v.type, "CARAVAN"); assert.equal(v.in, true);
});

test("operator-photos: 상품 링크와 사진 후보", () => {
  const html = `<title>OO캠핑장</title><a href="/sub/glamping.html">글램핑</a><a href="/board/review">후기</a><a href="https://other.com/site">사이트</a>
    <h3>A구역 파쇄석</h3><img src="/data/site_a1.jpg" alt="A구역"><img src="/img/logo.png"><img data-src="/upload/b.jpg" width="120">
    <div style="background-image:url('/upload/hero.jpg')"></div>`;
  const links = siteLinks(html, "http://camp.example.kr/");
  assert.deepEqual(links.map((l) => l.url), ["http://camp.example.kr/sub/glamping.html"]);
  const imgs = pageImages(html, "http://camp.example.kr/", { linkText: "사이트 안내" });
  assert.deepEqual(imgs.map((i) => i.url), ["http://camp.example.kr/data/site_a1.jpg", "http://camp.example.kr/upload/hero.jpg"]);
  assert.equal(imgs[0].alt, "A구역");
  assert.match(imgs[0].near, /A구역 파쇄석/);
  assert.match(imgs[0].cap, /사이트 안내/);
});
