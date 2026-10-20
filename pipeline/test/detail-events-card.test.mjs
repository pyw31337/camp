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

test("축제 범위: 5km·7일부터, 결과가 없을 때만 10km·10일 → 20km·30일 → 30km·45일로 넓힌다", async () => {
  const { autoRange, inRange, eventsFor } = await import("../../camping-atlas/public/context/events.js");
  const ev = (s, e) => ({ t: "x", s, e, k: "축제" });
  const mk = (rows) => eventsFor({ camps: { 1: rows.map(([id, km]) => [id, km]) }, ev: Object.fromEntries(rows.map(([id, , s, e]) => [id, ev(s, e)])) }, "1", "2026-10-20");
  // 3km에 진행 중 → 5km·7일
  assert.deepEqual(autoRange(mk([["a", 3, "2026-10-01", "2026-10-30"]]), "2026-10-20"), [5, 7]);
  // 3km에 예정 행사가 하나라도 있으면 기본 5km·7일을 그대로 쓴다.
  assert.deepEqual(autoRange(mk([["a", 3, "2026-10-25", "2026-10-25"], ["b", 8, "2026-10-01", "2026-10-30"]]), "2026-10-20"), [5, 7]);
  // 20km 안 30일째 행사는 세 번째 범위에서 처음 보인다.
  assert.deepEqual(autoRange(mk([["a", 18, "2026-11-17", "2026-11-18"]]), "2026-10-20"), [20, 30]);
  // 그보다 멀고 늦은 행사는 최종 범위로 넓힌다.
  assert.deepEqual(autoRange(mk([["a", 25, "2026-11-20", "2026-11-21"]]), "2026-10-20"), [30, 45]);
  assert.equal(inRange(mk([["a", 3, "2026-10-29", "2026-10-29"]]), 5, 7, "2026-10-20").length, 0, "7일 뒤 시작은 7일 범위 밖");
});

test("주변 축제·행사 카드 정렬: 가장 가까운 거리(최단 거리) 순으로 맨 상단 맨 좌측(첫 카드)에 배열된다", async () => {
  const { render } = await import("../../camping-atlas/public/context/events.js");
  const ev = (t, s) => ({ t, s, e: "2026-10-30", k: "축제", u: "https://example.org/" });
  // 캠핑장 데이터: 원본 순서가 14.2km, 25km, 10.9km일 때
  const data = {
    camps: { 99: [["far", 25.0], ["mid", 14.2], ["near", 10.9]] },
    ev: { far: ev("먼 행사", "2026-10-20"), mid: ev("중간 행사", "2026-10-20"), near: ev("가장 가까운 행사", "2026-10-20") },
  };
  const html = render(data, "99", "2026-10-20");
  const firstCardTitle = html.match(/<h3>([^<]+)<\/h3>/)?.[1];
  assert.equal(firstCardTitle, "가장 가까운 행사", "가장 가까운 거리의 행사가 맨 처음(상단 좌측)에 위치해야 함");
});
