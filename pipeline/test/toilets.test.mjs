import assert from "node:assert/strict";
import test from "node:test";
import { csvToObjects, decodeKoreanText, parseCsv } from "../lib/csv.mjs";
import { GridIndex, haversineM } from "../lib/geo.mjs";
import { geocodeAll } from "../lib/geocode.mjs";
import { linkNearbyToilets } from "../lib/nearby-toilets.mjs";
import { fromStandardApi, geocodeQuery, normalizeToilet } from "../lib/toilets.mjs";

test("CSV: BOM, 따옴표 속 쉼표·줄바꿈, CRLF", () => {
  const text = '﻿화장실명,소재지도로명주소,개방시간\r\n"공원, 북측","서울 마포구 ""하늘""로 1","09:00~18:00\n(동절기 단축)"\r\n';
  const rows = csvToObjects(decodeKoreanText(Buffer.from(text, "utf8")));
  assert.equal(rows.length, 1);
  assert.equal(rows[0]["화장실명"], "공원, 북측");
  assert.equal(rows[0]["소재지도로명주소"], '서울 마포구 "하늘"로 1');
  assert.ok(rows[0]["개방시간"].includes("\n"));
  assert.deepEqual(parseCsv("a,b\n1,2"), [["a", "b"], ["1", "2"]]);
});

test("EUC-KR 파일을 판별해 읽는다", () => {
  // "화장실명" EUC-KR 바이트
  const euc = Buffer.from([0xc8, 0xad, 0xc0, 0xe5, 0xbd, 0xc7, 0xb8, 0xed]);
  assert.equal(decodeKoreanText(euc), "화장실명");
});

test("화장실 정규화: 열 이름 패턴, 장애인 칸 합계, 24시간, 폐쇄 제외", () => {
  const t = normalizeToilet({
    "구분명": "공중화장실", "화장실명": "솔숲공원 화장실", "소재지도로명주소": "강원 홍천군 서석면 풍암리 1(공원 안)",
    "남성용-장애인용대변기수": "1", "여성용-장애인용대변기수": "1", "남성용-어린이용대변기수": "0",
    "개방시간상세": "24시간 개방", "비상벨설치여부": "Y", "기저귀교환대유무": "N", "데이터기준일자": "2026-10-10",
  });
  assert.equal(t.name, "솔숲공원 화장실");
  assert.equal(t.disabled_stalls, 2);
  assert.equal(t.open_24h, true);
  assert.equal(t.emergency_bell, true);
  assert.equal(t.diaper_table, false);
  assert.equal(geocodeQuery(t), "강원 홍천군 서석면 풍암리 1");
  assert.equal(normalizeToilet({ "화장실명": "x", "소재지지번주소": "y", "영업상태명": "폐업" }), null);
  assert.equal(normalizeToilet({ "화장실명": "주소 없음" }), null);
});

test("거리 계산과 격자 반경 검색", () => {
  // 위도 0.001° ≈ 111m
  assert.ok(Math.abs(haversineM(37.5, 127, 37.501, 127) - 111) < 2);
  const idx = new GridIndex([{ id: "a", lat: 37.5005, lng: 127 }, { id: "b", lat: 37.52, lng: 127 }, { id: "c", lat: 37.5, lng: 127.0099 }]);
  const near = idx.within(37.5, 127, 1000);
  assert.deepEqual(near.map((n) => n.point.id), ["a", "c"]);
  assert.ok(near[0].distance_m < near[1].distance_m);
});

test("지오코딩 캐시: 이미 있는 주소는 묻지 않고, 없음 결과는 30일 뒤 재시도", async () => {
  const cache = { "서울 A로 1": { lat: 37.5, lng: 127, precision: "ROAD" }, "서울 B로 2": { miss: true, at: "2026-10-01" }, "서울 C로 3": { miss: true, at: "2026-08-01" } };
  const asked = [];
  const r = await geocodeAll(["서울 A로 1", "서울 B로 2", "서울 C로 3", "서울 D로 4", "서울 D로 4"], cache, {
    geocode: async (q) => { asked.push(q); return q.includes("D") ? { lat: 37.6, lng: 127.1, precision: "ROAD" } : null; },
    today: "2026-10-13",
  });
  assert.deepEqual(asked.sort(), ["서울 C로 3", "서울 D로 4"]);
  assert.equal(r.hits, 1);
  assert.equal(cache["서울 C로 3"].at, "2026-10-13");
});

test("지오코딩: 한도 초과면 즉시 멈추고 남은 건수를 알린다", async () => {
  const r = await geocodeAll(["a", "b", "c"], {}, { concurrency: 1, geocode: async () => { const e = new Error("카카오 호출 한도 초과"); e.code = "RATE_LIMIT"; throw e; } });
  assert.equal(r.calls, 1);
  assert.equal(r.remaining, 2);
  assert.match(r.stopped, /한도/);
});

test("캠핑장별 주변 화장실: 거리순 5곳, 500m·2km 개수, 300m 통계", () => {
  const toilets = Array.from({ length: 7 }, (_, i) => ({ id: `t${i}`, name: `화장실${i}`, lat: 37.5 + i * 0.002, lng: 127, open_24h: i === 0 }));
  const { byCampground, stats } = linkNearbyToilets([{ id: "c1", lat: 37.5, lng: 127 }, { id: "c2", lat: 35, lng: 129 }], toilets);
  const c1 = byCampground.c1;
  assert.equal(c1.nearest.length, 5);
  assert.equal(c1.nearest[0].toilet_id, "t0");
  assert.equal(c1.nearest[0].distance_m, 0);
  assert.equal(c1.count_500m, 3); // 0, 222, 444m
  assert.equal(c1.count_2km, 7);
  assert.equal(byCampground.c2.count_2km, 0);
  assert.deepEqual(stats, { campgrounds: 2, with_toilet_2km: 1, with_toilet_300m: 1 });
});

import { mergeToiletSources, normalizeOsmToilet } from "../lib/osm-toilets.mjs";

test("OSM 화장실: 좌표·24시간·국외 제외", () => {
  const t = normalizeOsmToilet({ type: "node", id: 1, lat: 37.55, lon: 126.98, tags: { amenity: "toilets", name: "남산 화장실", opening_hours: "24/7", wheelchair: "yes" } });
  assert.equal(t.name, "남산 화장실");
  assert.equal(t.open_24h, true);
  assert.equal(t.disabled_stalls, 1);
  assert.equal(normalizeOsmToilet({ type: "node", id: 2, lat: 35.68, lon: 139.76, tags: {} }), null); // 도쿄
  const w = normalizeOsmToilet({ type: "way", id: 3, center: { lat: 33.5, lon: 126.5 }, tags: {} });
  assert.equal(w.name, "공중화장실");
});

test("행안부와 30m 안에서 겹치는 OSM 항목은 버린다", () => {
  const gov = [{ id: "g1", lat: 37.5, lng: 127 }, { id: "g2", name: "좌표 없음" }];
  const osm = [{ id: "o1", lat: 37.5001, lng: 127 }, { id: "o2", lat: 37.51, lng: 127 }];
  const r = mergeToiletSources(gov, osm);
  assert.equal(r.osm_added, 1);
  assert.equal(r.osm_duplicates, 1);
  assert.deepEqual(r.merged.map((t) => t.id), ["g1", "g2", "o2"]);
  assert.equal(r.merged[0].source, "mois");
});

import { isToiletRow } from "../lib/toilets.mjs";
import { overpass } from "../lib/overpass.mjs";

test("다른 업종 파일(이름·주소만 있음)은 화장실로 받지 않는다", () => {
  const culture = { "사업장명": "○○문화센터", "도로명주소": "서울 중구 세종대로 1", "문화체육업종명": "공연장", "좌표정보(X)": "198000", "좌표정보(Y)": "452000" };
  assert.equal(isToiletRow(culture), false);
  assert.equal(normalizeToilet(culture), null);
});

test("LOCALDATA 좌표정보(X/Y, EPSG:5174)가 있으면 WGS84로 바꿔 쓴다", () => {
  const t = normalizeToilet({ "화장실명": "시청앞 화장실", "소재지도로명주소": "서울 중구 세종대로 110", "개방시간": "24시간", "좌표정보(X)": "197836.6", "좌표정보(Y)": "451901.3" });
  assert.ok(Math.abs(t.lat - 37.5693) < 0.001 && Math.abs(t.lng - 126.9763) < 0.001, `${t.lat},${t.lng}`);
  assert.equal(t.precision, "EPSG5174");
});

test("표준데이터 API 영문 필드를 화장실 정규화 모델과 원천 좌표로 바꾼다", () => {
  const toilet = fromStandardApi({
    toiletNm: "표준 화장실", rdnmadr: "서울 중구 세종대로 1", openTime: "24시간", emgBellYn: "Y",
    disabledMaleWc: "1", disabledFemaleWc: "2", latitude: "37.5665", longitude: "126.9780", referenceDate: "2026-10-13",
  });
  assert.equal(toilet.name, "표준 화장실");
  assert.equal(toilet.open_24h, true);
  assert.equal(toilet.emergency_bell, true);
  assert.equal(toilet.disabled_stalls, 3);
  assert.equal(toilet.precision, "SOURCE");
  assert.equal(toilet.lat, 37.5665);
});

test("Overpass: 504면 다음 서버로 넘어간다", async () => {
  const calls = [];
  const fetchImpl = async (url) => { calls.push(new URL(url).host); return url.includes("a.test") ? { ok: false, status: 504 } : { ok: true, json: async () => ({ elements: [{ id: 1 }] }) }; };
  const r = await overpass("q", { fetchImpl, servers: ["https://a.test/x", "https://b.test/x"], wait: async () => {} });
  assert.equal(r.elements.length, 1);
  assert.deepEqual(calls, ["a.test", "a.test", "b.test"]);
});

test("전국공중화장실표준데이터 API(영문 필드) → 정규화, 원천 좌표 사용", async () => {
  const { fromStandardApi } = await import("../lib/toilets.mjs");
  const t = fromStandardApi({ toiletType: "공중화장실", toiletNm: "계곡입구 화장실", rdnmadr: "강원특별자치도 홍천군 서석면 1", lnmadr: "", openTime: "24시간", menDisabledToiletBowlNumber: "1", ladiesDisabledToiletBowlNumber: "1", emgBellYn: "Y", latitude: "37.70", longitude: "128.10", referenceDate: "2026-09-30" });
  assert.equal(t.name, "계곡입구 화장실");
  assert.equal(t.open_24h, true);
  assert.equal(t.disabled_stalls, 2);
  assert.equal(t.emergency_bell, true);
  assert.equal(t.lat, 37.7);
  assert.equal(t.precision, "SOURCE");
  assert.equal(fromStandardApi({ toiletNm: "주소 없음" }), null);
});
