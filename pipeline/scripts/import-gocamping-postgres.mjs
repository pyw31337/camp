import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import pg from "pg";
import { importGoCampingSnapshot } from "../lib/postgres-gocamping.mjs";

const connectionString = process.env.DATABASE_URL;
if (!connectionString) throw new Error("DATABASE_URL이 필요합니다. 먼저 npm run db:migrate를 실행하고 비밀 관리 환경에서만 연결 문자열을 제공합니다.");

const defaultInput = fileURLToPath(new URL("../out/campgrounds.json", import.meta.url));
const input = process.argv[2] || defaultInput;
const payload = JSON.parse(await readFile(input, "utf8"));
if (!Array.isArray(payload.campgrounds)) throw new Error(`${input}에 campgrounds 배열이 없습니다.`);

const { Pool } = pg;
const pool = new Pool({ connectionString, ssl: process.env.DATABASE_SSL === "true" ? { rejectUnauthorized: false } : undefined });
try {
  const counts = await importGoCampingSnapshot(pool, payload.campgrounds);
  console.log(JSON.stringify({ input, fetched_at: payload.fetched_at ?? null, ...counts }, null, 2));
} finally {
  await pool.end();
}
