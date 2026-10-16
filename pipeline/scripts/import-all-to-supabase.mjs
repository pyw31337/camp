#!/usr/bin/env node
/**
 * @fileoverview 탐색 데이터 및 AI 분석 결과를 Supabase PostgreSQL 데이터베이스로 초고속 멀티로우 벌크 적재하는 스크립트.
 */
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import pg from "pg";

const root = resolve(fileURLToPath(import.meta.url), "../../..");
const exploreDir = join(root, "camping-atlas/public/explore/data");
const campsDir = join(exploreDir, "camps");
const campgroundsJsonPath = join(exploreDir, "campgrounds.json");

const connectionString = process.env.DATABASE_URL;
if (!connectionString) {
  console.error("❌ DATABASE_URL 환경변수가 설정되지 않았습니다.");
  process.exit(1);
}

const { Pool } = pg;
const pool = new Pool({
  connectionString,
  ssl: process.env.DATABASE_SSL === "false" ? undefined : { rejectUnauthorized: false },
});

// 벌크 멀티로우 헬퍼
async function bulkInsert(client, table, columns, rows, onConflict = "") {
  if (!rows.length) return [];
  const colNames = columns.join(", ");
  const valPlaceholders = [];
  const flatVals = [];

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    const offset = i * columns.length;
    const placeholders = columns.map((_, colIdx) => `$${offset + colIdx + 1}`);
    valPlaceholders.push(`(${placeholders.join(", ")})`);
    for (const col of columns) {
      flatVals.push(row[col]);
    }
  }

  const sql = `INSERT INTO ${table} (${colNames}) VALUES ${valPlaceholders.join(", ")} ${onConflict}`;
  return client.query(sql, flatVals);
}

async function main() {
  const client = await pool.connect();
  console.log("⚡ Supabase PostgreSQL 연결 성공!");

  try {
    const campsRaw = JSON.parse(readFileSync(campgroundsJsonPath, "utf8"));
    console.log(`📦 전국 ${campsRaw.length}개 캠핑장 데이터 초고속 벌크 적재 시작...`);

    // gocamping data_source id 획득
    const dsRes = await client.query("SELECT id FROM data_source WHERE code = 'gocamping'");
    const gocampingSourceId = dsRes.rows[0]?.id;

    await client.query("BEGIN");

    // 1. 기존 external_identifier 매핑 획득
    const extMapRes = await client.query(
      "SELECT campground_id, external_id FROM external_identifier WHERE source_id = $1 AND entity_type = 'CAMPGROUND'",
      [gocampingSourceId]
    );
    const existingExt = new Map(extMapRes.rows.map((r) => [r.external_id, r.campground_id]));

    // 새로 삽입해야 할 캠핑장 분리
    const toInsert = [];
    for (const c of campsRaw) {
      const extId = String(c.id);
      if (!existingExt.has(extId)) {
        toInsert.push({
          extId,
          canonical_name: c.name,
          province: c.sido || null,
          city_county_district: c.sigungu || null,
          road_address: c.address || null,
          latitude: c.lat || null,
          longitude: c.lng || null,
        });
      }
    }

    console.log(`  신규 삽입 대상: ${toInsert.length}개, 기존 연결: ${existingExt.size}개`);

    // 신규 캠핑장 멀티로우 벌크 삽입 (청크 단위)
    const BATCH_SIZE = 100;
    for (let i = 0; i < toInsert.length; i += BATCH_SIZE) {
      const chunk = toInsert.slice(i, i + BATCH_SIZE);
      const cols = ["canonical_name", "province", "city_county_district", "road_address", "latitude", "longitude"];
      const valPlaceholders = [];
      const flatVals = [];

      for (let j = 0; j < chunk.length; j++) {
        const row = chunk[j];
        const offset = j * cols.length;
        valPlaceholders.push(`($${offset + 1}, $${offset + 2}, $${offset + 3}, $${offset + 4}, $${offset + 5}, $${offset + 6})`);
        flatVals.push(row.canonical_name, row.province, row.city_county_district, row.road_address, row.latitude, row.longitude);
      }

      const insRes = await client.query(
        `INSERT INTO campground (${cols.join(", ")}) VALUES ${valPlaceholders.join(", ")} RETURNING id`,
        flatVals
      );

      // external_identifier 연결
      const extRows = [];
      for (let j = 0; j < chunk.length; j++) {
        const newUuid = insRes.rows[j].id;
        const extId = chunk[j].extId;
        existingExt.set(extId, newUuid);
        extRows.push({
          campground_id: newUuid,
          source_id: gocampingSourceId,
          entity_type: "CAMPGROUND",
          external_id: extId,
        });
      }

      await bulkInsert(client, "external_identifier", ["campground_id", "source_id", "entity_type", "external_id"], extRows, "ON CONFLICT DO NOTHING");
      process.stdout.write(`\r  캠핑장 생성 중: ${Math.min(i + BATCH_SIZE, toInsert.length)} / ${toInsert.length}`);
    }
    console.log(`\n✅ 캠핑장 마스터 ${campsRaw.length}개 동기화 완료.`);

    // 2. 상세 데이터 (AI 다이제스트, 후기, 영상, 운영이슈) 수집
    const files = existsSync(campsDir) ? readdirSync(campsDir).filter((f) => f.endsWith(".json")) : [];
    console.log(`🔍 상세 파일 ${files.length}개 분석 중...`);

    const allDigests = [];
    const allReviews = [];
    const allVideos = [];
    const allEvents = [];

    for (const file of files) {
      const campId = file.replace(/\.json$/, "");
      const fullPath = join(campsDir, file);
      let detail;
      try {
        detail = JSON.parse(readFileSync(fullPath, "utf8"));
      } catch {
        continue;
      }

      if (detail.rv) {
        const rv = detail.rv;
        const details = rv.details || {};
        allDigests.push({
          campground_id: campId,
          total_reviews: rv.n || 0,
          pros_json: JSON.stringify(details.pros || []),
          cons_json: JSON.stringify(details.cons || []),
          issues_json: JSON.stringify(details.issues || []),
          top_pros_summary: Array.isArray(rv.p) ? rv.p.map(([t, n]) => `${t}(${n})`).join(", ") : null,
          top_cons_summary: Array.isArray(rv.c) ? rv.c.map(([t, n]) => `${t}(${n})`).join(", ") : null,
        });
      }

      const reviews = [
        ...(detail.reviews ?? []).map((r) => ({ ...r, platform: "NAVER_BLOG" })),
        ...(detail.cafe ?? []).map((r) => ({ ...r, platform: "NAVER_CAFE" })),
      ];
      for (const r of reviews) {
        allReviews.push({
          campground_id: campId,
          platform: r.platform,
          title: r.title || "",
          snippet: r.snippet || "",
          url: r.url || "",
          author: r.src || null,
          published_at: r.date || null,
          information_score: r.q || 0,
          thumbnail_url: r.thumb || null,
        });
      }

      if (Array.isArray(detail.videos)) {
        for (const v of detail.videos) {
          allVideos.push({
            campground_id: campId,
            platform: "YOUTUBE",
            video_id: v.yt || null,
            title: v.title || "",
            url: v.url || "",
            author: v.author || null,
            duration_seconds: v.dur || null,
            thumbnail_url: v.thumb || null,
            published_at: v.date || null,
          });
        }
      }

      const specFields = detail.spec?.fields ?? {};
      if (specFields.PROMOTION?.values?.length) {
        for (const v of specFields.PROMOTION.values) {
          allEvents.push({ campground_id: campId, category: "PROMOTION", title: "시즌 프로모션·행사", value_text: v.value, valid_period: v.norm ?? null });
        }
      }
      if (specFields.DISCOUNT?.values?.length) {
        for (const v of specFields.DISCOUNT.values) {
          allEvents.push({ campground_id: campId, category: "DISCOUNT", title: "할인 감면 혜택", value_text: v.value, valid_period: v.norm ?? null });
        }
      }
      if (specFields.MANNER_TIME?.values?.length) {
        for (const v of specFields.MANNER_TIME.values) {
          allEvents.push({ campground_id: campId, category: "MANNER_TIME", title: "매너타임 소등", value_text: v.value, valid_period: v.norm ?? null });
        }
      }
    }

    console.log(`📊 수집 집계: 다이제스트 ${allDigests.length}건, 후기 ${allReviews.length}건, 영상 ${allVideos.length}건, 이벤트 ${allEvents.length}건`);

    // 이전 데이터 클리어
    await client.query("TRUNCATE TABLE review_digest, review_post, video_content, operating_issue_event");

    // 1) review_digest 벌크 삽입
    console.log("  -> review_digest 적재 중...");
    for (let i = 0; i < allDigests.length; i += 100) {
      await bulkInsert(client, "review_digest", ["campground_id", "total_reviews", "pros_json", "cons_json", "issues_json", "top_pros_summary", "top_cons_summary"], allDigests.slice(i, i + 100));
    }

    // 2) review_post 벌크 삽입
    console.log("  -> review_post 적재 중...");
    for (let i = 0; i < allReviews.length; i += 100) {
      await bulkInsert(client, "review_post", ["campground_id", "platform", "title", "snippet", "url", "author", "published_at", "information_score", "thumbnail_url"], allReviews.slice(i, i + 100));
    }

    // 3) video_content 벌크 삽입
    console.log("  -> video_content 적재 중...");
    for (let i = 0; i < allVideos.length; i += 100) {
      await bulkInsert(client, "video_content", ["campground_id", "platform", "video_id", "title", "url", "author", "duration_seconds", "thumbnail_url", "published_at"], allVideos.slice(i, i + 100));
    }

    // 4) operating_issue_event 벌크 삽입
    console.log("  -> operating_issue_event 적재 중...");
    for (let i = 0; i < allEvents.length; i += 100) {
      await bulkInsert(client, "operating_issue_event", ["campground_id", "category", "title", "value_text", "valid_period"], allEvents.slice(i, i + 100));
    }

    await client.query("COMMIT");

    console.log("==================================================");
    console.log("🎉 Supabase 클라우드 데이터베이스 적재 100% 완료!");
    console.log(`📊 최종 적재 결과:`);
    console.log(`  - 캠핑장 마스터 (campground): ${campsRaw.length.toLocaleString()}개`);
    console.log(`  - AI 장단점 다이제스트 (review_digest): ${allDigests.length.toLocaleString()}건`);
    console.log(`  - 블로그·카페 후기 (review_post): ${allReviews.length.toLocaleString()}건`);
    console.log(`  - 유튜브 영상 클립 (video_content): ${allVideos.length.toLocaleString()}건`);
    console.log(`  - 실시간 운영 이벤트 (operating_issue_event): ${allEvents.length.toLocaleString()}건`);
    console.log("==================================================");
  } catch (err) {
    await client.query("ROLLBACK");
    console.error("\n❌ 적재 중 오류 발생:", err);
    throw err;
  } finally {
    client.release();
    await pool.end();
  }
}

main().catch(() => process.exit(1));
