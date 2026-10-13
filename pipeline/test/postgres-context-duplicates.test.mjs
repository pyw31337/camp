// 실제 일일 파일에서 나온 중복 키(같은 쉼터 두 번, 같은 화장실 해시 두 번)로 컨텍스트 적재가 멈추지 않는지 확인한다.
// TEST_DATABASE_URL(관리 권한)이 있을 때만 새 DB를 만들어 실행한다.
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { importContextData } from "../lib/postgres-context.mjs";

const adminUrl = process.env.TEST_DATABASE_URL;

test("중복 키가 있는 원천 파일도 적재된다", { skip: !adminUrl && "TEST_DATABASE_URL 없음" }, async () => {
  const { default: pg } = await import("pg");
  const dbName = `camp_dup_${process.pid}`;
  const admin = new pg.Client({ connectionString: adminUrl });
  await admin.connect();
  await admin.query(`DROP DATABASE IF EXISTS ${dbName}`);
  await admin.query(`CREATE DATABASE ${dbName}`);
  const url = new URL(adminUrl); url.pathname = `/${dbName}`;
  const pool = new pg.Pool({ connectionString: url.toString() });
  try {
    execFileSync("node", [fileURLToPath(new URL("../scripts/migrate-postgres.mjs", import.meta.url))], { env: { ...process.env, DATABASE_URL: url.toString() } });
    const now = new Date().toISOString();
    const stop = { id: "drowsy-dup", kind: "DROWSY_SHELTER", name: "중복쉼터", lat: 36.5, lng: 127.5, facilities: {} };
    const toilet = { id: "same-hash", name: "같은 화장실", road_address: "강원 홍천군 테스트로 1", lat: 37.7, lng: 128.1, precision: "ROAD" };
    const { importGoCampingSnapshot } = await import("../lib/postgres-gocamping.mjs");
    await importGoCampingSnapshot(pool, [{ external_id: { provider: "gocamping", id: "900001" }, name: "테스트 캠핑장", legal_business_types: [], operator_type: "PRIVATE", management: null,
      status_text: "운영", address: { sido: "강원", sigungu: "홍천군", line1: "강원 홍천군 테스트로 1", line2: null }, location: { lat: 37.7, lng: 128.1 }, contact: { tel: null, homepage: null },
      products: [], site_sizes: [], reservation: { methods: [], url: null }, source: { modified_at: now, fetched_at: now } }]);
    const many = Array.from({ length: 100 }, (_, i) => ({ id: `t-${i}`, name: `화장실 ${i}`, road_address: `강원 홍천군 테스트로 ${i + 10}`, lat: 37.7 + i / 1e5, lng: 128.1, precision: "ROAD" }));
    const input = {
      campgroundToilets: { campgrounds: { 900001: { nearest: [{ toilet_id: "t-1", distance_m: 50 }, { toilet_id: "t-1", distance_m: 50 }, { toilet_id: "t-2", distance_m: 80 }] } } },
      toilets: { source: { url: "https://file.localdata.go.kr/file/public_restroom_info/info", fetched_at: now }, toilets: [toilet, { ...toilet, open_hours: "24시간" }, ...many] },
      restStops: { generated_at: now, stops: [stop, { ...stop, name: "중복쉼터(재등록)" }] },
    };
    await importContextData(pool, input);
    await importContextData(pool, input);
    const n = async (t) => Number((await pool.query(`SELECT count(*) n FROM ${t}`)).rows[0].n);
    assert.equal(await n("road_stop"), 1);
    assert.equal(await n("public_toilet"), 101);
    assert.deepEqual((await pool.query("SELECT rank, distance_m FROM campground_nearby_toilet ORDER BY rank")).rows, [{ rank: 1, distance_m: 50 }, { rank: 2, distance_m: 80 }], "같은 화장실이 두 번 나오면 한 번만, 순위 재계산");
    assert.equal((await pool.query("SELECT name FROM road_stop")).rows[0].name, "중복쉼터(재등록)", "마지막 행을 쓴다");
  } finally {
    await pool.end();
    await admin.query(`DROP DATABASE IF EXISTS ${dbName}`);
    await admin.end();
  }
});
