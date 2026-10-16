// 사실 저장소(data/facts)를 PostgreSQL(db/010 fact_attribute·campground_fact)에 통째로 다시 적재한다.
// 한 트랜잭션에서 지우고 넣으므로 두 번 실행해도 같은 결과다. DATABASE_URL이 없으면 건너뛴다.
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import pg from "pg";
import { DICTIONARY, GRADE_RANK } from "../lib/fact-store.mjs";
import { factStoreExists, loadFactStore } from "../lib/fact-query.mjs";

const connectionString = process.env.DATABASE_URL;
if (!connectionString) { console.log("DATABASE_URL이 설정되지 않아 사실 저장소 적재를 건너뜁니다."); process.exit(0); }
const root = resolve(fileURLToPath(import.meta.url), "../../..");
const dir = join(root, "data/facts");
if (!factStoreExists(dir)) { console.log("data/facts가 없어 건너뜁니다(build-fact-store.mjs 먼저)."); process.exit(0); }

const { camps, facts } = loadFactStore(dir);
const pool = new pg.Pool({ connectionString, ssl: process.env.DATABASE_SSL === "true" ? { rejectUnauthorized: false } : undefined });
const client = await pool.connect();
try {
  const { rows: ext } = await client.query(
    `SELECT e.external_id, e.campground_id FROM external_identifier e JOIN data_source s ON s.id = e.source_id
      WHERE s.code = 'gocamping' AND e.entity_type = 'CAMPGROUND'`);
  const internal = new Map(ext.map((r) => [String(r.external_id), r.campground_id]));
  await client.query("BEGIN");
  await client.query("DELETE FROM campground_fact");
  await client.query("DELETE FROM fact_attribute");
  for (const a of DICTIONARY.attributes) {
    await client.query("INSERT INTO fact_attribute VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)",
      [a.code, a.group, a.label, a.type, a.unit ?? null, a.filter ?? null, a.pref ?? null, a.enum ? JSON.stringify(a.enum) : null, a.note ?? null]);
  }
  const cols = ["external_campground_id", "campground_id", "attr", "value_json", "value_num", "value_text", "grade", "grade_rank", "source_code", "source_url", "observed_at", "quote", "display_text", "mentions", "period", "label", "extra_num"];
  const rows = [];
  for (const [cid, byAttr] of facts) for (const list of byAttr.values()) for (const f of list) {
    const v = f.value;
    const at = f.at && !Number.isNaN(Date.parse(f.at)) ? f.at : null;
    rows.push([cid, internal.get(cid) ?? null, f.attr, JSON.stringify(v), typeof v === "number" ? v : typeof v === "boolean" ? (v ? 1 : 0) : null,
      typeof v === "string" ? v : null, f.grade, GRADE_RANK[f.grade], f.src, f.url ?? null, at, f.quote ?? null, f.text ?? null, f.n ?? null,
      f.period == null ? null : typeof f.period === "string" ? f.period : JSON.stringify(f.period), f.label ?? null, f.num ?? f.count ?? null]);
  }
  const BATCH = 1000;
  for (let i = 0; i < rows.length; i += BATCH) {
    const chunk = rows.slice(i, i + BATCH);
    const ph = chunk.map((_, r) => `(${cols.map((__, c) => `$${r * cols.length + c + 1}`).join(",")})`).join(",");
    await client.query(`INSERT INTO campground_fact (${cols.join(",")}) VALUES ${ph}`, chunk.flat());
  }
  await client.query("COMMIT");
  const linked = rows.filter((r) => r[1]).length;
  console.log(`사실 저장소 적재: 속성 ${DICTIONARY.attributes.length} · 사실 ${rows.length} · 캠핑장 ${camps.size} · 내부 id 연결 ${linked}`);
} catch (e) {
  await client.query("ROLLBACK").catch(() => {});
  throw e;
} finally {
  client.release();
  await pool.end();
}
