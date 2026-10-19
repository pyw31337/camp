import assert from "node:assert/strict";
import { test } from "node:test";
import sharp from "sharp";
import { allocateUnique, dhash, hamming, photoKey, uniqueBy, uniqueByHash } from "../lib/photo-dedupe.mjs";

test("고캠핑 대표 사진(thumb_720_파일)과 imageList(파일)는 같은 키", () => {
  assert.equal(photoKey("https://gocamping.or.kr/upload/camp/1/thumb/thumb_720_ABCjpg.jpg"), photoKey("https://gocamping.or.kr/upload/camp/1/ABCjpg.jpg?x=1"));
  assert.equal(photoKey("https://x/upload/50%할인%ZZ.jpg"), "50%할인%zz.jpg", "잘못된 % 인코딩에서도 멈추지 않는다");
  assert.equal(photoKey("https://x/%EC%82%AC%EC%A7%84.JPG"), "사진.jpg");
  const seen = new Set([photoKey("https://a/x/1.jpg")]);
  assert.deepEqual(uniqueBy(["https://b/1.jpg", "https://b/2.jpg", "https://c/2.jpg?type=w966"], photoKey, seen), ["https://b/2.jpg"]);
});

test("같은 장면은 크기·화질이 달라도 dHash가 가깝고, 다른 장면은 멀다", async () => {
  const scene = (flip) => sharp({ create: { width: 64, height: 48, channels: 3, background: "#ffffff" } })
    .composite([{ input: Buffer.from(`<svg width="64" height="48"><rect x="${flip ? 40 : 4}" y="4" width="20" height="40" fill="#000"/><circle cx="${flip ? 16 : 48}" cy="24" r="10" fill="#777"/></svg>`), top: 0, left: 0 }]).png().toBuffer();
  const a = await dhash(await scene(false));
  const a2 = await dhash(await sharp(await scene(false)).resize(320, 240).jpeg({ quality: 40 }).toBuffer());
  const b = await dhash(await scene(true));
  assert.ok(hamming(a, a2) <= 6, `같은 장면 거리 ${hamming(a, a2)}`);
  assert.ok(hamming(a, b) > 6, `다른 장면 거리 ${hamming(a, b)}`);
  const kept = uniqueByHash([{ n: 1, h: a }, { n: 2, h: a2 }, { n: 3, h: b }, { n: 4 }], (x) => x.h);
  assert.deepEqual(kept.map((x) => x.n), [1, 3, 4]);
});

test("테마 줄마다 다른 캠핑장을 번갈아 담고, 모자라면 겹치는 곳으로 채우지 않는다", () => {
  const c = (...ids) => ids.map((id) => ({ id }));
  const out = allocateUnique([{ id: "valley", candidates: c("A", "B", "C") }, { id: "forest", candidates: c("A", "B", "D") }], 2);
  assert.deepEqual(out.get("valley").map((x) => x.id), ["A", "C"]);
  assert.deepEqual(out.get("forest").map((x) => x.id), ["B", "D"]);
  const few = allocateUnique([{ id: "x", candidates: c("A") }, { id: "y", candidates: c("A") }], 2);
  assert.deepEqual(few.get("y"), []);
  assert.deepEqual(allocateUnique([{ id: "x", candidates: c("A") }, { id: "y", candidates: c("A") }], 2, { fillWithRepeats: true }).get("y").map((x) => x.id), ["A"]);
});

test("같은 캠핑장 내 중복 사진(대표 사진과 동일 또는 배너 중복)을 dHash와 photoKey로 걸러낸다", () => {
  const heroKey = photoKey("https://gocamping.or.kr/upload/camp/7760/thumb/thumb_720_6212BqMrJn7PF3Yi73J8oTfn.jpg");
  const candidates = [
    "https://gocamping.or.kr/upload/camp/7760/6801AVQUFvU3Qjr66urzrBvW.jpg", // banner 1
    "https://gocamping.or.kr/upload/camp/7760/5306zakjHuxQVUcX4pnMlEj4.jpg", // banner 2 (identical content)
    "https://gocamping.or.kr/upload/camp/7760/5106nF1RZwDvSGGXWqXH1DAE.jpg", // road
    "https://gocamping.or.kr/upload/camp/7760/6212BqMrJn7PF3Yi73J8oTfn.jpg", // same as hero
    "https://gocamping.or.kr/upload/camp/7760/5780GZCWpDyIZwMtdk5WURN9.jpg", // facility
  ];
  const seen = new Set([heroKey]);
  const uniqueUrls = uniqueBy(candidates, photoKey, seen);
  assert.equal(uniqueUrls.includes("https://gocamping.or.kr/upload/camp/7760/6212BqMrJn7PF3Yi73J8oTfn.jpg"), false, "대표 사진과 파일명이 같은 imageList 원본은 제외된다");
  assert.equal(uniqueUrls.length, 4);
});
