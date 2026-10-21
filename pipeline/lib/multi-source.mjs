// 다중 소스 후기·언급 수집 계획. 공개 API·허용 경로만 사용한다.
// 원칙: 업장이 공개한 사실만, 본문은 robots 허용 호스트만, 플랫폼 창작물(평점·랭킹)은 복제하지 않는다.

export const SOURCES = [
  { id: "naver-blog", name: "네이버 블로그", api: true, body: true, note: "현재 사용" },
  { id: "naver-cafe", name: "네이버 카페", api: true, body: false, note: "검색 API 요약만" },
  { id: "daum", name: "다음 웹·블로그", api: true, body: false, note: "카카오 Daum 웹 검색" },
  { id: "tistory", name: "티스토리", api: false, body: true, note: "robots 허용 시 본문" },
  { id: "youtube", name: "유튜브", api: false, body: false, note: "제목·설명·링크만 (본문 없음)" },
  { id: "community", name: "커뮤니티", api: false, body: false, note: "5gcamp·캠핑 커뮤니티 댓글 링크" },
  { id: "gocamping", name: "고캠핑 소개", api: false, body: false, note: "line 필드 → 최소 rv" },
  { id: "operator", name: "업장 홈페이지", api: false, body: true, note: "operator-site 경로" },
];

/** 다음 웹 검색 쿼리 계획 */
export const DAUM_QUERIES = [
  { q: "{name} 캠핑장 후기", sort: "accuracy" },
  { q: "{name} {sigungu} 후기", sort: "recency" },
];

/** 유튜브 검색 쿼리 (제목·설명만, 본문 수집 없음) */
export const YOUTUBE_QUERIES = [
  "{name} 캠핑장 후기",
  "{name} 캠핑 리뷰",
];

/** 커뮤니티·카페 검색 키워드 */
export const COMMUNITY_KEYWORDS = ["후기", "리뷰", "다녀왔", "방문기", "캠핑후기"];

/** 소스 우선순위: 운영자 > 공공 > 검색 언급 */
export const SOURCE_RANK = {
  operator: 3, gocamping: 2,
  "naver-blog": 1, "naver-cafe": 1, daum: 1, tistory: 1, youtube: 1, community: 1,
};
