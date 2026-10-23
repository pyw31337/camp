// 카카오(다음) 후기 글의 썸네일 찾기(소유자 2026-10-23: 카카오 후기에 썸네일이 안 나오는 곳이 많다).
// 다음 블로그·카페 검색 API는 글에 대표 이미지가 없으면 thumbnail을 비워 준다(전체 카카오 글의 약 40%).
// 같은 글의 사진이 다음 이미지 검색에 색인돼 있으면 그 썸네일을 쓴다 — 결과의 원문 주소(doc_url)가 그 글과 같을 때만(다른 글 사진 금지).
// 공식 검색 API 결과의 썸네일 주소만 저장하고 이미지는 내려받지 않는다(AGENTS.md 4번).

/** 비교용 원문 주소: 모바일 주소·프로토콜·끝 슬래시·쿼리 차이를 없앤다 */
export function normPostUrl(u) {
  let s = String(u ?? "").trim();
  if (!s) return "";
  s = s.replace(/^https?:\/\//i, "").replace(/^m\./i, "").replace(/[?#].*$/, "").replace(/\/+$/, "");
  // 티스토리 모바일 경로(/m/123) → /123
  s = s.replace(/^([^/]+\.tistory\.com)\/m\//i, "$1/");
  return s.toLowerCase();
}

/** 카카오 후기(다음 카페·티스토리·브런치·다음 블로그)인가 */
export const isKakaoPost = (u) => /(^|\.)(daum\.net|tistory\.com|brunch\.co\.kr|kakao\.com)$/i.test((() => { try { return new URL(u).hostname; } catch { return ""; } })());

/** 이미지 검색 결과 중 같은 글의 사진 하나({thumb, img}) 또는 null */
export function pickPostImage(docs, postUrl) {
  const want = normPostUrl(postUrl);
  if (!want) return null;
  for (const d of docs ?? []) {
    if (normPostUrl(d?.doc_url) !== want) continue;
    const thumb = /^https:\/\/search\d?\.kakaocdn\.net\//.test(String(d.thumbnail_url ?? "")) ? d.thumbnail_url : null;
    if (thumb) return { thumb, img: /^https?:\/\//.test(String(d.image_url ?? "")) ? d.image_url : null };
  }
  return null;
}

/** 검색어: 글 제목에서 태그·꾸밈 문자를 걷어 낸다(제목이 짧으면 카페·블로그 이름을 덧붙인다) */
export function thumbQuery(post) {
  const t = String(post?.title ?? "").replace(/<[^>]+>/g, "").replace(/[\[\]【】()「」"'#|·~…]+/g, " ").replace(/\s+/g, " ").trim();
  if (!t) return null;
  return t.length < 8 && post?.src ? `${t} ${post.src}` : t.slice(0, 60);
}
