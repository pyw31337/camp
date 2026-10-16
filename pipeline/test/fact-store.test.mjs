import assert from "node:assert/strict";
import test from "node:test";
import { amenityCodes, DICTIONARY, factsOf, hhmm, validateFacts } from "../lib/fact-store.mjs";

const base = {
  id: "1", name: "테스트캠핑장", gc_url: "https://www.gocamping.or.kr/x", modified_at: "2026-10-14", tel: "031-000-0000",
  kinds: [["AUTO_PITCH", 30], ["GLAMPING", 5]], amenities: ["전기", "온수", "물놀이장", "족구장", "개별 바비큐 시설", "물놀이장 공사 예정"],
  env: ["계곡"], themes: ["여름물놀이"], pets: "가능(소형견)", fire: "개별", seasons: ["봄", "여름"], days: ["평일+주말"], status: "운영", op: "PRIVATE",
  booking: { methods: ["온라인실시간예약"], channels: [{ kind: "online", platform_id: "camfit", platform_name: "캠핏" }] },
  field_conditions: { status: "CONFIRMED", power: { available: true }, charcoal: { state: "CONFIRMED", allowed: true }, source: { url: "https://www.gocamping.or.kr/x", checked_at: "2026-10-06" } },
};

test("속성 사전: 코드가 겹치지 않고 모든 속성에 묶음·타입이 있다", () => {
  const codes = DICTIONARY.attributes.map((a) => a.code);
  assert.equal(new Set(codes).size, codes.length);
  for (const a of DICTIONARY.attributes) { assert.ok(DICTIONARY.groups[a.group], a.code); assert.ok(DICTIONARY.types[a.type], a.code); }
});

test("고캠핑 등록값은 속성마다 1행으로 잘게 나뉜다", () => {
  const f = factsOf(base, null);
  const has = (attr, value) => f.some((x) => x.attr === attr && x.value === value);
  assert.ok(has("STAY_AUTO_SITES", 30) && has("STAY_GLAMPING_SITES", 5) && has("SITE_TOTAL", 35));
  assert.ok(has("ENV_VALLEY", true) && has("THEME_SUMMER_WATER", true));
  assert.ok(has("OPEN_SUMMER", true) && has("OPEN_WINTER", false));
  assert.ok(has("PET_POLICY", "SMALL_ONLY") && has("POWER_AVAILABLE", true) && has("CHARCOAL_ALLOWED", true));
  assert.ok(has("AMENITY_POOL", true) && has("AMENITY_SPORTS", true) && has("AMENITY_PRIVATE_BBQ", true));
  assert.ok(has("BOOKING_CHANNEL", "camfit") && has("BOOKING_REALTIME", true));
  assert.deepEqual(validateFacts(f), []);
  assert.ok(f.every((x) => x.grade === "CONFIRMED" && x.url));
});

test("운영자·후기 사실은 등급과 근거 문장을 따로 남기고, 충돌도 지우지 않는다", () => {
  const c = { ...base, of: { w: { v: 600, q: "전기는 600W까지", u: "https://camp.example/rule", t: "2026-10-15" } } };
  const site = { status: "OK", url: "https://camp.example/", checked_at: "2026-10-15", snippets: [{ text: "평일 40,000원", url: "https://camp.example/price" }] };
  const details = { SITE_PRICE: { min: 40000, max: 40000, items: [{ amount: 40000, label: "평일", quote: "평일 40,000원" }] }, AMENITIES: [], REFUND: null, SEASON: null };
  const d = { spec: { fields: { PET_POLICY: { values: [{ value: "동반 불가", quote: "반려견 입장 불가", source: { kind: "operator_homepage", url: "https://camp.example/rule", date: "2026-10-15" } }], mentions: [] },
    CHECKIN_TIME: { values: [], mentions: [{ value: "14:00부터", count: 3, samples: [{ url: "https://blog/y", quote: "체크인 2시" }] }] } } },
    prices: [{ won: 50000, url: "https://blog/x", quote: "5만원", date: "2026-10-01" }] };
  const digest = { n: 4, pros: [["조용·한적", 2]], cons: [], all: { pros: [["조용·한적", 2], ["사이트 넓음", 1]], cons: [["벌레 많음", 1]] }, samples: { "조용·한적": [{ url: "https://blog/z" }] } };
  const f = factsOf(c, d, { site, details, digest });
  const one = (attr, grade) => f.find((x) => x.attr === attr && x.grade === grade);
  assert.equal(one("POWER_MAX_W", "OPERATOR").quote, "전기는 600W까지");
  assert.equal(one("PRICE_NIGHT", "OPERATOR").url, "https://camp.example/price");
  assert.equal(one("PRICE_MENTION", "MENTION").value, 50000);
  assert.equal(one("CHECKIN_TIME", "MENTION").value, "14:00");
  assert.equal(one("CHECKIN_TIME", "MENTION").n, 3);
  assert.ok(one("PET_POLICY", "OPERATOR").value === "NOT_ALLOWED" && one("PET_POLICY", "CONFIRMED").value === "SMALL_ONLY");
  assert.equal(one("REVIEW_PRO_QUIET", "MENTION").url, "https://blog/z");
  assert.ok(one("REVIEW_CON_BUGS", "MENTION") && one("REVIEW_PRO_WIDE_SITE", "MENTION"));
  assert.deepEqual(validateFacts(f), []);
});

test("편의시설 정규화와 시각 정규화", () => {
  assert.deepEqual(amenityCodes("물놀이장 공사 예정"), []);
  assert.deepEqual(amenityCodes("카페 & 베이커리"), ["CAFE"]);
  assert.equal(hhmm("오후 3시"), "15:00");
  assert.equal(hhmm("14:00부터"), "14:00");
  assert.equal(hhmm("오전 11시 30분"), "11:30");
});

test("검증은 사전에 없는 속성·원천 없는 확정값을 잡는다", () => {
  const errs = validateFacts([{ cid: "1", attr: "NOPE", value: 1, grade: "CONFIRMED", src: "gocamping", url: "x" },
    { cid: "1", attr: "POWER_MAX_W", value: 600, grade: "OPERATOR", src: "operator_homepage", url: null }]);
  assert.equal(errs.length, 2);
});
