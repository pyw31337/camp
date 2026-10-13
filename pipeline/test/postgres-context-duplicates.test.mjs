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
    const input = {
      toilets: { source: { url: "https://file.localdata.go.kr/file/public_restroom_info/info", fetched_at: now }, toilets: [toilet, { ...toilet, open_hours: "24시간" }] },
      restStops: { generated_at: now, stops: [stop, { ...stop, name: "중복쉼터(재등록)" }] },
    };
    await importContextData(pool, input);
    await importContextData(pool, input);
    const n = async (t) => Number((await pool.query(`SELECT count(*) n FROM ${t}`)).rows[0].n);
    assert.equal(await n("road_stop"), 1);
    assert.equal(await n("public_toilet"), 1);
    assert.equal((await pool.query("SELECT name FROM road_stop")).rows[0].name, "중복쉼터(재등록)", "마지막 행을 쓴다");
  } finally {
    await pool.end();
    await admin.query(`DROP DATABASE IF EXISTS ${dbName}`);
    await admin.end();
  }
});
