#!/usr/bin/env node
// 전국야영장표준데이터(STD), 산림빅데이터(LINKED 95689), 지자체 야영장 현황(FILE) 수집·동기화
import { existsSync } from "node:fs";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { fetchDataGoKr } from "../lib/datagokr.mjs";
import { nowInKst, toKstIso } from "../lib/kst.mjs";
import { matchStandardToCamp, normalizeStandardCamp } from "../lib/standard-campgrounds.mjs";

const out = fileURLToPath(new URL("../out/", import.meta.url));
await mkdir(out, { recursive: true });
const fetchedAt = toKstIso(nowInKst());

const STANDARD_CAMP_API = "https://api.data.go.kr/openapi/tn_pubr_public_campg_api";

let rawRecords = [];

// 1. 공공데이터포털 표준데이터 API (키가 있을 때)
if (process.env.DATA_GO_KR_SERVICE_KEY) {
  try {
    const all = [];
    for (let page = 1; page <= 50; page++) {
      const { res } = await fetchDataGoKr(
        `${STANDARD_CAMP_API}?pageNo=${page}&numOfRows=1000&type=json`,
        process.env.DATA_GO_KR_SERVICE_KEY,
        { timeoutMs: 30000 }
      );
      const text = await res.text();
      let body = null;
      try { body = JSON.parse(text)?.response?.body ?? JSON.parse(text)?.body; } catch {}
      if (!body) {
        console.log(`  ${STANDARD_CAMP_API} p${page} → HTTP ${res.status}`);
        break;
      }
      const items = Array.isArray(body.items) ? body.items : body.items?.item ? [].concat(body.items.item) : [];
      all.push(...items);
      if (items.length < 1000) break;
    }
    if (all.length) {
      rawRecords.push(...all);
      console.log(`전국야영장표준데이터 API ${all.length}건 수신`);
    }
  } catch (err) {
    console.log(`  표준데이터 API 실패: ${err.message}`);
  }
}

// 2. 캐시 또는 로컬 파일데이터/연계데이터
const cachePath = `${out}standard-campgrounds-raw.json`;
if (!rawRecords.length && existsSync(cachePath)) {
  rawRecords = JSON.parse(await readFile(cachePath, "utf8"));
  console.log(`캐시된 표준데이터 ${rawRecords.length}건 로드`);
}

const normalized = rawRecords.map(normalizeStandardCamp).filter(Boolean);
console.log(`표준데이터 정규화: ${normalized.length}건`);

// 3. 고캠핑 캠핑장과 1:1 매칭
const campPath = existsSync(`${out}campgrounds.json`)
  ? `${out}campgrounds.json`
  : fileURLToPath(new URL("../../camping-atlas/public/explore/data/campgrounds.json", import.meta.url));

let matchedCount = 0;
const enrichedMap = {};

if (existsSync(campPath)) {
  const content = JSON.parse(await readFile(campPath, "utf8"));
  const camps = Array.isArray(content) ? content : content.campgrounds ?? [];

  for (const std of normalized) {
    const match = matchStandardToCamp(std, camps);
    if (match.campId) {
      matchedCount++;
      enrichedMap[match.campId] = {
        std_name: std.name,
        specs: std.specs,
        nature: std.nature,
        conditions: std.conditions,
        agency: std.agency,
        base_date: std.base_date,
        match_score: match.score,
        match_method: match.method,
      };
    }
  }
  console.log(`캠핑장 매칭 완료: 총 ${normalized.length}건 중 ${matchedCount}곳 1:1 연결`);
}

const result = {
  version: 1,
  fetched_at: fetchedAt,
  total_standard: normalized.length,
  matched_campgrounds: matchedCount,
  records: enrichedMap,
};

await writeFile(`${out}standard-campgrounds.json`, JSON.stringify(result, null, 2));
console.log(`결과 저장: ${out}standard-campgrounds.json`);
