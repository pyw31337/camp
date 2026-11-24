#!/usr/bin/env node
// 전국 캠핑장 썸네일 전수 진위 검증 및 대표 사진 정제 배치
import { readFileSync, writeFileSync, readdirSync, existsSync } from "node:fs";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { isRejectedThumbnail, isAuthenticOperatorPhoto, pickValidCampThumbnail } from "../lib/thumbnail-validator.mjs";

const root = resolve(fileURLToPath(import.meta.url), "../../..");
const campgroundsPath = join(root, "camping-atlas/public/explore/data/campgrounds.json");
const campsDir = join(root, "camping-atlas/public/explore/data/camps");

const camps = JSON.parse(readFileSync(campgroundsPath, "utf8"));
console.log(`[thumbnail-batch] 전체 ${camps.length}곳 대상 썸네일 진위 검증 시작...`);

let rejectedCount = 0;
let upgradedCount = 0;
const issues = [];

for (const camp of camps) {
  const id = String(camp.id);
  const detailFile = join(campsDir, `${id}.json`);
  let detail = null;
  if (existsSync(detailFile)) {
    try {
      detail = JSON.parse(readFileSync(detailFile, "utf8"));
    } catch {}
  }

  const currentImg = camp.img || camp.sn || null;
  const currentRejected = currentImg ? isRejectedThumbnail(currentImg) : { rejected: false };

  // 최적 썸네일 선별
  const best = pickValidCampThumbnail(camp, detail);

  if (currentRejected.rejected) {
    rejectedCount++;
    issues.push({
      id,
      name: camp.name,
      old: currentImg,
      new: best.img,
      reason: currentRejected.reason,
    });
    camp.img = best.img;
    camp.sn = best.sn;
    if (detail) {
      if (Array.isArray(detail.photos)) {
        detail.photos = detail.photos.filter(p => !isRejectedThumbnail(p).rejected);
      }
      writeFileSync(detailFile, JSON.stringify(detail, null, 2));
    }
  } else if (currentImg && !isAuthenticOperatorPhoto(currentImg) && best.source === "AUTHENTIC_OPERATOR" && best.img !== currentImg) {
    // 공식 정품 사진이 있는데 임의 사진이 걸려 있던 경우 승격
    upgradedCount++;
    camp.img = best.img;
    camp.sn = best.sn;
  }
}

writeFileSync(campgroundsPath, JSON.stringify(camps));
console.log(`[thumbnail-batch] 검증 완료:`);
console.log(`- 엉뚱한 비캠핑장/아바타/거절 썸네일 발견 및 교체: ${rejectedCount}건`);
console.log(`- 공식 고캠핑/예약사 고화질 정품 사진으로 승격: ${upgradedCount}건`);
if (issues.length > 0) {
  console.log(`[thumbnail-batch] 교체된 주요 캠핑장:`);
  for (const iss of issues.slice(0, 10)) {
    console.log(`  - [${iss.id}] ${iss.name}: 사유="${iss.reason}" -> 교체: ${iss.new ? iss.new.slice(0, 60) + '...' : '(공식 전경 대체)'}`);
  }
}
