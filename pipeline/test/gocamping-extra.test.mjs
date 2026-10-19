import assert from "node:assert/strict";
import test from "node:test";
import { gcDate, innerCodes, normalizeCampground } from "../lib/gocamping.mjs";
import { buildExploreRecords, buildExploreTexts, gxOf } from "../lib/explore-data.mjs";
import { factsOf, validateFacts } from "../lib/fact-store.mjs";
import { scorePair } from "../lib/localdata-campgrounds.mjs";
import { indexBest, parseBestList } from "../lib/best-campgrounds.mjs";

// 공개 활용 사례의 응답 키를 따른 가상 표본(실제 시설 아님).
const item = {
  contentId: "100001", facltNm: "예시 오토캠핑장", doNm: "경기도", sigunguNm: "가평군", addr1: "경기도 가평군 예시로 1", mapX: "127.5", mapY: "37.8",
  autoSiteCo: "24", glampSiteCo: "4", modifiedtime: "20261010093000",
  bizrno: "123-45-67890", trsagntNo: "제2020-3호", prmisnDe: "20200109", insrncAt: "Y", manageNmpr: "3", mgcDiv: "가평군시설관리공단", allar: "15000",
  sitedStnc: "5", hvofBgnde: "20261201", hvofEnddle: "20270228",
  extshrCo: "12", frprvtWrppCo: "0", frprvtSandCo: "4", fireSensorCo: "",
  glampInnerFclty: "침대,TV,에어컨,냉장고,유무선인터넷,난방기구,취사도구,내부화장실", caravInnerFclty: "",
  clturEventAt: "Y", clturEvent: "가을 음악회", exprnProgrmAt: "Y", tourEraCl: "봄,여름", posblFcltyEtc: "가평 레일바이크", direction: "가평역에서 10분",
};

test("고캠핑: 버리던 등록 필드를 정규화한다(0·빈값은 미입력=null)", () => {
  const c = normalizeCampground(item, "2026-10-19T09:00:00+09:00");
  assert.deepEqual(c.registry, { business_no: "123-45-67890", tourism_business_no: "제2020-3호", licensed_on: "2020-01-09", insured: true, staff_onsite: 3, operating_org: "가평군시설관리공단", total_area_m2: 15000 });
  assert.equal(c.site_gap_m, 5);
  assert.deepEqual(c.closure, { from: "2026-12-01", to: "2027-02-28" });
  assert.deepEqual(c.safety, { extinguishers: 12, fire_water: null, fire_sand: 4, fire_sensors: null });
  assert.equal(c.culture_event, "가을 음악회");
  assert.equal(c.experience_program, true);
  assert.deepEqual(c.travel_seasons, ["봄", "여름"]);
  assert.equal(gcDate("00000000"), null);
  assert.equal(gcDate("2020-13-01"), null);
  assert.deepEqual(innerCodes(["유무선인터넷", "내부화장실", "취사도구"]), ["INTERNET", "PRIVATE_TOILET", "COOKWARE"]);
  const empty = normalizeCampground({ contentId: "1", facltNm: "x" }, "2026-10-19T09:00:00+09:00");
  assert.equal(empty.closure, null);
  assert.equal(empty.registry.insured, null);
});

test("탐색 카탈로그: gx 축약형은 사업자번호를 싣지 않고, 지난 휴장은 버린다", () => {
  const c = normalizeCampground(item, "2026-10-19T09:00:00+09:00");
  const gx = gxOf(c, new Date("2026-10-19T00:00:00Z"));
  assert.deepEqual(gx, { lic: "2020-01-09", ins: true, staff: 3, org: "가평군시설관리공단", tno: "제2020-3호", area: 15000, gap: 5, sf: [12, 0, 4, 0], cl: ["2026-12-01", "2027-02-28"] });
  assert.equal(JSON.stringify(gx).includes("67890"), false);
  assert.equal(gxOf(c, new Date("2027-03-02T00:00:00Z")).cl, undefined);
  assert.equal(gxOf({}), null);
  const [r] = buildExploreRecords({ campgrounds: [c] });
  assert.equal(JSON.stringify(r).includes("67890"), false);
  assert.ok(r.gx.lic);
  const t = buildExploreTexts({ campgrounds: [c] })["100001"];
  assert.deepEqual(t.inner, { glamping: c.inner.glamping });
  assert.equal(t.event, "가을 음악회");
  assert.equal(t.exp, true);
});

test("사실 저장소: 안전시설·보험·인허가·내부시설·우수야영장이 원천·확인시각과 함께 행이 된다", () => {
  const c = { id: "100001", gc_url: "https://www.gocamping.or.kr/bsite/camp/info/read.do?c_no=100001", modified_at: "2026-10-10",
    gx: { lic: "2020-01-09", ins: true, staff: 3, org: "공단", gap: 5, area: 15000, sf: [12, 0, 4, 0], cl: ["2026-12-01", "2027-02-28"] },
    best: [[2025, "PET"]], best_at: "2026-10-19T04:00:00Z" };
  const d = { inner: { glamping: ["침대", "에어컨"] }, event: "가을 음악회", exp: true };
  const f = factsOf(c, d);
  const get = (a) => f.filter((x) => x.attr === a);
  assert.equal(get("SAFETY_EXTINGUISHER")[0].value, 12);
  assert.equal(get("SAFETY_FIRE_WATER").length, 0);
  assert.equal(get("SAFETY_INSURANCE")[0].value, true);
  assert.equal(get("LICENSE_DATE")[0].value, "2020-01-09");
  assert.deepEqual(get("SEASONAL_CLOSURE")[0].period, { from: "2026-12-01", to: "2027-02-28" });
  assert.deepEqual(get("INNER_AMENITY").map((x) => [x.value, x.label]), [["BED", "GLAMPING"], ["AIRCON", "GLAMPING"]]);
  const best = get("AWARD_PUBLIC_BEST")[0];
  assert.equal(best.value, "PET");
  assert.equal(best.src, "gocamping_best");
  assert.match(best.url, /searchYear=2025/);
  for (const x of f) assert.ok(x.url && x.grade, x.attr);
  assert.deepEqual(validateFacts(f).filter((e) => !/MENTION/.test(e)), []);
});

test("LOCALDATA 매칭: 인허가일·사업자번호가 같으면 점수를 더한다", () => {
  const lic = { name: "예시캠핑장", lat: 37.8, lng: 127.5, road_address: "경기도 가평군 예시로 1", phone: null, licensed_at: "2020-01-09", extra: {} };
  const gc = { name: "예시 오토캠핑장", lat: 37.801, lng: 127.501, address: "경기도 가평군 다른로 2", phone: null };
  const plain = scorePair(lic, gc), dated = scorePair(lic, { ...gc, licensed_on: "2020-01-09" });
  assert.ok(dated.score > plain.score);
  assert.equal(dated.evidence.license_date_same, true);
  const biz = scorePair({ ...lic, extra: { 사업자등록번호: "1234567890" } }, { ...gc, business_no: "123-45-67890" });
  assert.equal(biz.evidence.business_no_same, true);
  assert.ok(biz.score > plain.score);
});

test("공공 우수야영장 목록: 분야 섹션별로 캠핑장 번호를 뽑는다", () => {
  const html = `<section class="map-swiper-item eco"><ul><li><a href="/bsite/camp/info/read.do?c_no=111"><p class="subject">A캠핑장</p><p class="summary">숲</p><p class="address">강원</p></a></li></ul></section>
    <section class="map-swiper-item pet"><ul><li><a href="read.do?c_no=222"><p class="subject">B</p></a></li><li><a href="read.do?c_no=222"><p class="subject">B</p></a></li></ul></section>`;
  const rows = parseBestList(html, 2025);
  assert.deepEqual(rows.map((r) => [r.contentId, r.field]), [["111", "ECO"], ["222", "PET"]]);
  const idx = indexBest(rows);
  assert.equal(idx["111"][0].year, 2025);
});
