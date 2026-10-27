import assert from "node:assert/strict";
import test from "node:test";
import { extractSiteFacts, guideLinks, htmlToText, isOperatorHost, parseRobots, relevantSentences, robotsAllows } from "../lib/operator-site.mjs";

const v = (lines) => Object.fromEntries(Object.entries(extractSiteFacts(lines)).map(([k, f]) => [k, f.value]));

test("플랫폼 도메인은 운영자 홈페이지로 보지 않는다", () => {
  assert.equal(isOperatorHost("https://blog.naver.com/abc"), false);
  assert.equal(isOperatorHost("https://www.instagram.com/camp"), false);
  assert.equal(isOperatorHost("https://camfit.co.kr/camp/1"), false);
  assert.equal(isOperatorHost("www.sglamping.com/index.html"), true);
  assert.equal(isOperatorHost("http://okhwa.cbhuyang.go.kr/"), true);
});

test("robots.txt의 * 묶음과 가장 긴 규칙을 따른다", () => {
  const rules = parseRobots("User-agent: Googlebot\nDisallow: /\n\nUser-agent: *\nDisallow: /admin\nAllow: /admin/public\nDisallow: /*search*\n");
  assert.equal(robotsAllows(rules, "/"), true);
  assert.equal(robotsAllows(rules, "/admin/x"), false);
  assert.equal(robotsAllows(rules, "/admin/public/a"), true);
  assert.equal(robotsAllows(rules, "/bbs/search.php"), false);
  assert.equal(robotsAllows(parseRobots("User-agent: *\nDisallow:\n"), "/any"), true);
});

test("이용 안내 링크·프레임만 같은 호스트에서 고른다", () => {
  const html = `<frame src="main.html"><a href="/guide.html">이용안내</a><a href="https://other.com/x">이용안내</a><a href="/photo.jpg">요금</a><a href="/a">회사소개</a>`;
  const links = guideLinks(html, "https://camp.example.com/");
  assert.ok(links.includes("https://camp.example.com/main.html"));
  assert.ok(links.includes("https://camp.example.com/guide.html"));
  assert.ok(!links.some((l) => l.includes("other.com") || l.endsWith(".jpg")));
});

test("전문 대신 선택에 필요한 짧은 문장만 남긴다", () => {
  const text = htmlToText("<p>저희 캠핑장은 아름다운 계곡에 있습니다</p><p>입실은 오후 3시이며, 퇴실은 오전 11시입니다.</p><script>var a=1</script>");
  assert.deepEqual(relevantSentences(text), ["입실은 오후 3시이며, 퇴실은 오전 11시입니다."]);
});

test("전력 W: 300~3,000W만, 여러 값이면 낮은 값과 최대를 함께", () => {
  const f = extractSiteFacts(["사이트당 전기 사용량은 600W 이하로 사용 바랍니다.", "최대 전력 사용량은 각 사이트당 1kw까지 사용 가능합니다."]);
  assert.equal(f.POWER_W.value, 600);
  assert.equal(f.POWER_W.max, 1000);
  assert.equal(v(["태양광 발전 3000W 설치"]).POWER_W, undefined);
  assert.equal(v(["전기 50W"]).POWER_W, undefined);
});

test("불멍: 부정·질문·부분 금지 문장을 ‘가능’으로 읽지 않는다", () => {
  assert.equal(v(["- 불멍은 불가능합니다"]).FIRE, undefined);
  assert.equal(v(["화목(장작)사용이 가능한가요?"]).FIRE, undefined);
  assert.equal(v(["숯 추가 1만원 추가요금이 있습니다."]).FIRE, undefined);
  assert.equal(v(["밀폐된 곳에서 화로/가스 사용 금지"]).FIRE, undefined);
  assert.equal(v(["화로대 사용시 숯만 사용가능하며 장작, 솔방울등 캠프파이어를 금지 합니다."]).FIRE, "CHARCOAL_ONLY");
  assert.equal(v(["개인화기 및 숯 장작 반입 불가"]).FIRE, "NO_FIRE");
  assert.equal(v(["365일 1일 1 불멍 가능"]).FIRE, "FIREWOOD_OK");
  assert.equal(v(["바비큐장과 불멍존에서만 이용 가능합니다."]).FIRE, undefined);
});

test("주차·차박: 구역 한정·부정·맥락 없는 문장은 버리고, 어긋나면 값을 비운다", () => {
  assert.equal(v(["각 사이트 바로 옆에 주차가 가능합니다."]).PARKING, "SITE_SIDE");
  assert.equal(v(["카라반 옆 주차가 안되는 자리 이용시 캠핑 카트 대여 가능합니다."]).PARKING, undefined);
  assert.equal(v(["캠핑장A,B 타입은 반드시 주차장에 주차 후 이용 부탁드립니다.(캠핑장C 타입만 사이트 내 주차 가능)"]).PARKING, undefined);
  assert.equal(v(["- 차량진입금지"]).PARKING, undefined);
  assert.equal(v(["아랫쪽 넓은 주차장 주차 후 수레를 이용해서 짐 옮기시면 됩니다."]).PARKING, "EXTERNAL");
  assert.equal(v(["차박이나 캠핑카는 가능한가요?"]).CAR_CAMPING, undefined);
  assert.equal(v(["캠핑카, 트레일러, 차박, 루푸탑 입장불가"]).CAR_CAMPING, false);
  assert.equal(v(["저희 캠핑장은 모든 사이트가 차박 가능합니다."]).CAR_CAMPING, true);
  const mixed = extractSiteFacts(["각 사이트 바로 옆에 주차가 가능합니다.", "아랫쪽 넓은 주차장 주차 후 수레를 이용해서 짐 옮기시면 됩니다."]);
  assert.equal(mixed.PARKING.value, null);
  assert.equal(mixed.PARKING.conflict.length, 2);
});

test("상세 사실: 기본 요금은 부대 요금과 분리하고, 편의시설·운영 기간·환불을 문장과 함께 꺼낸다", async () => {
  const { extractSiteDetails } = await import("../lib/operator-site.mjs");
  const d = extractSiteDetails([
    "주말 45,000원 (텐트1동 + 차량1대 + 4인)",
    "평일 35,000원",
    "추가 차량은 1대당 10,000원",
    "- 무통장입금시 : 2박 95,000원",
    "- 모닥불 세트(화롯대, 고체연료, 장작 10kg) 25,000원",
    "- 바비큐 시설(숯불, 석쇠) 이용요금 : 25,000원",
    "- 반려견 동반 요금 : 1마리당 30,000원",
    "전기 사용 시(1사이트당) 3,000원",
    "수영장은 7월~8월 운영합니다",
    "와이파이는 안 됩니다",
    "동계 기간(12월~2월)은 휴장합니다",
    "이용일 3일 전 취소 시 50% 수수료가 발생합니다",
  ]);
  assert.equal(d.SITE_PRICE.min, 35000);
  assert.equal(d.SITE_PRICE.max, 45000);
  assert.deepEqual(d.SITE_PRICE.items.map((x) => x.label), ["주말", "평일"]);
  assert.equal(d.FIRE_SET_FEE.amount, 25000);
  assert.equal(d.BBQ_SET_FEE.amount, 25000);
  assert.equal(d.PET_FEE.amount, 30000);
  assert.equal(d.ELECTRIC_FEE.amount, 3000);
  assert.deepEqual(d.AMENITIES.map((a) => a.code), ["POOL"]);
  assert.equal(d.AMENITIES[0].period, "7월~8월");
  assert.equal(d.SEASON.value, "SEASONAL_CLOSURE");
  assert.ok(d.REFUND.quote.includes("취소"));
});

test("주차·전력 문장 보강(2026-10-16): 앞/옆 개별 주차·사이트별 주차·캠핑장 내 주차 불가·충전기 금지 문장의 W", () => {
  assert.equal(v(["사이트 바로 앞 개별 주차가 가능합니다."]).PARKING, "SITE_SIDE");
  assert.equal(v(["본인의 캠핑사이트 바로 옆으로 자차 주차가 가능합니다.(오토캠핑 가능)"]).PARKING, "SITE_SIDE");
  assert.equal(v(["사이트별 개별 주차가 가능합니다."]).PARKING, "SITE_SIDE");
  assert.equal(v(["캠핑장 내에는 주차가 불가능하며, 캠핑장 구역 반대편의 꽃밭주차장을 이용해주시기 바랍니다."]).PARKING, "EXTERNAL");
  assert.equal(v(["짐을 내린후 주차장으로 이동조치됩니다."]).PARKING, "EXTERNAL");
  assert.equal(v(["사이트 내 주차가능 여부는 별도 문의바랍니다."]).PARKING, undefined);
  assert.equal(v(["캠핑장 전력은 1,100w까지이며, 에어컨, 전기차 충전기등 고전력기기의 사용은 금지되어 있습니다."]).POWER_W, 1100);
  assert.equal(v(["전기차 충전기 1,000W 설치"]).POWER_W, undefined);
});

test("실전 팩트 문장 추출: 릴선 길이·선착순 배정·얼리/레이트 입퇴실·갯벌 해루질", () => {
  assert.equal(v(["분전함 거리가 있으니 릴선 30m 준비 권장합니다."]).REEL_WIRE_RECOMMEND, 30);
  assert.equal(v(["리드선 20m 이상 필수"]).REEL_WIRE_RECOMMEND, 20);
  assert.equal(v(["자리 배치는 당일 선착순 입장 순서대로 진행됩니다."]).SITE_ASSIGN_MODE, "선착순");
  assert.equal(v(["예약 시 지정 예약 자리로 배정됩니다."]).SITE_ASSIGN_MODE, "지정예약");
  assert.equal(v(["전날 빈 사이트가 있을 경우 빠른 입실(오전 9시) 가능합니다."]).EARLY_CHECKIN, true);
  assert.equal(v(["다음날 예약이 없는 경우 늦은 퇴실(오후 2시) 가능합니다."]).LATE_CHECKOUT, true);
  assert.equal(v(["바로 앞 해변에서 무료 갯벌 체험 및 야간 해루질이 가능합니다."]).THEME_TIDAL_FLAT, true);
});

