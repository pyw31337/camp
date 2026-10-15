#!/usr/bin/env node
/**
 * 승인된 원천이 제출한 빈자리 관측(registry/pilot-observations.json)을 저부하 시간대(평일 08~18시 KST 회피)에
 * 읽기 모델로 발행한다. 이 스크립트는 예약 사이트를 직접 조회하지 않는다. 커넥터는 원천 승인 카드
 * (PILOT_INTAKE_CONTRACT 2절)가 APPROVED_LIVE/APPROVED_OBSERVATION일 때만 별도로 추가한다.
 *
 * 사용법:
 *   node pipeline/scripts/observe-public-availability.mjs [--force] [--dry-run]
 *
 * 옵션:
 *   --force    안심 시간대(isSafeObservationTime) 검사를 건너뛰고 강제 실행
 *   --dry-run  파일 쓰기 없이 콘솔에 결과만 출력
 */
import { existsSync } from "node:fs";
import { readFile, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import {
  buildAvailabilityReadModel,
  isSafeObservationTime,
} from "../lib/availability-read-model.mjs";

const p = (rel) => fileURLToPath(new URL(rel, import.meta.url));
const readJson = async (path) => JSON.parse(await readFile(path, "utf8"));

const args = new Set(process.argv.slice(2));
const isForce = args.has("--force");
const isDryRun = args.has("--dry-run");

const now = new Date();
const kstStr = new Date(now.getTime() + 9 * 60 * 60 * 1000).toISOString().replace("T", " ").slice(0, 19) + " KST";

console.log(`[관측 파이프라인] 현재 시각: ${kstStr}`);

if (!isForce && !isSafeObservationTime(now)) {
  console.log(`[안내] 현재는 평일 업무시간(08:00~18:00 KST)입니다.`);
  console.log(`[안내] 사용자 작업 보호 및 원천 부하 방지를 위해 관측 실행을 대기합니다. (강제 실행은 --force)`);
  process.exit(0);
}

const seoulPath = process.env.SEOUL_YEYAK_PATH ?? p("../out/seoul-yeyak.json");
const observationsPath = process.env.AVAILABILITY_OBSERVATIONS_PATH ?? p("../registry/pilot-observations.json");
const campgroundsPath = p("../../camping-atlas/public/explore/data/campgrounds.json");
const atlasAvailabilityPath = p("../../camping-atlas/public/explore/data/availability.json");

let existingRecords = [];
if (!existsSync(seoulPath) && existsSync(atlasAvailabilityPath)) {
  try {
    const prev = await readJson(atlasAvailabilityPath);
    existingRecords = (prev.records ?? []).filter((r) => r.state === "OFFICIAL_APPLICATION_OPEN");
  } catch {}
}

const [seoulPayload, observationsPayload, campgrounds] = await Promise.all([
  existsSync(seoulPath) ? readJson(seoulPath) : { services: [] },
  existsSync(observationsPath) ? readJson(observationsPath) : { observations: [] },
  readJson(campgroundsPath),
]);

// 관측 시각은 제출된 원본 값을 그대로 쓴다. 실행 시각으로 덮어쓰면 오래된 관측이
// 방금 확인한 빈자리처럼 보이므로 절대 갱신하지 않는다.
const submittedObservations = observationsPayload.observations ?? [];

const model = buildAvailabilityReadModel({
  seoulPayload,
  observationsPayload: submittedObservations,
  existingRecords,
  campgrounds: Array.isArray(campgrounds) ? campgrounds : campgrounds.campgrounds,
  generatedAt: now.toISOString(),
  ttlMinutes: 75,
  observationTtlMinutes: 1440,
});

if (model.stats.observations_rejected) console.log(`[제외] 계약 미충족 관측 ${model.stats.observations_rejected}건: ${model.rejected_observations.map((r) => r.reason).join(", ")}`);
console.log(`[관측 완료] 공식 접수: ${model.stats.official_application_open}건 | 빈자리 관측: ${model.stats.observed_available}건 | 활성 캠핑장: ${model.stats.total_active_campgrounds}곳`);

if (!isDryRun) {
  const outAtlas = p("../../camping-atlas/public/explore/data/availability.json");
  const outPipeline = p("../out/explore/availability.json");
  await writeFile(outAtlas, JSON.stringify(model));
  if (existsSync(p("../out/explore/"))) {
    await writeFile(outPipeline, JSON.stringify(model));
  }
  console.log(`[발행 완료] ${outAtlas} 에 저장되었습니다.`);
}
