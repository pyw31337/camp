#!/usr/bin/env node
// 그래가(graega.com) 전수 데이터 수집 및 병합 스크립트
// 86개 파트너 캠핑장의 실시간 구역/사이트 규격, 바닥, 요금, 입퇴실, 반려동물 규정, CloudFront 원본 사진 및 175개 노지 정보.
// docs/DATA_MERGE_POLICY.md 준수: 기존 데이터를 비우거나 줄이지 않고 누적 보강(mergeRecord/assignNonEmpty)

import { readFile, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import {
  fetchGraegaHotels,
  fetchGraegaHotelDetail,
  fetchGraegaNoji,
  extractGraegaSpecs,
} from "../lib/graega.mjs";
import { mergeRecord } from "../lib/merge-policy.mjs";

const p = (rel) => fileURLToPath(new URL(rel, import.meta.url));

const CATALOG_PATH = p("../../camping-atlas/public/explore/data/campgrounds.json");
const REGISTRY_GRAEGA = p("../registry/graega.json");
const REGISTRY_NOJI = p("../registry/graega-noji.json");

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function main() {
  console.log("=== [1/5] Fetching Graega Partners and Noji Campsites ===");
  const [hotels, nojiList] = await Promise.all([
    fetchGraegaHotels(),
    fetchGraegaNoji(),
  ]);
  console.log(`- Graega Partner Campgrounds: ${hotels.length}곳`);
  console.log(`- Graega Noji Campsites: ${nojiList.length}곳`);

  // Save Noji data directly to registry
  await writeFile(
    REGISTRY_NOJI,
    JSON.stringify(
      {
        collected_at: new Date().toISOString(),
        total_count: nojiList.length,
        items: nojiList,
      },
      null,
      2
    )
  );
  console.log(`- Saved Noji registry: ${REGISTRY_NOJI}`);

  let hotelDetails = [];
  const force = process.argv.includes("--force");

  if (!force && existsSync(REGISTRY_GRAEGA)) {
    try {
      const cached = JSON.parse(await readFile(REGISTRY_GRAEGA, "utf8"));
      if (Array.isArray(cached.hotels) && cached.hotels.length >= 80) {
        hotelDetails = cached.hotels;
        console.log(`- Loaded ${hotelDetails.length} campgrounds from existing snapshot (${REGISTRY_GRAEGA})`);
      }
    } catch {}
  }

  if (hotelDetails.length === 0) {
    console.log("=== [2/5] Fetching Detailed Specs for 86 Partner Campgrounds ===");
    for (let i = 0; i < hotels.length; i++) {
      const hotel = hotels[i];
      process.stdout.write(`  [${i + 1}/${hotels.length}] ${hotel.name}... `);
      try {
        const detail = await fetchGraegaHotelDetail(hotel.id);
        const specs = extractGraegaSpecs(hotel, detail);
        hotelDetails.push(specs);
        process.stdout.write(`OK (areas: ${specs.sitePricingTable.length}, photos: ${specs.photos.length})\n`);
      } catch (err) {
        process.stdout.write(`FAIL (${err.message})\n`);
      }
      await sleep(200); // Polite rate limit
    }

    // Save raw snapshot to registry/graega.json
    await writeFile(
      REGISTRY_GRAEGA,
      JSON.stringify(
        {
          collected_at: new Date().toISOString(),
          total_count: hotelDetails.length,
          hotels: hotelDetails,
        },
        null,
        2
      )
    );
    console.log(`- Saved Graega snapshot: ${REGISTRY_GRAEGA}`);
  }

  console.log("=== [3/5] Matching & Merging into Campgrounds Catalog ===");
  const rawCatalog = JSON.parse(await readFile(CATALOG_PATH, "utf8"));
  let matchedCount = 0;
  const matchLog = [];

  for (const specs of hotelDetails) {
    const cleanName = specs.name.replace(/\s+/g, "").toLowerCase();
    
    // Find best match in catalog
    let best = null;
    let bestScore = 0;

    for (const c of rawCatalog) {
      const cName = (c.name || "").replace(/\s+/g, "").toLowerCase();
      let score = 0;

      // Exact name match
      if (cName === cleanName) {
        score = 100;
      } else if (cleanName.length >= 3 && (cName.includes(cleanName) || cleanName.includes(cName))) {
        score = 80;
      }

      // Coordinate proximity check
      if (c.lat && c.lng && specs.lat && specs.lng) {
        const dLat = Math.abs(c.lat - specs.lat);
        const dLng = Math.abs(c.lng - specs.lng);
        if (dLat < 0.005 && dLng < 0.005) {
          score += 50; // within ~500m
        }
        if (dLat < 0.001 && dLng < 0.001) {
          score += 50; // within ~100m
        }
      }

      if (score > bestScore && score >= 80) {
        bestScore = score;
        best = c;
      }
    }

    if (best) {
      matchedCount++;
      matchLog.push({ graegaName: specs.name, matchedName: best.name, id: best.id, score: bestScore });

      // Build delta according to DATA_MERGE_POLICY
      const delta = {};

      // 1. Practical Specs (p5)
      const existingP5 = best.p5 || {};
      delta.p5 = {
        size: existingP5.size && existingP5.size !== "-" ? existingP5.size : specs.p5.size,
        power: existingP5.power && existingP5.power !== "-" ? existingP5.power : specs.p5.power,
        fire: existingP5.fire && existingP5.fire !== "-" ? existingP5.fire : specs.p5.fire,
        parking: existingP5.parking && existingP5.parking !== "-" ? existingP5.parking : specs.p5.parking,
        nearby: existingP5.nearby && existingP5.nearby !== "-" ? existingP5.nearby : specs.p5.nearby,
        fee: existingP5.fee && existingP5.fee !== "-" && !existingP5.fee.includes("문의") ? existingP5.fee : specs.p5.fee,
      };

      // 2. Site Pricing Table
      if (Array.isArray(specs.sitePricingTable) && specs.sitePricingTable.length > 0) {
        if (!Array.isArray(best.sitePricingTable) || best.sitePricingTable.length === 0) {
          delta.sitePricingTable = specs.sitePricingTable;
        }
      }

      // 3. Site Map URL
      if (specs.siteMapUrl && !best.siteMapUrl) {
        delta.siteMapUrl = specs.siteMapUrl;
      }

      // 4. Booking link
      if (!best.booking || typeof best.booking !== "object") {
        best.booking = {
          url: specs.url,
          channels: [],
          primary: {
            platform_id: "graega",
            platform_name: "그래가 (실시간 예약)",
            url: specs.url,
            kind: "online",
            confidence: 0.9,
          },
        };
      }
      best.booking.channels = Array.isArray(best.booking.channels) ? best.booking.channels : [];
      if (!best.booking.channels.some((ch) => ch.platform_id === "graega" || ch.url === specs.url)) {
        best.booking.channels.unshift({
          platform_id: "graega",
          platform_name: "그래가 (실시간 예약)",
          url: specs.url,
          kind: "online",
          confidence: 0.9,
          evidence: ["graega.partner_reservation"],
        });
      }
      if (!best.booking.url) {
        best.booking.url = specs.url;
      }

      // 5. Photos: Prepend Graega CloudFront verified photos, avoiding non-camp illustrations
      const existingPhotos = Array.isArray(best.pt) ? best.pt : [];
      const cleanExisting = existingPhotos.filter(
        (url) => !url.includes("image_type") && !url.includes("avatar") && !url.includes("illust")
      );
      const mergedPhotos = [...specs.photos];
      for (const p of cleanExisting) {
        if (!mergedPhotos.includes(p)) mergedPhotos.push(p);
      }
      delta.pt = mergedPhotos.slice(0, 20);

      // 6. Rules & Fees
      if (specs.petPolicy && !best.petPolicy) delta.petPolicy = specs.petPolicy;
      if (specs.refundSummary && !best.refundSummary) delta.refundSummary = specs.refundSummary;
      if (specs.minCheckIn && !best.checkIn) delta.checkIn = specs.minCheckIn;
      if (specs.maxCheckOut && !best.checkOut) delta.checkOut = specs.maxCheckOut;
      if (specs.youtubeUrl && !best.youtubeUrl) delta.youtubeUrl = specs.youtubeUrl;

      // Merge safely into campground record
      const { record } = mergeRecord(best, delta, {
        source: {
          src: "booking_engine",
          grade: "OPERATOR",
          tier: "A",
          at: new Date().toISOString(),
          url: specs.url,
        },
      });
      Object.assign(best, record);
    }
  }

  console.log(`- Matched & Merged: ${matchedCount} / ${hotelDetails.length}곳`);

  console.log("=== [4/5] Writing Updated Catalog ===");
  await writeFile(CATALOG_PATH, JSON.stringify(rawCatalog, null, 1) + "\n");
  console.log(`- Updated ${CATALOG_PATH}`);

  // Also sync to camping-atlas/public/explore/data/ if duplicate exists or needed
  const altPath = p("../../design/renewal/data/campgrounds.json");
  if (existsSync(altPath)) {
    await writeFile(altPath, JSON.stringify(rawCatalog, null, 1) + "\n");
    console.log(`- Synced ${altPath}`);
  }

  console.log("=== [5/5] Match Summary (Top 15) ===");
  for (const m of matchLog.slice(0, 15)) {
    console.log(`  ✓ Graega [${m.graegaName}] -> Catalog [${m.matchedName}] (id: ${m.id})`);
  }
}

main().catch((err) => {
  console.error("Fatal error:", err);
  process.exit(1);
});
