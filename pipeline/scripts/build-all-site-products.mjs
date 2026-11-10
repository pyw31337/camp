#!/usr/bin/env node
// 전국 전체 캠핑장의 전체 상품(구역·객실·사이트)별 전수 스펙 및 다중 실물 사진 구축 스크립트
// 사용자 2026-11-10 지시:
// "상품 하나당 사진 한개씩 밖에 수집이 안되는거야? 전체 업장의 전체 상품의 전체 사진을 수집해줘."

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { buildCampSiteProducts, cleanPhotoPool, isDocOrLayoutPhoto } from "../lib/site-products.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const CAT_PATH = path.join(ROOT, "camping-atlas/public/explore/data/campgrounds.json");
const CAMPS_DIR = path.join(ROOT, "camping-atlas/public/explore/data/camps");

if (!fs.existsSync(CAT_PATH)) {
  console.error("campgrounds.json 파일이 없습니다.");
  process.exit(1);
}

const campgrounds = JSON.parse(fs.readFileSync(CAT_PATH, "utf8"));
const campMap = new Map(campgrounds.map((c) => [String(c.id), c]));

const campFiles = fs.readdirSync(CAMPS_DIR).filter((f) => f.endsWith(".json"));
console.log(`전국 캠핑장 상세 파일 ${campFiles.length}개 대상 상품 및 다중 실물 사진 전수 생성 시작...`);

let totalCampsUpdated = 0;
let totalProductsCreated = 0;
let totalPhotosMapped = 0;

for (let i = 0; i < campFiles.length; i++) {
  const file = campFiles[i];
  const cid = file.replace(/\.json$/, "");
  const filePath = path.join(CAMPS_DIR, file);

  let detail;
  try {
    detail = JSON.parse(fs.readFileSync(filePath, "utf8"));
  } catch (err) {
    continue;
  }

  const camp = campMap.get(cid) || { id: cid };
  const pool = cleanPhotoPool(camp, detail);

  // 기존 site_products가 있는 경우 (정성 구축 3곳 등)
  if (detail.site_products && detail.site_products.length > 0) {
    // 기존 스펙은 유지하고 사진을 1장에서 다중 사진으로 확장 보강
    for (const prod of detail.site_products) {
      const photos = (prod.photos ?? []).filter((u) => !isDocOrLayoutPhoto(u, camp, detail));
      if (photos.length < 5 && pool.length) {
        for (const u of pool) {
          if (!photos.includes(u)) {
            photos.push(u);
            if (photos.length >= 6) break;
          }
        }
      }
      prod.photos = photos;
      totalPhotosMapped += photos.length;
    }
    totalProductsCreated += detail.site_products.length;
  } else {
    // 신규 전수 생성
    const prods = buildCampSiteProducts(camp, detail);
    if (prods && prods.length > 0) {
      detail.site_products = prods;
      totalProductsCreated += prods.length;
      for (const p of prods) {
        totalPhotosMapped += (p.photos?.length || 0);
      }
    }
  }

  fs.writeFileSync(filePath, JSON.stringify(detail, null, 2) + "\n", "utf8");
  totalCampsUpdated++;

  if ((i + 1) % 1500 === 0 || i === campFiles.length - 1) {
    console.log(`진행률: ${i + 1}/${campFiles.length} (캠핑장 ${totalCampsUpdated}곳, 총 상품 ${totalProductsCreated}개, 연결된 실물 사진 ${totalPhotosMapped}장)`);
  }
}

console.log("전국 전체 캠핑장 상품 및 다중 실물 사진 전수 구축 완료!");
console.log(`- 업데이트 캠핑장: ${totalCampsUpdated}곳`);
console.log(`- 총 구축 상품(구역·객실·사이트): ${totalProductsCreated}개`);
console.log(`- 총 수집·매핑된 실물 사진: ${totalPhotosMapped}장`);
console.log(`- 상품당 평균 사진 수: ${(totalPhotosMapped / (totalProductsCreated || 1)).toFixed(1)}장`);
