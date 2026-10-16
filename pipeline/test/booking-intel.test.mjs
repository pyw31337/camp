import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import {
  BOOKING_CHANNEL_PRIORITY, buildBookingGuide, classifyChannels, extractOpenRules, extractPlatformMentions, forestScope,
  nextOpenings, normalizeUrl, parseKoreanTime, parseTargetPeriod, platformOfUrl, splitSentences,
  selectBookingChannel, sortBookingChannels,
} from "../lib/booking-intel.mjs";

const registry = JSON.parse(await readFile(new URL("../registry/booking-platforms.json", import.meta.url), "utf8"));
// 2026-10-13(화) 12:00 KST
const NOW = new Date("2026-10-13T03:00:00Z");
const one = (text) => extractOpenRules([text]);

// ───────────── 레지스트리 무결성 ─────────────

test("플랫폼 레지스트리: id 고유, 호스트 정규식 컴파일, 단계 2~8개, 사실마다 출처·확인일·등급·신뢰도", () => {
  const ids = registry.platforms.map((p) => p.id);
  assert.equal(new Set(ids).size, ids.length);
  for (const p of registry.platforms) {
    assert.ok(p.name, p.id);
    assert.ok(Array.isArray(p.hosts), p.id);
    p.hosts.forEach((h) => new RegExp(h));
    assert.ok(p.steps.length >= 2 && p.steps.length <= 8, `${p.id} steps`);
    assert.equal(typeof p.needs_verification, "boolean", p.id);
    for (const f of p.facts) {
      assert.match(f.url, /^https:\/\//, f.id);
      assert.equal(f.checked_at, "2026-10-13", f.id);
      assert.ok(["A", "B", "C", "E"].includes(f.tier), f.id);
      assert.ok(f.confidence > 0 && f.confidence <= 1, f.id);
      assert.equal(typeof f.needs_verification, "boolean", f.id);
    }
    for (const t of p.tips) if (t.fact_id) assert.ok(p.facts.some((f) => f.id === t.fact_id), `${p.id} tip → ${t.fact_id}`);
  }
  for (const t of registry.rule_templates) {
    assert.ok(ids.includes(t.platform_id), t.id);
    assert.ok(t.source.url && t.source.checked_at && t.source.tier, t.id);
    assert.ok(t.confidence > 0 && t.confidence <= 1, t.id);
    // 커뮤니티(E) 근거 템플릿은 반드시 확인 필요
    if (t.source.tier === "E") assert.equal(t.needs_verification, true, t.id);
  }
});

// ───────────── URL·채널 분류 ─────────────

test("normalizeUrl: 스킴 보정, 예시 도메인·tel 거부", () => {
  assert.equal(normalizeUrl("www.foresttrip.go.kr"), "http://www.foresttrip.go.kr/");
  assert.equal(normalizeUrl("https://example.com/book"), null);
  assert.equal(normalizeUrl("tel:010-1234-5678"), null);
  assert.equal(normalizeUrl("없음"), null);
  assert.equal(normalizeUrl(""), null);
});

test("platformOfUrl: 전용 플랫폼이 지자체 일반 도메인보다 먼저", () => {
  assert.equal(platformOfUrl("https://www.foresttrip.go.kr/indvz/main.do?hmpgId=ID02030052", registry), "foresttrip");
  assert.equal(platformOfUrl("https://reservation.knps.or.kr/reservation/searchSimpleCampReservation.do", registry), "knps");
  assert.equal(platformOfUrl("https://yeyak.seoul.go.kr/web/reservation/selectReservView.do?rsv_svc_id=S1", registry), "seoul-yeyak");
  assert.equal(platformOfUrl("https://m.booking.naver.com/booking/3/bizes/123456", registry), "naver");
  assert.equal(platformOfUrl("https://naver.me/abcd", registry), "naver");
  assert.equal(platformOfUrl("https://m.thankqcamping.com/resv/view.hbb?cseq=1", registry), "thankqcamping");
  assert.equal(platformOfUrl("https://www.camfit.co.kr/camp/abc", registry), "camfit");
  assert.equal(platformOfUrl("https://cafe.naver.com/somecamp", registry), "naver-cafe");
  assert.equal(platformOfUrl("https://www.gapyeong.go.kr/camping/reserve", registry), "public-site");
  assert.equal(platformOfUrl("http://www.happycamp.co.kr", registry), "homepage");
});

test("classifyChannels: 예약 URL → 홈페이지 → 전화 → 현장 순, 중복 제거", () => {
  const ch = classifyChannels({
    reservation: { methods: ["온라인실시간예약", "전화", "현장"], url: "https://m.booking.naver.com/booking/3/bizes/555" },
    contact: { tel: "031-123-4567", homepage: "http://www.happycamp.co.kr" },
  }, registry);
  assert.deepEqual(ch.map((c) => [c.platform_id, c.kind]), [["naver", "online"], ["homepage", "homepage"], ["phone", "phone"], ["onsite", "onsite"]]);
  assert.deepEqual(ch[0].evidence, ["reservation.url", "methods:온라인실시간예약"]);
  assert.equal(ch[0].confidence, 0.9);
  assert.equal(ch[2].url, "tel:0311234567");
});

test("classifyChannels: 홈페이지가 예약 플랫폼이면 online, 예약 URL과 같으면 합친다", () => {
  const ch = classifyChannels({ reservation: { methods: [], url: "https://www.thankqcamping.com/x" }, contact: { homepage: "thankqcamping.com/x/" } }, registry);
  assert.equal(ch.length, 1);
  assert.deepEqual(ch[0].evidence, ["reservation.url", "contact.homepage"]);
  const ch2 = classifyChannels({ reservation: { methods: [] }, contact: { homepage: "https://cafe.naver.com/mycamp" } }, registry);
  assert.equal(ch2[0].kind, "online");
  assert.equal(ch2[0].platform_id, "naver-cafe");
});

test("classifyChannels: 온라인이라 했지만 URL이 없으면 플랫폼 미상 채널(신뢰도 낮음)", () => {
  const ch = classifyChannels({ reservation: { methods: ["온라인실시간예약", "전화"], url: null }, contact: { tel: "010-0000-1111" } }, registry);
  assert.deepEqual(ch.map((c) => [c.platform_id, c.kind]), [[null, "online"], ["phone", "phone"]]);
  assert.equal(ch[0].confidence, 0.3);
});

test("classifyChannels: 탐색 레코드 형태, 예시 도메인 무시, 전화번호만 있으면 문의용 전화", () => {
  const ch = classifyChannels({ booking: { methods: ["온라인실시간예약"], url: "https://example.com/book" }, homepage: null, tel: "033-111-2222" }, registry);
  assert.deepEqual(ch.map((c) => [c.platform_id, c.kind, c.confidence]), [[null, "online", 0.3], ["phone", "phone", 0.5]]);
  assert.deepEqual(ch[1].evidence, ["contact.tel(문의)"]);
  assert.deepEqual(classifyChannels({}, registry), []);
});

test("classifyChannels: 네이버 지도 링크는 예약 화면이 아닐 수 있어 신뢰도를 낮춘다", () => {
  const [c] = classifyChannels({ reservation: { url: "https://map.naver.com/p/entry/place/1234" } }, registry);
  assert.equal(c.platform_id, "naver");
  assert.equal(c.confidence, 0.6);
});

test("예약 전환 우선순위: 캠핏 → 네이버 → 땡큐캠핑 → 기타 온라인 → 홈페이지 → 전화", () => {
  assert.deepEqual(BOOKING_CHANNEL_PRIORITY, { camfit: 0, naver: 10, thankqcamping: 20 });
  const channels = [
    { platform_id: "public-site", kind: "online", url: "https://reserve.example.kr/camp" },
    { platform_id: "thankqcamping", kind: "online", url: "https://www.thankqcamping.com/camp/1" },
    { platform_id: "naver", kind: "online", url: "https://booking.naver.com/booking/3/bizes/1" },
    { platform_id: "camfit", kind: "online", url: "https://www.camfit.co.kr/camp/1" },
    { platform_id: "homepage", kind: "homepage", url: "https://camp.example.kr" },
    { platform_id: "phone", kind: "phone", url: "tel:01000000000" },
  ];
  assert.deepEqual(sortBookingChannels(channels).map((x) => x.platform_id), ["camfit", "naver", "thankqcamping", "public-site", "homepage", "phone"]);
  assert.equal(selectBookingChannel(channels).platform_id, "camfit");
  // 플랫폼 이름만 언급되고 URL이 없으면 실제 연결이 있는 다음 경로를 고른다.
  assert.equal(selectBookingChannel([{ platform_id: "camfit", kind: "online", url: null }, channels[1]]).platform_id, "thankqcamping");
});

// ───────────── 시각·기간 파서 ─────────────

test("parseKoreanTime", () => {
  assert.equal(parseKoreanTime("오후 2시"), "14:00");
  assert.equal(parseKoreanTime("14:00"), "14:00");
  assert.equal(parseKoreanTime("오전 9시 30분"), "09:30");
  assert.equal(parseKoreanTime("오전 10시 반"), "10:30");
  assert.equal(parseKoreanTime("정오에 오픈"), "12:00");
  assert.equal(parseKoreanTime("자정"), "00:00");
  assert.equal(parseKoreanTime("밤 9시"), "21:00");
  assert.equal(parseKoreanTime("24시간 예약 가능"), null);
  assert.equal(parseKoreanTime("체크인 15시"), null);
  assert.equal(parseKoreanTime("입실 14:00 퇴실 11:00"), null);
  assert.equal(parseKoreanTime("25시"), null);
});

test("parseTargetPeriod", () => {
  assert.equal(parseTargetPeriod("다음달 예약"), "NEXT_MONTH");
  assert.equal(parseTargetPeriod("익월분"), "NEXT_MONTH");
  assert.equal(parseTargetPeriod("다다음달 예약"), "MONTH_PLUS_2");
  assert.equal(parseTargetPeriod("2개월치 오픈"), "MONTHS_2");
  assert.equal(parseTargetPeriod("예약 오픈"), null);
});

test("splitSentences: 가운뎃점 단어는 유지, 기호·줄바꿈으로 자름", () => {
  assert.deepEqual(splitSentences("매주 화·목 예약 오픈\n※ 매월 1일 휴무"), ["매주 화·목 예약 오픈", "매월 1일 휴무"]);
});

// ───────────── 오픈 규칙 추출: 양성 ─────────────

test("MONTHLY: 매월 1일 오전 10시 다음달 예약 오픈", () => {
  const [r, ...rest] = one("예약은 매월 1일 오전 10시에 다음달 예약이 오픈됩니다.");
  assert.equal(rest.length, 0);
  assert.equal(r.type, "MONTHLY");
  assert.equal(r.day_of_month, 1);
  assert.equal(r.time, "10:00");
  assert.equal(r.target_period, "NEXT_MONTH");
  assert.ok(r.confidence >= 0.85);
  assert.match(r.snippet, /매월 1일/);
});

test("MONTHLY: 매월 15일, 말일, 지역주민 우선 범위", () => {
  assert.equal(one("매월 15일 14시 익월 예약 접수 시작")[0].time, "14:00");
  const last = one("매월 말일 자정에 다음 달 예약을 오픈합니다")[0];
  assert.equal(last.day_of_month, "last");
  assert.equal(last.time, "00:00");
  const pri = one("매월 1~3일은 군민 우선 예약 기간입니다")[0];
  assert.equal(pri.type, "MONTHLY");
  assert.equal(pri.day_of_month, 1);
  assert.equal(pri.window_end_day, 3);
  assert.equal(pri.mode, "LOCAL_PRIORITY");
});

test("MONTHLY: 여러 날짜는 각각 규칙", () => {
  const rs = one("매월 1일, 15일 오전 9시 예약 오픈");
  assert.deepEqual(rs.map((r) => [r.day_of_month, r.time]), [[1, "09:00"], [15, "09:00"]]);
});

test("WEEKLY: 매주 화요일 14시 예약 오픈 / 화·목 두 요일", () => {
  const single = one("예약은 매주 화요일 14시에 오픈합니다");
  assert.equal(single.length, 1); // '요일'의 '일'을 일요일로 읽지 않는다
  assert.deepEqual([single[0].type, single[0].weekday, single[0].time], ["WEEKLY", 2, "14:00"]);
  const rs = one("매주 화·목 오전 10시 예약 오픈");
  assert.deepEqual(rs.map((x) => x.weekday), [2, 4]);
  assert.deepEqual(one("매주 화요일, 금요일 정오 예약 오픈").map((x) => [x.weekday, x.time]), [[2, "12:00"], [5, "12:00"]]);
  assert.deepEqual(one("매주 일요일 오후 8시 다음 주 예약 오픈").map((x) => x.weekday), [0]);
});

test("WEEKLY: 숲나들e식 '6주전 수요일 오전 09:00부터'", () => {
  const [r, ...rest] = one("비수기 주중 선착순 예약 - 예약 : 사용일 기준 6주전 수요일 오전 09:00부터");
  assert.equal(rest.length, 0);
  assert.deepEqual([r.type, r.weekday, r.lead_weeks, r.time, r.mode], ["WEEKLY", 3, 6, "09:00", "FIRST_COME"]);
});

test("ROLLING: 30일 전부터 / 2주 전 / 2개월 전 / 한 달 전 / N일 이내", () => {
  const a = one("이용일 30일 전부터 예약 가능합니다(오전 9시 오픈)")[0];
  assert.deepEqual([a.type, a.days_before, a.time], ["ROLLING", 30, "09:00"]);
  assert.equal(one("이용일 2주 전부터 예약 오픈")[0].days_before, 14);
  assert.equal(one("입실일 2개월 전부터 예약 가능")[0].months_before, 2);
  assert.equal(one("한 달 전부터 예약을 받습니다")[0].days_before, 30);
  const w = one("이용일로부터 60일 이내 날짜만 예약 가능합니다")[0];
  assert.deepEqual([w.type, w.days_before, w.window], ["ROLLING", 60, "WITHIN"]);
});

test("LOTTERY: 매월 4일~9일 추첨 신청 + 익월분", () => {
  const [r] = one("주말 예약은 추첨제로 진행되며 매월 4일~9일 익월분 신청을 받습니다");
  assert.deepEqual([r.type, r.day_of_month, r.apply_end_day, r.target_period], ["LOTTERY", 4, 9, "NEXT_MONTH"]);
});

test("LOTTERY·FIRST_COME·QUARTERLY: 방식만 밝힌 문구", () => {
  assert.equal(one("성수기는 추첨제로 예약을 받습니다")[0].type, "LOTTERY");
  assert.equal(one("모든 예약은 선착순으로 마감됩니다")[0].type, "FIRST_COME");
  const q = one("분기별로 예약을 오픈합니다")[0];
  assert.equal(q.type, "QUARTERLY");
  assert.equal(nextOpenings(q, NOW).length, 0);
});

test("전각 숫자도 읽는다", () => {
  assert.equal(one("매월 １일 오전 １０시 예약 오픈")[0].time, "10:00");
});

test("여러 텍스트 객체: 출처·필드를 보존하고 같은 규칙은 한 번만", () => {
  const src = { url: "https://apis.data.go.kr/x", checked_at: "2026-10-13", tier: "C" };
  const rs = extractOpenRules([
    { text: "매월 1일 10시 다음달 예약 오픈", field: "tourapi.reservation", source: src },
    "매월 1일 10시 다음달 예약 오픈",
  ]);
  assert.equal(rs.length, 1);
  assert.equal(rs[0].field, "tourapi.reservation");
  assert.deepEqual(rs[0].source, src);
});

// ───────────── 오픈 규칙 추출: 음성(추측 금지) ─────────────

test("음성: 휴무·취소·마감·이벤트·체크인 문구는 오픈 규칙이 아니다", () => {
  const negatives = [
    "매월 1일은 정기 휴무입니다",
    "매주 월요일 휴무(공휴일인 경우 익일)",
    "매주 화요일은 시설 점검일로 운영하지 않습니다",
    "이용일 3일 전 취소 시 100% 환불, 2일 전 취소 시 50% 공제",
    "예약은 이용 2일 전까지 가능합니다",
    "선착순 10팀 장작 무료 증정 이벤트",
    "체크인 14시, 체크아웃 11시, 매너타임 22시",
    "24시간 온라인 예약 가능",
    "계곡과 숲이 어우러진 조용한 캠핑장입니다. 매월 둘째 주에는 숲 해설 프로그램이 있습니다",
    "추첨 이벤트에 참여하시면 캠핑용품을 드립니다",
    "매월 1일 소독을 실시합니다",
    "입실일 기준 7일 이내 취소 시 환불 불가",
  ];
  for (const t of negatives) assert.deepEqual(one(t), [], t);
});

// ───────────── 플랫폼 언급 ─────────────

test("extractPlatformMentions: 이름·URL 언급, 카페는 '예약' 맥락에서만", () => {
  const m = extractPlatformMentions(["예약은 네이버 예약으로만 받습니다", "숲나들e에서 예약하세요", "자세한 예약은 https://m.thankqcamping.com/abc 참고"], registry);
  assert.deepEqual(m.map((x) => x.platform_id), ["naver", "foresttrip", "thankqcamping"]);
  assert.deepEqual(extractPlatformMentions(["관리동 1층에 카페가 있습니다"], registry), []);
  assert.equal(extractPlatformMentions(["예약은 네이버 카페에서 받습니다"], registry)[0].platform_id, "naver-cafe");
});

// ───────────── 다가오는 오픈 시각 ─────────────

test("nextOpenings MONTHLY: 다음 달 1일 10:00부터 3회, 이용 달 표시", () => {
  const ev = nextOpenings({ type: "MONTHLY", day_of_month: 1, time: "10:00", target_period: "NEXT_MONTH" }, NOW, 3);
  assert.deepEqual(ev.map((e) => e.at), ["2026-11-01T10:00:00+09:00", "2026-12-01T10:00:00+09:00", "2027-01-01T10:00:00+09:00"]);
  assert.deepEqual(ev[0].stay, { month: "2026-12" });
  assert.equal(ev[0].time_known, true);
});

test("nextOpenings MONTHLY: 오늘 오픈 시각 전이면 오늘 포함, 31일은 말일로", () => {
  const morning = new Date("2026-11-01T00:00:00Z"); // 11-01 09:00 KST
  assert.equal(nextOpenings({ type: "MONTHLY", day_of_month: 1, time: "10:00" }, morning, 1)[0].at, "2026-11-01T10:00:00+09:00");
  const ev = nextOpenings({ type: "MONTHLY", day_of_month: 31, time: null }, NOW, 2);
  assert.deepEqual(ev.map((e) => [e.date, e.clamped_from_day ?? null, e.time_known]), [["2026-10-31", null, false], ["2026-11-30", 31, false]]);
  assert.equal(nextOpenings({ type: "MONTHLY", day_of_month: "last", time: "00:00" }, NOW, 1)[0].date, "2026-10-31");
});

test("nextOpenings MONTHLY: 시각 미상이면 오늘도 후보", () => {
  const ev = nextOpenings({ type: "MONTHLY", day_of_month: 13, time: null }, NOW, 1);
  assert.equal(ev[0].date, "2026-10-13");
});

test("nextOpenings WEEKLY: 수요일 09:00, 6주 뒤 주(월~일)", () => {
  const ev = nextOpenings({ type: "WEEKLY", weekday: 3, time: "09:00", lead_weeks: 6 }, NOW, 2);
  assert.deepEqual(ev.map((e) => e.at), ["2026-10-14T09:00:00+09:00", "2026-10-21T09:00:00+09:00"]);
  assert.deepEqual(ev[0].stay, { from: "2026-11-23", to: "2026-11-29" });
  // 화요일 12시 기준 '매주 화요일 10시'는 다음 주로 넘어간다
  assert.equal(nextOpenings({ type: "WEEKLY", weekday: 2, time: "10:00" }, NOW, 1)[0].date, "2026-10-20");
});

test("nextOpenings ROLLING: 매일 09:00, 30일 뒤 날짜가 열린다", () => {
  const ev = nextOpenings({ type: "ROLLING", days_before: 30, time: "09:00" }, NOW, 2);
  assert.deepEqual(ev.map((e) => [e.at, e.stay.date]), [["2026-10-14T09:00:00+09:00", "2026-11-13"], ["2026-10-15T09:00:00+09:00", "2026-11-14"]]);
  const m = nextOpenings({ type: "ROLLING", months_before: 2, time: null }, NOW, 1);
  assert.deepEqual([m[0].date, m[0].stay.date], ["2026-10-13", "2026-12-13"]);
});

test("nextOpenings LOTTERY(짝수월): 국립공원 추첨 템플릿", () => {
  const tpl = registry.rule_templates.find((t) => t.id === "knps-campground-bimonthly-lottery");
  const ev = nextOpenings(tpl.rule, NOW, 3);
  assert.deepEqual(ev.map((e) => e.at), ["2026-12-01T10:00:00+09:00", "2027-02-01T10:00:00+09:00", "2027-04-01T10:00:00+09:00"]);
  assert.deepEqual(ev[0].stay, { from_month: "2027-01", to_month: "2027-02" });
  assert.equal(ev[0].apply_end, "2026-12-06");
});

test("nextOpenings: 일정이 없는 규칙은 빈 배열", () => {
  assert.deepEqual(nextOpenings({ type: "FIRST_COME" }, NOW), []);
  assert.deepEqual(nextOpenings({ type: "LOTTERY", day_of_month: null }, NOW), []);
  assert.deepEqual(nextOpenings(null, NOW), []);
});

// ───────────── 안내 조립 ─────────────

const privateCamp = {
  name: "별빛계곡 오토캠핑장",
  operator_type: "PRIVATE",
  gocamping_url: "https://www.gocamping.or.kr/bsite/camp/info/read.do?c_no=9999",
  source: { fetched_at: "2026-10-12T21:00:00+09:00" },
  contact: { tel: "031-555-1234", homepage: "http://www.byeolbit.co.kr" },
  reservation: { methods: ["온라인실시간예약", "전화"], url: "https://m.booking.naver.com/booking/3/bizes/777" },
  intro: { line: "계곡 옆 오토캠핑장", text: "예약은 네이버 예약으로 받습니다. 매월 1일 오전 10시에 다음달 예약이 오픈됩니다. 매주 월요일 휴무.", feature: null },
};

test("buildBookingGuide: 민간 캠핑장 + 운영자 문구 → tier C 규칙과 다가오는 오픈(확인 필요)", () => {
  const g = buildBookingGuide(privateCamp, registry, [], { now: NOW });
  assert.equal(g.platform.id, "naver");
  assert.equal(g.channels[0].platform_id, "naver");
  assert.ok(g.channels[0].evidence.includes("text:gocamping.intro.text"));
  assert.match(g.steps[0].text, /m\.booking\.naver\.com/);
  assert.ok(g.steps.length >= 4);
  assert.equal(g.open_rules.length, 1);
  const r = g.open_rules[0];
  assert.deepEqual([r.origin, r.type, r.day_of_month, r.time], ["operator_text", "MONTHLY", 1, "10:00"]);
  assert.deepEqual(r.source, { url: privateCamp.gocamping_url, checked_at: "2026-10-12T21:00:00+09:00", tier: "C", label: "고캠핑 운영자 등록 문구", field: "gocamping.intro.text" });
  assert.equal(r.needs_verification, true);
  assert.equal(g.next_openings[0].at, "2026-11-01T10:00:00+09:00");
  assert.equal(g.next_openings[0].needs_verification, true);
  assert.ok(g.warnings.some((w) => w.code === "OPERATOR_TEXT_UNVERIFIED"));
  assert.ok(g.warnings.some((w) => w.code === "PLATFORM_UNVERIFIED"));
  assert.equal(g.generated_at, "2026-10-13T12:00:00+09:00");
});

test("buildBookingGuide: 국립 휴양림 → 숲나들e 공식 템플릿(A) 적용, 변형 템플릿은 제외", () => {
  const g = buildBookingGuide({ name: "국립 유명산자연휴양림", operator_type: "NATURAL_RECREATION_FOREST", reservation: { methods: ["온라인실시간예약"], url: "https://www.foresttrip.go.kr/indvz/main.do?hmpgId=ID02030001" } }, registry, [], { now: NOW });
  assert.equal(g.platform.id, "foresttrip");
  assert.equal(g.platform.needs_verification, false);
  const ids = g.open_rules.map((r) => r.id);
  assert.ok(ids.includes("foresttrip-national-weekday-fcfs"));
  assert.ok(!ids.includes("foresttrip-public-monthly-variant"));
  const weekly = g.next_openings.find((e) => e.rule_id === "foresttrip-national-weekday-fcfs");
  assert.equal(weekly.at, "2026-10-14T09:00:00+09:00");
  assert.equal(weekly.needs_verification, false);
  assert.equal(weekly.source.tier, "A");
  // 15일 미결제분 선착순, 다음 달 4일 추첨 접수도 계산된다
  assert.ok(g.next_openings.some((e) => e.rule_id === "foresttrip-national-weekend-reopen" && e.at === "2026-10-15T09:00:00+09:00"));
  assert.ok(g.next_openings.some((e) => e.rule_id === "foresttrip-national-weekend-lottery" && e.at === "2026-11-04T09:00:00+09:00"));
  assert.ok(!g.warnings.some((w) => w.code === "FOREST_SCOPE_UNKNOWN"));
});

test("buildBookingGuide: 국립 여부를 모르는 휴양림 → IF_NATIONAL + 변형 템플릿(일정 계산 안 함) + 경고", () => {
  const c = { name: "산음자연휴양림", operator_type: "NATURAL_RECREATION_FOREST", reservation: { url: "https://www.foresttrip.go.kr/" } };
  assert.equal(forestScope(c), "UNKNOWN");
  const g = buildBookingGuide(c, registry, [], { now: NOW });
  const weekly = g.open_rules.find((r) => r.id === "foresttrip-national-weekday-fcfs");
  assert.equal(weekly.applies, "IF_NATIONAL");
  assert.equal(weekly.needs_verification, true);
  const variant = g.open_rules.find((r) => r.id === "foresttrip-public-monthly-variant");
  assert.equal(variant.applies, "VARIANT");
  assert.ok(!g.next_openings.some((e) => e.rule_id === variant.id));
  assert.ok(g.next_openings.every((e) => e.needs_verification));
  assert.ok(g.warnings.some((w) => w.code === "FOREST_SCOPE_UNKNOWN"));
});

test("buildBookingGuide: 공립 휴양림 + 운영자 문구 '매월 1일 09시 다음달 오픈' → 국립 템플릿 제외", () => {
  const g = buildBookingGuide({ name: "기찬랜드 군립자연휴양림", operator_type: "LOCAL_GOVERNMENT", reservation: { url: "https://www.foresttrip.go.kr/" } }, registry,
    [{ text: "매월 1일 오전 9시 이후 다음 달 1개월치 예약이 오픈됩니다", field: "operator.notice", source: { url: "https://www.foresttrip.go.kr/notice/1", checked_at: "2026-10-13", tier: "C" } }], { now: NOW });
  assert.ok(!g.open_rules.some((r) => r.id.startsWith("foresttrip-national")));
  const op = g.open_rules.find((r) => r.origin === "operator_text");
  assert.equal(op.time, "09:00");
  assert.equal(g.next_openings[0].at, "2026-11-01T09:00:00+09:00");
  assert.ok(g.warnings.some((w) => w.code === "FOREST_LOCAL_RULES"));
});

test("buildBookingGuide: 국립공원 → 짝수월 추첨 템플릿(B, 확인 필요)", () => {
  const g = buildBookingGuide({ name: "덕유대 야영장", operator_type: "NATIONAL_PARK", reservation: { url: "https://reservation.knps.or.kr/" } }, registry, [], { now: NOW });
  assert.equal(g.platform.id, "knps");
  const e = g.next_openings[0];
  assert.deepEqual([e.rule_id, e.at, e.needs_verification], ["knps-campground-bimonthly-lottery", "2026-12-01T10:00:00+09:00", true]);
});

test("buildBookingGuide: 예약 URL과 다른 플랫폼을 문구가 언급하면 경고", () => {
  const g = buildBookingGuide({ name: "A캠핑장", reservation: { url: "https://www.thankqcamping.com/a" }, intro: { text: "네이버 예약으로 예약 가능합니다" } }, registry, [], { now: NOW });
  assert.ok(g.warnings.some((w) => w.code === "TEXT_PLATFORM_MISMATCH"));
  assert.equal(g.platform.id, "thankqcamping");
  assert.ok(g.channels.some((c) => c.platform_id === "naver" && c.confidence === 0.4));
});

test("buildBookingGuide: 출처 없는 추가 문구는 SOURCE_MISSING", () => {
  const g = buildBookingGuide({ name: "B", reservation: { url: "https://www.camfit.co.kr/b" } }, registry, ["매주 수요일 오후 2시 예약 오픈"], { now: NOW });
  assert.ok(g.warnings.some((w) => w.code === "SOURCE_MISSING"));
  assert.equal(g.next_openings[0].at, "2026-10-14T14:00:00+09:00");
});

test("buildBookingGuide: 전화만 있는 곳, 채널이 없는 곳", () => {
  const phone = buildBookingGuide({ name: "C", reservation: { methods: ["전화"] }, contact: { tel: "061-000-1234" } }, registry, [], { now: NOW });
  assert.equal(phone.platform.id, "phone");
  assert.match(phone.steps[0].text, /0610001234/);
  assert.ok(phone.warnings.some((w) => w.code === "PHONE_ONLY"));
  const none = buildBookingGuide({ name: "D" }, registry, [], { now: NOW });
  assert.equal(none.platform, null);
  assert.deepEqual(none.steps, []);
  assert.ok(none.warnings.some((w) => w.code === "NO_CHANNEL"));
});

test("buildBookingGuide: 서로 다른 일정이 섞이면 RULE_CONFLICT", () => {
  const g = buildBookingGuide({ name: "E", reservation: { url: "https://www.happy.co.kr" }, intro: { text: "매월 1일 10시 예약 오픈. 글램핑은 매주 화요일 14시 예약 오픈." } }, registry, [], { now: NOW });
  assert.ok(g.warnings.some((w) => w.code === "RULE_CONFLICT"));
  assert.equal(g.open_rules.length, 2);
});
