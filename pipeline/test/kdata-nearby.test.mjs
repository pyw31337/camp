import test from "node:test";
import assert from "node:assert/strict";
import { buildNearbyIndexes, nearbyFor } from "../lib/nearby-context.mjs";

test("공공시설 색인은 휴양림·수영장 등 범주별 주변 결과로 연결된다", () => {
  const idx = buildNearbyIndexes({ public: [
    { id: "forest:a", kind: "forest", name: "A 휴양림", lat: 37.5, lng: 127.0, address: "서울", source: { url: "https://k-data.aljal.kr/foresttrip/a" } },
    { id: "pool:b", kind: "pool", name: "B 수영장", lat: 37.51, lng: 127.0, address: "서울", source: { url: "https://k-data.aljal.kr/pool/b" } },
  ] });
  const nearby = nearbyFor(37.5, 127.0, idx);
  assert.equal(nearby.public.forest[0].name, "A 휴양림");
  assert.equal(nearby.public.pool[0].name, "B 수영장");
});
