import assert from "node:assert/strict";
import test from "node:test";
import {
  buildRecord, campsiteListUrl, coverage, detailImageUrl, detailInfoUrl, isQuotaError, matchProducts, normalizeDetailInfo,
  normalizeImages, normalizeListItem, onlyCampsites, officialPhotoUrl, parsePrice, parseTourBody, planDetailCalls, stayListUrl,
} from "../lib/tour-products.mjs";

// 위도 0.001° ≈ 111m
const GC = [
  { id: "1", name: "솔숲 오토캠핑장", lat: 37.8, lng: 127.5 },
  { id: "2", name: "별빛글램핑", lat: 37.9, lng: 127.6 },
  { id: "3", name: "강변야영장", lat: 36.5, lng: 128.0 },
];

const ROOM = {
  contentid: "900", contenttypeid: "32", roomcode: "2", roomtitle: "카라반 A동", roomsize1: "8", roomsize2: "26.4", roomcount: "4",
  roombasecount: "2", roommaxcount: "4", roomoffseasonminfee1: "80000", roomoffseasonminfee2: "100,000", roompeakseasonminfee1: "0", roompeakseasonminfee2: "",
  roomintro: "개별 화장실<br>바비큐 가능", roomaircondition: "Y", roomtv: "N", roomcook: "Y", roomrefrigerator: "Y", roombath: "",
  roomimg1: "http://tong.visitkorea.or.kr/cms/resource/1.jpg", roomimg1alt: "카라반 외관", cpyrhtDivCd1: "Type3",
  roomimg2: "https://example.com/x.jpg", roomimg2alt: "", roomimg3: "http://tong.visitkorea.or.kr/cms/resource/1.jpg",
};

test("URL은 KorService2·serviceKey 제외·필수 파라미터", () => {
  assert.match(stayListUrl(2), /^https:\/\/apis\.data\.go\.kr\/B551011\/KorService2\/areaBasedList2\?.*contentTypeId=32/);
  assert.match(stayListUrl(2), /numOfRows=1000&pageNo=2/);
  assert.match(campsiteListUrl(1), /contentTypeId=28.*cat3=A03021700/);
  assert.match(detailInfoUrl("900", "32"), /detailInfo2\?.*contentId=900&contentTypeId=32/);
  assert.match(detailImageUrl("900"), /detailImage2\?.*contentId=900&imageYN=Y/);
  for (const u of [stayListUrl(1), detailInfoUrl(1, 28), detailImageUrl(1)]) assert.doesNotMatch(u, /serviceKey/);
});

test("응답 파싱·한도 오류 판별", () => {
  const body = JSON.stringify({ response: { header: { resultCode: "0000" }, body: { totalCount: 1, items: { item: { contentid: 5, contenttypeid: "32", title: "별빛 글램핑", addr1: "경기 가평군", mapx: "127.6", mapy: "37.9", cat3: "B02010700" } } } } });
  const { items, total } = parseTourBody(body);
  assert.equal(total, 1);
  assert.deepEqual(normalizeListItem(items[0]), { contentid: "5", type: "32", title: "별빛 글램핑", addr: "경기 가평군", lat: 37.9, lng: 127.6, cat3: "B02010700" });
  assert.equal(normalizeListItem({ contentid: 1, mapx: "0", mapy: "0" }), null);
  assert.deepEqual(parseTourBody(JSON.stringify({ response: { header: { resultCode: "0000" }, body: { totalCount: 0, items: "" } } })).items, []);
  assert.throws(() => parseTourBody("<OpenAPI_ServiceResponse><returnAuthMsg>LIMITED_NUMBER_OF_SERVICE_REQUESTS_EXCEEDS_ERROR</returnAuthMsg></OpenAPI_ServiceResponse>"), (e) => isQuotaError(e.message));
  assert.throws(() => parseTourBody(JSON.stringify({ response: { header: { resultCode: "22", resultMsg: "LIMITED_NUMBER_OF_SERVICE_REQUESTS_EXCEEDS_ERROR" } } })), (e) => isQuotaError(e.message));
  assert.equal(isQuotaError("TourAPI HTTP 500 timeout"), false);
  const cs = onlyCampsites([{ type: "28", cat3: "A03021700" }, { type: "28", cat3: "A03022700" }, { type: "32", cat3: null }]);
  assert.equal(cs.length, 1);
});

test("가격 파싱: 0·빈값·문구는 null", () => {
  assert.equal(parsePrice("80000"), 80000);
  assert.equal(parsePrice("100,000원"), 100000);
  assert.equal(parsePrice("5만원"), 50000);
  assert.equal(parsePrice("5.5만"), 55000);
  assert.equal(parsePrice("0"), null);
  assert.equal(parsePrice(""), null);
  assert.equal(parsePrice("문의"), null);
  assert.equal(parsePrice("50000~70000"), null);
});

test("매칭: 1km·0.6, 캠핑형 150m·0.4, 1:1 최고점", () => {
  const items = [
    { contentid: "a", type: "28", title: "솔숲캠핑장", lat: 37.805, lng: 127.5 }, // ~555m, 이름 동일 → 1
    { contentid: "b", type: "32", title: "솔숲펜션", lat: 37.8001, lng: 127.5 }, // 가깝지만 1과는 a가 더 높음
    { contentid: "c", type: "32", title: "별빛하늘 글램핑", lat: 37.9008, lng: 127.6 }, // ~89m, 유사도 낮음 + 캠핑형 → 2
    { contentid: "d", type: "32", title: "강변호텔", lat: 36.5009, lng: 128.0 }, // 100m지만 캠핑형 아님·유사도 0.5 미만 → 불일치
    { contentid: "e", type: "28", title: "솔숲 오토캠핑장", lat: 37.82, lng: 127.5 }, // 2.2km → 제외
  ];
  const m = matchProducts(GC, items);
  assert.equal(m.get("1").contentid, "a");
  assert.equal(m.get("1").type, "28");
  assert.ok(m.get("1").distance_m > 500 && m.get("1").distance_m < 600);
  assert.equal(m.get("2").contentid, "c");
  assert.equal(m.has("3"), false);
  const used = [...m.values()].map((x) => x.contentid);
  assert.equal(new Set(used).size, used.length);
});

test("detailInfo2(32) 객실 → 상품", () => {
  const { products, info } = normalizeDetailInfo([ROOM, { ...ROOM }, { ...ROOM, roomcode: "1", roomtitle: "글램핑 B", roomimg1: "", roomoffseasonminfee1: "5만원" }]);
  assert.equal(info.length, 0);
  assert.deepEqual(products.map((p) => p.name), ["글램핑 B", "카라반 A동"]);
  const p = products[1];
  assert.equal(p.size, "8평 · 26.4㎡");
  assert.equal(p.count, 4);
  assert.equal(p.base, 2);
  assert.equal(p.max, 4);
  assert.deepEqual(p.price, { off_weekday: 80000, off_weekend: 100000, peak_weekday: null, peak_weekend: null });
  assert.equal(p.price_raw.off_weekend, "100,000");
  assert.equal(p.intro, "개별 화장실\n바비큐 가능");
  assert.deepEqual(p.amenities, ["에어컨", "냉장고", "취사용품"]);
  assert.deepEqual(p.photos, ["https://tong.visitkorea.or.kr/cms/resource/1.jpg"]);
  assert.deepEqual(p.photo_meta, [{ url: "https://tong.visitkorea.or.kr/cms/resource/1.jpg", alt: "카라반 외관", license: "Type3" }]);
  assert.equal(products[0].price.off_weekday, 50000);
});

test("detailInfo2(28) 일반 행 → 안내 정보", () => {
  const { products, info } = normalizeDetailInfo([
    { contentid: "a", contenttypeid: "28", fldgubun: "1", serialnum: "1", infoname: "이용요금", infotext: "오토캠핑 1박 40,000원<br />주말 50,000원" },
    { contentid: "a", contenttypeid: "28", fldgubun: "1", serialnum: "0", infoname: "입 장 료", infotext: "없음" },
    { contentid: "a", contenttypeid: "28", serialnum: "2", infoname: "빈칸", infotext: "" },
  ]);
  assert.equal(products.length, 0);
  assert.deepEqual(info, [{ name: "입 장 료", text: "없음" }, { name: "이용요금", text: "오토캠핑 1박 40,000원\n주말 50,000원" }]);
});

test("detailImage2 → 공식 호스트 사진만", () => {
  const photos = normalizeImages([
    { originimgurl: "http://tong.visitkorea.or.kr/cms/resource/2.jpg", smallimageurl: "http://tong.visitkorea.or.kr/cms/resource/2_s.jpg", imgname: "전경", cpyrhtDivCd: "Type1", serialnum: "2" },
    { originimgurl: "https://blog.example.com/a.jpg", serialnum: "1" },
    { originimgurl: "http://tong.visitkorea.or.kr/cms/resource/2.jpg", serialnum: "3" },
  ]);
  assert.deepEqual(photos, [{ url: "https://tong.visitkorea.or.kr/cms/resource/2.jpg", thumb: "https://tong.visitkorea.or.kr/cms/resource/2_s.jpg", title: "전경", license: "Type1" }]);
  assert.equal(officialPhotoUrl("https://scontent.cdninstagram.com/x.jpg"), null);
});

test("상세 호출 계획: 상한·캐시 신선도", () => {
  const now = Date.parse("2026-10-13T00:00:00+09:00");
  const matches = [{ contentid: "1", type: "32" }, { contentid: "2", type: "28" }, { contentid: "3", type: "32" }];
  const cache = {
    "1": { info_fetched_at: "2026-10-10T00:00:00+09:00", image_fetched_at: "2026-10-10T00:00:00+09:00" }, // 신선
    "2": { info_fetched_at: "2026-09-01T00:00:00+09:00", image_fetched_at: "2026-10-10T00:00:00+09:00" }, // info만 오래됨
  };
  const plan = planDetailCalls(matches, cache, { now, maxCalls: 10 });
  assert.deepEqual(plan, [{ contentid: "3", type: "32", ops: ["info", "image"] }, { contentid: "2", type: "28", ops: ["info"] }]);
  assert.deepEqual(planDetailCalls(matches, cache, { now, maxCalls: 1 }), [{ contentid: "3", type: "32", ops: ["info"] }]);
  assert.deepEqual(planDetailCalls(matches, cache, { now, maxCalls: 0 }), []);
});

test("레코드·커버리지", () => {
  const { products, info } = normalizeDetailInfo([ROOM]);
  const m = { contentid: "900", type: "32", title: "별빛하늘 글램핑", score: 0.6, distance_m: 89, name_similarity: 0.57 };
  const r = buildRecord(m, { info_fetched_at: "2026-10-13T09:00:00+09:00", image_fetched_at: "2026-10-12T09:00:00+09:00", products, info, photos: [{ url: "https://tong.visitkorea.or.kr/1.jpg" }] });
  assert.equal(r.tour_id, "900");
  assert.equal(r.checked_at, "2026-10-12T09:00:00+09:00");
  assert.equal(r.source_url, "https://korean.visitkorea.or.kr/detail/ms_detail.do?cotid=900");
  assert.deepEqual(r.matched, { score: 0.6, distance_m: 89, name_similarity: 0.57 });
  assert.equal(buildRecord(m, undefined), null);
  const cov = coverage({ "2": r });
  assert.equal(cov.with_products, 1);
  assert.equal(cov.with_prices, 1);
  assert.equal(cov.with_product_photos, 1);
  assert.equal(cov.with_photos, 1);
});
