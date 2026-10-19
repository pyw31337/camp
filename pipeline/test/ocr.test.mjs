import { test } from "node:test";
import assert from "node:assert/strict";
import { ocrScore, ocrSentences } from "../lib/ocr.mjs";
import { extractSiteDetails } from "../lib/operator-site.mjs";

test("OCR 표: 머리 행 칸 이름을 붙이고 구성 칸은 괄호 안에", () => {
  const t = "사이트그룹      사이트수     기준          비고       주중요금      주말요금\n오토캠핑      30      4인/차량!대      비수기      45,000원      45,000원\n성수기            50,000      50,000원";
  const s = ocrSentences(t);
  assert.equal(s[0], "오토캠핑 (사이트수 30, 기준 4인/차량1대, 비고 비수기) — 주중요금 45,000원, 주말요금 45,000원");
  // 병합 셀(첫 칸이 계절) → 앞 행 이름을 잇고, 원이 빠진 요금 칸에 원을 붙인다
  assert.equal(s[1], "오토캠핑 성수기 — 주중요금 50,000원, 주말요금 50,000원");
  const p = extractSiteDetails(s).SITE_PRICE;
  assert.deepEqual([p.min, p.max], [45000, 50000]);
});

test("OCR 표: 두 줄 머리는 요금 칸 이름 묶음을 행 앞에 붙인다", () => {
  const t = "방이름      평형      기준인원     성수기          비고\n주말(금,토)     평일\n밤나무집      7평        4명       13만원      10만원      7만원\n감나무집      7평        4명       13만원      10만원      7만원";
  const s = ocrSentences(t);
  assert.equal(s[0], "밤나무집 (7평, 4명) — 성수기·주말(금,토)·평일 요금 13만원, 10만원, 7만원");
  const p = extractSiteDetails(s).SITE_PRICE;
  assert.deepEqual([p.min, p.max], [70000, 130000]);
});

test("OCR 잡음 줄은 버리고 안내 문장은 남긴다; 점수는 요금 단서가 많을수록 높다", () => {
  const s = ocrSentences("a| ~~ ..\n입실은 오후 2시, 퇴실은 오전 11시입니다.\n%% 3 ##");
  assert.deepEqual(s, ["입실은 오후 2시, 퇴실은 오전 11시입니다."]);
  assert.ok(ocrScore("평일 45,000원 주말 60,000원") > ocrScore("평일 45 OOO 주말 6O OOO"));
});
