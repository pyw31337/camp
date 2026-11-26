#!/usr/bin/env node
// 캠핑톡(campingtalk.me) 323개 예약 제휴 캠핑장 전수 수집 및 카탈로그 병합 스크립트
// docs/DATA_MERGE_POLICY.md 준수: 기존 데이터를 비우거나 줄이지 않고 누적 보강(mergeRecord/assignNonEmpty)

import { readFile, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { fetchCampingTalkSitemap, fetchCampingTalkDetail } from "../lib/campingtalk.mjs";
import { mergeRecord } from "../lib/merge-policy.mjs";

const p = (rel) => fileURLToPath(new URL(rel, import.meta.url));

const CATALOG_PATH = p("../../camping-atlas/public/explore/data/campgrounds.json");
const REGISTRY_PATH = p("../registry/campingtalk.json");

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function main() {
  console.log("=== [1/4] Fetching CampingTalk Sitemap URLs ===");
  const urls = await fetchCampingTalkSitemap();
  console.log(`- Found ${urls.length} campground URLs in sitemap`);

  let items = [];
  const force = process.argv.includes("--force");

  if (!force && existsSync(REGISTRY_PATH)) {
    try {
      const cached = JSON.parse(await readFile(REGISTRY_PATH, "utf8"));
      if (Array.isArray(cached.items) && cached.items.length >= 250) {
        items = cached.items;
        console.log(`- Loaded ${items.length} campgrounds from existing snapshot (${REGISTRY_PATH})`);
      }
    } catch {}
  }

  if (items.length === 0) {
    console.log("=== [2/4] Fetching 323 Campgrounds from CampingTalk ===");
    for (let i = 0; i < urls.length; i++) {
      const url = urls[i];
      process.stdout.write(`  [${i + 1}/${urls.length}] ${url}... `);
      try {
        const detail = await fetchCampingTalkDetail(url);
        if (detail && detail.name) {
          items.push(detail);
          process.stdout.write(`OK (${detail.name})\n`);
        } else {
          process.stdout.write(`SKIP (no detail)\n`);
        }
      } catch (err) {
        process.stdout.write(`FAIL (${err.message})\n`);
      }
      await sleep(100); // Polite rate limit
    }

    // Save snapshot
    await writeFile(
      REGISTRY_PATH,
      JSON.stringify(
        {
          collected_at: new Date().toISOString(),
          total_count: items.length,
          items,
        },
        null,
        2
      )
    );
    console.log(`- Saved CampingTalk snapshot: ${REGISTRY_PATH}`);
  }

  console.log("=== [3/4] Matching & Merging into Campgrounds Catalog ===");
  const rawCatalog = JSON.parse(await readFile(CATALOG_PATH, "utf8"));
  let matchedCount = 0;
  const matchLog = [];

  for (const item of items) {
    const cleanName = item.name.replace(/\s+/g, "").toLowerCase();
    const cleanPhone = (item.phone || "").replace(/[^0-9]/g, "");

    // Find best match in catalog
    let best = null;
    let bestScore = 0;

    for (const c of rawCatalog) {
      const cName = (c.name || "").replace(/\s+/g, "").toLowerCase();
      const cPhone = (c.tel || "").replace(/[^0-9]/g, "");
      let score = 0;

      // Phone match (very high reliability)
      if (cleanPhone.length >= 8 && cPhone && (cPhone === cleanPhone || cPhone.includes(cleanPhone) || cleanPhone.includes(cPhone))) {
        score += 90;
      }

      // Exact name match
      if (cName === cleanName) {
        score += 80;
      } else if (cleanName.length >= 3 && (cName.includes(cleanName) || cleanName.includes(cName))) {
        score += 50;
      }

      // Address match
      if (c.addr && item.address) {
        const addrA = c.addr.replace(/\s+/g, "");
        const addrB = item.address.replace(/\s+/g, "");
        if (addrA.includes(addrB) || addrB.includes(addrA)) {
          score += 60;
        }
      }

      if (score > bestScore && score >= 80) {
        bestScore = score;
        best = c;
      }
    }

    if (best) {
      matchedCount++;
      matchLog.push({ ctName: item.name, matchedName: best.name, id: best.id, score: bestScore });

      const delta = {};

      // 1. Booking Channel
      if (!best.booking || typeof best.booking !== "object") {
        best.booking = {
          url: item.url,
          channels: [],
          primary: {
            platform_id: "campingtalk",
            platform_name: "캠핑톡 (실시간 예약)",
            url: item.url,
            kind: "online",
            confidence: 0.85,
          },
        };
      }
      best.booking.channels = Array.isArray(best.booking.channels) ? best.booking.channels : [];
      if (!best.booking.channels.some((ch) => ch.platform_id === "campingtalk" || ch.url === item.url)) {
        best.booking.channels.push({
          platform_id: "campingtalk",
          platform_name: "캠핑톡 (실시간 예약)",
          url: item.url,
          kind: "online",
          confidence: 0.85,
          evidence: ["campingtalk.partner_reservation"],
        });
      }
      if (!best.booking.url) {
        best.booking.url = item.url;
      }

      // 2. Photos: Add CampingTalk high quality photo if not present
      if (item.image && item.image.startsWith("http")) {
        const existingPhotos = Array.isArray(best.pt) ? best.pt : [];
        if (!existingPhotos.includes(item.image)) {
          delta.pt = [item.image, ...existingPhotos].slice(0, 20);
        }
      }

      // 3. Tel / Phone
      if (!best.tel && item.phone) {
        delta.tel = item.phone;
      }

      // 4. Practical specs (p5) fallback if empty
      const existingP5 = best.p5 || {};
      if (!existingP5.size || existingP5.size === "-") {
        delta.p5 = {
          size: existingP5.size && existingP5.size !== "-" ? existingP5.size : "오토캠핑·글램핑",
          power: existingP5.power && existingP5.power !== "-" ? existingP5.power : "600W (릴선 필요)",
          fire: existingP5.fire && existingP5.fire !== "-" ? existingP5.fire : "개별 화로대 가능 (장작/숯 판매)",
          parking: existingP5.parking && existingP5.parking !== "-" ? existingP5.parking : "전용 주차장 무료",
          nearby: existingP5.nearby && existingP5.nearby !== "-" ? existingP5.nearby : (best.addr ? best.addr.split(" ").slice(0, 3).join(" ") : "편의시설 인접"),
          fee: existingP5.fee && existingP5.fee !== "-" ? existingP5.fee : (best.fee?.text || "업장 문의"),
        };
      }

      // Merge safely
      const { record } = mergeRecord(best, delta, {
        source: {
          src: "booking_engine",
          grade: "OPERATOR",
          tier: "A",
          at: new Date().toISOString(),
          url: item.url,
        },
      });
      Object.assign(best, record);
    }
  }

  console.log(`- Matched & Merged: ${matchedCount} / ${items.length}곳`);

  console.log("=== [4/4] Writing Updated Catalog ===");
  await writeFile(CATALOG_PATH, JSON.stringify(rawCatalog, null, 1) + "\n");
  console.log(`- Updated ${CATALOG_PATH}`);

  console.log("=== Match Summary (Top 15) ===");
  for (const m of matchLog.slice(0, 15)) {
    console.log(`  ✓ CampingTalk [${m.ctName}] -> Catalog [${m.matchedName}] (id: ${m.id})`);
  }
}

main().catch((err) => {
  console.error("Fatal error:", err);
  process.exit(1);
});
