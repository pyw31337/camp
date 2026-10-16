#!/usr/bin/env node
// 행정안전부 LOCALDATA 인허가 공개 데이터(registry/nearby-licensed.json)에서
// 캠핑장별 가장 가까운 편의점, 마트, 정육점, 주유소, 약국, 동물병원 정보를 꺼내
// 공개 카탈로그(campgrounds.json)의 c.nl과 상세(camps/{id}.json)의 d.nearby_licensed 및 d.nearby에 반영한다.
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(fileURLToPath(import.meta.url), "../../..");
const dataDir = join(root, "camping-atlas/public/explore/data");
const nearbyPath = join(root, "pipeline/registry/nearby-licensed.json");

if (!existsSync(nearbyPath)) {
  console.log("주변 인허가 데이터(nearby-licensed.json)가 없어 건너뜁니다.");
  process.exit(0);
}

const reg = JSON.parse(readFileSync(nearbyPath, "utf8"));
const licensed = reg.campgrounds ?? {};
const campsPath = join(dataDir, "campgrounds.json");
const camps = JSON.parse(readFileSync(campsPath, "utf8"));

let updatedCamps = 0;
let updatedDetails = 0;

for (const c of camps) {
  const near = licensed[c.id];
  if (!near) continue;

  // 카탈로그용 경량 요약 (c.nl)
  c.nl = {
    c: near.CONVENIENCE?.m ?? null,
    cn: near.CONVENIENCE?.name ?? null,
    m: near.MART?.m ?? null,
    mn: near.MART?.name ?? null,
    b: near.BUTCHER?.m ?? null,
    bn: near.BUTCHER?.name ?? null,
    f: near.FUEL?.m ?? null,
    fn: near.FUEL?.name ?? null,
    p: near.PHARMACY?.m ?? null,
    pn: near.PHARMACY?.name ?? null,
    v: near.VET?.m ?? null,
  };
  updatedCamps++;

  // 상세 파일(camps/{id}.json) 갱신
  const detailPath = join(dataDir, "camps", `${c.id}.json`);
  if (existsSync(detailPath)) {
    try {
      const d = JSON.parse(readFileSync(detailPath, "utf8"));
      d.nearby_licensed = near;
      d.nearby = d.nearby ?? {};

      // 1. 편의점
      if (near.CONVENIENCE) {
        const item = {
          n: near.CONVENIENCE.name,
          m: near.CONVENIENCE.m,
          a: near.CONVENIENCE.addr,
          lat: near.CONVENIENCE.lat,
          lng: near.CONVENIENCE.lng,
          k: "편의점",
          ty: "인허가 등록",
        };
        const existing = d.nearby.conv ?? [];
        if (!existing.some((x) => x.n === item.n)) {
          d.nearby.conv = [item, ...existing];
        }
      }

      // 2. 마트 & 정육점
      const martList = [...(d.nearby.mart ?? [])];
      if (near.MART && !martList.some((x) => x.n === near.MART.name)) {
        martList.unshift({
          n: near.MART.name,
          m: near.MART.m,
          a: near.MART.addr,
          lat: near.MART.lat,
          lng: near.MART.lng,
          k: "마트",
          ty: "인허가 등록",
        });
      }
      if (near.BUTCHER && !martList.some((x) => x.n === near.BUTCHER.name)) {
        martList.push({
          n: near.BUTCHER.name,
          m: near.BUTCHER.m,
          a: near.BUTCHER.addr,
          lat: near.BUTCHER.lat,
          lng: near.BUTCHER.lng,
          k: "정육점·바베큐",
          ty: "축산물판매업 인허가",
        });
      }
      if (martList.length) d.nearby.mart = martList;

      // 3. 주유소
      if (near.FUEL) {
        const item = {
          n: near.FUEL.name,
          m: near.FUEL.m,
          a: near.FUEL.addr,
          lat: near.FUEL.lat,
          lng: near.FUEL.lng,
          k: "주유소",
          ty: "석유판매업 인허가",
        };
        const existing = d.nearby.fuel ?? [];
        if (!existing.some((x) => x.n === item.n)) {
          d.nearby.fuel = [item, ...existing];
        }
      }

      // 4. 약국 & 상비약
      const medList = [...(d.nearby.medical ?? [])];
      if (near.PHARMACY && !medList.some((x) => x.n === near.PHARMACY.name)) {
        medList.unshift({
          n: near.PHARMACY.name,
          m: near.PHARMACY.m,
          a: near.PHARMACY.addr,
          lat: near.PHARMACY.lat,
          lng: near.PHARMACY.lng,
          k: "약국",
          ty: "약국 인허가",
        });
      }
      if (near.OTC_MEDICINE && !medList.some((x) => x.n === near.OTC_MEDICINE.name)) {
        medList.push({
          n: near.OTC_MEDICINE.name,
          m: near.OTC_MEDICINE.m,
          a: near.OTC_MEDICINE.addr,
          lat: near.OTC_MEDICINE.lat,
          lng: near.OTC_MEDICINE.lng,
          k: "안전상비의약품 판매점",
          ty: "인허가 등록",
        });
      }
      if (medList.length) d.nearby.medical = medList;

      // 5. 동물병원
      if (near.VET) {
        const item = {
          n: near.VET.name,
          m: near.VET.m,
          a: near.VET.addr,
          lat: near.VET.lat,
          lng: near.VET.lng,
          k: "동물병원",
          ty: "수의업 인허가",
        };
        const existing = d.nearby.vet ?? [];
        if (!existing.some((x) => x.n === item.n)) {
          d.nearby.vet = [item, ...existing];
        }
      }

      writeFileSync(detailPath, JSON.stringify(d));
      updatedDetails++;
    } catch (e) {
      // JSON 파싱 실패 등 무시
    }
  }
}

writeFileSync(campsPath, JSON.stringify(camps));

// meta.json 갱신
const metaPath = join(dataDir, "meta.json");
if (existsSync(metaPath)) {
  const meta = JSON.parse(readFileSync(metaPath, "utf8"));
  meta.nearby_licensed = {
    generated_at: new Date().toISOString(),
    campgrounds: updatedCamps,
    details: updatedDetails,
  };
  writeFileSync(metaPath, JSON.stringify(meta, null, 2));
}

console.log(`주변 생활 인프라 사실 반영 완료: 카탈로그 ${updatedCamps}곳 · 상세 ${updatedDetails}곳`);
