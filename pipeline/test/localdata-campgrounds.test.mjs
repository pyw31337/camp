import assert from "node:assert/strict";
import test from "node:test";
import { tmForward } from "../lib/crs.mjs";
import { matchLicenses, nameSimilarity, normalizeLicense, scorePair, statusOf } from "../lib/localdata-campgrounds.mjs";

// EPSG:5174 좌표를 만들 때는 Bessel 위경도로 근사(검증은 수십 m 오차 허용)
const tm = (lat, lng) => tmForward(lat, lng).map((v) => v.toFixed(3));
const row = (o) => ({ 개방자치단체코드: "4200000", 관리번호: "2026-001", 사업장명: "숲속 오토캠핑장", 영업상태명: "영업/정상", 상세영업상태명: "영업",
  인허가일자: "2019-05-01", 폐업일자: "", 소재지전화: "033-123-4567", 도로명전체주소: "강원특별자치도 홍천군 서석면 숲속로 12", 소재지전체주소: "강원특별자치도 홍천군 서석면 풍암리 1",
  "좌표정보x(epsg5174)": tm(37.7, 128.2)[0], "좌표정보y(epsg5174)": tm(37.7, 128.2)[1], 데이터갱신일자: "2026-10-01 00:00:00", 시설총규모: "12000", 야영장구분명: "자동차야영장", ...o });

test("인허가 행 정규화: 상태·날짜·좌표(EPSG:5174)·업종 고유 열 보존", () => {
  const r = normalizeLicense(row({}), "AUTO");
  assert.equal(r.id, "AUTO:4200000:2026-001");
  assert.equal(r.status, "OPERATING");
  assert.equal(r.licensed_at, "2019-05-01");
  assert.equal(r.closed_at, null);
  assert.ok(Math.abs(r.lat - 37.7) < 0.01 && Math.abs(r.lng - 128.2) < 0.01, `${r.lat},${r.lng}`);
  assert.equal(r.coord_method, "EPSG5174");
  assert.deepEqual(r.extra, { 시설총규모: "12000", 야영장구분명: "자동차야영장" });
  assert.equal(normalizeLicense({ 사업장명: "번호 없음" }, "GENERAL"), null);
  assert.equal(statusOf("폐업 / 폐업"), "CLOSED");
  assert.equal(statusOf("휴업"), "TEMPORARILY_CLOSED");
});

test("이름 유사도는 법인 표기·업종 단어를 빼고 비교", () => {
  assert.equal(nameSimilarity("(주)숲속 오토캠핑장", "숲속캠핑장"), 1);
  assert.ok(nameSimilarity("숲속마을 캠핑장", "숲속 오토캠핑장") >= 0.9);
  assert.ok(nameSimilarity("바다향 글램핑", "숲속 캠핑장") < 0.3);
});

test("매칭: 같은 곳은 자동 연결, 애매하면 검수, 없으면 숨은 후보, 1:1 유지, 폐업 교차 표시", () => {
  const gc = [
    { id: "g1", name: "숲속캠핑장", lat: 37.7003, lng: 128.2002, address: "강원특별자치도 홍천군 서석면 숲속로 12", phone: "033-123-4567", status: "운영" },
    { id: "g2", name: "강변 야영장", lat: 37.5, lng: 127.5, address: "경기도 가평군 가평읍 강변로 1", phone: null, status: "운영" },
  ];
  const lic = [
    normalizeLicense(row({}), "AUTO"),
    normalizeLicense(row({ 관리번호: "2026-002", 사업장명: "숲속캠핑장 제2야영장", 영업상태명: "폐업", 폐업일자: "2024-01-01" }), "GENERAL"),
    normalizeLicense(row({ 관리번호: "2026-003", 사업장명: "산골 노을 캠핑", 도로명전체주소: "강원특별자치도 인제군 기린면 산골로 3", "좌표정보x(epsg5174)": tm(38.0, 128.3)[0], "좌표정보y(epsg5174)": tm(38.0, 128.3)[1] }), "GENERAL"),
  ];
  const [a, b, c] = matchLicenses(lic, gc);
  assert.equal(a.match.state, "MATCHED");
  assert.equal(a.match.gocamping_id, "g1");
  assert.ok(a.match.evidence.road_address_same && a.match.evidence.phone_same);
  assert.equal(b.match.state, "NEW", "같은 고캠핑 시설은 점수 높은 인허가 하나에만 연결");
  assert.equal(c.match.state, "NEW");
  assert.deepEqual(c.match.flags, ["HIDDEN_CANDIDATE"]);
  const closed = matchLicenses([normalizeLicense(row({ 영업상태명: "폐업" }), "AUTO")], gc)[0];
  assert.deepEqual(closed.match.flags, ["LICENSE_CLOSED_BUT_LISTED"]);
  assert.ok(scorePair(lic[0], gc[1]).score < 0.3);
});
