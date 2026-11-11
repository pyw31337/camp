// pipeline/lib/image-document-filter.mjs
// 관광사업등록증, 사업자등록증, 허가서, 공문서, 도면/배치도 등 비실물 서류 이미지 자동 감지 및 필터링 라이브러리

// 알려진 서류/등록증/배치도 파일명 및 키워드 패턴
export const DOC_REGEX = /배치도|도면|layout|cert|등록증|신고서|사업자|허가증|안내도|4157qtog|7769KMjKnSuN5G6umGgImjui|3916WQ8qu2YUoU0aTu5OiSyI|5326uedfrszollnn8MKJxnRw|21ffa8f8|389ad86c|848669b7|ae803104|50ddaa3e/i;

/**
 * 주어진 사진 메타데이터나 URL이 문서/등록증인지 판별
 * @param {string|object} photo - 사진 URL 문자열 또는 { t, l, w, h } 객체
 * @param {object} [camp] - 캠핑장 메타데이터
 * @param {object} [detail] - 캠핑장 상세 데이터
 * @returns {boolean}
 */
export function isDocumentOrCertificate(photo, camp = null, detail = null) {
  if (!photo) return true;

  // 문자열 URL인 경우
  const url = typeof photo === "string" ? photo : (photo.l || photo.t || photo.url || "");
  if (!url) return true;

  // 1. 파일명 / URL 정규식 패턴 검사
  if (DOC_REGEX.test(url)) return true;

  // 2. 배치도 등록 목록 대조
  const layoutImgs = [
    ...(camp?.layout_images || []),
    ...(detail?.layout?.images || []),
    ...(Array.isArray(detail?.layout) ? detail.layout : [])
  ];
  if (layoutImgs.some(lx => lx && typeof lx === "string" && url.toLowerCase().includes(lx.toLowerCase()))) {
    return true;
  }

  // 3. 사진 객체에 규격(w, h)이 있는 경우: 세로형 A4 문서 비율(1.35 ~ 1.55) 감지
  if (typeof photo === "object" && photo.w && photo.h) {
    const ratio = photo.h / photo.w;
    // 일반 캠핑장 사진은 가로형(landscape: w >= h). A4 서류(1.414) 비율이면 문서로 판별
    if (ratio >= 1.35 && ratio <= 1.55) {
      return true;
    }
  }

  return false;
}

/**
 * 캠핑장의 전체 사진 풀 중 가장 고해상도의 '진짜 풍경/시설 실물 사진'을 우선순위화하여 정렬
 * @param {Array} photos - 사진 객체 또는 URL 배열
 * @param {object} camp - 캠핑장 객체
 * @param {object} detail - 캠핑장 상세 객체
 * @returns {Array} 서류가 뒤로 가거나 제외되고 고해상도 실물 사진이 맨 앞에 온 배열
 */
export function prioritizeRealCampPhotos(photos = [], camp = null, detail = null) {
  if (!Array.isArray(photos) || photos.length === 0) return [];

  const real = [];
  const docs = [];

  for (const p of photos) {
    if (isDocumentOrCertificate(p, camp, detail)) {
      docs.push(p);
    } else {
      real.push(p);
    }
  }

  // 실물 사진이 있으면 실물 사진을 먼저 놓고, 문서 사진은 맨 뒤로 배치
  return [...real, ...docs];
}
