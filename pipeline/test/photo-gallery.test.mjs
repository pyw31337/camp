import assert from "node:assert/strict";
import test from "node:test";
import {
  PHOTO_GALLERY_BASE,
  SOURCE,
  gallerySearchUrl,
  galleryDetailUrl,
  parsePhotoGalleryBody,
  normalizeGalleryPhoto,
} from "../lib/photo-gallery.mjs";

test("관광사진갤러리 URL 생성: 필수 파라미터 및 키워드 인코딩", () => {
  const url = gallerySearchUrl("강원도 캠핑", 2, 20, "C");
  assert.ok(url.startsWith(PHOTO_GALLERY_BASE));
  const parsed = new URL(url);
  assert.equal(parsed.searchParams.get("keyword"), "강원도 캠핑");
  assert.equal(parsed.searchParams.get("pageNo"), "2");
  assert.equal(parsed.searchParams.get("numOfRows"), "20");
  assert.equal(parsed.searchParams.get("arrange"), "C");
  assert.equal(parsed.searchParams.get("MobileOS"), "ETC");
  assert.equal(parsed.searchParams.get("MobileApp"), "moyeora");
  assert.equal(parsed.searchParams.get("_type"), "json");

  const detailUrl = galleryDetailUrl("설악산 풍경", 1, 5);
  const parsedDetail = new URL(detailUrl);
  assert.equal(parsedDetail.searchParams.get("title"), "설악산 풍경");
  assert.equal(parsedDetail.searchParams.get("numOfRows"), "5");
});

test("관광사진갤러리 응답 파싱: 정상 JSON 및 항목 추출", () => {
  const mockJson = JSON.stringify({
    response: {
      header: { resultCode: "0000", resultMsg: "OK" },
      body: {
        items: {
          item: [
            {
              galContentId: "2837491",
              galTitle: "태안 몽산포 캠핑장 일몰",
              galWebImageUrl: "http://tong.visitkorea.or.kr/cms2/website/49/2837491.jpg",
              galPhotographyLocation: "충청남도 태안군",
              galPhotographer: "한국관광공사",
              galPhotographyMonth: "202410",
              galSearchKeyword: "몽산포, 캠핑장, 일몰, 서해안",
              galCreatedtime: "20241015143000",
            },
          ],
        },
        numOfRows: 10,
        pageNo: 1,
        totalCount: 1,
      },
    },
  });

  const { items, total } = parsePhotoGalleryBody(mockJson, 200);
  assert.equal(total, 1);
  assert.equal(items.length, 1);

  const norm = normalizeGalleryPhoto(items[0]);
  assert.equal(norm.id, "2837491");
  assert.equal(norm.title, "태안 몽산포 캠핑장 일몰");
  assert.equal(norm.url, "https://tong.visitkorea.or.kr/cms2/website/49/2837491.jpg"); // https 변환 확인
  assert.equal(norm.location, "충청남도 태안군");
  assert.deepEqual(norm.keywords, ["몽산포", "캠핑장", "일몰", "서해안"]);
  assert.ok(norm.license.includes("공공누리 제1유형"));
  assert.ok(norm.source.includes("한국관광공사"));
});

test("관광사진갤러리 응답 파싱: 오류 응답 및 빈 데이터 안전 처리", () => {
  const errJson = JSON.stringify({
    response: {
      header: { resultCode: "0030", resultMsg: "SERVICE KEY IS NOT REGISTERED ERROR" },
    },
  });
  assert.throws(() => parsePhotoGalleryBody(errJson, 200), /0030/);

  assert.equal(normalizeGalleryPhoto(null), null);
  assert.equal(normalizeGalleryPhoto({}), null);
});
