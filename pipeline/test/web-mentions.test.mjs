import { test } from "node:test";
import assert from "node:assert/strict";
import { bodyBlockedHost, bodySentences, hostGroup, normalizeNaver, robotsBlocksAiByName, robotsVerdict } from "../lib/web-mentions.mjs";
import { siteTypesOf } from "../lib/site-types.mjs";

test("robots: AI 수집기를 이름으로 막은 곳은 본문을 읽지 않는다", () => {
  const naverBlog = "User-agent: Yeti\nDisallow: /\nUser-agent: GPTBot\nDisallow: /\nUser-agent: ClaudeBot\nDisallow: /\nUser-agent: *\nDisallow: /PostList.naver";
  assert.equal(robotsBlocksAiByName(naverBlog), true);
  assert.equal(robotsVerdict(naverBlog, "/someone/22334455").reason, "AI_BOTS_BLOCKED");
  const tistory = "User-agent: *\nDisallow: /guestbook\nDisallow: /manage";
  assert.equal(robotsVerdict(tistory, "/123").ok, true);
  assert.equal(robotsVerdict(tistory, "/manage/posts").ok, false);
  // 같은 묶음에 여러 User-agent가 이어지면 함께 막힌 것으로 본다(brunch 방식)
  assert.equal(robotsBlocksAiByName("User-agent: GPTBot\nUser-agent: ClaudeBot\nDisallow: /"), true);
  // AI 봇에 일부 경로만 막은 경우는 이름 차단으로 보지 않는다
  assert.equal(robotsBlocksAiByName("User-agent: GPTBot\nDisallow: /private"), false);
});

test("본문을 읽지 않는 플랫폼과 호스트 묶음", () => {
  assert.equal(bodyBlockedHost("https://blog.naver.com/abc/123"), true);
  assert.equal(bodyBlockedHost("https://m.cafe.naver.com/x/1"), true);
  assert.equal(bodyBlockedHost("https://abc.tistory.com/12"), false);
  assert.equal(hostGroup("https://abc.tistory.com/12"), "tistory.com");
  assert.equal(hostGroup("https://www.foo.co.kr/a"), "foo.co.kr");
});

test("네이버 검색 결과 정규화: 작성일·출처·태그 제거", () => {
  const d = normalizeNaver({ title: "<b>별빛</b>캠핑장 후기", link: "https://blog.naver.com/a/1", description: "입실 <b>15시</b> 퇴실 11시", bloggername: "캠퍼A", postdate: "20250916" }, "blog");
  assert.deepEqual([d.t, d.title, d.snippet, d.src, d.date], ["nblog", "별빛캠핑장 후기", "입실 15시 퇴실 11시", "캠퍼A", "2025-09-16"]);
  assert.equal(normalizeNaver({ title: "x", link: "javascript:0" }, "blog"), null);
  assert.equal(normalizeNaver({ title: "질문", link: "https://kin.naver.com/q/1", description: "1박 5만원" }, "kin").src, "지식iN");
});

test("본문 문장: 캠핑장 이름이 있는 글에서 사실 단서 문장만", () => {
  const html = "<article><p>별빛캠핑장 다녀왔어요.</p><p>입실은 오후 2시, 퇴실은 12시입니다.</p><p>사이트 크기는 8x10 정도라 넉넉했어요.</p><p>날씨가 좋았다.</p><p>공감 댓글 부탁드려요 1박 요금</p></article>";
  const s = bodySentences(html, { tokens: ["별빛"] });
  assert.ok(s.some((x) => /입실은 오후 2시/.test(x)));
  assert.ok(s.some((x) => /8x10/.test(x)));
  assert.ok(!s.some((x) => /날씨/.test(x)));
  assert.ok(!s.some((x) => /댓글/.test(x)));
  assert.deepEqual(bodySentences(html, { tokens: ["다른곳"] }), []);
});

test("사이트 타입: 후기 언급은 글 2건 이상이거나 제목에 나올 때만(MENTION)", () => {
  const one = siteTypesOf({}, {}, { posts: [{ title: "주말 캠핑", snippet: "옆에 카라반이 많더라", url: "u1", date: "2025-09-16" }] });
  assert.equal(one.find((t) => t.code === "CARAVAN"), undefined);
  const two = siteTypesOf({}, {}, { posts: [{ title: "a", snippet: "카라반 사이트 좋아요", url: "u1", date: "2025-09-16" }, { title: "b", snippet: "카라반 이용 후기", url: "u2" }] });
  const cv = two.find((t) => t.code === "CARAVAN");
  assert.equal(cv.grade, "MENTION");
  assert.equal(cv.at, "2025-09-16");
  const title = siteTypesOf({}, {}, { posts: [{ title: "복층 데크 사이트 후기", snippet: "", url: "u3" }] });
  assert.equal(title.find((t) => t.code === "DUPLEX_DECK")?.grade, "MENTION");
  // 등록값이 있으면 언급보다 등록값이 이긴다
  const reg = siteTypesOf({ kinds: [["CARAVAN_RENTAL", 5]] }, {}, { posts: [{ title: "카라반 후기", snippet: "", url: "u4" }] });
  assert.equal(reg.find((t) => t.code === "CARAVAN").grade, "CONFIRMED");
});
