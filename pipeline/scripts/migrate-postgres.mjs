import { readdir, readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { createHash } from "node:crypto";
import pg from "pg";

const connectionString = process.env.DATABASE_URL;
if (!connectionString) throw new Error("DATABASE_URL이 필요합니다. 연결 문자열은 저장소에 넣지 말고 비밀 관리 환경에 설정하세요.");

const migrationDirectory = fileURLToPath(new URL("../../db/", import.meta.url));
const migrations = (await readdir(migrationDirectory))
  .filter((name) => /^\d{3}_[\w-]+\.sql$/.test(name))
  .sort();
const { Pool } = pg;
const pool = new Pool({ connectionString, ssl: process.env.DATABASE_SSL === "true" ? { rejectUnauthorized: false } : undefined });

const checksum = (sql) => createHash("sha256").update(sql).digest("hex");

// All repository migrations use an outer BEGIN/COMMIT. Remove that wrapper so
// schema changes and their schema_migration record commit atomically together.
// This prevents a crash after CREATE TYPE/TABLE but before the old runner's
// separate bookkeeping INSERT, which made a subsequent run fail permanently.
const unwrapMigrationTransaction = (sql, filename) => {
  const trimmed = sql.trim();
  // Keep accepting a migration header made of SQL line comments. Every
  // migration in this repository documents its rollback before BEGIN.
  const opening = trimmed.match(/^(?:(?:--[^\n]*(?:\n|$))|\s)*BEGIN\s*;\s*/i);
  if (!opening) {
    throw new Error(`${filename} must have one outer BEGIN; ... COMMIT; wrapper.`);
  }
  const afterBegin = trimmed.slice(opening[0].length);
  const closing = afterBegin.match(/\s*COMMIT\s*;\s*$/i);
  if (!closing) throw new Error(`${filename} must have one outer BEGIN; ... COMMIT; wrapper.`);
  return afterBegin.slice(0, afterBegin.length - closing[0].length);
};

let migrationClient;
try {
  // Advisory locks are session-scoped. Keep one checked-out connection for the
  // entire migration run; pool.query() could otherwise acquire and release the
  // lock on a different session from the DDL session.
  migrationClient = await pool.connect();
  await migrationClient.query(`CREATE TABLE IF NOT EXISTS schema_migration (
    filename text PRIMARY KEY,
    checksum text,
    applied_at timestamptz NOT NULL DEFAULT now()
  )`);
  await migrationClient.query("ALTER TABLE schema_migration ADD COLUMN IF NOT EXISTS checksum text");
  await migrationClient.query("SELECT pg_advisory_lock(hashtext('moyeora-camping-schema-migration-v1'))");
  for (const filename of migrations) {
    const sql = await readFile(`${migrationDirectory}${filename}`, "utf8");
    const fileChecksum = checksum(sql);
    const applied = await migrationClient.query("SELECT checksum FROM schema_migration WHERE filename = $1", [filename]);
    if (applied.rowCount) {
      const appliedChecksum = applied.rows[0].checksum;
      if (appliedChecksum && appliedChecksum !== fileChecksum) {
        throw new Error(`${filename} was already applied with a different checksum; create a new migration instead of editing it.`);
      }
      if (!appliedChecksum) await migrationClient.query("UPDATE schema_migration SET checksum = $2 WHERE filename = $1", [filename, fileChecksum]);
      continue;
    }
    try {
      await migrationClient.query("BEGIN");
      await migrationClient.query(unwrapMigrationTransaction(sql, filename));
      await migrationClient.query("INSERT INTO schema_migration (filename, checksum) VALUES ($1, $2)", [filename, fileChecksum]);
      await migrationClient.query("COMMIT");
      console.log(`applied ${filename}`);
    } catch (error) {
      await migrationClient.query("ROLLBACK");
      throw error;
    }
  }
  console.log(`PostgreSQL migration check complete (${migrations.length} files).`);
} finally {
  try { await migrationClient?.query("SELECT pg_advisory_unlock(hashtext('moyeora-camping-schema-migration-v1'))"); } catch { /* connection setup may have failed */ }
  migrationClient?.release();
  await pool.end();
}
