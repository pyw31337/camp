// 최신 서울 공공예약 원천을 탐색 화면의 짧은 TTL 상태 파일로 발행한다.
// 원본 응답 전체는 공개하지 않고, 매칭된 캠핑 상품의 접수 상태·이용 기간·원문 링크만 남긴다.
import { existsSync } from "node:fs";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { buildAvailabilityReadModel } from "../lib/availability-read-model.mjs";

const p = (rel) => fileURLToPath(new URL(rel, import.meta.url));
const readJson = async (path) => JSON.parse(await readFile(path, "utf8"));
const seoulPath = process.env.SEOUL_YEYAK_PATH ?? p("../out/seoul-yeyak.json");
const defaultCampgroundsPath = p("../out/explore/campgrounds.json");
const fallbackCampgroundsPath = p("../../camping-atlas/public/explore/data/campgrounds.json");
const campgroundsPath = process.env.AVAILABILITY_CAMPGROUNDS_PATH ?? (existsSync(defaultCampgroundsPath) ? defaultCampgroundsPath : fallbackCampgroundsPath);

if (!existsSync(seoulPath)) throw new Error(`서울 공공예약 원천이 없습니다: ${seoulPath}`);
if (!existsSync(campgroundsPath)) throw new Error(`캠핑장 탐색 데이터가 없습니다: ${campgroundsPath}`);

const [seoulPayload, campgrounds] = await Promise.all([readJson(seoulPath), readJson(campgroundsPath)]);
const model = buildAvailabilityReadModel({
  seoulPayload,
  campgrounds: Array.isArray(campgrounds) ? campgrounds : campgrounds.campgrounds,
  generatedAt: new Date().toISOString(),
  ttlMinutes: Number(process.env.AVAILABILITY_STATUS_TTL_MINUTES ?? 75),
});

const out = p("../out/explore/availability.json");
await mkdir(p("../out/explore/"), { recursive: true });
await writeFile(out, JSON.stringify(model));
console.log(`공식 접수 상태 ${model.stats.official_application_open}개 상품 · ${model.stats.campgrounds_with_open_application}곳 · ${model.expires_at} 만료`);
