#!/usr/bin/env node
// 산림청 국립자연휴양림 예약 정책·시설 정보 수집 스터브.
// data.go.kr 관련 데이터셋(예: 15134227 예약정보, 우선예약 상품 등)을 읽어
// booking-windows · 시설 사실로 정규화한 뒤 registry/forest-recreation.json으로 저장.
// 실제 API 호출은 DATA_GO_KR_SERVICE_KEY가 있을 때만. 키 없으면 건너뜀.
// 결과는 build-fact-store가 읽을 수 있도록 확장 예정.

import { writeFileSync, mkdirSync } from "node:fs";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(fileURLToPath(import.meta.url), "../..");
const out = join(root, "registry/forest-recreation.json");

const stub = {
  version: 1,
  generated_at: new Date().toISOString(),
  note: "스터브. 실제 수집은 data.go.kr 키와 원천 파싱 후 채워 넣는다. docs/DATA_COLLECTION_EXPANSION.md 참조.",
  sources: [
    { id: "15134227", title: "산림청_국립자연휴양림 예약정보", status: "planned" }
  ],
  campgrounds: {}
};

mkdirSync(join(root, "registry"), { recursive: true });
writeFileSync(out, JSON.stringify(stub, null, 2) + "\n");
console.log("forest-recreation stub written:", out);
