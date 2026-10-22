import test from "node:test";
import assert from "node:assert/strict";
import { buildNearbyIndexes, nearbyFor } from "../lib/nearby-context.mjs";

test("공공시설 색인은 휴양림·수영장 등 범주별 주변 결과로 연결된다", () => {
  const idx = buildNearbyIndexes({ public: [
    { id: "forest:a", kind: "forest", name: "A 휴양림", lat: 37.5, lng: 127.0, address: "서울", source: { url: "https://www.data.go.kr/" } },
    { id: "pool:b", kind: "pool", name: "B 수영장", lat: 37.51, lng: 127.0, address: "서울", source: { url: "https://www.data.go.kr/" } },
  ] });
  const nearby = nearbyFor(37.5, 127.0, idx);
  assert.equal(nearby.public.forest[0].name, "A 휴양림");
  assert.equal(nearby.public.pool[0].name, "B 수영장");
});

test("공공데이터포털 표준데이터(public-leisure.json) → 주변 공공시설 레코드(원천 URL·기준일 포함, 놀이 시설 이름 규칙 적용)", async () => {
  const { publicLeisureRecords } = await import("../lib/public-poi.mjs");
  const reg = {
    collected_at: "2026-10-22",
    sources: { forest: { label: "전국휴양림표준데이터", url: "https://www.data.go.kr/x" }, kids: { label: "공공시설개방", url: "https://www.data.go.kr/y" } },
    forests: [{ id: "rf-1", name: "기찬자연휴양림", cls: "공립", lat: 34.6, lng: 126.6, fee: "무료", ref: "2024-11-12" }],
    kids: [{ name: "여주시육아종합지원센터 아이사랑놀이터", lat: 37.2, lng: 127.5 }, { name: "주엽어린이도서관 동아리방", lat: 37.6, lng: 126.7 }],
  };
  const rs = publicLeisureRecords(reg);
  assert.equal(rs.length, 2);
  assert.equal(rs[0].kind, "forest");
  assert.equal(rs[0].source.url, "https://www.data.go.kr/x");
  assert.equal(rs[0].source.checked_at, "2024-11-12");
  assert.equal(rs[1].kind, "indoorplay");
});
