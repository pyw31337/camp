// LOCALDATA 야영장업 인허가 ↔ 고캠핑 연계를 PostgreSQL에 적재한다. 고캠핑 적재(db:import-gocamping) 뒤에 실행한다.
import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import pg from "pg";
import { importCampgroundLicences } from "../lib/postgres-licences.mjs";

const connectionString = process.env.DATABASE_URL;
if (!connectionString) throw new Error("DATABASE_URL이 필요합니다.");
const input = process.argv[2] || fileURLToPath(new URL("../out/localdata-campgrounds.json", import.meta.url));
if (!existsSync(input)) { console.log(`${input}이 없어 인허가 적재를 건너뜁니다.`); process.exit(0); }
const pool = new pg.Pool({ connectionString, ssl: process.env.DATABASE_SSL === "true" ? { rejectUnauthorized: false } : undefined });
try {
  console.log(JSON.stringify(await importCampgroundLicences(pool, JSON.parse(await readFile(input, "utf8"))), null, 2));
} finally {
  await pool.end();
}
