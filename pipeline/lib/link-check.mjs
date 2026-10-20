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
 * 반환: { s: "OK" | "DEAD" | "FLAKY" | "UNVERIFIED", why }
 *  - DEAD: 주소가 없음(DNS), 404·410, 소프트 404·만료 도메인
 *  - FLAKY: 연결 거부·시간 초과·5xx 등(해외에서 막힌 국내 사이트일 수 있어 화면에서 빼지 않는다)
 *  - UNVERIFIED: 401·403·429(봇 차단)
 */
export function judge(res) {
  if (!res) return { s: "FLAKY", why: "no response" };
  const e = String(res.error ?? "");
  if (/ENOTFOUND|EAI_NONAME|ERR_NAME_NOT_RESOLVED/i.test(e)) return { s: "DEAD", why: "DNS 없음" };
  // 연결 거부·시간 초과·5xx는 해외 IP 차단·비표준 포트 차단(공공 사이트에 흔함)일 수 있어 깨진 링크로 보지 않는다
  if (/ECONNREFUSED/i.test(e)) return { s: "FLAKY", why: "연결 거부" };
  if (/CERT|SSL|EPROTO|self.signed/i.test(e)) return { s: "FLAKY", why: "인증서 오류" };
  if (e) return { s: "FLAKY", why: e.slice(0, 60) };
  if (res.status === 404 || res.status === 410) return { s: "DEAD", why: `HTTP ${res.status}` };
  // 401·403·429는 봇만 막는 경우가 많다(사람에게는 열린다) → 깨진 링크로 보지 않는다
  if ([401, 403, 429].includes(res.status)) return { s: "UNVERIFIED", why: `HTTP ${res.status}(봇 차단)` };
  if (res.status >= 400) return { s: "FLAKY", why: `HTTP ${res.status}` };
  const text = String(res.html ?? "").replace(/<(script|style)[\s\S]*?<\/\1>/gi, " ").replace(/<[^>]+>/g, " ").slice(0, 20000);
  // 글이 거의 없는 화면에서만 소프트 404로 본다(정상 페이지 본문의 ‘폐업’ 같은 낱말 오판 방지)
  const short = text.replace(/\s+/g, " ").trim().length < 1500;
  if (short && SOFT_DEAD.test(text)) return { s: "DEAD", why: "없는 페이지 안내" };
  return { s: "OK", why: `HTTP ${res.status}` };
}

/**
 * 이전 판정과 합친다. 2026-10-20 점검: 시간 초과·5xx를 두 번 연속 DEAD로 보니 국내 공공·예약 사이트(해외 IP 차단, :451 같은 포트)가
 * 살아 있는데도 빠졌다 → DEAD는 확실한 신호(DNS 없음·404/410·없는 페이지 안내)만. 일시 오류는 몇 번이든 FLAKY(화면에 남김).
 */
export function merge(prev, now) {
  return now;
}

/** 네이버 예약 상세 주소(업체 번호)인지 — 자동 확인이 막혀 있고 등록값이 낡아 없는 페이지가 되기 쉽다 */
export const isNaverBookingDeep = (u) => /^https?:\/\/(m\.)?booking\.naver\.com\/booking\/\d+\/bizes\/\d+/i.test(String(u ?? ""));
