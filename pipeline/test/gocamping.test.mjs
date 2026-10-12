import assert from "node:assert/strict";
import test from "node:test";
import { extractItems, fetchAllCampgrounds, normalizeCampground, parseGoCampingTime, summarize } from "../lib/gocamping.mjs";

// 공개 활용 사례의 응답 키를 따른 가상 표본(실제 시설 아님).
const sample = {
  contentId: "100001", facltNm: "예시 오토캠핑장", lineIntro: "계곡 옆 타프존이 있는 캠핑장", intro: "",
  induty: "자동차야영장,글램핑", facltDivNm: "민간", mangeDivNm: "직영", manageSttus: "운영",
  doNm: "경기도", sigunguNm: "가평군", addr1: "경기도 가평군 예시로 1", mapX: "127.5", mapY: "37.8",
  tel: "031-000-0000", homepage: "https://example.com", resveCl: "온라인실시간예약,전화", resveUrl: "https://example.com/book",
  gnrlSiteCo: "0", autoSiteCo: "24", glampSiteCo: "4", caravSiteCo: "0", indvdlCaravSiteCo: "0",
  siteBottomCl1: "0", siteBottomCl2: "18", siteBottomCl3: "6", siteBottomCl4: "0", siteBottomCl5: "0",
  siteMg1Width: "8", siteMg1Vrticl: "10", siteMg1Co: "18", siteMg2Width: "6", siteMg2Vrticl: "8", siteMg2Co: "6", siteMg3Width: "0", siteMg3Vrticl: "0", siteMg3Co: "0",
  sbrsCl: "전기,온수,장작판매", animalCmgCl: "가능(소형견)", trlerAcmpnyAt: "N", caravAcmpnyAt: "Y",
  toiletCo: "4", swrmCo: "4", wtrplCo: "3", createdtime: "2020-03-01 10:00:00", modifiedtime: "20261010093000",
};

test("상품 유형·사이트 규격·바닥을 구조화한다", () => {
  const c = normalizeCampground(sample, "2026-10-12T03:00:00+09:00");
  assert.deepEqual(c.products.map((p) => [p.kind, p.site_count]), [["AUTO_PITCH", 24], ["GLAMPING", 4]]);
  assert.deepEqual(c.product_kind_candidates, ["TARP_ZONE"]);
  assert.deepEqual(c.site_sizes.map((s) => [s.width_m, s.depth_m, s.count, s.area_m2]), [[8, 10, 18, 80], [6, 8, 6, 48]]);
  assert.deepEqual(c.floors, [{ floor: "CRUSHED_STONE", count: 18 }, { floor: "DECK", count: 6 }]);
  assert.equal(c.operator_type, "PRIVATE");
  assert.deepEqual(c.location, { lat: 37.8, lng: 127.5 });
  assert.deepEqual(c.reservation.methods, ["온라인실시간예약", "전화"]);
  assert.equal(c.trailer_allowed, false);
  assert.equal(c.caravan_allowed, true);
  assert.equal(c.source.modified_at, "2026-10-10T09:30:00+09:00");
  assert.equal(c.source.tier, "A");
});

test("빈 좌표와 알 수 없는 운영 주체를 추정하지 않는다", () => {
  const c = normalizeCampground({ ...sample, mapX: "", mapY: "0", facltDivNm: "" }, "x");
  assert.equal(c.location, null);
  assert.equal(c.operator_type, "UNKNOWN");
});

test("시각 파서", () => {
  assert.equal(parseGoCampingTime("2020-03-01 10:00:00"), "2020-03-01T10:00:00+09:00");
  assert.equal(parseGoCampingTime(""), null);
});

test("API 오류 코드를 예외로 올린다", () => {
  assert.throws(() => extractItems({ response: { header: { resultCode: "30", resultMsg: "SERVICE KEY IS NOT REGISTERED" } } }), /30/);
  assert.equal(extractItems({ response: { header: { resultCode: "0000" }, body: { items: { item: sample }, totalCount: 1 } } }).items.length, 1);
});

test("페이지를 모두 받고 누락이 있으면 실패한다", async () => {
  const pages = { 1: [sample, { ...sample, contentId: "2" }], 2: [{ ...sample, contentId: "3" }] };
  const mk = (total) => async (url) => {
    const page = Number(new URL(url).searchParams.get("pageNo"));
    return { ok: true, json: async () => ({ response: { header: { resultCode: "0000" }, body: { items: { item: pages[page] ?? [] }, totalCount: total } } }) };
  };
  const all = await fetchAllCampgrounds({ serviceKey: "k", fetchImpl: mk(3), pageSize: 2 });
  assert.equal(all.length, 3);
  await assert.rejects(fetchAllCampgrounds({ serviceKey: "k", fetchImpl: mk(5), pageSize: 2 }), /페이지 누락/);
});

test("요약 통계", () => {
  const s = summarize([normalizeCampground(sample, "x")]);
  assert.deepEqual(s, { total: 1, by_product_kind: { AUTO_PITCH: 1, GLAMPING: 1 }, by_operator: { PRIVATE: 1 }, with_site_sizes: 1 });
});
