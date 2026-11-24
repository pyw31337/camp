import assert from "node:assert/strict";
import { test } from "node:test";
import {
  isRejectedThumbnail,
  isAuthenticOperatorPhoto,
  pickValidCampThumbnail,
} from "../lib/thumbnail-validator.mjs";

test("isRejectedThumbnail: 거절 목록에 등록된 인물 일러스트 및 프로필 이미지를 거른다", () => {
  // 1. 범바위포레스트 인물 일러스트 (photo-judgments.json 거절)
  const bumbawiIllustration = "https://search4.kakaocdn.net/argon/130x130_85_c/AFTO76F1APm";
  const r1 = isRejectedThumbnail(bumbawiIllustration);
  assert.equal(r1.rejected, true);
  assert.match(r1.reason, /내용 판정 거절|수기 검수 거절 목록/);

  // 2. 프로필/아바타 URL 패턴
  const avatarUrl = "https://blogpfthumb-phinf.pstatic.net/data/profile.jpg";
  const r2 = isRejectedThumbnail(avatarUrl);
  assert.equal(r2.rejected, true);
  assert.match(r2.reason, /프로필\/아바타/);

  // 3. 정상 캠핑장 사진은 통과
  const authenticPhoto = "https://dul339flcqmyl.cloudfront.net/hotel_photos/20260910100918_범바위_메인_01.png";
  const r3 = isRejectedThumbnail(authenticPhoto);
  assert.equal(r3.rejected, false);
});

test("isAuthenticOperatorPhoto: 공식 운영사/예약사 CDN 및 고캠핑 정품 사진 판별", () => {
  assert.equal(
    isAuthenticOperatorPhoto("https://dul339flcqmyl.cloudfront.net/hotel_photos/20260910100918_범바위_메인_01.png"),
    true
  );
  assert.equal(
    isAuthenticOperatorPhoto("https://gocamping.or.kr/upload/camp/7997/thumb/thumb_720_3452y6299Yk77XwJgIqU2C7x.jpg"),
    true
  );
  assert.equal(
    isAuthenticOperatorPhoto("https://search4.kakaocdn.net/argon/130x130_85_c/AFTO76F1APm"),
    false
  );
});

test("pickValidCampThumbnail: 거절된 이미지를 배제하고 공식 운영사 정품 사진을 우선 선택", () => {
  const camp = {
    id: "loc-872363c1",
    name: "범바위포레스트",
    img: "https://search4.kakaocdn.net/argon/130x130_85_c/AFTO76F1APm", // 인물 일러스트
    sn: "https://search4.kakaocdn.net/argon/130x130_85_c/AFTO76F1APm",
  };
  const detail = {
    photos: [
      "https://search4.kakaocdn.net/argon/130x130_85_c/AFTO76F1APm", // bad
      "https://dul339flcqmyl.cloudfront.net/hotel_photos/20260910100918_범바위_메인_01.png", // authentic
    ],
  };

  const picked = pickValidCampThumbnail(camp, detail);
  assert.equal(
    picked.img,
    "https://dul339flcqmyl.cloudfront.net/hotel_photos/20260910100918_범바위_메인_01.png"
  );
  assert.notEqual(picked.img, "https://search4.kakaocdn.net/argon/130x130_85_c/AFTO76F1APm");
});
