// 화면에 보이는 예약·홈페이지 링크가 살아 있는지(2026-10-20 소유자: “예약 버튼을 누르니 없는 페이지 — 깨진 링크를 전부 살펴봐 줘”).
// 원칙: robots.txt가 막은 곳과 AI 크롤러를 이름으로 막은 플랫폼(네이버 예약·지도·블로그·카페, 카카오맵, 캠핏, 인스타그램 등)은
// 자동으로 열지 않는다 → UNVERIFIED. 그 밖의 링크는 봇 이름을 밝히고 호스트별 간격을 두고 한 번씩 연다.

/** 자동 확인하지 않는 호스트(봇·AI 크롤러 차단, 로그인 벽) */
export const NO_CHECK_HOSTS = [
  "booking.naver.com", "m.booking.naver.com", "map.naver.com", "m.map.naver.com", "place.naver.com", "m.place.naver.com", "pcmap.place.naver.com",
  "blog.naver.com", "m.blog.naver.com", "cafe.naver.com", "m.cafe.naver.com", "naver.me", "smartstore.naver.com", "booking.naver.com",
  "map.kakao.com", "place.map.kakao.com", "pf.kakao.com", "camfit.co.kr", "www.camfit.co.kr", "campit.co.kr",
  "instagram.com", "www.instagram.com", "facebook.com", "www.facebook.com", "brunch.co.kr", "cafe.daum.net", "m.cafe.daum.net", "band.us",
];
export function noCheck(url) {
  let h; try { h = new URL(url).hostname.toLowerCase(); } catch { return true; }
  return NO_CHECK_HOSTS.some((x) => h === x || h.endsWith(`.${x}`));
}

// 응답은 왔지만 사실상 없는 페이지(소프트 404·주차 도메인·만료 안내)
const SOFT_DEAD = /존재하지\s*않는\s*(페이지|게시물|업체|사이트|상품)|페이지를\s*찾을\s*수\s*없|삭제(된|되었)\s*(페이지|게시물)|운영하지\s*않는|서비스(가)?\s*(종료|중단)된|폐업|도메인(이)?\s*(만료|판매)|this\s+domain\s+(is|may\s+be)\s+for\s+sale|domain\s+has\s+expired|page\s+not\s+found|404\s+not\s+found|account\s+suspended|사이트\s*점검\s*중이\s*아닙|호스팅\s*(기간|서비스)\s*(만료|종료)/i;

/**
 * 한 번 연 결과 → 판정.
 * res: { ok, status, error, url(최종), html(앞부분) }
 * 반환: { s: "OK" | "DEAD" | "FLAKY", why }
 *  - DEAD: 주소가 없음(DNS), 연결 거부, 404·410, 소프트 404·만료 도메인
 *  - FLAKY: 시간 초과·5xx·403·429 등 일시적일 수 있는 실패(두 번 연속이면 DEAD로 본다 — 스크립트가 판단)
 */
export function judge(res) {
  if (!res) return { s: "FLAKY", why: "no response" };
  const e = String(res.error ?? "");
  if (/ENOTFOUND|EAI_NONAME|ERR_NAME_NOT_RESOLVED/i.test(e)) return { s: "DEAD", why: "DNS 없음" };
  if (/ECONNREFUSED/i.test(e)) return { s: "DEAD", why: "연결 거부" };
  if (/CERT|SSL|EPROTO|self.signed/i.test(e)) return { s: "FLAKY", why: "인증서 오류" };
  if (e) return { s: "FLAKY", why: e.slice(0, 60) };
  if (res.status === 404 || res.status === 410) return { s: "DEAD", why: `HTTP ${res.status}` };
  if (res.status >= 400) return { s: "FLAKY", why: `HTTP ${res.status}` };
  const text = String(res.html ?? "").replace(/<(script|style)[\s\S]*?<\/\1>/gi, " ").replace(/<[^>]+>/g, " ").slice(0, 20000);
  // 글이 거의 없는 화면에서만 소프트 404로 본다(정상 페이지 본문의 ‘폐업’ 같은 낱말 오판 방지)
  const short = text.replace(/\s+/g, " ").trim().length < 1500;
  if (short && SOFT_DEAD.test(text)) return { s: "DEAD", why: "없는 페이지 안내" };
  return { s: "OK", why: `HTTP ${res.status}` };
}

/** 이전 판정과 합친다: DEAD는 바로, FLAKY는 두 번 연속이면 DEAD, OK가 한 번이라도 나오면 OK */
export function merge(prev, now) {
  if (now.s === "FLAKY" && (prev?.s === "FLAKY" || prev?.s === "DEAD")) return { ...now, s: "DEAD", why: `${now.why} (2회 연속)` };
  return now;
}

/** 네이버 예약 상세 주소(업체 번호)인지 — 자동 확인이 막혀 있고 등록값이 낡아 없는 페이지가 되기 쉽다 */
export const isNaverBookingDeep = (u) => /^https?:\/\/(m\.)?booking\.naver\.com\/booking\/\d+\/bizes\/\d+/i.test(String(u ?? ""));
