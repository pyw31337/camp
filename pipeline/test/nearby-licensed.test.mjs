import assert from "node:assert/strict";
import test from "node:test";
import { buildIndexes, CONVENIENCE_BRAND, distText, nearestFor, placeOf } from "../lib/nearby-licensed.mjs";
import { factsOf, validateFacts } from "../lib/fact-store.mjs";

// EPSG:5174 서울 종로 부근 좌표(실데이터 행 형태)
const row = (name, status = "영업/정상", x = "201937.46", y = "452380.75") => ({ 사업장명: name, 영업상태명: status, 상세영업상태명: status, "좌표정보(X)": x, "좌표정보(Y)": y, 도로명주소: "서울특별시 종로구 난계로 17" });

test("영업 중·좌표 있는 행만 장소가 되고 좌표는 위경도로 바뀐다", () => {
  const p = placeOf(row("GS25 숭인행운"));
  assert.ok(p && p.lat > 37.5 && p.lat < 37.6 && p.lng > 127 && p.lng < 127.1);
  assert.equal(placeOf(row("GS25 숭인행운", "폐업")), null);
  assert.equal(placeOf({ ...row("x"), "좌표정보(X)": "" }), null);
});

test("편의점 체인 상호 판별", () => {
  for (const n of ["GS25 숭인행운", "씨유 가평점", "CU 홍천점", "세븐일레븐 양평", "이마트24 R포천", "미니스톱 춘천"]) assert.ok(CONVENIENCE_BRAND.test(n), n);
  for (const n of ["행복슈퍼", "가평농협하나로마트", "CUBE 상사"]) assert.ok(!CONVENIENCE_BRAND.test(n), n);
});

test("범주별 최근접·5km 안 개수, 담배·상비약 양쪽의 같은 편의점은 한 번만, 20km 밖은 없음", () => {
  const a = placeOf(row("CU 종로점")), b = placeOf(row("세븐일레븐 멀리", "영업/정상", "211937.46", "452380.75")); // 약 10km 동쪽
  const ix = buildIndexes({ over_the_counter_medicine_stores: [a], tobacco_retailers: [a, b] });
  const near = nearestFor(a.lat, a.lng + 0.001, ix);
  assert.equal(near.CONVENIENCE.name, "CU 종로점");
  assert.ok(near.CONVENIENCE.m < 200);
  assert.equal(near.CONVENIENCE.n5, 1);
  assert.equal(ix.CONVENIENCE.size, 2);
  assert.equal(near.VET.m, null);
  assert.equal(distText(1234), "1.2km");
  assert.equal(distText(380), "380m");
});

test("사실 저장소: NEARBY_* 사실은 CONFIRMED·원천 URL·상호 문구를 가진다", () => {
  const c = { id: "1", name: "x", gc_url: "https://gc/x", modified_at: "2026-10-01" };
  const f = factsOf(c, null, { nearby: { places: { CONVENIENCE: { m: 1234, name: "CU 가평점", n5: 3 }, VET: { m: null } }, urls: { CONVENIENCE: "https://file.localdata.go.kr/file/tobacco_retailers/info" }, at: "2026-10-16" } });
  const n = f.filter((x) => x.attr.startsWith("NEARBY_"));
  assert.equal(n.length, 1);
  assert.deepEqual([n[0].value, n[0].grade, n[0].src, n[0].count, n[0].text], [1234, "CONFIRMED", "localdata", 3, "CU 가평점 1.2km"]);
  assert.deepEqual(validateFacts(f), []);
});
