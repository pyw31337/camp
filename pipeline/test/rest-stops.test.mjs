import assert from "node:assert/strict";
import test from "node:test";
import { enrichWithNearby, mergeStops, normalizeDrowsyShelter, normalizeOsmStop } from "../lib/rest-stops.mjs";
import { stopsAlongRoute, suggestBreaks } from "../lib/route-stops.mjs";

test("OSM 휴게소·졸음쉼터 정규화와 유·무료 기본값", () => {
  const s = normalizeOsmStop({ type: "way", id: 1, center: { lat: 37.2, lon: 127.1 }, tags: { highway: "services", name: "기흥휴게소(부산방향)", ref: "1", fuel: "yes", shower: "yes", "shower:fee": "no" } });
  assert.equal(s.kind, "SERVICE_AREA");
  assert.equal(s.direction, "부산방향");
  assert.deepEqual(s.facilities.toilet, { available: true, fee: "FREE" });
  assert.deepEqual(s.facilities.fuel, { available: true, fee: "PAID" });
  assert.deepEqual(s.facilities.shower, { available: true, fee: "FREE" });
  assert.equal(s.facilities.ev_charging.available, null);
  const r = normalizeOsmStop({ type: "node", id: 2, lat: 36.5, lon: 127.5, tags: { highway: "rest_area", name: "옥천졸음쉼터", toilets: "yes" } });
  assert.equal(r.kind, "DROWSY_SHELTER");
  assert.equal(normalizeOsmStop({ type: "node", id: 3, lat: 35.6, lon: 139.7, tags: { highway: "services" } }), null);
});

test("전기차 충전: socket 태그만 있어도 있음, charging_station=no면 없음", () => {
  const a = normalizeOsmStop({ type: "node", id: 4, lat: 37, lon: 127, tags: { highway: "services", "socket:type2": "2" } });
  const b = normalizeOsmStop({ type: "node", id: 5, lat: 37, lon: 127, tags: { highway: "services", charging_station: "no" } });
  assert.equal(a.facilities.ev_charging.available, true);
  assert.equal(b.facilities.ev_charging.available, false);
});

test("휴게소 300m 안의 주유소·충전소로 시설 보강", () => {
  const [s] = enrichWithNearby([normalizeOsmStop({ type: "node", id: 6, lat: 37, lon: 127, tags: { highway: "services" } })], [{ lat: 37.001, lon: 127, lng: 127, kind: "fuel" }, { lat: 37.0015, lng: 127, kind: "charging" }]);
  assert.equal(s.facilities.fuel.available, true);
  assert.equal(s.facilities.ev_charging.available, true);
});

test("졸음쉼터 표준데이터: 한글·영문 키 모두, 무료", () => {
  const a = normalizeDrowsyShelter({ "졸음쉼터명": "칠곡졸음쉼터", "위도": "35.99", "경도": "128.4", "화장실유무": "Y", "주차면수": "20", "도로노선명": "경부선", "도로노선방향": "서울방향", "기타편의시설": "자판기" });
  assert.equal(a.kind, "DROWSY_SHELTER");
  assert.deepEqual(a.facilities.toilet, { available: true, fee: "FREE" });
  assert.equal(a.facilities.convenience.available, true);
  assert.equal(a.parking_spaces, 20);
  assert.ok(normalizeDrowsyShelter({ drowsyShelterNm: "x", latitude: "36", longitude: "127" }));
  assert.equal(normalizeDrowsyShelter({ "졸음쉼터명": "좌표 없음" }), null);
});

test("공식과 150m 안에서 겹치는 OSM 쉼터는 버린다", () => {
  const off = [{ id: "a", kind: "DROWSY_SHELTER", lat: 36, lng: 127 }];
  const osm = [{ id: "o1", kind: "DROWSY_SHELTER", lat: 36.0005, lng: 127 }, { id: "o2", kind: "SERVICE_AREA", lat: 36.2, lng: 127 }];
  const r = mergeStops(off, osm);
  assert.deepEqual(r.merged.map((s) => s.id), ["a", "o2"]);
});

test("경로 주변 시설을 출발지부터 거리순으로", () => {
  // 위도 방향 직선 경로 약 111km
  const path = [[36.0, 127.0], [36.5, 127.0], [37.0, 127.0]];
  const stops = [
    { id: "far", kind: "SERVICE_AREA", lat: 36.6, lng: 127.05 },   // 약 4.5km 옆 → 제외
    { id: "s2", kind: "SERVICE_AREA", lat: 36.8, lng: 127.002 },   // 89km 지점, 180m 옆
    { id: "s1", kind: "DROWSY_SHELTER", lat: 36.2, lng: 126.999 }, // 22km 지점
  ];
  const r = stopsAlongRoute(path, stops, { bufferM: 400 });
  assert.deepEqual(r.map((x) => x.stop.id), ["s1", "s2"]);
  assert.ok(Math.abs(r[0].along_km - 22.3) < 0.5);
  assert.ok(r[1].offset_m < 250);
  assert.deepEqual(stopsAlongRoute([[36, 127]], stops), []);
});

test("약 2시간(120km)마다 쉬어 갈 곳 제안", () => {
  const along = [10, 115, 130, 240, 300].map((k, i) => ({ stop: { id: `s${i}`, kind: "SERVICE_AREA" }, along_km: k }));
  const marks = suggestBreaks(along, 320);
  assert.deepEqual(marks.map((m) => m.along_km), [115, 240]);
});

test("한국도로공사 휴게소: 좌표·편의시설은 코드로, 주유소는 이름으로 묶고 가격을 숫자로", async () => {
  const { buildExServiceAreas } = await import("../lib/ex-rest-areas.mjs");
  const [a, b] = buildExServiceAreas({
    location: [
      { unitName: "기흥(부산)휴게소", routeName: "경부선", xValue: "127.12", yValue: "37.25", serviceAreaCode: "A00002" },
      { unitName: "목록없음휴게소", routeName: "중부선", xValue: "127.3", yValue: "37.1", serviceAreaCode: "A99999" },
    ],
    convenience: [{ serviceAreaCode: "A00002", convenience: "수유실|샤워실|농산물판매장", truckSaYn: "O", maintenanceYn: "X", telNo: "031" }],
    fuel: [{ serviceAreaName: "기흥(부산)주유소", oilCompany: "AD", lpgYn: "N", gasolinePrice: "1,839원", diselPrice: "1,836원", lpgPrice: "X원" }],
    checkedAt: "2026-10-13T09:00:00+09:00",
  });
  assert.equal(a.direction, "부산");
  assert.deepEqual(a.facilities.nursing, { available: true, fee: "FREE" });
  assert.deepEqual(a.facilities.shower, { available: true, fee: null });
  assert.equal(a.facilities.laundry.available, false);
  assert.deepEqual(a.extras, ["농산물판매장"]);
  assert.equal(a.truck_rest, true);
  assert.deepEqual(a.fuel.prices_krw_per_l, { gasoline: 1839, diesel: 1836, lpg: null });
  assert.equal(a.fuel.brand, "알뜰주유소");
  assert.equal(a.fuel.checked_at, "2026-10-13T09:00:00+09:00");
  assert.equal(b.facilities.nursing.available, null, "편의시설 목록이 없으면 모름");
  assert.equal(b.fuel, null);
});

test("한국도로공사 API: 오류 페이지(HTML)를 주는 쪽은 9건씩 다시 받고 실패분만 건너뛴다", async () => {
  const { fetchExAll } = await import("../lib/ex-rest-areas.mjs");
  const rows = Array.from({ length: 120 }, (_, i) => ({ i }));
  const fetchImpl = async (url) => {
    const u = new URL(url);
    const size = Number(u.searchParams.get("numOfRows")), page = Number(u.searchParams.get("pageNo"));
    const from = (page - 1) * size, slice = rows.slice(from, from + size);
    const bad = slice.some((r) => r.i === 105); // 105번 행이 서버 오류를 일으킨다고 가정
    return { status: 200, text: async () => bad ? "<!DOCTYPE html><html>" : JSON.stringify({ code: "SUCCESS", count: 120, pageSize: Math.ceil(120 / size), list: slice }) };
  };
  const got = await fetchExAll("x", "test", { fetchImpl, pause: 0 });
  assert.equal(got.length, 111);
  assert.equal(got.skipped, 9);
  assert.ok(!got.some((r) => r.i === 105));
});
