#!/usr/bin/env node
// 전국 캠핑장 5대 실전 스펙(p5) 전수 합성 및 보강 스크립트
// 규격/바닥(size), 전력제한(power), 화로대(fire), 주차형태(parking), 주변인프라(nearby), 1박요금(fee)
import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(fileURLToPath(import.meta.url), "../../..");
const campgroundsPath = resolve(root, "camping-atlas/public/explore/data/campgrounds.json");

console.log("[expand-p5] 5대 실전 스펙(p5) 전수 보강 시작...");

const camps = JSON.parse(readFileSync(campgroundsPath, "utf8"));

const floorNames = {
  GRASS: "잔디",
  DECK: "데크",
  CRUSHED_STONE: "파쇄석",
  GRAVEL: "자갈",
  DIRT: "마사토",
};

let enrichedCount = 0;
let totalFieldsAdded = 0;

for (const c of camps) {
  if (!c.p5) c.p5 = {};
  const p5 = c.p5;
  let added = 0;

  // 1. 규격 및 바닥 (size)
  if (!p5.size || p5.size === "-" || p5.size === "확인필요") {
    let floorDesc = "";
    if (Array.isArray(c.floors) && c.floors.length > 0) {
      floorDesc = c.floors.map(([f]) => floorNames[f] || f).join("·");
    }
    let sizeDesc = "";
    if (Array.isArray(c.sizes) && c.sizes.length > 0) {
      const topSizes = c.sizes.slice(0, 2).map(([w, d]) => `${w}×${d}m`).join(", ");
      sizeDesc = ` (${topSizes})`;
    }
    if (floorDesc || sizeDesc) {
      p5.size = `${floorDesc || "일반 사이트"}${sizeDesc}`;
      added++;
    }
  }

  // 2. 전력 제한 (power)
  if (!p5.power || p5.power === "-" || p5.power === "확인필요") {
    if (c.field_conditions?.power?.available === true || (Array.isArray(c.amenities) && c.amenities.includes("전기"))) {
      const limit = c.field_conditions?.power?.limit_w;
      p5.power = limit ? `${limit}W 제공` : "600W (고캠핑/전기안전 기준)";
      added++;
    }
  }

  // 3. 화로대 / 장작 (fire)
  if (!p5.fire || p5.fire === "-" || p5.fire === "확인필요") {
    if (c.fire) {
      p5.fire = c.fire.includes("개별")
        ? "개별 화로대 가능 (장작/숯)"
        : c.fire.includes("공동")
        ? "공동취사장 화로 이용"
        : `${c.fire} 화로대`;
      added++;
    } else if (c.field_conditions?.charcoal?.allowed) {
      p5.fire = "화로대 사용 가능 (숯/장작)";
      added++;
    }
  }

  // 4. 주차 형태 (parking)
  if (!p5.parking || p5.parking === "-" || p5.parking === "확인필요") {
    if (Array.isArray(c.th) && c.th.includes("auto")) {
      p5.parking = "사이트 옆 주차 가능 (오토캠핑)";
      added++;
    } else if (c.field_conditions?.parking?.mode === "MOVE_PARKING") {
      p5.parking = "짐 하역 후 전용 주차장 이동 주차";
      added++;
    } else if (c.field_conditions?.parking?.mode === "TENT_SIDE") {
      p5.parking = "사이트 바로 옆 개별 주차";
      added++;
    }
  }

  // 5. 주변 7종 생활인프라 (nearby)
  if (!p5.nearby || p5.nearby === "-" || p5.nearby === "확인필요") {
    if (c.nl) {
      const parts = [];
      if (c.nl.c != null) parts.push(`편의점 ${c.nl.c}m`);
      if (c.nl.m != null) parts.push(`마트 ${c.nl.m}m`);
      if (c.nl.f != null) parts.push(`주유소 ${c.nl.f}m`);
      if (parts.length > 0) {
        p5.nearby = parts.join(" · ");
        added++;
      }
    }
  }

  // 6. 1박 요금대 (fee)
  if (!p5.fee || p5.fee === "-" || p5.fee.includes("문의") || p5.fee === "확인필요") {
    if (c.fee?.text) {
      p5.fee = c.fee.text;
      added++;
    } else if (c.pf?.p?.v) {
      p5.fee = c.pf.p.v;
      added++;
    }
  }

  if (added > 0) {
    enrichedCount++;
    totalFieldsAdded += added;
  }
}

writeFileSync(campgroundsPath, JSON.stringify(camps, null, 2) + "\n");
console.log(`[expand-p5] 완료! 총 ${enrichedCount}곳 캠핑장에 실전 스펙 ${totalFieldsAdded}건 추가/보강됨.`);
