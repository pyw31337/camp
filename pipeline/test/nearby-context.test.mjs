import assert from "node:assert/strict";
import test from "node:test";
import {
  buildTiles, computeNearby, dedupeById, isStale, normalizeOsmShop, normalizeRestStop, normalizeTourPoi,
  osmKind, overpassShopQuery, parseTourBody, tourListUrl,
} from "../lib/nearby-context.mjs";

// 기준 캠핑장: 가평 근처(37.80, 127.50). 위도 0.01° ≈ 1.11km.
const CAMP = { external_id: { id: "100" }, name: "테스트 캠핑장", location: { lat: 37.8, lng: 127.5 } };
const tour = (id, type, dLat, extra = {}) => ({ id, type, title: `T${id}`, addr: "경기 가평군", lat: 37.8 + dLat, lng: 127.5, image: null, tel: null, cat3: null, ...extra });
const osm = (id, kind, dLat, extra = {}) => ({ id: `osm-node-${id}`, kind, name: `${kind}${id}`, lat: 37.8 + dLat, lng: 127.5, ...extra });

test("TourAPI 목록 URL과 응답 파싱·정규화", () => {
  const url = tourListUrl("12", 3);
  assert.match(url, /^https:\/\/apis\.data\.go\.kr\/B551011\/KorService2\/areaBasedList2\?/);
  assert.match(url, /contentTypeId=12/);
  assert.match(url, /numOfRows=1000/);
  assert.match(url, /pageNo=3/);
  assert.doesNotMatch(url, /serviceKey/);

  const body = JSON.stringify({ response: { header: { resultCode: "0000" }, body: { totalCount: 2, items: { item: { contentid: 7, contenttypeid: "12", title: "남이섬", addr1: "강원 춘천시", addr2: "남산면", mapx: "127.5255", mapy: "37.7913", firstimage: "http://tong.visitkorea.or.kr/a.jpg", tel: "031-000", cat3: "A01010500" } } } } });
  const { items, total } = parseTourBody(body);
  assert.equal(total, 2);
  assert.equal(items.length, 1);
  const p = normalizeTourPoi(items[0]);
  assert.deepEqual(p, { id: "7", type: "12", title: "남이섬", addr: "강원 춘천시 남산면", lat: 37.7913, lng: 127.5255, image: "http://tong.visitkorea.or.kr/a.jpg", tel: "031-000", cat3: "A01010500" });
  assert.equal(normalizeTourPoi({ contentid: 1, mapx: "0", mapy: "0" }), null);
  assert.throws(() => parseTourBody("<OpenAPI_ServiceResponse>LIMITED_NUMBER_OF_SERVICE_REQUESTS_EXCEEDS_ERROR</OpenAPI_ServiceResponse>", 200), /LIMITED_NUMBER/);
  assert.throws(() => parseTourBody(JSON.stringify({ response: { header: { resultCode: "30", resultMsg: "SERVICE_KEY_IS_NOT_REGISTERED_ERROR" } } })), /SERVICE_KEY/);
});

test("OSM 분류·정규화(중심 좌표, 응급실, 국외 제외)와 중복 제거", () => {
  assert.equal(osmKind({ shop: "convenience" }), "convenience");
  assert.equal(osmKind({ amenity: "fuel", shop: "convenience" }), "fuel");
  assert.equal(osmKind({ shop: "bakery" }), null);
  const h = normalizeOsmShop({ type: "way", id: 9, center: { lat: 37.81, lon: 127.51 }, tags: { amenity: "hospital", name: "가평병원", emergency: "yes" } });
  assert.deepEqual(h, { id: "osm-way-9", kind: "hospital", name: "가평병원", lat: 37.81, lng: 127.51, emergency: true });
  const c = normalizeOsmShop({ type: "node", id: 1, lat: 37.8, lon: 127.5, tags: { shop: "convenience", brand: "GS25", opening_hours: "24/7" } });
  assert.equal(c.name, "GS25");
  assert.equal(c.brand, "GS25");
  assert.equal(c.hours, "24/7");
  assert.equal(normalizeOsmShop({ type: "node", id: 2, lat: 35.6, lon: 139.7, tags: { shop: "supermarket" } }), null);
  assert.equal(dedupeById([c, { ...c }, null, h]).length, 2);
});

test("Overpass 타일: 캠핑장 근처 타일만, 쿼리에 범위·태그 포함", () => {
  const all = buildTiles({ bbox: [37, 127, 38, 128], step: 0.5 });
  assert.equal(all.length, 4);
  const near = buildTiles({ bbox: [33, 124.5, 38.7, 131], step: 0.5, points: [{ lat: 37.8, lng: 127.5 }], marginDeg: 0.25 });
  assert.ok(near.length >= 1 && near.length <= 9, `타일 ${near.length}`);
  assert.ok(near.every((t) => t.bbox[0] <= 38.05 && t.bbox[2] >= 37.55));
  const q = overpassShopQuery([37.5, 127, 38, 127.5], 60);
  assert.match(q, /\[timeout:60\]/);
  assert.match(q, /\(37\.5,127,38,127\.5\)/);
  assert.match(q, /supermarket\|convenience/);
  assert.match(q, /fuel\|pharmacy\|hospital/);
  assert.match(q, /out center tags;$/);
});

test("휴게소 정규화와 캐시 만료", () => {
  assert.deepEqual(normalizeRestStop({ id: "drowsy-1", kind: "DROWSY_SHELTER", name: "A쉼터", lat: 37.9, lng: 127.5, road: "46번", facilities: {} }), { id: "drowsy-1", kind: "DROWSY_SHELTER", name: "A쉼터", lat: 37.9, lng: 127.5, road: "46번" });
  assert.equal(normalizeRestStop({ id: "x", lat: null, lng: null }), null);
  const now = Date.parse("2026-10-13T00:00:00+09:00");
  assert.equal(isStale("2026-10-10T00:00:00+09:00", 7, now), false);
  assert.equal(isStale("2026-10-01T00:00:00+09:00", 7, now), true);
  assert.equal(isStale(undefined, 7, now), true);
});

test("캠핑장별 주변 계산: 반경·개수·우선순위·출처", () => {
  const pois = {
    tour: [
      tour("1", "12", 0.01), tour("2", "14", 0.02), tour("3", "28", 0.03), tour("4", "12", 0.05),
      tour("5", "12", 0.25), // 27.8km — 20km 밖
      tour("6", "28", 0.005, { cat3: "A03021700" }), // 야영장은 제외
      tour("7", "12", 0.06, { image: "https://img/7.jpg" }), // 6.7km × 0.8 = 5.3km로 4번(5.6km)보다 앞
      tour("8", "38", 0.04), // 쇼핑: 관광지가 모자랄 때만
      tour("20", "39", 0.01), tour("21", "39", 0.02), tour("22", "39", 0.03), tour("23", "39", 0.04), tour("24", "39", 0.1),
    ],
    osm: [
      osm(1, "supermarket", 0.02), osm(2, "butcher", 0.03), osm(3, "greengrocer", 0.05), osm(4, "supermarket", 0.06),
      osm(5, "convenience", 0.01), osm(6, "convenience", 0.02), osm(7, "convenience", 0.03), osm(8, "convenience", 0.06), // 8: 6.7km
      osm(9, "fuel", 0.01), osm(10, "fuel", 0.2), // 22km — 밖
      osm(11, "pharmacy", 0.02), osm(12, "hospital", 0.03, { emergency: null }), osm(13, "hospital", 0.1, { emergency: true }),
      osm(14, "outdoor", 0.04),
    ],
    rest: [{ id: "r1", kind: "SERVICE_AREA", name: "가평휴게소", lat: 37.9, lng: 127.5, road: "60" }, { id: "r2", kind: "DROWSY_SHELTER", name: "B", lat: 38.3, lng: 127.5 }],
  };
  const res = computeNearby([CAMP, { external_id: { id: "200" }, location: null }], pois);
  assert.deepEqual(Object.keys(res), ["100"]);
  const n = res["100"];

  assert.deepEqual(n.tour.map((t) => t.source_id), ["1", "2", "3", "7", "4"]);
  assert.equal(n.tour[0].kind, "관광지");
  assert.equal(n.tour[0].source, "tourapi-kor2");
  assert.match(n.tour[0].url, /cotid=1$/);
  assert.ok(n.tour[0].distance_m > 1000 && n.tour[0].distance_m < 1200);
  assert.deepEqual(n.food.map((t) => t.source_id), ["20", "21", "22"]);

  assert.deepEqual(n.mart.map((t) => t.kind), ["supermarket", "butcher", "greengrocer"]);
  assert.deepEqual(n.conv.map((t) => t.source_id), ["osm-node-5", "osm-node-6"]);
  assert.deepEqual(n.fuel.map((t) => t.source_id), ["osm-node-9"]);
  assert.equal(n.fuel[0].source, "osm-shops");
  assert.deepEqual(n.medical.map((t) => t.kind), ["pharmacy", "hospital", "hospital"]);
  assert.equal(n.medical[2].emergency, true);
  assert.deepEqual(n.gear.map((t) => t.kind), ["outdoor"]);
  assert.deepEqual(n.rest.map((t) => t.source_id), ["r1"]);
  assert.equal(n.rest[0].road, "60");
  for (const items of Object.values(n)) for (const it of items) {
    assert.ok(Number.isFinite(it.lat) && Number.isFinite(it.lng) && Number.isInteger(it.distance_m));
    assert.ok(it.source && it.source_id);
  }
});

test("관광지가 모자라면 쇼핑으로 채우고, 원천이 비어도 빈 배열", () => {
  const n = computeNearby([CAMP], { tour: [tour("1", "12", 0.01), tour("8", "38", 0.02)] })["100"];
  assert.deepEqual(n.tour.map((t) => t.kind), ["관광지", "쇼핑"]);
  const empty = computeNearby([CAMP], {})["100"];
  assert.deepEqual(empty, { tour: [], food: [], mart: [], conv: [], fuel: [], gear: [], medical: [], rest: [] });
});
