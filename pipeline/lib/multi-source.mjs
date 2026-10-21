// 다중 소스 후기·언급 수집 계획. 네이버 외에 공개 API·허용 경로만 사용한다.
// 원칙: 업장이 공개한 사실만, 본문은 robots 허용 호스트만, 플랫폼 창작물(평점·랭킹)은 복제하지 않는다.

export const SOURCES = [
  { id: "naver", name: "네이버 블로그·카페·웹", api: true, body: true, note: "현재 사용" },
  { id: "daum", name: "다음 웹 검색", api: true, body: false, note: "카카오 Daum 웹 검색 API" },
  { id: "tistory", name: "티스토리", api: false, body: true, note: "robots 허용 시 본문 문장" },
  { id: "gocamping", name: "고캠핑 소개", api: false, body: false, note: "line 필드 → 최소 rv" },
  { id: "5gcamp", name: "오지캠프", api: false, body: false, note: "댓글·소개 링크만" },
  { id: "operator", name: "업장 홈페이지", api: false, body: true, note: "operator-site 경로" },
];

/** 다음 웹 검색 쿼리 계획 (카카오 Daum API) */
export const DAUM_QUERIES = [
  { q: "{name} 캠핑장 후기", sort: "accuracy" },
  { q: "{name} {sigungu} 후기", sort: "recency" },
];

/** 소스 우선순위: 운영자 > 공공 > 검색 언급 */
export const SOURCE_RANK = { operator: 3, gocamping: 2, naver: 1, daum: 1, tistory: 1, "5gcamp": 1 };
