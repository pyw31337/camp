// 인허가 ↔ 고캠핑 연계 적재. TEST_DATABASE_URL(관리 권한)이 있을 때만 새 DB를 만들어 실행한다.
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { importGoCampingSnapshot } from "../lib/postgres-gocamping.mjs";
import { importCampgroundLicences } from "../lib/postgres-licences.mjs";

const adminUrl = process.env.TEST_DATABASE_URL;
const now = new Date().toISOString();
const camp = { external_id: { provider: "gocamping", id: "900001" }, name: "테스트 캠핑장", legal_business_types: ["일반야영장"], operator_type: "PRIVATE",
  management: null, status_text: "운영", address: { sido: "강원", sigungu: "홍천군", line1: "강원 홍천군 테스트로 1", line2: null }, location: { lat: 37.7, lng: 128.1 },
  contact: { tel: null, homepage: null }, products: [], site_sizes: [], reservation: { methods: [], url: null }, source: { modified_at: now, fetched_at: now } };
const licences = { fetched_at: now, sources: [{ kind: "AUTO", download_url: "https://file.localdata.go.kr/file/download/auto_campgrounds/info" }], records: [
  { id: "AUTO:4200000:1", kind: "AUTO", license_no: "1", name: "테스트 캠핑장", status: "CLOSED", road_address: "강원 홍천군 테스트로 1", lat: 37.7001, lng: 128.1001, extra: { 시설총규모: "1000" },
    match: { state: "MATCHED", gocamping_id: "900001", score: 0.95, evidence: { name: 1, distance_m: 12 }, flags: ["LICENSE_CLOSED_BUT_LISTED"] } },
  { id: "GENERAL:4200000:2", kind: "GENERAL", license_no: "2", name: "숨은 야영장", status: "OPERATING", road_address: "강원 인제군 숨은로 1", lat: 38.0, lng: 128.3, extra: {},
    match: { state: "NEW", flags: ["HIDDEN_CANDIDATE"] } },
] };

test("인허가 연계: 자동 연결·숨은 후보·멱등·사람 검토 보존", { skip: !adminUrl && "TEST_DATABASE_URL 없음" }, async () => {
  const { default: pg } = await import("pg");
  const dbName = `camp_lic_${process.pid}`;
  const admin = new pg.Client({ connectionString: adminUrl });
  await admin.connect();
  await admin.query(`DROP DATABASE IF EXISTS ${dbName}`);
  await admin.query(`CREATE DATABASE ${dbName}`);
  const url = new URL(adminUrl); url.pathname = `/${dbName}`;
  const pool = new pg.Pool({ connectionString: url.toString() });
  try {
    execFileSync("node", [fileURLToPath(new URL("../scripts/migrate-postgres.mjs", import.meta.url))], { env: { ...process.env, DATABASE_URL: url.toString() } });
    await importGoCampingSnapshot(pool, [camp]);
    const first = await importCampgroundLicences(pool, licences);
    assert.deepEqual({ matched: first.matched, hidden: first.hidden_candidates, closed: first.closed_but_listed }, { matched: 1, hidden: 1, closed: 1 });
    await importCampgroundLicences(pool, licences);
    const rows = (await pool.query(`SELECT external_key, state::text, matched_campground_id IS NOT NULL AS linked, evidence->>'status' AS status, evidence->'extra'->>'시설총규모' AS size
      FROM campground_candidate WHERE discovery_method = 'LOCALDATA_LICENCE' ORDER BY external_key`)).rows;
    assert.deepEqual(rows, [
      { external_key: "localdata-licence:AUTO:4200000:1", state: "MATCHED", linked: true, status: "CLOSED", size: "1000" },
      { external_key: "localdata-licence:GENERAL:4200000:2", state: "NEW", linked: false, status: "OPERATING", size: null },
    ]);
    await pool.query("UPDATE campground_candidate SET state = 'REJECTED', matched_campground_id = NULL, reviewed_at = now() WHERE external_key = 'localdata-licence:AUTO:4200000:1'");
    await importCampgroundLicences(pool, licences);
    assert.equal((await pool.query("SELECT state::text FROM campground_candidate WHERE external_key = 'localdata-licence:AUTO:4200000:1'")).rows[0].state, "REJECTED");
    assert.equal(Number((await pool.query("SELECT count(*) n FROM ingestion_run WHERE dataset_key = 'campground-licences'")).rows[0].n), 3);
  } finally {
    await pool.end();
    await admin.query(`DROP DATABASE IF EXISTS ${dbName}`);
    await admin.end();
  }
});
