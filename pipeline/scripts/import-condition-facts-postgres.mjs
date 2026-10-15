// 파일럿 현장 조건 사실 및 최근 빈자리 관측을 PostgreSQL(db/009)에 적재한다.
import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import pg from "pg";
import { importConditionFactsAndObservations } from "../lib/postgres-condition-facts.mjs";

const connectionString = process.env.DATABASE_URL;
if (!connectionString) {
  console.log("DATABASE_URL이 설정되지 않아 PostgreSQL 조건 및 관측 적재를 건너뜁니다.");
  process.exit(0);
}

const p = (rel) => fileURLToPath(new URL(rel, import.meta.url));
const readJson = async (path) => JSON.parse(await readFile(path, "utf8"));

const factsPath = process.env.PILOT_FACTS_PATH ?? p("../registry/pilot-condition-facts.json");
const observationsPath = process.env.PILOT_OBSERVATIONS_PATH ?? p("../registry/pilot-observations.json");

if (!existsSync(factsPath)) {
  console.log(`${factsPath}가 없어 적재를 건너뜁니다.`);
  process.exit(0);
}

const [pilotFacts, observations] = await Promise.all([
  readJson(factsPath),
  existsSync(observationsPath) ? readJson(observationsPath) : { observations: [] },
]);

const pool = new pg.Pool({
  connectionString,
  ssl: process.env.DATABASE_SSL === "true" ? { rejectUnauthorized: false } : undefined,
});

try {
  const result = await importConditionFactsAndObservations(pool, {
    pilotFacts,
    observations,
    fetchedAt: new Date().toISOString(),
  });
  console.log("PostgreSQL 조건 사실 및 관측 적재 완료:", JSON.stringify(result, null, 2));
} finally {
  await pool.end();
}
