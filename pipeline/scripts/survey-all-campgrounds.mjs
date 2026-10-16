/**
 * @fileoverview 전국 3,116개 캠핑장 전수조사 및 조건 데이터 채우기 실행 스크립트.
 * 고캠핑 공공데이터 카탈로그 및 3,116개 캠핑장의 공식 소개글, 시설 메타데이터를
 * survey-extractor로 전수 분석하여 주차 동선, 전력 W, 화기 기준, 위생, 키즈 놀거리를 정형화한다.
 */

import { existsSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { resolve, join } from "node:path";
import { fileURLToPath } from "node:url";
import { extractCampConditions } from "../lib/survey-extractor.mjs";

const rootDir = resolve(fileURLToPath(import.meta.url), "../../..");
const publicDataDir = join(rootDir, "camping-atlas/public/explore/data");
const distDataDir = join(rootDir, "camping-atlas/dist/client/explore/data");
const campsDir = join(publicDataDir, "camps");

console.log("=== 모여라캠핑 전국 3,116개 캠핑장 현장 조건 전수조사 시작 ===");

// 1. 파일럿 검증 레지스트리 로드
const pilotFactsPath = join(rootDir, "pipeline/registry/pilot-condition-facts.json");
const pilotFacts = JSON.parse(readFileSync(pilotFactsPath, "utf8"));
const pilotMap = new Map();
for (const p of pilotFacts.pilot_campgrounds || []) {
  if (p.gocamping_id) pilotMap.set(String(p.gocamping_id), p);
  pilotMap.set(String(p.id), p);
}
console.log(`- 파일럿 검증 캠핑장: ${pilotMap.size}개 매핑 로드 완료`);

// 1.5 운영자 사이트 스니펫 레지스트리 로드
const operatorSnippetsPath = join(rootDir, "pipeline/registry/operator-site-snippets.json");
const operatorSnippets = existsSync(operatorSnippetsPath)
  ? (JSON.parse(readFileSync(operatorSnippetsPath, "utf8")).campgrounds ?? {})
  : {};
console.log(`- 운영자 웹사이트 스니펫: ${Object.keys(operatorSnippets).length}개 캠핑장 로드 완료`);

// 2. campgrounds.json 로드
const campgroundsPath = join(publicDataDir, "campgrounds.json");
if (!existsSync(campgroundsPath)) {
  console.error(`Error: ${campgroundsPath} 파일이 존재하지 않습니다.`);
  process.exit(1);
}
const campgrounds = JSON.parse(readFileSync(campgroundsPath, "utf8"));
console.log(`- 대상 캠핑장 총수: ${campgrounds.length}개소`);

// 3. 통계 수집기
const stats = {
  total: campgrounds.length,
  verified: 0,
  surveyed: 0,
  confirmed: 0,
  parking_tent_side: 0,
  parking_cart_required: 0,
  parking_shared: 0,
  parking_unknown: 0,
  power_available: 0,
  power_high_w: 0,
  firewood_allowed: 0,
  firewood_prohibited: 0,
  fire_unknown: 0,
  private_bathroom: 0,
  kids_play: 0,
  site_sizes_registered: 0,
  floors_registered: 0,
};

// 4. 전수조사 실행 및 레코드 갱신
let updatedCount = 0;
let detailUpdatedCount = 0;

for (const camp of campgrounds) {
  const id = String(camp.id);
  const pilotFact = pilotMap.get(id) || null;

  // 상세 소개글 로드 (intro, feature, guide, programs)
  let detail = null;
  const detailPath = join(campsDir, `${id}.json`);
  if (existsSync(detailPath)) {
    try {
      detail = JSON.parse(readFileSync(detailPath, "utf8"));
    } catch (e) {
      // JSON 파싱 실패 시 건너뜀
    }
  }

  // 운영자 웹사이트 스니펫 주입
  const op = operatorSnippets[id];
  if (op?.status === "OK" && Array.isArray(op.snippets) && op.snippets.length) {
    detail ??= {};
    detail.operator_snippets = op.snippets;
  }

  // 추출 엔진 실행
  const conditions = extractCampConditions(camp, detail, pilotFact);
  camp.field_conditions = conditions;
  updatedCount++;

  // 상세 파일에도 field_conditions 동기화
  if (detail) {
    detail.field_conditions = conditions;
    try {
      writeFileSync(detailPath, JSON.stringify(detail));
      detailUpdatedCount++;
    } catch (e) {}
  }

  // 통계 집계
  if (conditions.status === "VERIFIED") stats.verified++;
  else if (conditions.status === "SURVEYED") stats.surveyed++;
  else stats.confirmed++;

  if (conditions.parking?.tent_side === true) stats.parking_tent_side++;
  else if (conditions.parking?.cart_required === true || conditions.parking?.mode === "CART_REQUIRED") stats.parking_cart_required++;
  else if (conditions.parking?.shared_nearby === true) stats.parking_shared++;
  else stats.parking_unknown++;

  if (conditions.power?.available === true) stats.power_available++;
  if (conditions.power?.limit_w >= 700) stats.power_high_w++;

  if (conditions.firewood?.allowed === true) stats.firewood_allowed++;
  else if (conditions.firewood?.allowed === false) stats.firewood_prohibited++;
  else stats.fire_unknown++;

  if (conditions.sanitary?.private_bathroom === true) stats.private_bathroom++;
  if (conditions.features?.length > 0) stats.kids_play++;
  if (conditions.site_size?.groups?.length > 0) stats.site_sizes_registered++;
  if (conditions.ground?.types?.length > 0) stats.floors_registered++;
}

// 5. campgrounds.json 저장
writeFileSync(campgroundsPath, JSON.stringify(campgrounds));
console.log(`- campgrounds.json 갱신 완료 (${updatedCount}개 캠핑장)`);
console.log(`- 개별 상세 camps/*.json 갱신 완료 (${detailUpdatedCount}개 파일)`);

// dist 폴더에도 동기화
if (existsSync(distDataDir)) {
  writeFileSync(join(distDataDir, "campgrounds.json"), JSON.stringify(campgrounds));
  console.log(`- dist/client/explore/data/campgrounds.json 동기화 완료`);
}

// 6. meta.json 갱신
const metaPath = join(publicDataDir, "meta.json");
if (existsSync(metaPath)) {
  const meta = JSON.parse(readFileSync(metaPath, "utf8"));
  meta.updated_at = new Date().toISOString();
  meta.stats = {
    ...meta.stats,
    field_conditions: campgrounds.length,
    verified_condition_facts: stats.verified,
    surveyed_condition_facts: stats.surveyed,
    confirmed_condition_facts: stats.confirmed,
    parking_tent_side: stats.parking_tent_side,
    parking_cart_required: stats.parking_cart_required,
    parking_shared: stats.parking_shared,
    electricity_registered: stats.power_available,
    power_high_w: stats.power_high_w,
    firewood_allowed: stats.firewood_allowed,
    firewood_prohibited: stats.firewood_prohibited,
    private_bathroom: stats.private_bathroom,
    kids_play_features: stats.kids_play,
    site_size_registered: stats.site_sizes_registered,
    ground_registered: stats.floors_registered,
  };
  writeFileSync(metaPath, JSON.stringify(meta, null, 2));
  if (existsSync(distDataDir)) {
    writeFileSync(join(distDataDir, "meta.json"), JSON.stringify(meta, null, 2));
  }
  console.log("- meta.json 통계 갱신 완료");
}

console.log("\n=== 전수조사 완료 통계 ===");
console.log(`- 총 캠핑장 수: ${stats.total.toLocaleString()}개소`);
console.log(`- 파일럿 정밀 검증: ${stats.verified}개소`);
console.log(`- 고캠핑 등록값만(CONFIRMED): ${stats.confirmed.toLocaleString()}개소`);
console.log(`- 소개글 신호 포함(SURVEYED): ${stats.surveyed.toLocaleString()}개소`);
console.log(`- 텐트 옆 단독 주차: ${stats.parking_tent_side.toLocaleString()}개소`);
console.log(`- 짐수레/손수레 이동: ${stats.parking_cart_required}개소`);
console.log(`- 지정 주차장 도보 이동: ${stats.parking_shared}개소`);
console.log(`- 전기 제공 언급: ${stats.power_available.toLocaleString()}개소`);
console.log(`- 소개글 700W+ 언급(SURVEYED): ${stats.power_high_w}개소`);
console.log(`- 장작 불멍 허용: ${stats.firewood_allowed.toLocaleString()}개소`);
console.log(`- 장작 금지 (숯만 가능 등): ${stats.firewood_prohibited}개소`);
console.log(`- 단독 개별 욕실/화장실: ${stats.private_bathroom}개소`);
console.log(`- 키즈·특화 놀거리 보유: ${stats.kids_play.toLocaleString()}개소`);
console.log(`- 사이트 규격 등록: ${stats.site_sizes_registered.toLocaleString()}개소`);
console.log(`- 바닥재 등록: ${stats.floors_registered.toLocaleString()}개소`);
console.log("===============================\n");
