import assert from "node:assert/strict";
import test from "node:test";
import { buildProfile, summaryOf } from "../lib/campground-profile.mjs";

const base = {
  id: "1", name: "테스트캠핑장", gc_url: "https://www.gocamping.or.kr/x", modified_at: "2026-10-14",
  kinds: [["AUTO_PITCH", 30], ["GLAMPING", 5]], amenities: ["전기", "온수", "물놀이장"], env: ["계곡", "산"],
  pets: "가능(소형견)", fire: "개별", seasons: ["봄", "여름", "가을", "겨울"], toilets: 4, showers: 4,
  booking: { channels: [{ kind: "online", platform_name: "캠핏" }] }, field_conditions: { status: "CONFIRMED", power: { available: true } },
};

test("원천 우선순위: 운영자 공개 W > 고캠핑 전기 제공, 고캠핑 화로대는 연료 미확인", () => {
  const p = buildProfile({ ...base, of: { w: { v: 600, q: "전기는 600W까지", u: "https://camp.example/rule", t: "2026-10-15" } } });
  assert.equal(p.fields.POWER.value, "최대 600W");
  assert.equal(p.fields.POWER.grade, "OPERATOR");
  assert.equal(p.fields.POWER.source.quote, "전기는 600W까지");
  assert.equal(p.fields.FIRE.value, "화로대 개별(연료 미확인)");
  assert.equal(p.fields.FIRE.grade, "CONFIRMED");
});
test("후기 언급은 MENTION으로만, 요약에는 쓰지 않는다", () => {
  const d = { prices: [{ won: 50000, url: "https://blog/x", quote: "5만원", date: "2026-10-01" }, { won: 60000 }],
    spec: { fields: { CHECKIN_TIME: { values: [], mentions: [{ value: "14:00부터", count: 3, samples: [{ url: "https://blog/y", quote: "체크인 2시" }] }] } } } };
  const p = buildProfile(base, d);
  assert.equal(p.fields.PRICE.grade, "MENTION");
  assert.equal(p.fields.PRICE.value, "5만~6만원대");
  assert.equal(p.fields.CHECKIN.grade, "MENTION");
  assert.ok(!p.summary.includes("입실"));
  assert.ok(!p.summary.includes("1박"));
});

test("운영자 상세 사실은 요금·편의시설·환불로 들어가고 태그 근거가 남는다", () => {
  const details = {
    SITE_PRICE: { min: 40000, max: 50000, items: [{ amount: 40000, quote: "평일 40,000원" }] },
    FIRE_SET_FEE: { amount: 25000, quote: "불멍 세트 25,000원" }, AMENITIES: [{ code: "POOL", label: "수영장·물놀이장", period: "7월~8월", quote: "수영장 7월~8월" }],
    REFUND: { quote: "3일 전 취소 50%" }, SEASON: null, PET_FEE: { amount: 10000, quote: "반려견 1마리 10,000원" },
  };
  const p = buildProfile(base, null, details, { urlOf: () => "https://camp.example/guide", detailDate: "2026-10-16" });
  assert.equal(p.fields.PRICE.value, "4만~5만원");
  assert.equal(p.fields.PRICE.source.url, "https://camp.example/guide");
  assert.equal(p.fields.FIRE.value, "불멍 세트 유료(2.5만원)");
  assert.ok(p.fields.AMENITIES.items.includes("수영장·물놀이장(7월~8월)"));
  assert.equal(p.fields.REFUND.value, "규정 있음");
  assert.equal(p.fields.PET.fee, 10000);
  const tags = p.tags.map((t) => t.code);
  for (const t of ["VALLEY", "MOUNTAIN", "AUTO", "GLAMPING", "FAMILY", "PET_OK", "WINTER", "WATER_PLAY"]) assert.ok(tags.includes(t), t);
  assert.match(p.summary, /^오토 30·글램핑 5 · 1박 4만~5만원/);
});

test("요약은 확인된 값만, 최대 6조각", () => {
  const s = summaryOf({ TYPE: { value: "오토 30", grade: "CONFIRMED" }, CHECKIN: { value: "14:00부터", grade: "OPERATOR" }, PRICE: { value: "5만원", grade: "MENTION" }, POWER: { watts: 600, grade: "OPERATOR" }, FIRE: { value: "장작 가능", grade: "OPERATOR" }, PARKING: { value: "사이트 옆 주차", grade: "OPERATOR" }, CAR_CAMPING: { value: "차박 가능", grade: "OPERATOR" }, PET: { value: "동반 가능", grade: "CONFIRMED" } });
  assert.equal(s, "오토 30 · 입실 14:00 · 전기 600W · 장작 가능 · 사이트 옆 주차 · 차박 가능");
});

test("환불 규정 미기재 시 법정 소비자분쟁해결기준을 참고값(REFERENCE)으로만 둔다", () => {
  // 2026-10-19 소유자 결정: 업장이 공지하지 않은 법정 기본값은 그 업장의 규정이 아니므로 확정값으로 쓰지 않는다.
  const p = buildProfile(base);
  assert.equal(p.fields.REFUND.value, "업장 미공지 · 법정 기준 10일 전 100% 환불");
  assert.equal(p.fields.REFUND.grade, "REFERENCE");
  assert.equal(p.fields.REFUND.source.url, "https://www.ftc.go.kr/");
  assert.equal(p.fields.REFUND.statutory, true);
});
