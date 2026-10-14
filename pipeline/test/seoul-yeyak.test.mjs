import assert from "node:assert/strict";
import test from "node:test";
import { fetchSeoulService, isCampingService, matchSeoulToCampgrounds, normalizeSeoulService, seoulTime } from "../lib/seoul-yeyak.mjs";

const row = { SVCID: "S240101000000000001", SVCNM: "난지캠핑장 일반캠핑 11월", MAXCLASSNM: "시설대관", MINCLASSNM: "캠핑장", SVCSTATNM: "접수중", PLACENM: "난지캠핑장",
  AREANM: "마포구", X: "126.8778", Y: "37.5680", RCPTBGNDT: "2026-10-01 10:00:00.0", RCPTENDDT: "2026-10-31 18:00:00.0", SVCURL: "", REVSTDDAYNM: "이용일", REVSTDDAY: "1" };

test("서울 공공예약: 캠핑 상품 판별·정규화(시각·좌표·예약 링크)", () => {
  assert.equal(isCampingService(row), true);
  assert.equal(isCampingService({ MINCLASSNM: "테니스장", SVCNM: "테니스" }), false);
  assert.equal(isCampingService({ MINCLASSNM: "숲체험", SVCNM: "(화,수)신나는 유아 숲체험", PLACENM: "중랑캠핑숲" }), false);
  assert.equal(isCampingService({ MINCLASSNM: "공원탐방", SVCNM: "중랑캠핑숲 오감체험", PLACENM: "중랑캠핑숲" }), false);
  assert.equal(isCampingService({ MINCLASSNM: "캠핑장", SVCNM: "난지 성인야구장 2(캠핑장옆)" }), false);
  assert.equal(isCampingService({ MINCLASSNM: "캠핑장", SVCNM: "난지캠핑장 바비큐존(4인용)" }), false);
  assert.equal(isCampingService({ MINCLASSNM: "캠핑장", SVCNM: "가족캠핑장 11월 예약", PLACENM: "중랑캠핑숲" }), true);
  assert.equal(seoulTime("2026-10-01 10:00:00.0"), "2026-10-01T10:00:00+09:00");
  const s = normalizeSeoulService(row, "2026-10-13T00:00:00Z");
  assert.equal(s.status, "접수중");
  assert.equal(s.lat, 37.568);
  assert.equal(s.receipt.to, "2026-10-31T18:00:00+09:00");
  assert.match(s.url, /rsv_svc_id=S240101000000000001$/);
  assert.equal(s.cancel_rule, "이용일 1일 전");
  assert.equal(normalizeSeoulService({ ...row, X: "37.5680", Y: "126.8778" }).lng, 126.8778);
});

test("서울 공공예약: 2km 안 이름이 비슷한 캠핑장에 연결", () => {
  const s = normalizeSeoulService(row, "t");
  const camps = [
    { external_id: { id: "1" }, name: "난지캠핑장", location: { lat: 37.5684, lng: 126.8771 } },
    { external_id: { id: "2" }, name: "다른 캠핑장", location: { lat: 37.5681, lng: 126.8779 } },
    { external_id: { id: "3" }, name: "난지캠핑장", location: { lat: 35.1, lng: 129.0 } },
  ];
  const m = matchSeoulToCampgrounds([s], camps);
  assert.deepEqual([...m.keys()], ["1"]);
});

test("서울 공공예약: 페이지 수신과 오류 코드", async () => {
  const pages = [{ tvYeyakCOllect: { list_total_count: 2, RESULT: { CODE: "INFO-000" }, row: [row, row] } }];
  const fetchImpl = async () => ({ status: 200, text: async () => JSON.stringify(pages.shift() ?? { RESULT: { CODE: "INFO-200" } }) });
  const { rows, total } = await fetchSeoulService("k", "tvYeyakCOllect", { fetchImpl, wait: async () => {} });
  assert.equal(rows.length, 2); assert.equal(total, 2);
  const bad = async () => ({ status: 200, text: async () => JSON.stringify({ RESULT: { CODE: "INFO-100", MESSAGE: "인증키가 유효하지 않습니다." } }) });
  await assert.rejects(fetchSeoulService("k", "tvYeyakCOllect", { fetchImpl: bad, wait: async () => {} }), /INFO-100/);
});
