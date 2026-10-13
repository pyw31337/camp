// 부가 데이터 PostgreSQL 적재: 화장실·주변 화장실 연계, 휴게소·시설·유가, 예약 규칙·일정, 무료 레지스트리.
// 사용: DATABASE_URL=... npm run db:import-enrichment
// IMPORT_UNVERIFIED_LICENSES=true 는 CI 임시 DB 검증 전용이다(운영 DB에는 이용허락이 확인된 원천만 쓴다).
import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import pg from "pg";
import { finishRun, importBooking, importFreeRegistry, importLocaldataCampgrounds, importRestStops, importToilets, loadSources, startRun } from "../lib/postgres-enrichment.mjs";

const connectionString = process.env.DATABASE_URL;
if (!connectionString) throw new Error("DATABASE_URL이 필요합니다. 먼저 npm run db:migrate를 실행하세요.");
const p = (rel) => fileURLToPath(new URL(rel, import.meta.url));
const readJson = async (rel) => (existsSync(p(rel)) ? JSON.parse(await readFile(p(rel), "utf8")) : null);
const allowUnverified = process.env.IMPORT_UNVERIFIED_LICENSES === "true";
if (allowUnverified && !/localhost|127\.0\.0\.1|@postgres[:/]/.test(connectionString)) throw new Error("IMPORT_UNVERIFIED_LICENSES는 로컬·CI 임시 DB에서만 쓸 수 있습니다.");

const pool = new pg.Pool({ connectionString, ssl: process.env.DATABASE_SSL === "true" ? { rejectUnauthorized: false } : undefined });
const summary = {};
async function step(name, input, fn) {
  if (!input) { summary[name] = "입력 파일 없음(건너뜀)"; return; }
  const client = await pool.connect();
  const run = await startRun(client, name, input);
  try {
    await client.query("BEGIN");
    const r = await fn(client);
    await client.query("COMMIT");
    const read = Object.entries(r).filter(([k]) => /_read$/.test(k)).reduce((s, [, v]) => s + v, 0);
    const written = Object.entries(r).filter(([k]) => /_written$/.test(k)).reduce((s, [, v]) => s + v, 0);
    await finishRun(client, run, "SUCCEEDED", read, written, r);
    summary[name] = r;
  } catch (e) {
    await client.query("ROLLBACK");
    await finishRun(client, run, "FAILED", 0, 0, { error: e.message });
    throw e;
  } finally {
    client.release();
  }
}

try {
  const source = await loadSources(pool, { allowUnverified });
  const toilets = await readJson("../out/toilets.json");
  const links = await readJson("../out/campground-toilets.json");
  await step("toilets", toilets, (db) => importToilets(db, toilets, links, source));
  const rest = await readJson("../out/rest-stops.json");
  await step("rest-stops", rest, (db) => importRestStops(db, rest, source));
  const registry = await readJson("../registry/booking-rules.json");
  const calendar = await readJson("../out/open-calendar.json");
  await step("booking", registry && calendar ? { registry, calendar } : null, (db) => importBooking(db, registry, calendar));
  const lic = await readJson("../out/localdata-campgrounds.json");
  await step("localdata-campgrounds", lic, (db) => importLocaldataCampgrounds(db, lic, source));
  const free = await readJson("../registry/free-sites.json");
  await step("free-registry", free, (db) => importFreeRegistry(db, free, source));
  console.log(JSON.stringify({ allow_unverified_licenses: allowUnverified, ...summary }, null, 2));
} finally {
  await pool.end();
}
