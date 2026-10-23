// 맥미니 야간 작업 시간·겹침·작업 고르기(lib/nightshift.mjs)와 맥 판독 결론(lib/mac-vision.mjs).
import test from "node:test";
import assert from "node:assert/strict";
import { clashesWith, idle, isDayOff, kst, minutesUntil, pickJob, window } from "../lib/nightshift.mjs";
import { decideNearbyMac, nameTokens, signMatches } from "../lib/mac-vision.mjs";

const at = (s) => new Date(`${s}+09:00`); // 한국 시간으로 적는다
const HOL = ["2026-10-09"]; // 한글날(금)

test("평일 낮은 닫힘, 18시부터 다음 날 08시까지 열림", () => {
  assert.equal(window(at("2026-10-21T12:00:00"), { holidays: HOL }).open, false); // 수
  const w = window(at("2026-10-21T19:00:00"), { holidays: HOL });
  assert.equal(w.open, true);
  assert.equal(w.minutesLeft, 13 * 60); // 목 08:00까지
  assert.equal(window(at("2026-10-22T07:30:00"), { holidays: HOL }).minutesLeft, 30);
  assert.equal(window(at("2026-10-22T08:00:00"), { holidays: HOL }).open, false);
});

test("금요일 저녁부터 월요일 08시까지, 공휴일은 하루 종일", () => {
  assert.equal(window(at("2026-10-23T18:30:00")).minutesLeft, (13.5 + 48) * 60); // 금 18:30 → 월 08:00
  assert.equal(window(at("2026-10-24T14:00:00")).open, true); // 토
  // 목 저녁 → 금(한글날) 쉬는 날 → 월 08:00까지
  const w = window(at("2026-10-08T20:00:00"), { holidays: HOL });
  assert.equal(w.endsAt.toISOString(), at("2026-10-12T08:00:00").toISOString());
  assert.equal(isDayOff("2026-10-09", HOL), true);
  assert.equal(kst(at("2026-10-25T01:00:00")).dow, 0);
});

test("기존 작업 시간(시작 10분 전~예상 시간)은 피한다", () => {
  const busy = [{ label: "백업", dow: null, hm: 2 * 60, minutes: 60 }, { label: "토 동기화", dow: 6, hm: 23 * 60 + 30, minutes: 120 }];
  assert.equal(clashesWith(at("2026-10-21T01:55:00"), busy)?.label, "백업");
  assert.equal(clashesWith(at("2026-10-21T02:59:00"), busy)?.label, "백업");
  assert.equal(clashesWith(at("2026-10-21T03:00:00"), busy), null);
  assert.equal(clashesWith(at("2026-10-25T01:00:00"), busy)?.label, "토 동기화"); // 일요일 새벽까지 이어짐
  assert.equal(clashesWith(at("2026-10-25T01:30:00"), busy), null);
  assert.equal(minutesUntil(at("2026-10-21T01:00:00"), busy), 50);
});

test("부하가 높거나 피할 프로세스가 돌면 쉰다", () => {
  assert.equal(idle({ load1: 1, cpus: 8 }).ok, true);
  assert.equal(idle({ load1: 6, cpus: 8 }).ok, false);
  assert.equal(idle({ load1: 0, cpus: 8, running: ["codex"] }).ok, false);
});

test("작업 고르기: 차례·주말 전용·남은 시간·CI와 겹침", () => {
  const jobs = [
    { id: "a", everyHours: 20, minMinutes: 60 },
    { id: "b", everyHours: 20, minMinutes: 30, avoid: [{ dow: 3, hm: 20 * 60, minutes: 60 }] },
    { id: "w", everyHours: 100, minMinutes: 240, dayOffOnly: true },
  ];
  const now = at("2026-10-21T19:00:00"); // 수
  assert.equal(pickJob(jobs, { a: { last: now.toISOString() } }, { now, minutesLeft: 600, dayOff: false }).id, "b"); // 20시 CI 전 50분 ≥ 30분
  assert.equal(pickJob(jobs, {}, { now, minutesLeft: 600, dayOff: false }).id, "a");
  assert.equal(pickJob(jobs, { a: { last: now.toISOString() } }, { now: at("2026-10-21T19:40:00"), minutesLeft: 600, dayOff: false }), null); // b: CI까지 10분
  assert.equal(pickJob([jobs[2]], {}, { now, minutesLeft: 600, dayOff: false }), null);
  assert.equal(pickJob([jobs[2]], {}, { now: at("2026-10-24T09:00:00"), minutesLeft: 1400, dayOff: true }).id, "w");
});

test("간판 글자: 상표·지점 이름이 보이면 일치", () => {
  assert.deepEqual(nameTokens("GS25 가평청평점").words, ["gs25", "가평청평"]);
  assert.equal(signMatches("GS25 가평청평점", "GS 25  24시간  택배"), true);
  assert.equal(signMatches("CU 설악점", "CU편의점"), true);
  assert.equal(signMatches("단비약국", "단비 약국 처방조제"), true); // 띄어쓰기는 무시
  assert.equal(signMatches("행복한정육점", "행복한 정육점"), true);
  assert.equal(signMatches("단비약국", "행복 약국"), false);
  assert.equal(signMatches("청평한우정육", "청평한우정육 식당"), true);
  assert.equal(signMatches("편의점", "편의점"), false); // 흔한 낱말만으로는 일치로 보지 않는다
});

test("맥 판독 결론: 비전 모델이 주인, 없으면 CLIP 또는 간판 글자", () => {
  const clipOk = { ok: true, top: "a photo of a convenience store", pos: 0.8 };
  const clipFood = { ok: false, top: "a photo of food on a plate or a table of dishes", pos: 0.1, why: "a photo of food on a plate or a table of dishes" };
  const clipMeh = { ok: false, top: "a photo of a building exterior on a street", pos: 0.5, why: "가게 모습 아님" };
  assert.equal(decideNearbyMac({ clip: clipOk, sign: false, vlm: { scene: "food", same_place: false } }).ok, false);
  assert.equal(decideNearbyMac({ clip: clipMeh, sign: false, vlm: { scene: "exterior", same_place: true } }).ok, true);
  assert.equal(decideNearbyMac({ clip: clipFood, sign: true, vlm: { scene: "interior", same_place: true } }).ok, false);
  assert.equal(decideNearbyMac({ clip: clipMeh, sign: true, vlm: null }).ok, true);
  assert.equal(decideNearbyMac({ clip: clipMeh, sign: false, vlm: null }).ok, false);
  assert.equal(decideNearbyMac({ clip: { ...clipMeh, top: "an advertisement banner or poster with text" }, sign: true, vlm: null }).ok, false);
});
