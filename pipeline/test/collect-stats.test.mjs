import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { catalogMetrics, isStay } from "../scripts/build-collect-stats.mjs";

test("수집 현황: 캠핑장(숙박)만 기준으로 비율을 센다", () => {
  const cat = [
    { id: "1", gc_url: "x", addr: "a", lat: 1, lng: 1, tel: "010", soc: [10, 2, 5], ph: "p", iq: 60, booking: { url: "https://x" } },
    { id: "2", addr: "b", lat: 1, lng: 1, soc: [0, 0, 0], iq: 20 },
    { id: "park-1", du: "park", addr: "c", soc: [99, 99, 99], iq: 90 },
  ];
  assert.equal(isStay(cat[2]), false);
  const m = catalogMetrics(cat);
  assert.equal(m["catalog.all"].value, 3);
  assert.equal(m["catalog.camps"].value, 2);
  assert.equal(m["catalog.dayuse"].value, 1);
  assert.equal(m["catalog.gocamping"].value, 1);
  assert.deepEqual([m["field.tel"].value, m["field.tel"].pct], [1, 50]);
  assert.deepEqual([m["review.camps"].value, m["review.items"].value, m["video.items"].value], [1, 10, 2]);
  assert.equal(m["photo.official"].pct, 50);
  assert.equal(m["quality.iq"].value, 40);
});

test("수집 현황: 목표 파일은 형식이 맞고 화면 지표 사전에 있는 지표만 쓴다", () => {
  const t = JSON.parse(readFileSync(new URL("../registry/collect-targets.json", import.meta.url), "utf8")).targets;
  const page = readFileSync(new URL("../../camping-atlas/public/admin/collect/index.html", import.meta.url), "utf8");
  for (const [k, v] of Object.entries(t)) {
    assert.ok(["pct", "count", "per_camp", "value", "max"].some((x) => typeof v[x] === "number"), k);
    assert.ok(page.includes(`"${k}"`), `화면 지표 사전에 ${k}가 없음`);
  }
});
