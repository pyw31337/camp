/**
 * @fileoverview 한국관광공사 관광사진 정보_GW (PhotoGalleryService1 / 공공데이터포털 15101914)
 * 포토코리아(phoko.visitkorea.or.kr) 10만여 장의 공공누리 제1유형 고해상도 관광·자연·캠핑 사진 연동.
 * 순수 함수만 두며 네트워크·파일 입출력은 스크립트에서 수행한다.
 */

export const PHOTO_GALLERY_BASE = "https://apis.data.go.kr/B551011/PhotoGalleryService1";

export const SOURCE = Object.freeze({
  id: "photo-gallery-gw",
  name: "한국관광공사 관광사진 정보_GW(PhotoGalleryService1)",
  url: "https://www.data.go.kr/data/15101914/openapi.do",
  tier: "A",
  license: "공공누리 제1유형(출처표시 조건 자유 이용·변형·상업적 이용 가능)",
});

const clean = (v) => {
  const t = String(v ?? "")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/\s+/g, " ")
    .trim();
  return t || null;
};

/**
 * 키워드 기반 사진갤러리 목록 검색 URL 생성 (serviceKey 제외)
 * @param {string} keyword 검색 키워드(캠핑장명, 지명, 산/계곡/호수 등)
 * @param {number} pageNo 페이지 번호
 * @param {number} numOfRows 페이지당 결과 수
 * @param {"A"|"B"|"C"} arrange 정렬 (A=촬영일, B=제목, C=수정일)
 */
export function gallerySearchUrl(keyword, pageNo = 1, numOfRows = 10, arrange = "A") {
  const q = new URLSearchParams({
    MobileOS: "ETC",
    MobileApp: "moyeora",
    _type: "json",
    keyword: String(keyword ?? "").trim(),
    pageNo: String(pageNo),
    numOfRows: String(numOfRows),
    arrange,
  });
  return `${PHOTO_GALLERY_BASE}/gallerySearchList1?${q}`;
}

/**
 * 사진 상세 목록 조회 URL 생성
 */
export function galleryDetailUrl(title, pageNo = 1, numOfRows = 10) {
  const q = new URLSearchParams({
    MobileOS: "ETC",
    MobileApp: "moyeora",
    _type: "json",
    title: String(title ?? "").trim(),
    pageNo: String(pageNo),
    numOfRows: String(numOfRows),
  });
  return `${PHOTO_GALLERY_BASE}/galleryDetailList1?${q}`;
}

/**
 * 관광사진갤러리 JSON 응답 파싱 -> { items, total }
 */
export function parsePhotoGalleryBody(text, status = 200) {
  let j;
  try {
    j = JSON.parse(text);
  } catch {
    throw new Error(`PhotoGallery API HTTP ${status} invalid JSON: ${String(text).slice(0, 160)}`);
  }
  const header = j?.response?.header;
  if (header && header.resultCode !== "0000") {
    throw new Error(`PhotoGallery API Error [${header.resultCode}]: ${header.resultMsg}`);
  }
  const body = j?.response?.body;
  if (!body) {
    throw new Error(`PhotoGallery API response has no body: ${String(text).slice(0, 160)}`);
  }
  const raw = body.items?.item ?? [];
  const items = Array.isArray(raw) ? raw : [raw];
  return {
    items: items.filter(Boolean),
    total: Number(body.totalCount ?? 0),
  };
}

/**
 * API 항목 정규화
 * @param {object} item API 원문 행
 * @returns {object|null} 정규화된 고화질 사진 메타데이터
 */
export function normalizeGalleryPhoto(item) {
  if (!item) return null;
  const imgUrl = clean(item.galWebImageUrl);
  if (!imgUrl) return null;

  const keywords = clean(item.galSearchKeyword)
    ? String(item.galSearchKeyword).split(/[,|\s]+/).map((k) => k.trim()).filter(Boolean)
    : [];

  return {
    id: String(item.galContentId ?? ""),
    title: clean(item.galTitle) ?? "한국관광공사 관광사진",
    url: imgUrl.replace(/^http:\/\//i, "https://"),
    location: clean(item.galPhotographyLocation),
    photographer: clean(item.galPhotographer),
    month: clean(item.galPhotographyMonth),
    keywords,
    created_at: clean(item.galCreatedtime),
    modified_at: clean(item.galModifiedtime),
    license: SOURCE.license,
    source: SOURCE.name,
  };
}
