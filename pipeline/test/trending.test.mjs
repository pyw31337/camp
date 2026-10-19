import test from "node:test";
import assert from "node:assert/strict";
import { buildMatcher, matchPost, platformOf, rankCamps, recencyWeight, spamReason, urlKey } from "../lib/trending.mjs";
import { kakaoSource, naverSource, queryPlan } from "../lib/trending-sources.mjs";

const camps = [
  { id: "1", name: "아웃오브파크", sido: "강원특별자치도", sigungu: "춘천시" },
  { id: "2", name: "하늘캠핑장", sido: "경기도", sigungu: "가평군" },
  { id: "3", name: "하늘캠핑장", sido: "충청북도", sigungu: "괴산군" },
  { id: "4", name: "솔바람숲캠핑장", sido: "경기도", sigungu: "양평군" },
  { id: "5", name: "솔바람캠핑장", sido: "전라남도", sigungu: "구례군" },
  { id: "6", name: "동해글램핑장", sido: "강원특별자치도", sigungu: "동해시" },
];
const m = buildMatcher(camps);

test("고유한 이름은 캠핑 맥락만 있으면 맞춘다", () => {
  assert.deepEqual(matchPost({ title: "춘천 아웃오브파크 카라반 1박 후기", snippet: "에어스트림 캠핑" }, m), ["1"]);
});
test("흔한 이름(하늘캠핑장)은 지역 단서가 있어야 하고, 그 지역 한 곳만 고른다", () => {
  assert.deepEqual(matchPost({ title: "하늘캠핑장 다녀왔어요", snippet: "불멍 최고" }, m), []);
  assert.deepEqual(matchPost({ title: "가평 하늘캠핑장 다녀왔어요", snippet: "불멍 최고" }, m), ["2"]);
  assert.deepEqual(matchPost({ title: "괴산 하늘캠핑장 후기", snippet: "계곡 캠핑" }, m), ["3"]);
});
test("긴 이름이 짧은 이름을 덮는다", () => {
  assert.deepEqual(matchPost({ title: "양평 솔바람숲캠핑장 사이트 추천", snippet: "캠핑" }, m), ["4"]);
});
test("일반어 핵심어(글램핑장)는 이름 전체+지역일 때만", () => {
  assert.deepEqual(matchPost({ title: "서울 근교 글램핑장 추천", snippet: "글램핑" }, m), []);
  assert.deepEqual(matchPost({ title: "동해 동해글램핑장 후기", snippet: "글램핑" }, m), ["6"]);
});
test("모음 글(5곳 넘게)·광고는 순위에 넣지 않는다", () => {
  const many = buildMatcher(["가나다", "라마바", "사아자", "차카타", "파하거"].map((n, i) => ({ id: String(i), name: `${n}캠핑장`, sido: "경기도", sigungu: "가평군" })));
  assert.deepEqual(matchPost({ title: "가평 캠핑장 5곳: 가나다캠핑장 라마바캠핑장 사아자캠핑장 차카타캠핑장 파하거캠핑장", snippet: "" }, many), []);
  assert.equal(spamReason({ url: "https://camppick.com/x", title: "아웃오브파크" }), "정보 모음 사이트");
  assert.equal(spamReason({ url: "https://blog.naver.com/a/1", title: "가평 캠핑장 토지 매매" }), "광고·부동산");
});
test("같은 글 주소는 하나로 본다", () => {
  assert.equal(urlKey("http://m.blog.naver.com/abc/223?x=1"), urlKey("https://blog.naver.com/abc/223"));
  assert.equal(urlKey("https://blog.naver.com/PostView.naver?blogId=abc&logNo=223"), "blog.naver.com/abc/223");
  assert.equal(platformOf({ url: "https://www.youtube.com/watch?v=x" }), "youtube");
  assert.equal(platformOf({ url: "https://cafe.daum.net/x/1" }), "daum");
});
test("최근일수록 크게 세고, 전날 순위로 화살표를 단다", () => {
  assert.equal(recencyWeight("2026-10-19", "2026-10-19"), 1);
  assert.equal(recencyWeight("2026-10-17", "2026-10-19"), 0.5);
  assert.equal(recencyWeight("2026-10-12", "2026-10-19"), 0);
  const posts = [
    { ids: ["1"], date: "2026-10-19", platform: "naver", url: "a" }, { ids: ["1"], date: "2026-10-18", platform: "daum", url: "b" },
    { ids: ["4"], date: "2026-10-15", platform: "naver", url: "c" }, { ids: ["4"], date: "2026-10-15", platform: "youtube", url: "d" }, { ids: ["4"], date: "2026-10-14", platform: "naver", url: "e" },
  ];
  const r = rankCamps(posts, "2026-10-19", { prevRanks: { 4: 1 } });
  assert.deepEqual(r.map((x) => [x.id, x.today, x.week, x.trend]), [["1", 1, 2, "new"], ["4", 0, 3, "down"]]);
  assert.deepEqual(r[1].by, { naver: 2, youtube: 1 });
});

test("수집원: 카카오는 기간보다 오래된 쪽이 나오면 다음 쪽을 부르지 않고, 한도를 넘지 않는다", async () => {
  const urls = [];
  const fetchImpl = async (u) => {
    urls.push(u);
    const page = Number(new URL(u).searchParams.get("page"));
    const date = page === 1 ? "2026-10-19T10:00:00+09:00" : "2026-10-01T10:00:00+09:00";
    return { ok: true, json: async () => ({ documents: Array.from({ length: 50 }, (_, i) => ({ url: `https://blog.example/${page}/${i}`, title: "t", contents: "c", datetime: date })) }) };
  };
  const s = kakaoSource({ key: "k", caps: { blog: 5, cafe: 0, vclip: 0 }, fetchImpl, sleep: async () => {} });
  const out = await s.collect(["캠핑장", "글램핑"], "2026-10-13");
  assert.equal(s.calls.blog, 4, "검색어마다 1쪽(새 글)·2쪽(옛 글)에서 멈춘다");
  assert.equal(out.length, 100);
  assert.ok(urls.every((u) => /sort=recency/.test(u)));
});
test("수집원: 네이버는 최신순(sort=date)·실행 상한을 지킨다", async () => {
  let n = 0;
  const fetchImpl = async (u) => { n++; return { ok: true, text: async () => JSON.stringify({ items: [{ link: "https://blog.naver.com/a/1", title: "t", description: "d", postdate: "20261019" }] }) }; };
  const s = naverSource({ id: "i", secret: "s", maxCalls: 7, fetchImpl, sleep: async () => {} });
  await s.collect(queryPlan(), "2026-10-13");
  assert.ok(s.calls <= 7 && n <= 7);
  assert.equal(queryPlan().length, 44);
});

test("trending: 카카오 동시 수집도 종류별 상한·시간 상한을 지킨다", async () => {
  const fetchImpl = async () => ({ ok: true, status: 200, json: async () => ({ documents: Array.from({ length: 50 }, (_, i) => ({ url: `https://blog.example/${Math.random()}`, datetime: "2026-10-19T10:00:00+09:00", title: "t" + i, contents: "" })) }) });
  const s = kakaoSource({ key: "k", caps: { blog: 7, cafe: 3, vclip: 0 }, concurrency: 4, fetchImpl, sleep: async () => {} });
  await s.collect(["a", "b", "c"], "2026-10-13");
  assert.deepEqual(s.calls, { blog: 7, cafe: 3, vclip: 0 });
  const late = kakaoSource({ key: "k", deadline: Date.now() - 1, fetchImpl, sleep: async () => {} });
  assert.deepEqual(await late.collect(["a"], "2026-10-13"), []);
  assert.equal(late.stopped, "deadline");
});

test("trending: 일반어 핵심어·지역 없는 글·작성자 도배는 세지 않는다", () => {
  const M = buildMatcher([
    { id: "p1", name: "산청프리미엄캠핑장", sido: "경상남도", sigungu: "산청군" },
    { id: "p2", name: "캠핑아이", sido: "전라남도", sigungu: "영광군" },
    { id: "p3", name: "인천대공원 캠핑장", sido: "인천광역시", sigungu: "남동구" },
  ]);
  assert.deepEqual(matchPost({ title: "캠핑용 프리미엄 휴대용 빔프로젝터 산청 여행" }, M), []);
  assert.deepEqual(matchPost({ title: "산청 프리미엄 캠핑장 1박 후기", snippet: "산청 캠핑" }, M), ["p1"]);
  assert.deepEqual(matchPost({ title: "김해 캠핑 아이랑 가기 좋은 곳" }, M), []);
  assert.deepEqual(matchPost({ title: "인천대공원 가을 산책 단풍 캠핑 피크닉" }, M), []);
  assert.deepEqual(matchPost({ title: "인천대공원 캠핑장 후기 아이와 캠핑", snippet: "인천 남동구" }, M), ["p3"]);
  const posts = Array.from({ length: 5 }, (_, i) => ({ ids: ["p1"], date: "2026-10-19", url: `https://blog.naver.com/owner/${i}`, platform: "naver", title: "t" }));
  assert.equal(rankCamps(posts, "2026-10-19")[0].week, 2);
});

test("trending: 요약에만 스친 축제·모음 글, 같은 카페 도배는 세지 않는다", () => {
  const M = buildMatcher([{ id: "c1", name: "칠곡보 오토캠핑장", sido: "경상북도", sigungu: "칠곡군" }]);
  assert.deepEqual(matchPost({ title: "칠곡낙동강평화축제 총정리", snippet: "주요 장소 칠곡보오토캠핑장 칠곡 왜관" }, M), []);
  assert.deepEqual(matchPost({ title: "칠곡 캠핑 1박 후기", snippet: "칠곡보오토캠핑장 사이트 넓고 칠곡군" }, M), ["c1"]);
  const posts = Array.from({ length: 4 }, (_, i) => ({ ids: ["c1"], date: "2026-10-19", url: `https://cafe.naver.com/owner/${i}`, platform: "naver", title: "t" }));
  assert.equal(rankCamps(posts, "2026-10-19")[0].week, 2);
});
