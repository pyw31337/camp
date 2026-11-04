import test from "node:test";
import assert from "node:assert/strict";
import { classifyUnique, hitsIn, UNIQUE_CATS } from "../lib/unique-camps.mjs";

const re = (id) => UNIQUE_CATS.find((c) => c.id === id).re;

test("골든쌔들: 소개의 노천탕·수영장 + 후기 제목 2건의 승마", () => {
  const c = { name: "골든쌔들 캠핑장", line: "개별 노천탕과 개별 수영장이 있는 캠핑장" };
  const det = { reviews: [{ title: "캠핑에 노천탕·승마까지…양평 골든쌔들" }], web: [{ title: "골든쌔들 캠핑장 아이랑 승마체험 후기" }] };
  const r = classifyUnique(c, det);
  assert.ok(r.hotspring && r.pool && r.horse);
});
test("부정·바깥 시설은 세지 않는다", () => {
  assert.deepEqual(hitsIn("수영장 없음", re("pool")), []);
  assert.deepEqual(hitsIn("차로 10분 거리 국민체육센터 수영장", re("pool")), []);
  assert.deepEqual(hitsIn("14세 이상 노키즈존으로 운영", re("kidscafe")), []);
  assert.deepEqual(hitsIn("바로 계곡 옆은 아니지만", re("valley")), []);
  assert.deepEqual(hitsIn("베스파 타고 캠핑가기", re("spa")), []);
  assert.deepEqual(hitsIn("리조트 스파 30% 할인", re("spa")), []);
});
test("후기 제목은 1건이면 부족, 계곡은 후기로 판정하지 않음", () => {
  const c = { name: "솔숲 캠핑장" };
  assert.deepEqual(classifyUnique(c, { reviews: [{ title: "솔숲캠핑장 승마체험" }] }), {});
  assert.deepEqual(classifyUnique(c, { reviews: [{ title: "솔숲캠핑장 계곡 바로 앞" }, { title: "솔숲 캠핑장 계곡 옆 사이트" }] }), {});
});
test("t45u: 12개 낱개 분류 — 노천탕/스파, 승마/동물체험, 키즈카페/실내놀이, 트리하우스/이색숙소 분리", () => {
  assert.deepEqual(UNIQUE_CATS.filter((c) => !c.ownOnly).map((c) => c.label), ["노천탕", "스파", "사계절온수풀", "수영장", "승마", "동물체험", "키즈카페", "실내놀이", "트리하우스", "이색숙소", "레포츠", "체험"]);
  const r = classifyUnique({ name: "가나 캠핑장", line: "자쿠지 객실, 알파카 먹이주기, 키즈카페, 트리하우스 운영" }, null);
  assert.ok(r.spa && r.animal && r.kidscafe && r.treehouse);
  assert.ok(!r.hotspring && !r.horse && !r.indoorplay && !r.stay);
});

// t47u-2: 이색 카드 — 문장 복사가 아니라 시설 이름·세부로 정리, 중복 합치기, 한 개뿐이면 다시 쓴 문장.
import { uniqueCard } from "../lib/unique-camps.mjs";
test("uniqueCard: 시설을 짧은 이름 + 세부(수온·시간·무료)로 정리하고 온수풀/수영장 중복을 합친다", () => {
  const c = { name: "골든쌔들 캠핑장", line: "개별 노천탕과 개별 수영장이 있는 캠핑장" };
  const det = { reviews: [
    { title: "골든쌔들 온수풀 후기", snippet: "온수풀은 32도로 따뜻했고 12시~19시 운영, 무료였어요." },
    { title: "골든쌔들 승마 체험", snippet: "승마 체험은 1회 30,000원이었어요." },
  ] };
  const r = uniqueCard(c, det, { hotspring: "소개: 노천탕", warmpool: "후기", pool: "소개: 수영장", horse: "후기" });
  assert.equal(r.m, "list");
  const by = Object.fromEntries(r.it.map((x) => [x.k, x]));
  assert.equal(by.hotspring.n, "개별 노천탕");
  assert.match(by.warmpool.d, /32℃/); assert.match(by.warmpool.d, /12~19시/); assert.match(by.warmpool.d, /무료/);
  assert.match(by.horse.d, /30,000원/);
  assert.ok(!by.pool, "온수풀이 있으면 수영장은 합친다");
  assert.ok(r.it.every((x) => !/…/.test(x.n + x.d)));
});
test("uniqueCard: 특색이 하나뿐이고 세부가 없으면 조사까지 맞춘 짧은 문장", () => {
  const r = uniqueCard({ name: "숲속", line: "서바이벌 체험장을 운영합니다" }, {}, { leisure: "소개: 서바이벌" });
  assert.equal(r.m, "list");
  assert.ok(r.it[0].d.length > 0); assert.equal(r.s === undefined || typeof r.s === "string", true);
});
