import { readdir, readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import pg from "pg";

const connectionString = process.env.DATABASE_URL;
if (!connectionString) throw new Error("DATABASE_URL이 필요합니다. 연결 문자열은 저장소에 넣지 말고 비밀 관리 환경에 설정하세요.");

const migrationDirectory = fileURLToPath(new URL("../../db/", import.meta.url));
const migrations = (await readdir(migrationDirectory))
  .filter((name) => /^\d{3}_[\w-]+\.sql$/.test(name))
  .sort();
const { Pool } = pg;
const pool = new Pool({ connectionString, ssl: process.env.DATABASE_SSL === "true" ? { rejectUnauthorized: false } : undefined });

try {
  await pool.query(`CREATE TABLE IF NOT EXISTS schema_migration (
    filename text PRIMARY KEY,
    applied_at timestamptz NOT NULL DEFAULT now()
  )`);
  for (const filename of migrations) {
    const applied = await pool.query("SELECT 1 FROM schema_migration WHERE filename = $1", [filename]);
    if (applied.rowCount) continue;
    const sql = await readFile(`${migrationDirectory}${filename}`, "utf8");
    await pool.query(sql);
    await pool.query("INSERT INTO schema_migration (filename) VALUES ($1)", [filename]);
    console.log(`applied ${filename}`);
  }
  console.log(`PostgreSQL migration check complete (${migrations.length} files).`);
} finally {
  await pool.end();
}
