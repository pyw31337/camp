import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { toKmaGrid } from "../lib/kma-grid.mjs";
import { moonPhase, sunTimes } from "../lib/astro.mjs";
import { airGrade, apiProblem, mapCampground, midLandOf, midTmFc, shortBase, summarizeAir, summarizeMid, summarizeShort, summarizeTide, upcomingWeekend } from "../lib/conditions.mjs";

test("기상청 격자 변환: 활용가이드 예시 지점", () => {
  assert.deepEqual(toKmaGrid(37.5665, 126.978), { nx: 60, ny: 127 }); // 서울 중구
  assert.deepEqual(toKmaGrid(35.1796, 129.0756), { nx: 98, ny: 76 }); // 부산
  assert.equal(toKmaGrid(10, 100), null);
});

test("일출·일몰: 서울 하지·동지가 천문연구원 발표값과 2분 이내", () => {
  const near = (a, b) => Math.abs((+a.slice(0, 2) * 60 + +a.slice(3)) - (+b.slice(0, 2) * 60 + +b.slice(3))) <= 2;
  const s = sunTimes("2026-06-21", 37.5665, 126.978), w = sunTimes("2026-12-22", 37.5665, 126.978);
  assert.ok(near(s.sunrise, "05:11") && near(s.sunset, "19:57"), JSON.stringify(s));
  assert.ok(near(w.sunrise, "07:43") && near(w.sunset, "17:17"), JSON.stringify(w));
  assert.equal(moonPhase("2026-10-26").label, "보름");
  assert.equal(moonPhase("2026-11-09").dark_sky, true);
});

test("화면용 astro.js는 파이프라인 astro.mjs와 같은 파일이다", () => {
  const a = readFileSync(new URL("../lib/astro.mjs", import.meta.url), "utf8");
  const b = readFileSync(new URL("../../camping-atlas/public/conditions/astro.js", import.meta.url), "utf8");
  assert.equal(a, b);
});

test("발표 시각·다가오는 주말", () => {
  const t = Date.parse("2026-10-21T20:41:00Z"); // 10/22(목) 05:41 KST
  assert.deepEqual(shortBase(t), { base_date: "20261022", base_time: "0500" });
  assert.deepEqual(shortBase(Date.parse("2026-10-21T16:00:00Z")), { base_date: "20261021", base_time: "2300" }); // 01:00 KST
  assert.equal(midTmFc(t), "202610211800");
  assert.deepEqual(upcomingWeekend(t), { sat: "2026-10-24", sun: "2026-10-25", days_ahead: 2 });
  assert.equal(upcomingWeekend(Date.parse("2026-10-25T03:00:00Z")).sat, "2026-10-24"); // 일요일엔 이번 주말
});

test("대응표: 강원 영동·영서 구분, 측정소·조석 지점은 거리 안에서만", () => {
  assert.equal(midLandOf("강원특별자치도", "속초시"), "11D20000");
  assert.equal(midLandOf("강원특별자치도", "홍천군"), "11D10000");
  assert.equal(midLandOf("전북특별자치도", "무주군"), "11F10000");
  const m = mapCampground({ lat: 37.75, lng: 128.9, sido: "강원특별자치도", sigungu: "강릉시" },
    { airStations: [{ name: "옥천동", lat: 37.76, lng: 128.9 }], tideStations: [{ code: "DT_0099", lat: 35, lng: 129 }] });
  assert.equal(m.ta, "11D20501");
  assert.equal(m.air, "옥천동");
  assert.equal(m.tide, undefined);
});

test("응답 정리: 단기·중기·미세먼지·물때·오류 판별", () => {
  const it = (category, fcstTime, fcstValue) => ({ category, fcstDate: "20261024", fcstTime, fcstValue });
  const d = summarizeShort([it("TMN", "0600", "8.0"), it("TMX", "1500", "19.0"), it("POP", "0900", "20"), it("POP", "1500", "60"), it("SKY", "0900", "1"), it("SKY", "1200", "4"), it("SKY", "1500", "4"), it("PTY", "1500", "1"), it("WSD", "1500", "5.1")])["2026-10-24"];
  assert.deepEqual(d, { tmin: 8, tmax: 19, pop: 60, sky: "흐림", pty: "비", wsd: 5.1 });
  const mid = summarizeMid({ wf5Am: "맑음", wf5Pm: "구름많음", rnSt5Am: 10, rnSt5Pm: 30 }, { taMin5: 7, taMax5: 18 }, "202610190600");
  assert.deepEqual(mid["2026-10-24"], { sky: "구름많음", sky_am: "맑음", sky_pm: "구름많음", pop: 30, tmin: 7, tmax: 18 });
  assert.equal(airGrade(45, 40), 3);
  assert.deepEqual(summarizeAir([{ stationName: "A", pm10Value: "20", pm25Value: "-", dataTime: "2026-10-19 13:00" }]).A, { pm10: 20, pm25: null, grade: 1, at: "2026-10-19 13:00", sido: null });
  assert.deepEqual(summarizeTide([{ predcDt: "2026-10-24 04:12", extrSe: "1", predcTdlvVl: "612" }, { predcDt: "2026-10-24 10:30", extrSe: "2", predcTdlvVl: "80" }]),
    [{ t: "04:12", type: "고조", h: 612 }, { t: "10:30", type: "저조", h: 80 }]);
  assert.equal(apiProblem(200, "<OpenAPI_ServiceResponse><returnAuthMsg>SERVICE_KEY_IS_NOT_REGISTERED_ERROR</returnAuthMsg>"), "NOT_REGISTERED");
  assert.equal(apiProblem(200, '{"response":{"header":{"resultCode":"00"}}}'), null);
  assert.equal(apiProblem(200, '{"response":{"header":{"resultCode":"03","resultMsg":"NO_DATA"}}}'), null);
});

test("주간 날씨 카드: 단기만 있을 때·중기까지 있을 때 문구와 주말 표시", async () => {
  const base = { generated_at: "2026-10-21T20:41:00Z", today: "2026-10-22", camps: { 9: ["93,131", "11D20000", "11D20501", "d:강원", 0] },
    short: { grids: { "93,131": { "2026-10-22": ["맑음", null, 8, 19, 10, 2], "2026-10-23": ["흐림", "비", 9, 15, 70, 6], "2026-10-24": ["구름많음", null, 7, 17, 20, 3], "2026-10-25": ["맑음", null, 5, 18, 0, 2] } } },
    air: { "d:강원": { pm10: 20, pm25: 9, grade: 1, stations: 39 } } };
  let payload = base;
  globalThis.fetch = async () => ({ ok: true, json: async () => payload });
  const { mount, daysFor } = await import("../../camping-atlas/public/conditions/card.js");
  assert.equal(daysFor(base, "9", "2026-10-22").length, 4);
  const el = { hidden: true, innerHTML: "" };
  await mount(el, { id: "9", lat: 37.75, lng: 128.9 });
  assert.equal(el.hidden, false);
  assert.match(el.innerHTML, /오늘부터 4일 예보예요/);
  assert.match(el.innerHTML, /이번 주말/);
  assert.match(el.innerHTML, /일출 \d\d:\d\d/);
  assert.match(el.innerHTML, /강원 측정소 39곳 중앙값/);
  const withMid = { ...base, mid: { land: { "11D20000": { "2026-10-26": ["맑음", "구름많음", 20], "2026-11-01": ["흐림", "비", 60] } }, ta: { "11D20501": { "2026-10-26": [6, 17], "2026-11-01": [4, 12] } } } };
  const ds = daysFor(withMid, "9", "2026-10-22");
  assert.deepEqual(ds.map((x) => x.src), ["short", "short", "short", "short", "mid", "mid"]);
  assert.equal(ds[5].sky, "비");
});

test("단기예보 끝자락(자정 한두 시간만 있는 날)은 하루 요약에서 뺀다", () => {
  const it = (fcstDate, fcstTime, category, fcstValue) => ({ fcstDate, fcstTime, category, fcstValue });
  const days = summarizeShort([
    it("20261022", "0600", "TMN", "4"), it("20261022", "1500", "TMX", "17"), it("20261022", "1200", "SKY", "1"), it("20261022", "1200", "TMP", "15"),
    it("20261023", "0000", "TMP", "5"), it("20261023", "0000", "POP", "0"),
  ]);
  assert.deepEqual(Object.keys(days), ["2026-10-22"]);
  assert.equal(days["2026-10-22"].sky, "맑음");
});

test("물때: 구분 코드와 무관하게 이웃 극치 높이로 고조·저조를 정한다", () => {
  const rows = summarizeTide([
    { predcDt: "2026-10-24 10:30", extrSe: "1", predcTdlvVl: "80" },
    { predcDt: "2026-10-24 04:12", extrSe: "2", predcTdlvVl: "612" },
    { predcDt: "2026-10-24 16:40", extrSe: "3", predcTdlvVl: "640" },
  ]);
  assert.deepEqual(rows.map((r) => [r.t, r.type]), [["04:12", "고조"], ["10:30", "저조"], ["16:40", "고조"]]);
});
