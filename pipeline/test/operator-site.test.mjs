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
