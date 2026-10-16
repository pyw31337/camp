#!/usr/bin/env node
/**
 * @fileoverview 전국 3,111개 캠핑장 데이터, 소셜 리뷰, 영상, 현장 조건,
 * AI 분석 장단점 및 운영 이슈 데이터를 SQLite 데이터베이스(db/moyeora_camping.db)로 구축하는 빌더.
 */
import { existsSync, mkdirSync, readFileSync, readdirSync, unlinkSync } from "node:fs";
import { join, resolve } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { fileURLToPath } from "node:url";

const root = resolve(fileURLToPath(import.meta.url), "../../..");
const dbDir = join(root, "db");
const dbPath = join(dbDir, "moyeora_camping.db");
const exploreDir = join(root, "camping-atlas/public/explore/data");
const campsDir = join(exploreDir, "camps");
const campgroundsJsonPath = join(exploreDir, "campgrounds.json");

if (!existsSync(dbDir)) mkdirSync(dbDir, { recursive: true });
if (existsSync(dbPath)) unlinkSync(dbPath);

console.log(`📦 SQLite 데이터베이스 생성 중: ${dbPath}`);
const db = new DatabaseSync(dbPath);

// 1. 테이블 및 인덱스 스키마 정의
db.exec(`
  PRAGMA journal_mode = WAL;
  PRAGMA synchronous = NORMAL;

  -- 1) 캠핑장 기본 정보 및 스펙
  CREATE TABLE IF NOT EXISTS campgrounds (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    sido TEXT,
    sigungu TEXT,
    area TEXT,
    address TEXT,
    lat REAL,
    lng REAL,
    tel TEXT,
    homepage TEXT,
    operator_type TEXT,
    status TEXT,
    booking_url TEXT,
    booking_primary_platform TEXT,
    total_sites INTEGER,
    general_sites INTEGER,
    auto_sites INTEGER,
    glamping_sites INTEGER,
    caravan_sites INTEGER,
    parking_count INTEGER,
    area_m2 REAL,
    toilets_count INTEGER,
    modified_at TEXT
  );

  -- 2) 인공지능 장단점 및 운영 이슈 종합 요약
  CREATE TABLE IF NOT EXISTS review_digests (
    campground_id TEXT PRIMARY KEY REFERENCES campgrounds(id) ON DELETE CASCADE,
    total_reviews INTEGER NOT NULL DEFAULT 0,
    top_pros TEXT,
    top_cons TEXT,
    pros_json TEXT NOT NULL DEFAULT '[]',
    cons_json TEXT NOT NULL DEFAULT '[]',
    issues_json TEXT NOT NULL DEFAULT '[]',
    generated_at TEXT NOT NULL
  );

  -- 3) 블로그 및 카페 후기
  CREATE TABLE IF NOT EXISTS reviews (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    campground_id TEXT NOT NULL REFERENCES campgrounds(id) ON DELETE CASCADE,
    kind TEXT NOT NULL,
    title TEXT NOT NULL,
    snippet TEXT,
    url TEXT NOT NULL,
    src TEXT,
    pub_date TEXT,
    info_score INTEGER,
    thumb_url TEXT
  );

  -- 4) 유튜브 및 영상 클립
  CREATE TABLE IF NOT EXISTS videos (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    campground_id TEXT NOT NULL REFERENCES campgrounds(id) ON DELETE CASCADE,
    platform TEXT NOT NULL DEFAULT 'YOUTUBE',
    video_id TEXT,
    title TEXT NOT NULL,
    url TEXT NOT NULL,
    author TEXT,
    duration_sec INTEGER,
    thumb_url TEXT,
    kind TEXT NOT NULL DEFAULT 'video',
    pub_date TEXT
  );

  -- 5) 캠핑장 사진 (공식 및 방문자 사진)
  CREATE TABLE IF NOT EXISTS photos (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    campground_id TEXT NOT NULL REFERENCES campgrounds(id) ON DELETE CASCADE,
    source_type TEXT NOT NULL,
    photo_url TEXT NOT NULL,
    thumb_url TEXT,
    width INTEGER,
    height INTEGER,
    pub_date TEXT
  );

  -- 6) 현장 조건 (전력, 불멍, 주차, 바닥, 규격)
  CREATE TABLE IF NOT EXISTS conditions (
    campground_id TEXT PRIMARY KEY REFERENCES campgrounds(id) ON DELETE CASCADE,
    status TEXT,
    power_watts INTEGER,
    power_note TEXT,
    firewood_allowed INTEGER,
    fire_pit_type TEXT,
    tent_side_parking INTEGER,
    cart_required INTEGER,
    private_bathroom INTEGER,
    floor_types TEXT,
    site_sizes TEXT
  );

  -- 7) 실시간 운영 이슈 & 행사
  CREATE TABLE IF NOT EXISTS operating_events (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    campground_id TEXT NOT NULL REFERENCES campgrounds(id) ON DELETE CASCADE,
    category TEXT NOT NULL,
    title TEXT NOT NULL,
    value_text TEXT,
    valid_period TEXT
  );

  -- 성능 최적화 인덱스
  CREATE INDEX IF NOT EXISTS idx_campgrounds_sido_sgg ON campgrounds(sido, sigungu);
  CREATE INDEX IF NOT EXISTS idx_campgrounds_name ON campgrounds(name);
  CREATE INDEX IF NOT EXISTS idx_reviews_camp_score ON reviews(campground_id, info_score DESC);
  CREATE INDEX IF NOT EXISTS idx_videos_camp ON videos(campground_id);
  CREATE INDEX IF NOT EXISTS idx_photos_camp ON photos(campground_id);
  CREATE INDEX IF NOT EXISTS idx_events_camp ON operating_events(campground_id);
`);

// 2. 데이터 적재 준비
const stmtCamp = db.prepare(`
  INSERT OR REPLACE INTO campgrounds (
    id, name, sido, sigungu, area, address, lat, lng, tel, homepage,
    operator_type, status, booking_url, booking_primary_platform,
    total_sites, general_sites, auto_sites, glamping_sites, caravan_sites,
    parking_count, area_m2, toilets_count, modified_at
  ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
`);

const stmtDigest = db.prepare(`
  INSERT OR REPLACE INTO review_digests (
    campground_id, total_reviews, top_pros, top_cons, pros_json, cons_json, issues_json, generated_at
  ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
`);

const stmtReview = db.prepare(`
  INSERT INTO reviews (campground_id, kind, title, snippet, url, src, pub_date, info_score, thumb_url)
  VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
`);

const stmtVideo = db.prepare(`
  INSERT INTO videos (campground_id, platform, video_id, title, url, author, duration_sec, thumb_url, kind, pub_date)
  VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
`);

const stmtPhoto = db.prepare(`
  INSERT INTO photos (campground_id, source_type, photo_url, thumb_url, width, height, pub_date)
  VALUES (?, ?, ?, ?, ?, ?, ?)
`);

const stmtCondition = db.prepare(`
  INSERT OR REPLACE INTO conditions (
    campground_id, status, power_watts, power_note, firewood_allowed, fire_pit_type,
    tent_side_parking, cart_required, private_bathroom, floor_types, site_sizes
  ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
`);

const stmtEvent = db.prepare(`
  INSERT INTO operating_events (campground_id, category, title, value_text, valid_period)
  VALUES (?, ?, ?, ?, ?)
`);

// 3. campgrounds.json 로드
if (!existsSync(campgroundsJsonPath)) {
  console.error(`❌ 파일 없음: ${campgroundsJsonPath}`);
  process.exit(1);
}
const campsList = JSON.parse(readFileSync(campgroundsJsonPath, "utf8"));
const campsMap = new Map(campsList.map((c) => [c.id, c]));

console.log(`🔍 총 ${campsList.length}개 캠핑장 데이터베이스 적재 시작...`);

db.exec("BEGIN TRANSACTION;");

let insertedCamps = 0;
let insertedDigests = 0;
let insertedReviews = 0;
let insertedVideos = 0;
let insertedPhotos = 0;
let insertedEvents = 0;

for (const c of campsList) {
  const kindsMap = new Map(c.kinds ?? []);
  const generalSites = kindsMap.get("PITCH") || kindsMap.get("NORMAL_PITCH") || 0;
  const autoSites = kindsMap.get("AUTO_PITCH") || 0;
  const glampingSites = kindsMap.get("GLAMPING") || 0;
  const caravanSites = kindsMap.get("CARAVAN_RENTAL") || kindsMap.get("CARAVAN") || 0;
  const totalSites = (c.specs?.total_sites) || (generalSites + autoSites + glampingSites + caravanSites) || null;

  const primaryChannel = c.booking?.channels?.[0];
  const primaryPlatform = primaryChannel?.platform_name || primaryChannel?.platform_id || null;

  stmtCamp.run(
    c.id,
    c.name,
    c.sido ?? null,
    c.sigungu ?? null,
    c.area ?? null,
    c.addr ?? null,
    c.lat ?? null,
    c.lng ?? null,
    c.tel ?? null,
    c.homepage ?? null,
    c.op ?? "UNKNOWN",
    c.status ?? null,
    c.booking?.url ?? null,
    primaryPlatform,
    totalSites,
    generalSites || null,
    autoSites || null,
    glampingSites || null,
    caravanSites || null,
    c.specs?.parking_count ?? null,
    c.specs?.area_m2 ?? null,
    c.toilets ?? null,
    c.modified_at ?? new Date().toISOString()
  );
  insertedCamps++;

  // 현장 조건
  const fc = c.field_conditions ?? {};
  const floorTypes = (c.floors ?? []).map(([fl, n]) => `${fl}:${n}`).join(",") || null;
  const siteSizes = (c.sizes ?? []).map(([w, d, n]) => `${w}x${d}:${n}`).join(",") || null;

  stmtCondition.run(
    c.id,
    fc.status ?? "UNKNOWN",
    fc.power?.limit_w ?? null,
    fc.power?.note ?? null,
    fc.firewood?.allowed === true ? 1 : fc.firewood?.allowed === false ? 0 : null,
    fc.fire_pit?.arrangement ?? null,
    fc.parking?.tent_side === true ? 1 : fc.parking?.tent_side === false ? 0 : null,
    fc.parking?.cart_required === true ? 1 : 0,
    fc.sanitary?.private_bathroom === true ? 1 : 0,
    floorTypes,
    siteSizes
  );

  // 상세 파일(camps/{id}.json) 읽기
  const detailFile = join(campsDir, `${c.id}.json`);
  if (!existsSync(detailFile)) continue;

  let d = null;
  try {
    d = JSON.parse(readFileSync(detailFile, "utf8"));
  } catch {
    continue;
  }

  // AI 장단점 및 운영이슈 요약 적재
  const rv = d.rv || (c.rv ? { n: c.rv.n, pros: c.rv.p, cons: c.rv.c } : null);
  if (rv) {
    const pros = rv.details?.pros || (rv.pros || []).map(([topic, count]) => ({ topic, count }));
    const cons = rv.details?.cons || (rv.cons || []).map(([topic, count]) => ({ topic, count }));
    const issues = rv.details?.issues || [];

    const topPros = pros.slice(0, 3).map((p) => `${p.topic}(${p.count})`).join(", ") || null;
    const topCons = cons.slice(0, 3).map((c) => `${c.topic}(${c.count})`).join(", ") || null;

    stmtDigest.run(
      c.id,
      rv.n ?? 0,
      topPros,
      topCons,
      JSON.stringify(pros),
      JSON.stringify(cons),
      JSON.stringify(issues),
      d.rv?.details?.generated_at ?? new Date().toISOString()
    );
    insertedDigests++;
  }

  // 블로그 및 카페 리뷰 적재
  const reviews = [...(d.reviews ?? []).map((r) => ({ ...r, kind: "blog" })), ...(d.cafe ?? []).map((r) => ({ ...r, kind: "cafe" }))];
  for (const r of reviews) {
    stmtReview.run(
      c.id,
      r.kind,
      r.title,
      r.snippet ?? null,
      r.url,
      r.src ?? null,
      r.date ?? null,
      r.q ?? null,
      r.thumb ?? null
    );
    insertedReviews++;
  }

  // 영상 클립 적재
  const videos = d.videos ?? [];
  for (const v of videos) {
    stmtVideo.run(
      c.id,
      v.yt ? "YOUTUBE" : "OTHER",
      v.yt ?? null,
      v.title,
      v.url,
      v.author ?? null,
      v.dur ?? null,
      v.thumb ?? null,
      v.kind ?? "video",
      v.date ?? null
    );
    insertedVideos++;
  }

  // 사진 적재
  const snaps = d.sns_images ?? [];
  for (const p of snaps) {
    stmtPhoto.run(
      c.id,
      "VISITOR_SNS",
      p.img || p.thumb,
      p.thumb ?? null,
      p.w ?? null,
      p.h ?? null,
      p.date ?? null
    );
    insertedPhotos++;
  }

  // 실시간 운영 이슈 & 행사
  const specFields = d.spec?.fields ?? {};
  if (specFields.PROMOTION?.values?.length) {
    for (const v of specFields.PROMOTION.values) {
      stmtEvent.run(c.id, "PROMOTION", "시즌 프로모션·행사", v.value, v.norm ?? null);
      insertedEvents++;
    }
  }
  if (specFields.DISCOUNT?.values?.length) {
    for (const v of specFields.DISCOUNT.values) {
      stmtEvent.run(c.id, "DISCOUNT", "할인 감면 혜택", v.value, null);
      insertedEvents++;
    }
  }
  if (specFields.MANNER_TIME?.values?.length) {
    for (const v of specFields.MANNER_TIME.values) {
      stmtEvent.run(c.id, "MANNER_TIME", "매너타임 소등", v.value, null);
      insertedEvents++;
    }
  }
}

db.exec("COMMIT;");

// out 디렉토리에도 복사본 보관
const outDir = join(root, "pipeline/out");
if (!existsSync(outDir)) mkdirSync(outDir, { recursive: true });
const outDbPath = join(outDir, "moyeora_camping.db");
try {
  const buf = readFileSync(dbPath);
  import("node:fs").then(({ writeFileSync }) => writeFileSync(outDbPath, buf));
} catch {}

console.log("==================================================");
console.log("🎉 SQLite 데이터베이스 구축 완료!");
console.log(`📁 데이터베이스 파일: ${dbPath}`);
console.log(`📊 적재 통계:`);
console.log(`  - 캠핑장: ${insertedCamps.toLocaleString()}개`);
console.log(`  - AI 장단점 요약: ${insertedDigests.toLocaleString()}건`);
console.log(`  - 블로그·카페 후기: ${insertedReviews.toLocaleString()}건`);
console.log(`  - 영상 콘텐츠: ${insertedVideos.toLocaleString()}건`);
console.log(`  - 사진 갤러리: ${insertedPhotos.toLocaleString()}장`);
console.log(`  - 운영 이슈 및 행사: ${insertedEvents.toLocaleString()}건`);
console.log("==================================================");
