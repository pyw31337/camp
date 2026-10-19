import test from "node:test";
import assert from "node:assert/strict";

test("축제 카드: 캠핑장에서 거리(850m · 12.3km)를 보이고 카드별 출처 줄은 없다", async () => {
  globalThis.fetch ??= async () => ({ ok: false });
  const { render } = await import("../../camping-atlas/public/context/events.js");
  const ev = (t) => ({ t, s: "2026-10-20", e: "2026-10-30", k: "축제", src: "TourAPI", u: "https://example.org/x" });
  const data = { camps: { 7: [["a", 0.85], ["b", 12.34]] }, ev: { a: ev("가 축제"), b: ev("나 축제") }, sources: {} };
  const html = render(data, "7", "2026-10-19");
  assert.match(html, /캠핑장에서 850m/);
  assert.match(html, /캠핑장에서 12\.3km/);
  assert.doesNotMatch(html, /정보·포스터/);
  assert.match(html, /ev-foot/, "출처는 칸 아래 한 줄에 남는다");
});
