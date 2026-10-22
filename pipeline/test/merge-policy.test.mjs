// 데이터 누적 정책(docs/DATA_MERGE_POLICY.md) — ① 채우기 ② 최신·신뢰 우선 덮어쓰기 ③ 논리 검사 ④ 정제, 그리고 발행 전 손실 검사.
import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { execFileSync, spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { mergeValue, mergeRecord, mergeList, recordLosses, isEmpty, validateField, normalizeField, crossCheck, assignNonEmpty, trustRank, leafAmounts } from "../lib/merge-policy.mjs";

// 작은 결정적 난수(재현 가능)
let seed = 20261021; const rnd = () => ((seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648);
const pick = (a) => a[Math.floor(rnd() * a.length)];
const VALS = [null, undefined, "", " ", "값", "다른 값", 0, 3, 45000, [], ["a"], ["a", "b"], [{ url: "u1" }], { x: 1 }, { x: null }, { y: "z", w: [1] }];
const randRec = (depth = 0) => { const o = {}; for (const k of ["a", "b", "c", "d"]) if (rnd() < 0.7) o[k] = depth < 2 && rnd() < 0.25 ? randRec(depth + 1) : structuredClone(pick(VALS)); return o; };
const randProv = () => ({ grade: pick([undefined, "MENTION", "CONFIRMED", "OPERATOR", "VERIFIED"]), at: pick([undefined, "2026-01-01", "2026-10-01", "2026-10-20"]) });

test("① 속성: 어떤 병합도 비어 있지 않던 잎 값을 잃지 않는다(2,000회 무작위)", () => {
  for (let i = 0; i < 2000; i++) {
    const a = randRec(), b = randRec();
    const { record } = mergeRecord(a, b, { old: randProv(), next: randProv() });
    const losses = recordLosses(a, record);
    // 덮어쓰기(같은 양의 다른 값)는 허용, 사라지거나 줄어드는 것은 금지
    assert.deepEqual(losses, [], `잃음: ${JSON.stringify({ a, b, record, losses })}`);
  }
});

test("① 빈 값·더 적은 항목으로 바꾸지 않는다", () => {
  assert.equal(mergeValue("서울", "").value, "서울");
  assert.equal(mergeValue("서울", null).action, "keep");
  assert.deepEqual(mergeValue(["a", "b"], ["a"]).value, ["a", "b"]);
  assert.deepEqual(mergeValue([{ url: "1" }], [{ url: "2" }]).value, [{ url: "1" }, { url: "2" }]);
  assert.equal(mergeValue(null, "새 값").action, "fill");
  assert.deepEqual(assignNonEmpty({ a: 1, b: 2 }, { a: null, b: 3, c: "" }), { a: 1, b: 3 });
});

test("② 더 믿을 만한 출처 또는 같은 등급의 더 최근 확인만 덮어쓰고 옛 값을 돌려준다", () => {
  const r1 = mergeValue(30000, 40000, { field: "min", old: { grade: "MENTION" }, next: { grade: "OPERATOR" } });
  assert.equal(r1.action, "overwrite"); assert.equal(r1.value, 40000); assert.equal(r1.previous, 30000);
  const r2 = mergeValue(30000, 40000, { field: "min", old: { grade: "OPERATOR", at: "2026-10-01" }, next: { grade: "MENTION", at: "2026-10-20" } });
  assert.equal(r2.value, 30000, "후기(낮은 등급)는 최근이어도 운영자 값을 못 덮는다");
  const r3 = mergeValue(30000, 40000, { field: "min", old: { grade: "CONFIRMED", at: "2026-10-01" }, next: { grade: "CONFIRMED", at: "2026-10-20" } });
  assert.equal(r3.value, 40000);
  const r4 = mergeValue(30000, 40000, { field: "min", old: { grade: "CONFIRMED", at: "2026-10-20" }, next: { grade: "CONFIRMED", at: "2026-10-01" } });
  assert.equal(r4.value, 30000, "옛 확인일은 덮지 못한다");
  const r5 = mergeValue("a", "b", {}); assert.equal(r5.value, "a", "근거 없는 새 값은 덮지 못한다");
  assert.ok(trustRank({ src: "operator_homepage" }) > trustRank({ src: "gocamping" }));
  assert.ok(trustRank({ src: "gocamping" }) > trustRank({ src: "osm" }));
});

test("③ 논리 검사: 범위·형식·좌표↔시도·교차 모순을 격리한다", () => {
  assert.equal(mergeValue(null, 10.5, { field: "lat" }).action, "reject");
  assert.equal(mergeValue(null, 3_500_000, { field: "fee.min" }).action, "reject");
  assert.ok(validateField("lat", 33.4, { sido: "경상남도" }), "의령(경남) 캠핑장이 제주 좌표");
  assert.equal(validateField("lat", 35.3, { sido: "경상남도" }), null);
  assert.ok(validateField("fee", { min: 80000, max: 30000 }));
  assert.ok(validateField("homepage", "카페 참고"));
  assert.ok(validateField("checked_at", "2099-01-01"));
  assert.deepEqual(crossCheck({ fee: { min: 30000 }, digest: { cons: [["가격 부담", 2]] } }).length, 1);
});

test("④ 정제: 서비스 표기(시도 짧은 이름은 기존 데이터가 짧을 때만, 단위, URL)", () => {
  assert.equal(normalizeField("sido", "경상남도", { sidoStyle: "short" }), "경남");
  assert.equal(normalizeField("sido", "서울특별시", { sidoStyle: "short" }), "서울");
  assert.equal(normalizeField("sido", "경상남도", {}), "경상남도", "기존 형식을 바꾸지 않는다");
  assert.equal(normalizeField("note", "전기 600 와트"), "전기 600W");
  assert.equal(normalizeField("homepage", "www.camp.kr"), "http://www.camp.kr");
});

test("목록 병합: 새 목록에 없는 기존 항목은 남는다", () => {
  const { list } = mergeList([{ id: 1, n: "a" }, { id: 2, n: "b" }], [{ id: 2, n: "" }, { id: 3, n: "c" }], (x) => x.id);
  assert.deepEqual(list.map((x) => [x.id, x.n]), [[1, "a"], [2, "b"], [3, "c"]]);
});

test("손실 검사: 비거나 줄어든 잎을 찾는다", () => {
  assert.deepEqual(recordLosses({ a: "x", b: [1, 2], c: { d: 1 } }, { a: "", b: [1], c: {} }).map((l) => l.field).sort(), ["a", "b", "c.d"]);
  assert.deepEqual(recordLosses({ a: "x" }, { a: "y" }), []);
  assert.ok(isEmpty({ x: null, y: [] }));
  assert.equal(Object.keys(leafAmounts({ a: { b: { c: { d: { e: 1 } } } } })).length, 1);
});

// field-guard 통합: 임시 저장소 두 벌로 실패·복원·이유 있는 삭제 통과를 본다.
const GUARD = fileURLToPath(new URL("../scripts/field-guard.mjs", import.meta.url));
function repo(cat, camps = {}, overrides = []) {
  const r = mkdtempSync(join(tmpdir(), "fg-"));
  const d = join(r, "camping-atlas/public/explore/data"); mkdirSync(join(d, "camps"), { recursive: true }); mkdirSync(join(r, "pipeline/registry"), { recursive: true });
  writeFileSync(join(d, "campgrounds.json"), JSON.stringify(cat));
  for (const [id, x] of Object.entries(camps)) writeFileSync(join(d, "camps", `${id}.json`), JSON.stringify(x));
  writeFileSync(join(r, "pipeline/registry/merge-overrides.json"), JSON.stringify({ overrides }));
  return r;
}
const run = (a, b, ...f) => spawnSync(process.execPath, [GUARD, a, b, ...f], { encoding: "utf8" });

test("field-guard: 지우면 실패, --heal은 되살림, 이유 적은 삭제는 통과, 파생 모델은 경고만", () => {
  const base = repo([{ id: "1", tel: "010-1", fee: { min: 3, src: "x" }, pf: { k: ["a"] } }, { id: "2", name: "b" }], { 1: { reviews: [{ url: "a" }, { url: "b" }] } });
  const next = repo([{ id: "1", tel: "", fee: { min: 3 }, pf: {} }], { 1: { reviews: [{ url: "a" }] } });
  const r = run(base, next); assert.equal(r.status, 1, r.stdout); assert.match(r.stdout, /tel/); assert.match(r.stdout, /파생 읽기 모델/);
  const h = run(base, next, "--heal"); assert.equal(h.status, 0, h.stdout);
  const cat = JSON.parse(readFileSync(join(next, "camping-atlas/public/explore/data/campgrounds.json"), "utf8"));
  assert.equal(cat.find((c) => c.id === "1").tel, "010-1"); assert.equal(cat.find((c) => c.id === "1").fee.src, "x"); assert.ok(cat.find((c) => c.id === "2"));
  assert.equal(JSON.parse(readFileSync(join(next, "camping-atlas/public/explore/data/camps/1.json"), "utf8")).reviews.length, 2);
  assert.match(readFileSync(join(next, "pipeline/registry/merge-review.ndjson"), "utf8"), /restored/);
  assert.equal(run(base, next).status, 0);
  const next2 = repo([{ id: "1", tel: "010-1", fee: { min: 3, src: "x" } }], { 1: { reviews: [{ url: "a" }, { url: "b" }] } }, [{ id: "2", field: "*", reason: "폐업 확인(고캠핑 삭제) 2026-10-21" }]);
  assert.equal(run(base, next2).status, 0, "이유 있는 삭제는 통과");
  const next3 = repo([{ id: "1", tel: "010-1", fee: { min: 3, src: "x" } }], { 1: { reviews: [{ url: "a" }, { url: "b" }] } }, [{ id: "2", field: "*", reason: "" }]);
  assert.equal(run(base, next3).status, 1, "이유 없는 삭제는 실패");
});

test("field-guard: 더 최신 확인일의 같은 등급 값이 묶음을 바꾸면 손실이 아니라 교체", () => {
  const base = repo([{ id: "1", fee: { min: 3, max: 5, tiers: [1], grade: "CONFIRMED", checked_at: "2026-10-01" } }]);
  const next = repo([{ id: "1", fee: { min: 4, grade: "CONFIRMED", checked_at: "2026-10-20" } }]);
  const r = run(base, next); assert.equal(r.status, 0, r.stdout); assert.match(r.stdout, /교체/);
});

test("field-guard --heal: 줄어든 객체 배열은 기준 배열로 되살린다(항목 열쇠가 겹쳐도 뭉치지 않음, 2026-10-22 data-sync 실패 재현)", () => {
  const t3 = [{ name: "공중화장실", m: 48, src: "osm" }, { name: "공중화장실", m: 183, src: "osm" }, { name: "화장실", m: 211, src: "osm" }];
  const base = repo([{ id: "1", nearby_toilets: { within_2km: 13, within_500m: 5, nearest: t3 } }], { 1: { layout: { images: [{ thumb: "a", src: "blog" }, { thumb: "b", src: "blog" }] } } });
  const next = repo([{ id: "1", nearby_toilets: { within_2km: 13, within_500m: 5, nearest: t3.slice(0, 2) } }], { 1: { layout: { images: [{ thumb: "a", src: "blog" }] } } });
  assert.equal(run(base, next).status, 1);
  assert.equal(run(base, next, "--heal").status, 0);
  const cat = JSON.parse(readFileSync(join(next, "camping-atlas/public/explore/data/campgrounds.json"), "utf8"));
  assert.equal(cat[0].nearby_toilets.nearest.length, 3, "3→2를 되살리며 3→1로 뭉치면 안 된다");
  assert.equal(JSON.parse(readFileSync(join(next, "camping-atlas/public/explore/data/camps/1.json"), "utf8")).layout.images.length, 2);
  assert.equal(run(base, next).status, 0, "되살린 뒤 검사는 통과");
});
