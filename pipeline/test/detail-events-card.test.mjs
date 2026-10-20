import test from "node:test";
import assert from "node:assert/strict";

test("축제 카드: 캠핑장에서 거리(850m · 12.3km)를 보이고 카드별 출처 줄은 없다", async () => {
  globalThis.fetch ??= async () => ({ ok: false });
  const { render } = await import("../../camping-atlas/public/context/events.js");
  const ev = (t) => ({ t, s: "2026-10-20", e: "2026-10-30", k: "축제", src: "TourAPI", u: "https://example.org/x", a: "경기도 가평군" });
  const data = { camps: { 7: [["a", 0.85], ["b", 12.34]] }, ev: { a: ev("가 축제"), b: ev("나 축제") }, sources: {} };
  const html = render(data, "7", "2026-10-19");
  assert.match(html, /캠핑장에서 850m/);
  assert.match(html, /캠핑장에서 12\.3km/);
  assert.doesNotMatch(html, /정보·포스터/);
  assert.doesNotMatch(html, /ev-foot/, "칸 아래 출처 문구는 두지 않는다(소유자 2026-10-20)");
  assert.doesNotMatch(html, /자세히 보기/, "카드 전체가 링크라 ‘자세히 보기’ 버튼이 없다");
  assert.match(html, /class="ev-hit" href="https:\/\/example\.org\/x"/);
  assert.match(html, /class="ev-map"/, "지도는 종류 줄 오른쪽 아이콘");
});

test("축제 범위: 5km·7일부터, 진행 중이 없으면 10km·10일 → 20km·20일 → 30km·45일로 넓힌다", async () => {
  const { autoRange, inRange, eventsFor } = await import("../../camping-atlas/public/context/events.js");
  const ev = (s, e) => ({ t: "x", s, e, k: "축제" });
  const mk = (rows) => eventsFor({ camps: { 1: rows.map(([id, km]) => [id, km]) }, ev: Object.fromEntries(rows.map(([id, , s, e]) => [id, ev(s, e)])) }, "1", "2026-10-20");
  // 3km에 진행 중 → 5km·7일
  assert.deepEqual(autoRange(mk([["a", 3, "2026-10-01", "2026-10-30"]]), "2026-10-20"), [5, 7]);
  // 3km는 예정뿐, 8km에 진행 중 → 10km·10일
  assert.deepEqual(autoRange(mk([["a", 3, "2026-10-25", "2026-10-25"], ["b", 8, "2026-10-01", "2026-10-30"]]), "2026-10-20"), [10, 10]);
  // 진행 중이 아예 없으면 행사가 있는 가장 좁은 단계
  assert.deepEqual(autoRange(mk([["a", 25, "2026-11-20", "2026-11-21"]]), "2026-10-20"), [30, 45]);
  assert.equal(inRange(mk([["a", 3, "2026-10-29", "2026-10-29"]]), 5, 7, "2026-10-20").length, 0, "7일 뒤 시작은 7일 범위 밖");
});
