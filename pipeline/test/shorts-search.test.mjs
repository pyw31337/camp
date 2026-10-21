import test from "node:test";
import assert from "node:assert/strict";
import { fillShorts, isoDurationSec, pickShortsDue, shortsFromVclip, shortsFromYoutube, shortsQueries } from "../lib/shorts-search.mjs";

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
  const cache = { c: { v: 1, fetched_at: "2026-10-20T00:00:00Z" } };
  assert.deepEqual(pickShortsDue(camps, cache, (id) => id === "a", 30, now).map((x) => x.id), ["b", "a"]);
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
  const out = execFileSync("node", [new URL("../scripts/merge-collected.mjs", import.meta.url).pathname, "--shorts", sh, "--data", dir], { encoding: "utf8" });
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
