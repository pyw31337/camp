import test from "node:test";
import assert from "node:assert/strict";
import { GridIndex, chargersOf, concentrationByDay, festivalOf, festivalsNear, landslideBySgg, landslideFor, ldongIndex, matchTourList, nearestCharger, petDetail, sigunguCode } from "../lib/trip-extras.mjs";

test("축제: 오늘~45일 사이에 걸치는 것만, 시작일 순으로 30km 안 3개", () => {
  const raw = [
    { contentid: 1, title: "가을 축제", mapy: "37.50", mapx: "127.50", eventstartdate: "20261024", eventenddate: "20261026" },
    { contentid: 2, title: "진행 중", mapy: "37.52", mapx: "127.52", eventstartdate: "20261001", eventenddate: "20261020" },
    { contentid: 3, title: "끝난 행사", mapy: "37.5", mapx: "127.5", eventstartdate: "20261001", eventenddate: "20261010" },
    { contentid: 4, title: "먼 미래", mapy: "37.5", mapx: "127.5", eventstartdate: "20261220", eventenddate: "20261221" },
    { contentid: 5, title: "멀리", mapy: "35.0", mapx: "129.0", eventstartdate: "20261024", eventenddate: "20261024" },
    { contentid: 6, title: "좌표 없음", mapy: "", mapx: "", eventstartdate: "20261024" },
  ];
  const fest = raw.map((it) => festivalOf(it, "2026-10-19")).filter(Boolean);
  assert.deepEqual(fest.map((f) => f.id), ["1", "2", "5"]);
  const near = festivalsNear({ lat: 37.5, lng: 127.5 }, new GridIndex(fest, 0.1));
  assert.deepEqual(near.map(([id]) => id), ["2", "1"]);
  assert.equal(near[1][1], 0);
});

test("충전소: OSM 추출본에서 가장 가까운 곳과 5km 안 개수", () => {
  const pts = chargersOf([
    { lat: 37.501, lon: 127.5, tags: { amenity: "charging_station", operator: "환경부" } },
    { lat: 37.53, lon: 127.5, tags: { amenity: "charging_station" } },
    { lat: 37.6, lon: 127.5, tags: { amenity: "fuel" } },
  ]);
  assert.equal(pts.length, 2);
  const [name, km, c5] = nearestCharger({ lat: 37.5, lng: 127.5 }, new GridIndex(pts, 0.05));
  assert.equal(name, "환경부"); assert.equal(km, 0.1); assert.equal(c5, 2);
  assert.equal(nearestCharger({ lat: 35, lng: 129 }, new GridIndex(pts, 0.05)), null);
});

test("반려동물·무장애 목록 연결: 300m 안 이름 겹침 또는 50m 안", () => {
  const idx = new GridIndex([{ id: "9", title: "솔밭 오토캠핑장", lat: 37.5015, lng: 127.5 }, { id: "8", title: "다른 펜션", lat: 37.5001, lng: 127.5 }], 0.01);
  assert.equal(matchTourList({ name: "솔밭캠핑장", lat: 37.5, lng: 127.5 }, idx).id, "8"); // 50m 안이 먼저
  const idx2 = new GridIndex([{ id: "9", title: "솔밭 오토캠핑장", lat: 37.5015, lng: 127.5 }, { id: "7", title: "다른 곳", lat: 37.502, lng: 127.5 }], 0.01);
  assert.equal(matchTourList({ name: "솔밭캠핑장", lat: 37.5, lng: 127.5 }, idx2).id, "9");
  assert.equal(matchTourList({ name: "바다캠핑장", lat: 37.5, lng: 127.5 }, idx2), null);
  assert.deepEqual(petDetail({ acmpyPsblCpam: "소형견<br>중형견", acmpyNeedMtr: "", contentid: 1 }), { "동반 가능 동물": "소형견 중형견" });
});

test("법정동 시군구 코드·집중률·산사태", () => {
  const idx = ldongIndex([{ lDongRegnCd: "51", lDongRegnNm: "강원특별자치도", lDongSignguCd: "130", lDongSignguNm: "원주시" },
    { lDongRegnCd: "43", lDongRegnNm: "충청북도", lDongSignguCd: "111", lDongSignguNm: "청주시 상당구" }]);
  assert.equal(sigunguCode({ sido: "강원특별자치도", sigungu: "원주시" }, idx), "51130");
  assert.equal(sigunguCode({ sido: "충청북도", sigungu: "청주시" }, idx), "43111");
  assert.deepEqual(concentrationByDay([{ baseYmd: "20261024", cnctrRate: "20" }, { baseYmd: "20261024", cnctrRate: "41" }, { baseYmd: "20261025", cnctrRate: "x" }]), { "2026-10-24": 31 });
  const now = Date.parse("2026-10-19T12:00:00+09:00");
  const by = landslideBySgg([{ sgg: "경상북도 안동시", lndslFrcstNm: "주의보", prctnInfoAnlssDt: "2026-10-19 09:00:00" },
    { sgg: "경상북도 안동시", lndslFrcstNm: "경 보", prctnInfoAnlssDt: "2026-10-19 11:00:00" },
    { sgg: "충청남도 서산시", lndslFrcstNm: "주의보", prctnInfoAnlssDt: "2026-10-18 09:00:00" }], now);
  assert.deepEqual(Object.keys(by), ["경상북도 안동시"]);
  assert.equal(by["경상북도 안동시"].level, "경보");
  assert.equal(landslideFor(by, "경북", "안동시").level, "경보");
  assert.equal(landslideFor(by, "충남", "서산시"), null);
});

test("여행 참고 정보 카드: 있는 항목만 행으로", async () => {
  const { rowsFor } = await import("../../camping-atlas/public/context/card.js");
  const data = { weekend: { sat: "2026-10-24", sun: "2026-10-25" }, sources: { ev: { name: "OpenStreetMap 충전소" } },
    fest: { 1: { t: "가을 <축제>", s: "2026-10-24", e: "2026-10-26" } },
    camps: { 10: { el: 488, ev: ["충전소", 2.3, 3], fe: [["1", 4.2]], cr: { "2026-10-24": 42 } }, 11: { el: 3 } } };
  const r = rowsFor(data, "10");
  assert.deepEqual(r.map((x) => x.k), ["고도", "전기차 충전", "주변 축제·행사", "주말 관광지 붐빔"]);
  assert.match(r[0].v, /해발 약 488m.*약 3℃ 낮은/);
  assert.match(r[1].v, /2\.3km \(충전소\) · 5km 안 3곳.*OSM/);
  assert.match(r[2].v, /가을 &lt;축제&gt;.*10\/24\(토\)~10\/26\(월\) · 4\.2km/);
  assert.match(r[3].v, /토 42/);
  assert.match(rowsFor(data, "11")[0].v, /해안가 저지대/);
  assert.deepEqual(rowsFor(data, "12"), []);
});
