import test from "node:test";
import assert from "node:assert/strict";
import { windTip } from "../../camping-atlas/public/conditions/card.js";
test("#38 풍속 안전팁 구간", () => {
  assert.equal(windTip([]), null);
  assert.equal(windTip([{ d: "2026-10-22", wsd: 3.9 }]), null);
  assert.equal(windTip([{ d: "a", wsd: 5 }, { d: "b", wsd: null }]).level, "mid");
  const h = windTip([{ d: "a", wsd: 5 }, { d: "b", wsd: 11 }]);
  assert.deepEqual([h.d, h.w, h.level], ["b", 11, "high"]);
  assert.equal(windTip([{ d: "a", wsd: 14 }]).level, "severe");
  assert.equal(windTip([{ d: "a" }]), null); // 중기예보 날은 풍속 없음
});
