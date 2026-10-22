#!/usr/bin/env node
// 산림청 국립자연휴양림 예약 정책·시설 정보 수집 스터브.
// data.go.kr 관련 데이터셋(예: 15134227 예약정보, 우선예약 상품 등)을 읽어
// booking-windows · 시설 사실로 정규화한 뒤 registry/forest-recreation.json으로 저장.
// 실제 API 호출은 DATA_GO_KR_SERVICE_KEY가 있을 때만. 키 없으면 건너뜀.
// 결과는 build-fact-store가 읽을 수 있도록 확장 예정.

import { existsSync, readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(fileURLToPath(import.meta.url), "../..");
const out = join(root, "registry/forest-recreation.json");

const collectedPath = join(root, "registry/forest-recreation-collected.json");
let collected = { items: [] };
try { collected = JSON.parse(readFileSync(collectedPath, "utf8")); } catch { /* 원장이 없으면 빈 상태로 유지 */ }
const previous = existsSync(out) ? JSON.parse(readFileSync(out, "utf8")) : {};
const byName = new Map([...(previous.items ?? []), ...(collected.items ?? [])].filter((x) => x?.name).map((x) => [x.name, x]));
const stub = {
  version: 1,
  generated_at: new Date().toISOString(),
  note: "국립·공립·사립 자연휴양림 원장은 기존 값을 보존하며 공식 예약·시설 원천을 추가 병합한다.",
  sources: [
    { id: "foresttrip-public", title: "숲나들e 자연휴양림 공개 안내", url: "https://www.foresttrip.go.kr", tier: "OPERATOR" },
    { id: "15134227", title: "산림청_국립자연휴양림 예약정보", url: "https://www.data.go.kr/", status: "planned" }
  ],
  items: [...byName.values()],
  campgrounds: previous.campgrounds ?? {}
};

mkdirSync(join(root, "registry"), { recursive: true });
writeFileSync(out, JSON.stringify(stub, null, 2) + "\n");
console.log("forest-recreation stub written:", out);
