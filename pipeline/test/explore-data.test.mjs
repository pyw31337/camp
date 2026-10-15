import assert from "node:assert/strict";
import test from "node:test";
import { areaOf, buildExploreRecords, buildExploreTexts, buildFieldConditions, buildImportantInfo, buildProviders, providerOf } from "../lib/explore-data.mjs";
import { feeRange, matchTour, normalizeTourIntro } from "../lib/tour-fees.mjs";

const camp = { external_id: { id: "7096" }, name: "향남 오토캠핑장", address: { sido: "경기도", sigungu: "화성시", line1: "경기도 화성시 테스트로 1", line2: "" },
  location: { lat: 37.1234567, lng: 126.7654321 }, contact: { tel: "031-000-0000", homepage: "www.example.com" }, operator_type: "LOCAL_GOVERNMENT",
  products: [{ kind: "AUTO_PITCH", site_count: 12 }], site_sizes: [{ width_m: 5, depth_m: 8, count: 12 }], floors: [{ floor: "파쇄석", count: 12 }],
  amenities: ["전기", "온수"], pets: "가능", reservation: { methods: ["온라인실시간예약"], url: "https://www.foresttrip.go.kr/x" }, hero_image_url: "https://gocamping.or.kr/a.jpg" };

test("탐색 레코드: 위치·예약처·요금(출처·확인일)·주변 화장실", () => {
  const [r] = buildExploreRecords({ campgrounds: [camp, { ...camp, location: null }] },
    { campgrounds: { 7096: { count_2km: 3, count_500m: 1, nearest: [{ name: "주차장 화장실", distance_m: 140, open_24h: true, source: "mois" }] } } },
    { records: { 7096: { fee_text: "오토캠핑 1박 35,000원~45,000원", fee_range: { min_krw: 35000, max_krw: 45000 }, checked_at: "2026-10-13T09:00:00+09:00", source_url: "https://korean.visitkorea.or.kr/x" } } });
  assert.equal(r.area, "서울·경기");
  assert.equal(r.lat, 37.123457);
  assert.equal(r.homepage, "http://www.example.com/");
  assert.equal(r.booking.provider, "foresttrip");
  // example.com은 예약 채널 판단에서 의도적으로 제외한다. 화면에는 홈페이지 원문만 별도로 남는다.
  assert.deepEqual(r.booking.channels.map((c) => [c.platform_id, c.kind]), [["foresttrip", "online"], ["phone", "phone"]]);
  assert.equal(r.booking.source.tier, "C");
  assert.deepEqual(r.fee, { text: "오토캠핑 1박 35,000원~45,000원", min: 35000, max: 45000, checked_at: "2026-10-13T09:00:00+09:00", url: "https://korean.visitkorea.or.kr/x" });
  assert.equal(r.nearby_toilets.nearest[0].m, 140);
  assert.equal(r.field_conditions.power.state, "PARTIAL");
  assert.equal(r.field_conditions.power.limit_w, null);
  assert.equal(r.field_conditions.parking.tent_side, null);
  assert.equal(r.field_conditions.parking.auto_camping_sites, 12);
  assert.equal(areaOf("제주특별자치도"), "제주");
  assert.equal(providerOf("https://yeyak.seoul.go.kr/web/main.do"), "seoul-yeyak");
  assert.equal(providerOf("not a url"), null);
});

test("현장 조건: 고캠핑에 없는 값을 불가로 만들지 않는다", () => {
  const fields = buildFieldConditions({ ...camp, amenities: ["전기", "장작판매"], fire_pit: "개별", gocamping_url: "https://www.gocamping.or.kr/bsite/camp/info/read.do?c_no=7096" });
  assert.deepEqual(fields.power, { state: "PARTIAL", available: true, limit_w: null });
  assert.deepEqual(fields.parking, { state: "UNKNOWN", tent_side: null, auto_camping_sites: 12 });
  assert.deepEqual(fields.charcoal, { state: "UNKNOWN", allowed: null });
  assert.deepEqual(fields.firewood, { state: "PARTIAL", sold: true, allowed: null });
  assert.equal(fields.fire_pit.arrangement, "개별");
  assert.equal(fields.site_size.groups[0].width_m, 5);
  assert.equal(fields.source.tier, "A");
});

test("중요 공지: 원문 링크와 확인일이 있는 운영자 제공값만 발행한다", () => {
  const notices = { campgrounds: { 7096: { source: { label: "캠핑장 공식 공지", url: "https://example.com/notice", checked_at: "2026-10-15T09:00:00+09:00", tier: "A" }, items: [
    { kind: "POWER", priority: "critical", title: "전기 사용", summary: "사이트당 최대 700W입니다." },
    { kind: "RENTAL", title: "대여", summary: "원문 없는 안내", source: { label: "운영자", checked_at: "2026-10-15" } },
  ] } } };
  const info = buildImportantInfo(notices, "7096");
  assert.equal(info.items.length, 1);
  assert.equal(info.items[0].priority, "critical");
  assert.equal(info.items[0].source.url, "https://example.com/notice");
  const [record] = buildExploreRecords({ campgrounds: [camp] }, null, null, new Map(), notices);
  assert.equal(record.important_info.items[0].summary, "사이트당 최대 700W입니다.");
});

test("소개 문구: 목록엔 한 줄 소개만, 긴 소개는 별도 파일", () => {
  const withIntro = { ...camp, intro: { line: "  계곡 옆 조용한 캠핑장 ", text: "가".repeat(900), feature: null }, nearby_facilities: ["계곡 물놀이"], gocamping_url: "https://www.gocamping.or.kr/bsite/camp/info/read.do?c_no=7096" };
  const [r] = buildExploreRecords({ campgrounds: [withIntro] }, null, null);
  assert.equal(r.line, "계곡 옆 조용한 캠핑장");
  assert.equal(r.gc_url, withIntro.gocamping_url);
  const texts = buildExploreTexts({ campgrounds: [withIntro, { ...camp, external_id: { id: "1" } }] });
  assert.equal(texts["7096"].intro.length, 700);
  assert.ok(texts["7096"].intro.endsWith("…"));
  assert.deepEqual(texts["7096"].nearby, ["계곡 물놀이"]);
  assert.equal("feature" in texts["7096"], false);
  assert.equal(texts["1"], undefined);
});

test("예약처별 다가오는 일정", () => {
  const ps = buildProviders({ providers: [{ id: "knps", name: "국립공원" }], rules: [{ id: "r", provider_id: "knps", label: "추첨", source: { url: "https://x" } }] },
    { events: [{ provider_id: "knps", type: "OPEN", at: "2099-01-01T09:00:00+09:00", label: "오픈", source: { url: "https://x" } }, { provider_id: "knps", type: "OPEN", at: "2000-01-01T00:00:00+09:00", label: "지난 일정" }] });
  assert.equal(ps[0].events.length, 1);
  assert.equal(ps[0].rules[0].label, "추첨");
});

test("TourAPI: 요금 문구에서 금액 범위, 이름·좌표 매칭", () => {
  assert.deepEqual(feeRange("평일 30,000원 / 주말 40000원, 전기 5천원"), { min_krw: 30000, max_krw: 40000 });
  assert.deepEqual(feeRange("1박 4만원"), { min_krw: 40000, max_krw: 40000 });
  assert.equal(feeRange("현장 문의"), null);
  assert.equal(normalizeTourIntro({ usefeeleports: "1박<br>35,000원", reservation: "네이버 예약" }).fee_text, "1박\n35,000원");
  const m = matchTour([{ id: "g1", name: "향남 오토캠핑장", lat: 37.1, lng: 126.7 }, { id: "g2", name: "다른 캠핑장", lat: 37.1005, lng: 126.7005 }],
    [{ contentid: "t1", title: "향남오토캠핑장", lat: 37.1003, lng: 126.7002 }]);
  assert.equal(m.get("g1").contentid, "t1");
  assert.equal(m.has("g2"), false);
});
