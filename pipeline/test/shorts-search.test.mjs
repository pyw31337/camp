import test from "node:test";
import assert from "node:assert/strict";
import { fileURLToPath } from "node:url";
import { SHORTS_CACHE_VERSION, fillShorts, isoDurationSec, pickShortsDue, shortsFromVclip, shortsFromYoutube, shortsQueries } from "../lib/shorts-search.mjs";

const camp = { id: "1", name: "명학산캠핑장", address: { sido: "경기도", sigungu: "파주시" } };
test("검색어: 이름 쇼츠·shorts", () => {
  assert.deepEqual(shortsQueries(camp), ["명학산캠핑장 쇼츠", "명학산캠핑장 shorts"]);
  assert.deepEqual(shortsQueries({ name: "별빛마을" }), ["별빛마을 캠핑 쇼츠", "별빛마을 캠핑 shorts"]);
});
test("ISO 길이", () => { assert.equal(isoDurationSec("PT1M5S"), 65); assert.equal(isoDurationSec("PT45S"), 45); assert.equal(isoDurationSec("PT1H"), 3600); assert.equal(isoDurationSec("x"), null); });
test("vclip: YouTube·숏츠·이름 관련만", () => {
  const docs = [
    { title: "명학산캠핑장 불멍 #shorts", url: "https://youtube.com/shorts/abcdefghijk", play_time: 40, author: "a", datetime: "2026-09-01T00:00:00" },
    { title: "명학산캠핑장 1박 브이로그", url: "https://www.youtube.com/watch?v=dQw4w9WgXcQ", play_time: 900 }, // 길다
    { title: "명학산 등산 쇼츠", url: "https://youtube.com/shorts/zzzzzzzzzzz", play_time: 30 }, // 캠핑 맥락 없음
    { title: "다른캠핑장 쇼츠", url: "https://youtube.com/shorts/yyyyyyyyyyy", play_time: 30 }, // 이름 다름
    { title: "명학산캠핑장 캠핑 숏폼", url: "http://tv.kakao.com/v/123", play_time: 30 }, // YouTube 아님
    { title: "명학산캠핑장 캠핑 2분", url: "https://www.youtube.com/watch?v=AAAAAAAAAAA", play_time: 150 }, // 3분 이하 → 숏츠
  ];
  const r = shortsFromVclip(camp, docs);
  assert.deepEqual(r.map((x) => x.yt), ["abcdefghijk", "AAAAAAAAAAA"]);
  assert.ok(r.every((x) => x.kind === "short"));
});
test("YouTube API: 길이 ≤180초·이름 관련만", () => {
  const items = [
    { id: { videoId: "v1xxxxxxxxx" }, snippet: { title: "명학산캠핑장 노을", description: "캠핑 #shorts", channelTitle: "c", publishedAt: "2026-08-01T00:00:00Z" } },
    { id: { videoId: "v2xxxxxxxxx" }, snippet: { title: "명학산캠핑장 캠핑 풀영상", description: "", channelTitle: "c" } },
    { id: { videoId: "v3xxxxxxxxx" }, snippet: { title: "오늘의 요리", description: "", channelTitle: "c" } },
  ];
  const r = shortsFromYoutube(camp, items, { v1xxxxxxxxx: 50, v2xxxxxxxxx: 1200, v3xxxxxxxxx: 30 });
  assert.deepEqual(r.map((x) => [x.yt, x.url, x.date]), [["v1xxxxxxxxx", "https://www.youtube.com/shorts/v1xxxxxxxxx", "2026-08-01"]]);
});
test("채우기만: 기존 영상 유지, 같은 id는 다시 안 붙임", () => {
  const old = [{ yt: "abcdefghijk", url: "https://www.youtube.com/watch?v=abcdefghijk", title: "원래" }, { url: "https://tv.naver.com/v/1", title: "네이버" }];
  const f = fillShorts(old, [{ yt: "abcdefghijk", url: "https://youtube.com/shorts/abcdefghijk" }, { yt: "BBBBBBBBBBB", url: "https://youtube.com/shorts/BBBBBBBBBBB", kind: "short" }]);
  assert.equal(f.videos.length, 3);
  assert.deepEqual(f.videos.slice(0, 2), old);
  assert.deepEqual(f.added.map((x) => x.yt), ["BBBBBBBBBBB"]);
  assert.equal(fillShorts(undefined, []).videos.length, 0);
});
test("대상 순서: 영상 없는 곳 먼저, 최근 캐시는 건너뜀", () => {
  const camps = [{ id: "a" }, { id: "b" }, { id: "c" }];
  const now = Date.parse("2026-10-22T00:00:00Z");
  const cache = { c: { v: SHORTS_CACHE_VERSION, fetched_at: "2026-10-20T00:00:00Z" } };
  assert.deepEqual(pickShortsDue(camps, cache, (id) => id === "a", 30, now).map((x) => x.id), ["b", "a"]);
  // 이전 버전 캐시(v1 숏츠만)는 최근이어도 다시 찾는다(v2 영상 확대)
  assert.deepEqual(pickShortsDue(camps, { c: { v: 1, fetched_at: "2026-10-20T00:00:00Z" } }, (id) => id === "a", 30, now).map((x) => x.id), ["b", "c", "a"]);
});
test("대상 순서: 찜/우선순위(priorityIds) 업장이 영상 유무보다 최우선", () => {
  const camps = [{ id: "a" }, { id: "b" }, { id: "c" }];
  const now = Date.parse("2026-10-22T00:00:00Z");
  const cache = {};
  // 'a'는 영상이 있지만 찜(priorityIds)되어 있으면 영상 없는 'b'보다 먼저 수집되어야 함
  const priority = new Set(["a"]);
  assert.deepEqual(pickShortsDue(camps, cache, (id) => id === "a", 30, now, priority).map((x) => x.id), ["a", "b", "c"]);
});
test("merge-collected --shorts: 상세 영상 칸에 채우기만", async () => {
  const { mkdtempSync, mkdirSync, writeFileSync, readFileSync } = await import("node:fs");
  const { tmpdir } = await import("node:os");
  const { join } = await import("node:path");
  const { execFileSync } = await import("node:child_process");
  const dir = mkdtempSync(join(tmpdir(), "shorts-")); mkdirSync(join(dir, "camps"));
  writeFileSync(join(dir, "camps", "1.json"), JSON.stringify({ name: "a" }));
  writeFileSync(join(dir, "camps", "2.json"), JSON.stringify({ videos: [{ yt: "XXXXXXXXXXX", title: "원래" }] }));
  const sh = join(dir, "s.json");
  writeFileSync(sh, JSON.stringify({ campgrounds: { 1: { shorts: [{ yt: "AAAAAAAAAAA", url: "https://youtube.com/shorts/AAAAAAAAAAA", kind: "short" }] }, 2: { shorts: [{ yt: "XXXXXXXXXXX" }] }, 3: { fetched_at: "x" } } }));
  const out = execFileSync("node", [fileURLToPath(new URL("../scripts/merge-collected.mjs", import.meta.url)), "--shorts", sh, "--data", dir], { encoding: "utf8" });
  assert.match(out, /숏츠 병합: 1곳\(영상 없던 곳 1곳\) · 숏츠 1개/);
  assert.equal(JSON.parse(readFileSync(join(dir, "camps", "1.json"), "utf8")).videos[0].yt, "AAAAAAAAAAA");
  assert.deepEqual(JSON.parse(readFileSync(join(dir, "camps", "2.json"), "utf8")).videos, [{ yt: "XXXXXXXXXXX", title: "원래" }]);
});

// t39 #36 정밀도 보강: 첫 수집에서 나온 오인 사례가 다시 들어오지 않게
import { shortsMatch, refilterShorts } from "../lib/shorts-search.mjs";
test("shortsMatch: 일반어 이름·다른 캠핑장·채널명 오인은 뺀다", () => {
  const c = (name, sigungu) => ({ name, address: { sigungu } });
  assert.equal(shortsMatch(c("좋은 카라반", "밀양시"), "4인 가족이 타기 좋은 카라반#shorts#캠핑카"), false);
  assert.equal(shortsMatch(c("하우스 캠핑장", "영월군"), "#Shorts 남해 버드하우스캠핑장 사전답사"), false);
  assert.equal(shortsMatch(c("언덕캠핑장", "고성군"), "랑리온캠핑 | 한탄강 오토캠핑장 #7 Shorts | 언덕야영지"), false);
  assert.equal(shortsMatch(c("스플래쉬 패드", "남양주시"), "뉴질랜드 스플래쉬패드와 놀이터 무료캠핑장 #Shorts"), false);
  assert.equal(shortsMatch(c("노을캠핑장", "통영시"), "서울에서 만 원에 캠핑 #노을캠핑장 #쇼츠"), false);
  assert.equal(shortsMatch(c("도토리 캠핑장", "홍천군"), "도토리TV 캠핑플래닛 #캠핑장 Shorts"), false);
  assert.equal(shortsMatch(c("동락공원", "구미시"), "캠핑대마왕 구미 동락공원 #shorts"), false); // 4자 + 장소명: 캠핑장 접미어 없음
});
test("shortsMatch: 고유명 + 캠핑 맥락이면 남긴다", () => {
  const c = (name, sigungu) => ({ name, address: { sigungu } });
  assert.equal(shortsMatch(c("북한산 사기막야영장", "고양시"), "(최초공개)북한산 사기막 야영장 현장 모습 #shorts"), true);
  assert.equal(shortsMatch(c("임진각 평화누리 / 평화누리캠핑장", "파주시"), "임진각평화누리캠핑장 피칭영상 #shorts #camping"), true);
  assert.equal(shortsMatch(c("합천영상테마파크", "합천군"), "캠핑대마왕 합천영상테마파크 아이와 강추 #shorts"), true);
  assert.deepEqual(refilterShorts(c("좋은 카라반", "밀양시"), [{ title: "좋은 카라반 #캠핑 shorts" }]), []);
});
test("숏츠: 다른 시·군 이름이 핵심어 앞에 붙으면 제외, exclude 목록 제외 (100278 진천 더빌리지)", async () => {
  const { shortsMatch, refilterShorts, excludeMap } = await import("../lib/shorts-search.mjs");
  const camp = { name: "더빌리지캠핑장", address: { sigungu: "태안군" } };
  assert.equal(shortsMatch(camp, "캠핑계의 에르메스 진천 더빌리지 캠핑장 #shorts", { stems: ["진천", "태안"] }), false);
  assert.equal(shortsMatch(camp, "태안 더빌리지 캠핑장 #shorts", { stems: ["진천", "태안"] }), true);
  const ex = excludeMap({ _note: "x", 100278: [{ yt: "MwVOrtKjy9M" }] });
  assert.deepEqual(ex, { 100278: ["MwVOrtKjy9M"] });
  assert.deepEqual(refilterShorts(camp, [{ yt: "MwVOrtKjy9M", title: "태안 더빌리지 캠핑장" }], { exclude: ex["100278"] }), []);
});

// v2 영상 확대 수집(소유자 2026-10-30: “유튜브엔 영상·쇼츠가 많은데 한두 개만 보인다”)
test("v2 영상: 일반 영상·숏츠를 함께 모으고, YouTube이고 제목에 이름이 있는 것만", async () => {
  const { videosFromVclip, isShortVideo, videoQueries } = await import("../lib/shorts-search.mjs");
  const docs = [
    { title: "명학산캠핑장 1박 브이로그", url: "https://www.youtube.com/watch?v=dQw4w9WgXcQ", play_time: 900, author: "a" },
    { title: "명학산캠핑장 불멍 #shorts", url: "https://www.youtube.com/watch?v=abcdefghijk", play_time: 40 },
    { title: "명학산 캠핑 우중캠핑 2편", url: "https://www.youtube.com/watch?v=BBBBBBBBBBB", play_time: 700 }, // 고유명 형태가 아니어도 받는다
    { title: "명학산 등산 브이로그", url: "https://www.youtube.com/watch?v=CCCCCCCCCCC", play_time: 600 }, // 캠핑 맥락 없음
    { title: "캠핑 브이로그 (명학산캠핑장 근처)", url: "https://tv.kakao.com/v/123", play_time: 300 }, // YouTube 아님
    { title: "다른캠핑장 캠핑", url: "https://www.youtube.com/watch?v=DDDDDDDDDDD", play_time: 600, author: "명학산캠핑장" }, // 채널명에만 이름
    { title: "명학산캠핑장 1박 브이로그", url: "https://www.youtube.com/watch?v=dQw4w9WgXcQ", play_time: 900 }, // 같은 id
  ];
  const r = videosFromVclip(camp, docs);
  assert.deepEqual(r.videos.map((x) => x.yt), ["dQw4w9WgXcQ", "BBBBBBBBBBB"]);
  assert.deepEqual(r.shorts.map((x) => x.yt), ["abcdefghijk"]);
  assert.ok(isShortVideo({ url: "https://youtube.com/shorts/x", dur: 170 }));
  assert.ok(isShortVideo({ url: "https://www.youtube.com/watch?v=x", dur: 150, title: "명학산 #shorts" }));
  assert.ok(!isShortVideo({ url: "https://www.youtube.com/watch?v=x", dur: 150, title: "명학산 캠핑" }));
  assert.deepEqual(videoQueries(camp).map((x) => [x.q, x.page]), [["명학산캠핑장", 1], ["명학산캠핑장", 2], ["명학산캠핑장 쇼츠", 1]]);
});
test("v2 기록: 숏츠 먼저, 그다음 일반 영상 · 제외 목록 반영 · 채우기는 기존 영상 뒤에", async () => {
  const { recordVideos, fillShorts } = await import("../lib/shorts-search.mjs");
  const r = { v: 2, shorts: [{ yt: "S1xxxxxxxxx", title: "명학산캠핑장 불멍 쇼츠", kind: "short" }], videos: [{ yt: "V1xxxxxxxxx", title: "명학산캠핑장 캠핑 브이로그", kind: "video" }, { yt: "V2xxxxxxxxx", title: "명학산캠핑장 캠핑 2", kind: "video" }] };
  assert.deepEqual(recordVideos(camp, r, { exclude: ["V2xxxxxxxxx"] }).map((x) => x.yt), ["S1xxxxxxxxx", "V1xxxxxxxxx"]);
  const f = fillShorts([{ yt: "V1xxxxxxxxx", title: "원래" }], recordVideos(camp, r));
  assert.deepEqual(f.videos.map((x) => x.yt), ["V1xxxxxxxxx", "S1xxxxxxxxx", "V2xxxxxxxxx"]);
});
