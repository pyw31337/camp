import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import pg from "pg";
import { importContextData } from "../lib/postgres-context.mjs";

const connectionString = process.env.DATABASE_URL;
if (!connectionString) throw new Error("DATABASE_URL이 필요합니다. 연결 문자열은 저장소에 넣지 말고 비밀 관리 환경에 설정하세요.");

const defaultOut = fileURLToPath(new URL("../out/", import.meta.url));
const outDirectory = process.argv[2] || defaultOut;
const readJson = async (name, fallback) => {
  const path = `${outDirectory.replace(/\/$/, "")}/${name}`;
  return existsSync(path) ? JSON.parse(await readFile(path, "utf8")) : fallback;
};
const readRegistry = async (name) => JSON.parse(await readFile(new URL(`../registry/${name}`, import.meta.url), "utf8"));

const input = {
  toilets: await readJson("toilets.json", {}),
  campgroundToilets: await readJson("campground-toilets.json", {}),
  restStops: await readJson("rest-stops.json", {}),
  publicFreeCandidates: await readJson("public-free-candidates.json", {}),
  bookingRegistry: await readRegistry("booking-rules.json"),
  freeRegistry: await readRegistry("free-sites.json"),
  calendar: await readJson("open-calendar.json", {}),
};

const { Pool } = pg;
const pool = new Pool({ connectionString, ssl: process.env.DATABASE_SSL === "true" ? { rejectUnauthorized: false } : undefined });
try {
  const counts = await importContextData(pool, input);
  console.log(JSON.stringify({ input_directory: outDirectory, ...counts }, null, 2));
} finally {
  await pool.end();
}
