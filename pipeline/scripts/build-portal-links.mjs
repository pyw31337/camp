#!/usr/bin/env node
// 공용 예약 사이트(숲나들e·국립공원) 예약 버튼을 메인 화면 대신 그 업장 페이지로(lib/portal-links.mjs). 멱등.
// registry/portal-directory.json(scripts/sync-portal-directory.mjs)을 읽는다. 목록 빌드 끝, build-link-health.mjs 앞에서 실행한다.
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { applyPortalPages } from "../lib/portal-links.mjs";

const root = resolve(fileURLToPath(import.meta.url), "../../..");
const path = join(root, "camping-atlas/public/explore/data/campgrounds.json");
const dirPath = join(root, "pipeline/registry/portal-directory.json");
if (!existsSync(dirPath)) { console.log("공용 예약 사이트 목록 없음 — 건너뜀"); process.exit(0); }
const dir = JSON.parse(readFileSync(dirPath, "utf8"));
const camps = JSON.parse(readFileSync(path, "utf8"));
let camps_ = 0, links = 0;
for (const c of camps) { const n = applyPortalPages(c, dir); if (n) { camps_++; links += n; } }
writeFileSync(path, JSON.stringify(camps));
console.log(`공용 예약 사이트 업장 페이지로 연결: ${camps_}곳 · 예약 링크 ${links}개(숲나들e ${dir.foresttrip?.length ?? 0}곳·국립공원 ${dir.knps?.length ?? 0}곳 목록)`);
