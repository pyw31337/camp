import test from "node:test";
import assert from "node:assert/strict";
import {
  classifyUrl, naverBlogId, candidatesFromCamp, verifyOwnership, sharedChannelIds,
  nameMatch, telMatch, addrMatch, parseRss, mergeRegistry, publicRecord, isReviewLike,
} from "../lib/official-channels.mjs";

test("classifyUrl: 블로그·카페·인스타·유튜브·홈페이지", () => {
  assert.equal(classifyUrl("https://blog.naver.com/seonjangnoel").type, "naver_blog");
  assert.equal(classifyUrl("https://m.blog.naver.com/seonjangnoel/224417533829").id, "seonjangnoel");
  assert.equal(classifyUrl("https://cafe.naver.com/firemaple").type, "naver_cafe");
  assert.equal(classifyUrl("http://cafe.daum.net/gurumpo/").id, "gurumpo");
  assert.equal(classifyUrl("https://www.instagram.com/2025whitecamp").type, "instagram");
  assert.equal(classifyUrl("https://www.instagram.com/p/Abc123/"), null); // 게시물 단건은 채널이 아님
  assert.equal(classifyUrl("https://youtube.com/@신두리오렌지캠핑장").type, "youtube");
  assert.equal(classifyUrl("https://band.us/band/83719280").type, "band");
  assert.equal(classifyUrl("http://pf.kakao.com/_xjFnPxj").type, "kakao");
  assert.equal(classifyUrl("http://jsimc.or.kr/").type, "homepage");
  assert.equal(classifyUrl("https://camfit.co.kr/camp/foo"), null);
  assert.equal(classifyUrl("https://www.gocamping.or.kr/bsite/camp/info/read.do?c_no=1"), null);
  assert.equal(classifyUrl("https://map.naver.com/p/entry/place/123"), null);
  assert.equal(classifyUrl("https://www.data.go.kr/tcs/dss/selectDataSetList.do"), null);
  assert.equal(classifyUrl("https://healingpark.modoo.at"), null); // 종료된 네이버 모두
});

test("naverBlogId: 글 주소에서도 아이디만", () => {
  assert.equal(naverBlogId("https://blog.naver.com/dosz/223466249289"), "dosz");
  assert.equal(naverBlogId("https://blog.naver.com/seonjangnoel"), "seonjangnoel");
});

test("candidatesFromCamp: 홈페이지·예약 경로만, 후기 필드는 제외", () => {
  const c = {
    id: "100193", name: "선장포노을캠핑장",
    homepage: "https://blog.naver.com/seonjangnoel",
    booking: { channels: [{ url: "https://blog.naver.com/seonjangnoel" }] },
    fee: { url: "https://blog.naver.com/randomreviewer/123" },
  };
  const hits = candidatesFromCamp(c);
  assert.equal(hits.length, 1);
  assert.equal(hits[0].type, "naver_blog");
  assert.equal(hits[0].source, "homepage");
});

test("verifyOwnership: 고캠핑 홈페이지 등록은 소유, 후기·공유 채널은 제외", () => {
  const camp = { id: "1", name: "선장포노을캠핑장", tel: "041-532-0106", addr: "충청남도 아산시 선장면 선장로 121-10", sigungu: "아산시" };
  const blog = { type: "naver_blog", url: "https://blog.naver.com/seonjangnoel", id: "seonjangnoel", source: "homepage" };
  const ok = verifyOwnership(camp, blog);
  assert.equal(ok.verified, true);
  assert.ok(ok.reasons.includes("catalog_homepage"));

  const named = verifyOwnership(camp, { ...blog, source: "dl" }, { title: "선장포 노을캠핑장님의블로그", description: "Tel. 041-532-0106\n충남 아산시 선장면 선장로 121-10" });
  assert.equal(named.verified, true);
  assert.ok(named.reasons.includes("name"));
  assert.ok(named.reasons.includes("tel"));
  assert.ok(named.reasons.includes("addr"));

  const review = verifyOwnership(camp, { ...blog, source: "vr.blog" });
  assert.equal(review.verified, false);
  assert.ok(review.reasons.includes("review_like"));

  const shared = new Set(["naver_blog:dosz"]);
  const vr = verifyOwnership(camp, { type: "naver_blog", url: "https://blog.naver.com/dosz", id: "dosz", source: "dl" }, { shared });
  assert.equal(vr.verified, false);
  assert.ok(vr.reasons.includes("shared_channel"));
});

test("nameMatch·telMatch·addrMatch", () => {
  assert.ok(nameMatch("선장포노을캠핑장", "선장포 노을캠핑장님의블로그") >= 0.72);
  assert.ok(telMatch("041-532-0106", "Tel. 041-532-0106"));
  assert.ok(addrMatch("충청남도 아산시 선장면 선장로 121-10", "충남 아산시 선장면 선장로 121-10"));
  assert.equal(isReviewLike({ source: "vr.blog" }), true);
  assert.equal(isReviewLike({ title: "여름 캠핑 후기" }), true);
});

test("sharedChannelIds: 4곳 이상 같은 아이디면 공유", () => {
  const entries = [1, 2, 3, 4].map((n) => ({ type: "naver_blog", id: "dosz", campId: String(n) }));
  entries.push({ type: "naver_blog", id: "mine", campId: "9" });
  const s = sharedChannelIds(entries, 4);
  assert.ok(s.has("naver_blog:dosz"));
  assert.equal(s.has("naver_blog:mine"), false);
});

test("parseRss: 제목·소개·글 사진 주소를 읽는다", () => {
  const xml = `<?xml version="1.0"?><rss><channel>
    <title><![CDATA[선장포 노을캠핑장님의블로그]]></title>
    <description><![CDATA[Tel. 041-532-0106]]></description>
    <item>
      <title><![CDATA[글램핑 A동 안내]]></title>
      <link><![CDATA[https://blog.naver.com/seonjangnoel/123?fromRss=true&trackingCode=rss]]></link>
      <description><![CDATA[<img src="https://postfiles.pstatic.net/foo.jpg"/>]]></description>
    </item>
  </channel></rss>`;
  const r = parseRss(xml);
  assert.match(r.title, /선장포/);
  assert.match(r.description, /041-532-0106/);
  assert.equal(r.items[0].title, "글램핑 A동 안내");
  assert.equal(r.items[0].link, "https://blog.naver.com/seonjangnoel/123");
  assert.ok(r.items[0].images.some((u) => u.includes("postfiles.pstatic.net")));
});

test("mergeRegistry: 쌓기만 하고 더 좋은 근거만 보강", () => {
  const prev = { camps: { "1": { id: "1", name: "A", channels: [{ type: "instagram", id: "a", url: "https://www.instagram.com/a", source: "dl", verified: false, by: [] }] } } };
  const next = { "1": { id: "1", name: "A", channels: [{ type: "instagram", id: "a", url: "https://www.instagram.com/a", source: "homepage", verified: true, by: ["catalog_homepage"], label: "인스타그램" }] } };
  const m = mergeRegistry(prev, next);
  assert.equal(m["1"].channels.length, 1);
  assert.equal(m["1"].channels[0].verified, true);
  assert.equal(m["1"].channels[0].source, "homepage");
  assert.ok(m["1"].channels[0].by.includes("catalog_homepage"));
  const pub = publicRecord(m["1"]);
  assert.equal(pub[0].k, "instagram");
  assert.equal(pub[0].l, "인스타그램");
});
