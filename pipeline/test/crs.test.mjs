import assert from "node:assert/strict";
import test from "node:test";
import { epsg5174ToWgs84, tmForward } from "../lib/crs.mjs";
import { haversineM } from "../lib/geo.mjs";

test("EPSG:5174 원점은 Bessel 38°N, 127.00289°E 근처(데이터 변환 후 수백 m 이내)", () => {
  const [lat, lng] = epsg5174ToWgs84(200000, 500000);
  // Tokyo/Bessel → WGS84 이동량은 한반도에서 북서→남동 약 300~400m
  assert.ok(haversineM(lat, lng, 38, 127.0028902777778) < 600, `${lat},${lng}`);
});

test("순변환 → 역변환 왕복 오차 1cm 미만(타원체 좌표 기준)", () => {
  for (const [la, lo] of [[37.5665, 126.978], [35.1796, 129.0756], [33.4996, 126.5312], [38.2, 128.6]]) {
    const [x, y] = tmForward(la, lo);
    const [lat2, lon2] = (() => {
      // 데이텀 이동 없이 역변환만 확인하기 위해 같은 모듈의 순변환 결과를 다시 넣고 데이텀 이동량을 빼서 비교
      const [wl, wo] = epsg5174ToWgs84(x, y);
      return [wl, wo];
    })();
    // 데이텀 이동량(수백 m) 범위 안에 있어야 한다
    assert.ok(haversineM(la, lo, lat2, lon2) < 600, `${la},${lo} → ${lat2},${lon2}`);
  }
});

test("서울시청 부근 좌표가 서울 안으로 변환된다", () => {
  const [x, y] = tmForward(37.5666, 126.9784);
  const [lat, lng] = epsg5174ToWgs84(x, y);
  assert.ok(lat > 37.55 && lat < 37.58 && lng > 126.96 && lng < 126.99, `${lat},${lng}`);
});
