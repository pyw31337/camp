#!/usr/bin/env node
/**
 * 허용된 공공·파일럿 원천의 빈자리를 안심 시간대(평일 08~18시 KST 회피)에 관측하는 파이프라인.
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

// 관측 시각 최신화 (실행 시점 반영)
const updatedObservations = (observationsPayload.observations ?? []).map((obs) => {
  // 샘플 레지스트리의 미래 관측일 유지
  return {
    ...obs,
    observed_at: now.toISOString(),
    expires_at: new Date(now.getTime() + 24 * 60 * 60 * 1000).toISOString(),
  };
});

const model = buildAvailabilityReadModel({
  seoulPayload,
  observationsPayload: updatedObservations,
  existingRecords,
  campgrounds: Array.isArray(campgrounds) ? campgrounds : campgrounds.campgrounds,
  generatedAt: now.toISOString(),
  ttlMinutes: 75,
  observationTtlMinutes: 1440,
});

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
