import assert from "node:assert/strict";
import { test } from "node:test";
import { buildOpenings, stayLabel } from "../lib/openings.mjs";

const now = new Date("2026-10-13T00:00:00+09:00");
const rec = (id, extra = {}) => ({ id, name: `캠핑장${id}`, sido: "강원", sigungu: "평창군", ph: null, booking: { url: `https://example.com/${id}` }, seoul: [], ...extra });

test("캠핑장별로 펼치고, 국립 여부 미확인(IF_NATIONAL)·변형(VARIANT)은 넣지 않는다", () => {
  const guides = new Map([
    ["1", { platform: { name: "숲나들e", url: "https://www.foresttrip.go.kr/" }, next: [
      { at: "2026-10-14T09:00:00+09:00", label: "주중 선착순", time_known: true, rule_id: "w", stay: { from: "2026-11-23", to: "2026-11-29" }, source: { url: "https://src", tier: "A" }, needs_verification: false },
      { at: "2026-10-21T09:00:00+09:00", label: "주중 선착순", time_known: true, rule_id: "w", source: { tier: "A" } },
      { at: "2026-10-28T09:00:00+09:00", label: "주중 선착순", time_known: true, rule_id: "w", source: { tier: "A" } },
    ] }],
    ["2", { platform: { name: "숲나들e" }, next: [{ at: "2026-10-14T09:00:00+09:00", label: "주중", applies: "IF_NATIONAL", rule_id: "w" }] }],
  ]);
  const out = buildOpenings({ records: [rec("1"), rec("2")], guides, now });
  assert.equal(out.length, 2, "같은 규칙은 캠핑장당 2회까지");
  assert.deepEqual(out.map((o) => o.id), ["1", "1"]);
  assert.equal(out[0].platform, "숲나들e");
  assert.equal(out[0].stay, "11.23~11.29 숙박분");
  assert.equal(out[0].url, "https://example.com/1");
  assert.equal(out[0].unv, false);
});

test("기간 밖 일정은 빼고, 서울시 공공예약은 접수 시작·접수중 마감으로 넣는다", () => {
  const guides = new Map([["1", { platform: null, next: [{ at: "2027-03-01T10:00:00+09:00", label: "추첨 접수", rule_id: "l" }] }]]);
  const seoul = [
    { name: "난지 캠핑장 11월", status: "접수예정", from: "2026-10-20T10:00:00+09:00", to: "2026-10-22T18:00:00+09:00", url: "https://yeyak" },
    { name: "노을 캠핑장", status: "접수중", from: "2026-10-01T10:00:00+09:00", to: "2026-10-15T18:00:00+09:00", url: "https://yeyak2" },
  ];
  const out = buildOpenings({ records: [rec("1", { seoul })], guides, now });
  assert.deepEqual(out.map((o) => o.kind), ["접수 마감", "접수 시작"]);
  assert.ok(out.every((o) => o.platform === "서울시 공공서비스예약"));
});

test("추첨·잔여분 종류와 이용 기간 문구", () => {
  const guides = new Map([["1", { platform: null, next: [
    { at: "2026-10-15T09:00:00+09:00", label: "미결제분 선착순", rule_id: "r", needs_verification: true },
    { at: "2026-11-01T10:00:00+09:00", label: "국립공원 추첨 접수", rule_id: "k", stay: { month: "2027-01" } },
  ] }]]);
  const out = buildOpenings({ records: [rec("1")], guides, now });
  assert.deepEqual(out.map((o) => o.kind), ["잔여분 오픈", "추첨 접수"]);
  assert.equal(out[0].unv, true);
  assert.equal(out[1].stay, "2027년 1월 이용분");
  assert.equal(stayLabel({ from_month: "2026-12", to_month: "2027-01" }), "2026년 12월~1월 이용분");
  assert.equal(stayLabel({ date: "2026-11-02" }), "11.02 숙박분");
});
