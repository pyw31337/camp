import test from "node:test";
import assert from "node:assert/strict";
import { isDocOrLayoutPhoto, cleanPhotoPool, buildCampSiteProducts } from "../lib/site-products.mjs";

test("isDocOrLayoutPhoto: 서류·배치도·인허가증 필터링", () => {
  assert.equal(isDocOrLayoutPhoto("https://gocamping.or.kr/upload/camp/100/배치도.jpg"), true);
  assert.equal(isDocOrLayoutPhoto("https://gocamping.or.kr/upload/camp/100/layout_map.png"), true);
  assert.equal(isDocOrLayoutPhoto("https://gocamping.or.kr/upload/camp/2266/thumb/thumb_720_4157qTOGFMi1GpcqUZvrk8u8.jpg"), true);
  assert.equal(isDocOrLayoutPhoto("https://gocamping.or.kr/upload/camp/100/nature_tent.jpg"), false);
});

test("cleanPhotoPool: 다중 사진 수집 및 서류 제외", () => {
  const camp = { id: "100", name: "테스트캠핑장" };
  const detail = {
    gcd: {
      photos: [
        "https://gocamping.or.kr/upload/camp/100/photo1.jpg",
        "https://gocamping.or.kr/upload/camp/100/thumb_720_4157qTOG.jpg", // 서류
        "https://gocamping.or.kr/upload/camp/100/photo2.jpg",
      ],
    },
    photos_remote: [
      "https://gocamping.or.kr/upload/camp/100/photo2.jpg", // 중복
      "https://gocamping.or.kr/upload/camp/100/photo3.jpg",
    ],
  };

  const pool = cleanPhotoPool(camp, detail);
  assert.deepEqual(pool, [
    "https://gocamping.or.kr/upload/camp/100/photo1.jpg",
    "https://gocamping.or.kr/upload/camp/100/photo2.jpg",
    "https://gocamping.or.kr/upload/camp/100/photo3.jpg",
  ]);
});

test("buildCampSiteProducts: TourAPI products 기반 다중 사진 및 스펙 생성", () => {
  const camp = { id: "200", name: "별빛글램핑" };
  const detail = {
    products: [
      {
        name: "포레스트 글램핑",
        size: "8×6m",
        price: { off_weekday: 90000, off_weekend: 140000 },
        photos: [
          "https://tong.visitkorea.or.kr/cms/resource/11.jpg",
          "https://tong.visitkorea.or.kr/cms/resource/12.jpg",
        ],
        amenities: ["침대", "에어컨"],
      },
    ],
    photos_remote: [
      "https://gocamping.or.kr/upload/camp/200/extra1.jpg",
      "https://gocamping.or.kr/upload/camp/200/extra2.jpg",
    ],
  };

  const prods = buildCampSiteProducts(camp, detail);
  assert.equal(prods.length, 1);
  assert.equal(prods[0].name, "포레스트 글램핑");
  assert.equal(prods[0].type, "GLAMPING");
  assert.equal(prods[0].price, 90000);
  assert.ok(prods[0].photos.length >= 2, "상품당 다중 사진이 포함되어야 함");
});

test("buildCampSiteProducts: 고캠핑 요금표(gcd.fees) 기반 상품 및 다중 사진 분배", () => {
  const camp = { id: "300", name: "무지개캠핑장", fee: { min: 45000 } };
  const detail = {
    gcd: {
      fees: [
        { label: "글램핑 · 평상시 주중", won: 60000 },
        { label: "글램핑 · 평상시 주말", won: 100000 },
        { label: "오토캠핑 · 평상시 주중", won: 45000 },
      ],
      facilities: [
        { k: "글램핑 내부시설", v: "침대 · 에어컨 · 냉장고" },
        { k: "주요시설", v: "오토캠핑 20면 · 글램핑 10동" },
      ],
      photos: [
        "https://gocamping.or.kr/upload/camp/300/p1.jpg",
        "https://gocamping.or.kr/upload/camp/300/p2.jpg",
        "https://gocamping.or.kr/upload/camp/300/p3.jpg",
      ],
    },
  };

  const prods = buildCampSiteProducts(camp, detail);
  assert.equal(prods.length, 2);
  const glamp = prods.find((p) => p.name === "글램핑");
  assert.ok(glamp);
  assert.equal(glamp.type, "GLAMPING");
  assert.equal(glamp.price, 60000);
  assert.ok(glamp.photos.length >= 3, "글램핑 상품에 다중 사진 매핑");
  assert.ok(glamp.desc.includes("침대"));
});
