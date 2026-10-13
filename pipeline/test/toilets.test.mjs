import assert from "node:assert/strict";
import test from "node:test";
import { csvToObjects, decodeKoreanText, parseCsv } from "../lib/csv.mjs";
import { GridIndex, haversineM } from "../lib/geo.mjs";
import { geocodeAll } from "../lib/geocode.mjs";
import { linkNearbyToilets } from "../lib/nearby-toilets.mjs";
import { geocodeQuery, normalizeToilet } from "../lib/toilets.mjs";

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
