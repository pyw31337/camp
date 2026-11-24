#!/usr/bin/env node
// 전국 캠핑장 5대 실전 캠핑 데이터 일괄 심층 추출 및 주입 배치
// (온수 공급시간, 동계 안전시설, 매너타임 순찰, 차박/도킹 허용, 쓰레기봉투 지급)
import { readFileSync, writeFileSync, readdirSync, existsSync } from "node:fs";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { sentences, extractFromSentence } from "../lib/spec-extractor.mjs";

const root = resolve(fileURLToPath(import.meta.url), "../../..");
const campsDir = join(root, "camping-atlas/public/explore/data/camps");
const campgroundsPath = join(root, "camping-atlas/public/explore/data/campgrounds.json");

const PRACTICAL_CODES = new Set([
  "HOT_WATER_OPERATING",
  "WINTER_SAFETY_AMENITY",
  "MANNER_ENFORCEMENT",
  "CAR_CAMPING_ALLOWED",
  "TRASH_BAG_POLICY"
]);

console.log("[practical-batch] 전체 캠핑장 대상 5대 실전 데이터 심층 추출 시작...");

const files = readdirSync(campsDir).filter(f => f.endsWith(".json"));
let extractedCampCount = 0;
let totalFactsCount = 0;
const countsByCode = {
  HOT_WATER_OPERATING: 0,
  WINTER_SAFETY_AMENITY: 0,
  MANNER_ENFORCEMENT: 0,
  CAR_CAMPING_ALLOWED: 0,
  TRASH_BAG_POLICY: 0
};

const camps = JSON.parse(readFileSync(campgroundsPath, "utf8"));
const campMap = new Map(camps.map(c => [String(c.id), c]));

for (const file of files) {
  const p = join(campsDir, file);
  let d;
  try {
    d = JSON.parse(readFileSync(p, "utf8"));
  } catch {
    continue;
  }

  const id = file.replace(/\.json$/, "");
  const campRecord = campMap.get(id);

  // 1. 텍스트 소스 모으기 (리뷰, 카페글, 웹문서, 운영자 안내 문구)
  const textSnippets = [];
  if (Array.isArray(d.reviews)) {
    for (const r of d.reviews) {
      if (r.title) textSnippets.push(r.title);
      if (r.snippet) textSnippets.push(r.snippet);
      if (Array.isArray(r.body)) textSnippets.push(...r.body);
    }
  }
  if (Array.isArray(d.cafe)) {
    for (const c of d.cafe) {
      if (c.title) textSnippets.push(c.title);
      if (c.snippet) textSnippets.push(c.snippet);
      if (Array.isArray(c.body)) textSnippets.push(...c.body);
    }
  }
  if (Array.isArray(d.web)) {
    for (const w of d.web) {
      if (w.title) textSnippets.push(w.title);
      if (w.snippet) textSnippets.push(w.snippet);
      if (Array.isArray(w.body)) textSnippets.push(...w.body);
    }
  }
  if (d.intro) textSnippets.push(d.intro);
  if (d.guide_text) textSnippets.push(d.guide_text);

  if (textSnippets.length === 0) continue;

  // 2. 문장별 5대 실전 데이터 추출
  const practicalFound = new Map();

  for (const text of textSnippets) {
    if (!text || typeof text !== "string") continue;
    for (const sent of sentences(text)) {
      const facts = extractFromSentence(sent, { year: 2026 });
      for (const f of facts) {
        if (PRACTICAL_CODES.has(f.code)) {
          if (!practicalFound.has(f.code)) {
            practicalFound.set(f.code, f);
          }
        }
      }
    }
  }

  if (practicalFound.size === 0) continue;

  // 3. 상세 레코드 d.practical_tips 및 d.profile.fields 에 누적 병합
  if (!d.practical_tips) d.practical_tips = {};
  if (!d.profile) d.profile = { fields: {} };
  if (!d.profile.fields) d.profile.fields = {};

  let addedInThisCamp = 0;
  for (const [code, fact] of practicalFound.entries()) {
    if (!d.practical_tips[code]) {
      d.practical_tips[code] = fact.value;
      addedInThisCamp++;
      countsByCode[code]++;
      totalFactsCount++;
    }
    if (!d.profile.fields[code]) {
      d.profile.fields[code] = {
        v: fact.value,
        norm: fact.norm,
        grade: "MENTION",
        src: "COMMUNITY_BODY",
        at: "2026-11-24"
      };
    }
  }

  if (addedInThisCamp > 0) {
    extractedCampCount++;
    writeFileSync(p, JSON.stringify(d, null, 2));

    // 카탈로그 레코드에도 간략 표시용 필드 주입 (c.p5: 5대 실전 데이터 격리 키, c.pt는 카드 사진 폴백 전용)
    if (campRecord) {
      if (!campRecord.p5) campRecord.p5 = {};
      for (const [code, fact] of practicalFound.entries()) {
        campRecord.p5[code] = fact.value;
      }
    }
  }
}

writeFileSync(campgroundsPath, JSON.stringify(camps));

console.log(`[practical-batch] 5대 실전 캠핑 데이터 심층 추출 완료!`);
console.log(`- 실전 정보가 추가/보강된 캠핑장: 총 ${extractedCampCount}곳`);
console.log(`- 새로 추출된 사실 문장: 총 ${totalFactsCount}건`);
console.log(`- 항목별 분포:`);
console.log(`  * 온수 공급 실태 (HOT_WATER_OPERATING): ${countsByCode.HOT_WATER_OPERATING}곳`);
console.log(`  * 동계 시설/열선 (WINTER_SAFETY_AMENITY): ${countsByCode.WINTER_SAFETY_AMENITY}곳`);
console.log(`  * 매너타임 순찰 (MANNER_ENFORCEMENT): ${countsByCode.MANNER_ENFORCEMENT}곳`);
console.log(`  * 차박/도킹 텐트 허용 (CAR_CAMPING_ALLOWED): ${countsByCode.CAR_CAMPING_ALLOWED}곳`);
console.log(`  * 쓰레기봉투 지급/정책 (TRASH_BAG_POLICY): ${countsByCode.TRASH_BAG_POLICY}곳`);
