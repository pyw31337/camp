import test from "node:test";
import assert from "node:assert/strict";
import { sitePicks } from "../../camping-atlas/public/context/site-picks.js";
test("#39 후기 추천 사이트 번호", () => {
  const d = { reviews: [
    { url: "u1", title: "세 번째 캠핑, 용인 한터팜 오토캠핑장 30번 사이트 (명당 사이트추천)" },
    { url: "u2", snippet: "동강이 내려다보이는 1번과 2번데크가 명당이며 이용요금" },
    { url: "u3", title: "#29번째 캠핑, 강원 영월 요기는캠핑장으로" }, // 순서 말
    { url: "u4", snippet: "곡성꿈꾸는캠핑 330번후기 330번은 나쁘지도않고 또 좋다고는 할수없지만" }, // 사이트 말 없음·부정
    { url: "u5", snippet: "A-12 사이트는 그늘이 좋아요." },
    { url: "u6", snippet: "A12번 사이트 그늘 최고" },
    { url: "u7", snippet: "B3번 사이트 시끄러워서 별로" },
  ], cafe: [{ url: "u1", title: "중복 글" }] };
  const r = sitePicks(d, 5);
  const sites = new Set(r.map((x) => x.site));
  assert.ok(sites.has("30") && sites.has("1") && sites.has("2") && sites.has("A12"), JSON.stringify(r));
  assert.equal(r.find((x) => x.site === "A12").posts, 2);
  assert.ok(!sites.has("29") && !sites.has("330") && !sites.has("B3"));
  assert.equal(r.find((x) => x.site === "30").tags[0], "명당");
  assert.equal(sitePicks({}).length, 0);
});
test("#39 상세에 후기 추천 사이트 칸", async () => {
  const { readFileSync } = await import("node:fs");
  for (const f of ["camping-atlas/public/app.js", "design/renewal/app.js"]) {
    const s = readFileSync(new URL(`../../${f}`, import.meta.url), "utf8");
    assert.match(s, /data-site-picks hidden><\/section>/);
    assert.match(s, /context\/site-picks\.js/);
  }
});
