// 원문 링크 정책: 공공 플랫폼은 연결, 상업 서비스는 숨김.
// 공공: 네이버·다음·티스토리·유튜브·공공데이터·고캠핑
// 숨김: 캠핑친구·오지캠프·캠프픽·캠핏·땡큐캠핑 등 상업 서비스

const PUBLIC_HOSTS = [
  "naver.com", "blog.naver.com", "cafe.naver.com", "m.blog.naver.com",
  "daum.net", "blog.daum.net", "cafe.daum.net",
  "tistory.com", "youtube.com", "youtu.be",
  "data.go.kr", "gocamping.or.kr",
  "visitkorea.or.kr", "korean.visitkorea.or.kr",
];

const HIDE_HOSTS = [
  "campingfriend.co.kr", "ojigo.kr", "camppick.com",
  "camfit.co.kr", "camfit.kr", "thankqcamping.com",
  "camping-in-life.vercel.app", "appraven.net",
];

export function hostOf(url) {
  try { return new URL(url).hostname.toLowerCase().replace(/^(www|m)\./, ""); }
  catch { return ""; }
}

/** 공공 플랫폼이면 true (원문 연결 유지) */
export function isPublicPlatform(url) {
  const h = hostOf(url);
  return PUBLIC_HOSTS.some((p) => h === p || h.endsWith(`.${p}`));
}

/** 상업 서비스면 true (원문 숨김) */
export function isHiddenService(url) {
  const h = hostOf(url);
  return HIDE_HOSTS.some((p) => h === p || h.endsWith(`.${p}`));
}

/** 원문 URL을 화면에 보여줄지. 공공이면 보여주고, 숨김 서비스면 null 반환 */
export function visibleUrl(url) {
  if (!url) return null;
  if (isHiddenService(url)) return null;
  return url;
}
