import test from "node:test";
import assert from "node:assert/strict";
import { GridIndex, cfImage, cultureEventOf, eventsNear, mergeEvents, parsePeriod, shortDesc, sitemapIds, titleKey, tourEventsOf } from "../lib/culture-events.mjs";

const T = "2026-10-19";
const base = { lat: 37.5, lng: 127.5, image: "/images/posters/festivals/a b.webp", link: "http://www.kopis.or.kr/x" };

test("기간 읽기: 범위·하루·없음", () => {
  assert.deepEqual(parsePeriod("2026.10.13 (화) ~ 2026.10.14 (수)"), { s: "2026-10-13", e: "2026-10-14" });
  assert.deepEqual(parsePeriod("2026.10.15 (목)"), { s: "2026-10-15", e: "2026-10-15" });
  assert.equal(parsePeriod("상시"), null);
});

test("CultureFlow 항목: 기간·분류·원천을 거르고 포스터는 절대 주소로", () => {
  const pages = new Set(["f1"]);
  const fest = cultureEventOf({ ...base, id: "f1", source: "festival", genre: "exhibition", title: "가을 대추축제", date: "2026.10.16 ~ 2026.10.25", venue: "이상한 장소", address: "경북 경산시" }, T, { pages });
  assert.equal(fest.kind, "축제");
  assert.equal(fest.venue, null); // 축제는 주소를 쓴다
  assert.equal(fest.img, "https://pyw31337.github.io/culture/images/posters/festivals/a%20b.webp");
  assert.equal(fest.cf, "https://pyw31337.github.io/culture/p/f1/");
  assert.equal(fest.url, "https://www.kopis.or.kr/x");
  const play = cultureEventOf({ ...base, id: "p", source: "kopis", genre: "play", title: "연극 페스티벌 작품", date: "2026.10.20 (화)" }, T);
  assert.equal(play.kind, "연극"); // 공연 원천은 제목에 ‘페스티벌’이 있어도 공연
  assert.equal(play.cf, null);
  const skip = (o) => cultureEventOf({ ...base, id: "x", title: "무엇", date: "2026.10.20", ...o }, T);
  assert.equal(skip({ source: "mochaclass", genre: "class" }), null, "클래스");
  assert.equal(skip({ source: "tourism", genre: "tourism" }), null, "관광지(상시)");
  assert.equal(skip({ source: "kopis", genre: "play", date: "2026.10.01 ~ 2026.10.18" }), null, "끝남");
  assert.equal(skip({ source: "kopis", genre: "play", date: "2026.12.20" }), null, "45일 밖");
  assert.equal(skip({ source: "kopis", genre: "exhibition", date: "2026.01.01 ~ 2026.12.31" }), null, "상설 전시");
  assert.equal(skip({ source: "interpark", genre: "etc", title: "서울오픈 챌린저 테니스 대회" }), null, "스포츠");
  assert.equal(skip({ source: "kopis", genre: "play", lat: null }), null, "좌표 없음");
  assert.equal(skip({ source: "kopis", genre: "play", openRun: true }), null, "오픈런");
});

test("소개: 자동 틀 문장은 버리고 길면 문장 끝에서 자른다", () => {
  assert.equal(shortDesc("A는 B에서 열리는 특별한 연극 공연/행사입니다. 진행 일정은 C 기준입니다."), null);
  const s = shortDesc("가".repeat(70) + "다. " + "나".repeat(80), 110);
  assert.ok(s.endsWith("다."));
  assert.equal(cfImage("data:image/png;base64,xx"), null);
  assert.equal(cfImage("http://tong.visitkorea.or.kr/a.jpg"), "https://tong.visitkorea.or.kr/a.jpg");
});

test("같은 행사 합치기: 제목 키 + 기간 겹침, 빈 칸은 다른 원천으로 채움", () => {
  assert.equal(titleKey("제15회 경산 대추축제 (2026)"), titleKey("경산대추축제"));
  const cf = [cultureEventOf({ ...base, id: "f1", source: "festival", genre: "exhibition", title: "제15회 경산대추축제", date: "2026.10.16 ~ 2026.10.25", image: "" }, T)];
  const extras = { fest: { 9: { t: "경산 대추축제", s: "2026-10-16", e: "2026-10-25", img: "http://tong.visitkorea.or.kr/p.jpg" }, 8: { t: "다른 축제", s: "2026-10-20", e: "2026-10-21" } }, camps: { 100: { fe: [["9", 3.2], ["8", 12]] } } };
  const tour = tourEventsOf(extras, T);
  assert.equal(tour.events.length, 2);
  const { events, alias } = mergeEvents(cf, tour.events);
  assert.equal(events.length, 2);
  assert.equal(alias.get("tour:9"), "cf:f1");
  assert.equal(events.find((e) => e.id === "cf:f1").img, "https://tong.visitkorea.or.kr/p.jpg");
  // 캠핑장별: 반경 검색 + 관광공사 거리(합쳐진 id로)
  const byId = new Map(events.map((e) => [e.id, e]));
  const idx = new GridIndex(events.filter((e) => Number.isFinite(e.lat)), 0.1);
  const rows = eventsNear({ id: "100", lat: 37.5, lng: 127.5 }, idx, { tourNear: tour.near["100"], alias, byId, today: T });
  assert.deepEqual(rows.map(([id]) => id), ["cf:f1", "tour:8"]);
});

test("공연은 캠핑장마다 최대 3개, 축제가 먼저", () => {
  const evs = [
    ...[1, 2, 3, 4, 5].map((i) => cultureEventOf({ ...base, id: `p${i}`, source: "kopis", genre: "concert", title: `공연${i}`, date: `2026.10.2${i}` }, T)),
    cultureEventOf({ ...base, id: "f", source: "festival", genre: "exhibition", title: "축제", date: "2026.11.01" }, T),
  ];
  const byId = new Map(evs.map((e) => [e.id, e]));
  const rows = eventsNear({ lat: 37.5, lng: 127.5 }, new GridIndex(evs, 0.1), { byId, today: T });
  assert.equal(rows[0][0], "cf:f");
  assert.equal(rows.length, 4);
});

test("sitemap에서 상세 id 읽기", () => {
  const ids = sitemapIds("<loc>https://pyw31337.github.io/culture/map/</loc><loc>https://pyw31337.github.io/culture/p/perf_%EA%B0%80/</loc>");
  assert.deepEqual([...ids], ["perf_가"]);
});

test("화면: 진행 중/예정·이번 주말 표시, 끝난 행사 숨김, 링크는 CultureFlow 우선", async () => {
  const { render, eventsFor, weekendOf } = await import("../../camping-atlas/public/context/events.js");
  assert.deepEqual(weekendOf("2026-10-19"), { sat: "2026-10-24", sun: "2026-10-25" });
  const data = {
    sources: { cf: { url: "https://pyw31337.github.io/culture/", data_at: "2026-10-13T00:00:00Z" } },
    ev: {
      e1: { t: "가을<축제>", s: "2026-10-10", e: "2026-10-25", k: "축제", img: "https://x/p.webp", cf: "https://pyw31337.github.io/culture/p/a/", u: "https://src/a", src: "한국관광공사" },
      e2: { t: "연극", s: "2026-10-30", e: "2026-10-30", k: "연극", u: "https://src/b", src: "KOPIS" },
      e3: { t: "끝남", s: "2026-10-01", e: "2026-10-18", k: "전시" },
    },
    camps: { 1: [["e1", 3.4], ["e2", 0.5], ["e3", 1]] },
  };
  const list = eventsFor(data, "1", "2026-10-19");
  assert.deepEqual(list.map((x) => [x.id, x.state, x.weekend]), [["e1", "ongoing", true], ["e2", "upcoming", false]]);
  const html = render(data, "1", "2026-10-19");
  assert.match(html, /진행 중/);
  assert.match(html, /예정 · D-11/);
  assert.match(html, /이번 주말/);
  assert.match(html, /가을&lt;축제&gt;/);
  assert.match(html, /CultureFlow에서 보기/);
  assert.match(html, /500m/);
  assert.doesNotMatch(html, /끝남/);
  assert.equal(render(data, "999", "2026-10-19"), "");
});
