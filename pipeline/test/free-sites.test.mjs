import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { judgeFreeSite, validateFreeSites } from "../lib/free-sites.mjs";

const reg = JSON.parse(await readFile(new URL("../registry/free-sites.json", import.meta.url), "utf8"));
const ev = (field, tier = "B") => ({ field, url: "https://example.go.kr/notice", title: "공지", checked_at: "2026-10-12", tier });
const base = { id: "x", name: "예시 야영장", region: "강원", operator: "○○군", fee: { free: true }, cooking: { allowed: true }, toilet: { onsite: true }, evidence: [ev("fee"), ev("cooking"), ev("toilet")] };

test("등록된 무료 사이트 레지스트리는 검증을 통과한다", () => {
  assert.deepEqual(validateFreeSites(reg), []);
});

test("세 조건이 모두 근거와 함께 yes일 때만 VERIFIED", () => {
  assert.equal(judgeFreeSite(base, "2026-10-12").display, "VERIFIED");
  const noCookEvidence = { ...base, evidence: [ev("fee"), ev("toilet")] };
  assert.equal(judgeFreeSite(noCookEvidence, "2026-10-12").cooking, "unknown");
  assert.equal(judgeFreeSite(noCookEvidence, "2026-10-12").display, "CHECKING");
});

test("커뮤니티(E) 근거는 무시된다", () => {
  const site = { ...base, evidence: [ev("fee", "E"), ev("cooking", "E"), ev("toilet", "E")] };
  const j = judgeFreeSite(site, "2026-10-12");
  assert.deepEqual([j.fee, j.cooking, j.toilet], ["unknown", "unknown", "unknown"]);
  assert.ok(validateFreeSites({ sites: [site] }).some((e) => e.includes("E 등급")));
});

test("화장실은 현장 또는 300m 이내", () => {
  const near = { ...base, toilet: { onsite: false, nearest_m: 250 } };
  const far = { ...base, toilet: { onsite: false, nearest_m: 800 } };
  assert.equal(judgeFreeSite(near, "2026-10-12").toilet, "yes");
  assert.equal(judgeFreeSite(far, "2026-10-12").toilet, "unknown");
});

test("한시 무료는 기간 밖이면 no → 목록에서 숨김", () => {
  const temp = { ...base, fee: { free: true, free_from: "2026-10-01", free_until: "2026-10-31" } };
  assert.equal(judgeFreeSite(temp, "2026-10-12").fee, "yes");
  assert.equal(judgeFreeSite(temp, "2026-11-01").display, "HIDE");
});

test("궁평오솔로: 10월 무료는 근거 있음, 취사·화장실은 확인 중", () => {
  const s = reg.sites.find((x) => x.id === "hwaseong-gungpyeong-osolro");
  const j = judgeFreeSite(s, "2026-10-12");
  assert.deepEqual([j.fee, j.cooking, j.toilet, j.display], ["yes", "unknown", "unknown", "CHECKING"]);
});

test("근거 없는 무료·취사 주장은 검증 실패", () => {
  const bad = { ...base, evidence: [] };
  const errors = validateFreeSites({ sites: [bad] });
  assert.ok(errors.some((e) => e.includes("무료 근거")));
  assert.ok(errors.some((e) => e.includes("취사 허용 근거")));
});
