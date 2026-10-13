import { test } from "node:test";
import assert from "node:assert/strict";
import {
  CAPS, buildQuery, buildSocialRecord, distinctiveTokens, isRelevant, kakaoSearch, nameCore, normalizeDoc,
  normalizeImage, normalizeVclip, pickDue, regionStem, searchUrl, stripHtml, summarize, youtubeId,
} from "../lib/social-search.mjs";

const camp = { id: "1066", name: "명학산 캠핑장", address: { sido: "경기도", sigungu: "파주시" } };

// 카카오 검색 응답 형태를 본뜬 고정 데이터(네트워크 없음)
const blogDocs = [
  { title: "<b>명학산</b> <b>캠핑장</b> 솔캠 후기 - 파쇄석 사이트", contents: "파주 <b>명학산캠핑장</b>에 다녀왔어요. 개수대가 깨끗하고 &amp; 화장실도 가까워요", url: "https://blog.naver.com/camper/223000000001", blogname: "주말캠퍼", thumbnail: "https://search1.kakaocdn.net/argon/130x130_85_c/abc", datetime: "2026-09-20T10:00:00.000+09:00" },
  { title: "파주 <b>명학산</b> 캠핑 2박3일", contents: "아이들과 <b>명학산</b> 캠핑", url: "http://camplog.tistory.com/88", blogname: "캠프로그", thumbnail: "", datetime: "2026-08-01T09:00:00.000+09:00" },
  { title: "파주 <b>명학산</b> 인근 토지 매매 급매", contents: "<b>명학산</b> 캠핑장 근처 토지", url: "https://blog.naver.com/realty/1", blogname: "부동산이야기", datetime: "2026-09-30T00:00:00.000+09:00" },
  { title: "파주 감성 <b>캠핑장</b> 추천", contents: "율곡캠핑장, 임진강캠핑장 소개", url: "https://blog.naver.com/x/2", blogname: "x", datetime: "2026-09-29T00:00:00.000+09:00" },
  { title: "임진강캠핑장 후기", contents: "다음엔 명학산캠핑장도 가보려고요", url: "https://blog.naver.com/y/3", blogname: "y", datetime: "2026-09-28T00:00:00.000+09:00" },
  { title: "<b>명학산</b> <b>캠핑장</b> 솔캠 후기 - 파쇄석 사이트", contents: "중복", url: "https://m.blog.naver.com/camper/223000000001", blogname: "주말캠퍼", datetime: "2026-09-20T10:00:00.000+09:00" },
];
const cafeDocs = [
  { title: "<b>명학산캠핑장</b> 다녀왔습니다", contents: "사이트 간격 넓음", url: "https://cafe.daum.net/campingfirst/abc/123", cafename: "캠핑퍼스트", thumbnail: "https://search2.kakaocdn.net/argon/130x130_85_c/def", datetime: "2026-07-11T08:00:00.000+09:00" },
];
const imageDocs = [
  { collection: "news", thumbnail_url: "https://search1.kakaocdn.net/thumb/1", image_url: "https://img.news.com/1.jpg", width: 800, height: 600, display_sitename: "뉴스", doc_url: "https://news.example.com/1", datetime: "2026-01-01T00:00:00.000+09:00" },
  { collection: "blog", thumbnail_url: "https://search1.kakaocdn.net/thumb/2", image_url: "https://blogfiles.naver.net/2.jpg", width: 1200, height: 900, display_sitename: "네이버블로그", doc_url: "https://blog.naver.com/camper/223000000001", datetime: "2026-09-20T00:00:00.000+09:00" },
  { collection: "cafe", thumbnail_url: "https://search1.kakaocdn.net/thumb/3", image_url: "https://cafe.img/3.jpg", width: 100, height: 80, display_sitename: "Daum카페", doc_url: "https://cafe.daum.net/x/3", datetime: "2026-09-21T00:00:00.000+09:00" },
  { collection: "blog", thumbnail_url: "https://search1.kakaocdn.net/thumb/4", image_url: "https://blogfiles.naver.net/2.jpg", width: 1200, height: 900, display_sitename: "네이버블로그", doc_url: "https://blog.naver.com/dup/1", datetime: "2026-09-20T00:00:00.000+09:00" },
  { collection: "blog", thumbnail_url: "", image_url: "https://x/5.jpg", doc_url: "https://x/5" },
];
const vclipDocs = [
  { title: "파주 <b>명학산캠핑장</b> 브이로그", url: "https://www.youtube.com/watch?v=dQw4w9WgXcQ&t=3", play_time: 734, thumbnail: "https://search4.kakaocdn.net/argon/138x78_80_pr/v1", author: "캠핑하는가족", datetime: "2026-09-01T12:00:00.000+09:00" },
  { title: "<b>명학산</b> 캠핑 불멍", url: "https://youtube.com/shorts/abcdefghijk", play_time: 120, thumbnail: "https://search4.kakaocdn.net/v2", author: "숏캠", datetime: "2026-09-02T00:00:00.000+09:00" },
  { title: "<b>명학산</b> 캠핑장 1분 요약", url: "http://tv.kakao.com/v/123456", play_time: 58, author: "카카오TV유저", datetime: "2026-08-02T00:00:00.000+09:00" },
  { title: "다른 동네 캠핑 브이로그", url: "https://youtu.be/ZZZZZZZZZZZ", play_time: 600, author: "누군가" },
  { title: "파주 <b>명학산캠핑장</b> 브이로그 (재업)", url: "https://youtu.be/dQw4w9WgXcQ", play_time: 734, author: "캠핑하는가족" },
];

test("stripHtml: <b> 태그와 엔티티", () => {
  assert.equal(stripHtml("<b>명학산</b> &amp; 캠핑 &#39;후기&#39;"), "명학산 & 캠핑 '후기'");
  assert.equal(stripHtml(null), "");
});

test("regionStem·distinctiveTokens", () => {
  assert.equal(regionStem("파주시"), "파주");
  assert.equal(regionStem("중구"), "중구");
  assert.equal(regionStem("창원시 의창구"), "창원");
  assert.deepEqual(distinctiveTokens("명학산 캠핑장", "파주시"), ["명학산"]);
  assert.deepEqual(distinctiveTokens("화천 둥지캠핑장", "화천군"), ["둥지"]);
  assert.deepEqual(distinctiveTokens("단양 스텔라캠프", "단양군"), ["스텔라"]);
  assert.deepEqual(distinctiveTokens("주식회사 라하", "홍천군"), ["라하"]);
  assert.deepEqual(distinctiveTokens("경주시종합자원화단지 별빛카라반", "경주시"), ["종합자원화단지", "별빛"]);
  assert.equal(nameCore("낙힐 더 포레스트", "가평군"), "낙힐포레스트");
});

test("buildQuery: 법인 접두어 제거, 시군구 약칭, 일반어 없으면 ‘캠핑’", () => {
  assert.equal(buildQuery(camp), "명학산 캠핑장 파주");
  assert.equal(buildQuery({ name: "화천 둥지캠핑장", address: { sigungu: "화천군" } }), "화천 둥지캠핑장");
  assert.equal(buildQuery({ name: "주식회사 라하", address: { sigungu: "홍천군" } }), "라하 캠핑 홍천");
  assert.equal(buildQuery({ name: "(주)솔바람 오토캠핑장", address: { sigungu: "양평군" } }), "솔바람 오토캠핑장 양평");
  assert.equal(buildQuery({ name: "옥화자연휴양림 국민여가오토캠핑장", address: { sigungu: "청주시 상당구" } }), "옥화자연휴양림 국민여가오토캠핑장 청주");
  assert.equal(buildQuery({ name: "  " }), null);
});

test("isRelevant: 이름 포함·광고·짧은 이름·다른 캠핑장 제목", () => {
  const ctx = { tokens: ["명학산"], stem: "파주", others: ["명학산", "임진강", "율곡"] };
  assert.equal(isRelevant({ title: "<b>명학산</b> <b>캠핑장</b> 후기" }, ctx), true);
  assert.equal(isRelevant({ title: "파주 감성 캠핑장 추천", contents: "율곡캠핑장" }, ctx), false);
  assert.equal(isRelevant({ title: "명학산 토지 매매" }, ctx), false);
  assert.equal(isRelevant({ title: "명학산 전원주택 분양" }, ctx), false);
  assert.equal(isRelevant({ title: "임진강캠핑장 후기", contents: "다음엔 명학산캠핑장도" }, ctx), false);
  assert.equal(isRelevant({ title: "주말 나들이", contents: "명학산캠핑장 다녀옴" }, ctx), true);
  const short = { tokens: ["라하"], stem: "홍천", others: [] };
  assert.equal(isRelevant({ title: "라하 캠핑 후기" }, short), true);
  assert.equal(isRelevant({ title: "라하 호텔 조식 후기" }, short), false);
  assert.equal(isRelevant({ title: "홍천 라하 다녀옴" }, short), true);
  const multi = { tokens: ["낙힐", "포레스트"], stem: "가평", others: [] };
  assert.equal(isRelevant({ title: "낙힐 더 포레스트 글램핑" }, multi), true);
  assert.equal(isRelevant({ title: "가평 포레스트 캠핑" }, multi), false);
});

test("normalizeDoc·normalizeImage", () => {
  const b = normalizeDoc(blogDocs[1], "blog");
  assert.deepEqual(b, { t: "blog", title: "파주 명학산 캠핑 2박3일", snippet: "아이들과 명학산 캠핑", url: "https://camplog.tistory.com/88", src: "캠프로그", thumb: null, date: "2026-08-01" });
  assert.equal(normalizeDoc(cafeDocs[0], "cafe").src, "캠핑퍼스트");
  assert.equal(normalizeDoc({ title: "x", url: "javascript:alert(1)" }, "blog"), null);
  const i = normalizeImage(imageDocs[1]);
  assert.deepEqual(i, { thumb: "https://search1.kakaocdn.net/thumb/2", img: "https://blogfiles.naver.net/2.jpg", url: "https://blog.naver.com/camper/223000000001", src: "네이버블로그", w: 1200, h: 900, date: "2026-09-20" });
  assert.equal(normalizeImage(imageDocs[4]), null);
});

test("youtubeId·normalizeVclip", () => {
  assert.equal(youtubeId("https://www.youtube.com/watch?v=dQw4w9WgXcQ&t=3"), "dQw4w9WgXcQ");
  assert.equal(youtubeId("https://youtu.be/dQw4w9WgXcQ?si=xx"), "dQw4w9WgXcQ");
  assert.equal(youtubeId("https://m.youtube.com/shorts/abcdefghijk"), "abcdefghijk");
  assert.equal(youtubeId("https://www.youtube.com/embed/dQw4w9WgXcQ"), "dQw4w9WgXcQ");
  assert.equal(youtubeId("http://tv.kakao.com/v/123456"), null);
  assert.equal(youtubeId("not a url"), null);
  const v = normalizeVclip(vclipDocs[0]);
  assert.equal(v.yt, "dQw4w9WgXcQ");
  assert.equal(v.kind, "video");
  assert.equal(v.dur, 734);
  assert.equal(v.author, "캠핑하는가족");
  assert.equal(normalizeVclip(vclipDocs[1]).kind, "short"); // /shorts/ 이면 120초여도 숏폼
  const k = normalizeVclip(vclipDocs[2]);
  assert.equal(k.kind, "short"); // 60초 이하
  assert.equal(k.yt, null);
  assert.equal(k.url, "https://tv.kakao.com/v/123456");
});

test("buildSocialRecord: 필터·중복 제거·정렬·상한", () => {
  const r = buildSocialRecord(camp, { blog: blogDocs, cafe: cafeDocs, image: imageDocs, vclip: vclipDocs }, { others: ["명학산", "임진강", "율곡"] });
  assert.deepEqual(r.blog.map((x) => x.url), ["https://blog.naver.com/camper/223000000001", "https://camplog.tistory.com/88"]);
  assert.equal(r.cafe.length, 1);
  // vclip: 무관 영상 제외, 같은 유튜브 ID 재업 제거
  assert.deepEqual(r.vclip.map((x) => x.yt ?? x.url), ["dQw4w9WgXcQ", "abcdefghijk", "https://tv.kakao.com/v/123456"]);
  // image: 관련 블로그 글에서 나온 이미지가 맨 앞, 같은 원본 이미지 중복 제거, 썸네일 없는 항목 제외, 작은 이미지는 뒤로
  assert.deepEqual(r.image.map((x) => x.thumb), ["https://search1.kakaocdn.net/thumb/2", "https://search1.kakaocdn.net/thumb/1", "https://search1.kakaocdn.net/thumb/3"]);
  // 이미지 파일 자체는 없고 URL만
  for (const x of r.image) assert.equal(typeof x.thumb, "string");
});

test("buildSocialRecord: 타입별 상한", () => {
  const many = Array.from({ length: 50 }, (_, i) => ({ title: `명학산 캠핑장 후기 ${i}`, contents: "", url: `https://blog.example.com/${i}`, blogname: "b", datetime: `2026-09-${String((i % 28) + 1).padStart(2, "0")}T00:00:00+09:00` }));
  const imgs = Array.from({ length: 50 }, (_, i) => ({ thumbnail_url: `https://t/${i}`, image_url: `https://i/${i}`, doc_url: `https://d/${i}`, width: 800, height: 600 }));
  const vids = Array.from({ length: 30 }, (_, i) => ({ title: `명학산 캠핑장 ${i}`, url: `https://tv.kakao.com/v/${i}`, play_time: 300 }));
  const r = buildSocialRecord(camp, { blog: many, cafe: many.map((d) => ({ ...d, cafename: "c" })), image: imgs, vclip: vids });
  assert.equal(r.blog.length, CAPS.blog);
  assert.equal(r.cafe.length, CAPS.cafe);
  assert.equal(r.image.length, CAPS.image);
  assert.equal(r.vclip.length, CAPS.vclip);
  assert.ok(r.blog[0].date >= r.blog.at(-1).date); // 최신순
  assert.equal(r.image[0].thumb, "https://t/0"); // 같은 점수면 검색 순위 유지
});

test("kakaoSearch: 헤더·URL·오류 분류", async () => {
  let seen;
  const okFetch = async (url, init) => { seen = { url, init }; return new Response(JSON.stringify({ meta: { total_count: 1, pageable_count: 1, is_end: true }, documents: [{ title: "a" }] }), { status: 200 }); };
  const docs = await kakaoSearch("blog", "명학산 캠핑장 파주", { sort: "recency", size: 10 }, { key: "K", fetchImpl: okFetch });
  assert.equal(docs.length, 1);
  assert.equal(seen.init.headers.Authorization, "KakaoAK K");
  assert.equal(seen.url, searchUrl("blog", "명학산 캠핑장 파주", { sort: "recency", size: 10 }));
  assert.match(seen.url, /^https:\/\/dapi\.kakao\.com\/v2\/search\/blog\?query=/);
  const err = (status, body) => async () => new Response(body, { status });
  await assert.rejects(kakaoSearch("image", "q", {}, { key: "K", fetchImpl: err(429, '{"errorType":"RequestThrottled","message":"API limit has been exceeded."}') }), { code: "RATE_LIMIT" });
  await assert.rejects(kakaoSearch("image", "q", {}, { key: "K", fetchImpl: err(400, '{"code":-10,"msg":"API limit has been exceeded."}') }), { code: "RATE_LIMIT" });
  await assert.rejects(kakaoSearch("image", "q", {}, { key: "K", fetchImpl: err(401, '{"errorType":"AccessDeniedError"}') }), { code: "AUTH" });
  await assert.rejects(kakaoSearch("image", "q", {}, { key: "K", fetchImpl: err(500, "oops") }), { code: "HTTP" });
});

test("pickDue: 캐시 없음 → 오래된 순, 신선한 항목 제외", () => {
  const now = Date.parse("2026-10-13T00:00:00+09:00");
  const camps = [{ id: "a" }, { id: "b" }, { id: "c" }, { id: "d" }];
  const cache = { a: { v: 2, fetched_at: "2026-10-10T00:00:00+09:00" }, b: { v: 2, fetched_at: "2026-09-01T00:00:00+09:00" }, c: { v: 2, fetched_at: "2026-09-20T00:00:00+09:00" } };
  assert.deepEqual(pickDue(camps, cache, 14, now).map((c) => c.id), ["d", "b", "c"]);
});

test("summarize", () => {
  const s = summarize({ a: { image: [1, 2], vclip: [1], blog: [] }, b: { image: [], vclip: [], cafe: [1] } });
  assert.deepEqual(s, { camps: 2, avg_images: 1, with_video_pct: 50, with_posts_pct: 50 });
});

import { buildLayout, extractPriceMentions, parseWon, pickDue as pickDue2, SOCIAL_CACHE_VERSION } from "../lib/social-search.mjs";

test("후기 속 요금: 금액·사이트·계절·요일 추출, 부대요금 제외", () => {
  assert.equal(parseWon("50,000원"), 50000);
  assert.equal(parseWon("5만 5천원"), 55000);
  assert.equal(parseWon("5만원"), 50000);
  const docs = [
    { title: "별빛캠핑장 후기", snippet: "오토캠핑 A구역 평일 45,000원 주말 성수기 6만원이었어요. 장작 10,000원 별도", url: "https://blog.example/1", src: "캠퍼", date: "2026-09-01" },
    { title: "별빛캠핑장 글램핑", snippet: "글램핑 1박 12만원, 전기 5,000원 추가", url: "https://blog.example/2", date: "2026-08-01" },
  ];
  const m = extractPriceMentions(docs);
  const wons = m.map((x) => x.won).sort((a, b) => a - b);
  assert.deepEqual(wons, [45000, 60000, 120000]);
  const a = m.find((x) => x.won === 45000);
  assert.equal(a.day, "weekday");
  assert.match(a.label, /오토|A구역/);
  assert.equal(m.find((x) => x.won === 60000).season, "peak");
  assert.equal(m.find((x) => x.won === 120000).label, "글램핑");
});

test("배치도: 관련 글의 이미지는 확정, 그 외 상위 3장은 추정", () => {
  const camp = { name: "별빛캠핑장", address: { sigungu: "가평군" } };
  const raw = {
    layout_blog: [{ title: "별빛캠핑장 배치도 공유", contents: "사이트 배치도와 명당", url: "https://blog.example/a", blogname: "x" }],
    layout_image: [
      { thumbnail_url: "https://t/1", image_url: "https://i/1", doc_url: "https://blog.example/a", display_sitename: "블로그", width: 900, height: 600 },
      { thumbnail_url: "https://t/2", image_url: "https://i/2", doc_url: "https://other/b", display_sitename: "블로그", width: 800, height: 600 },
    ],
  };
  const l = buildLayout(camp, raw);
  assert.equal(l.images.length, 2);
  assert.equal(l.images[0].sure, true);
  assert.equal(l.images[1].sure, false);
  assert.equal(l.posts.length, 1);
  // 이전 버전 캐시는 다시 받는다
  const due = pickDue2([{ id: "1" }, { id: "2" }], { 1: { v: SOCIAL_CACHE_VERSION, fetched_at: new Date().toISOString() }, 2: { fetched_at: new Date().toISOString() } }, 14);
  assert.deepEqual(due.map((c) => c.id), ["2"]);
});
