// 적재 결과를 원천 JSON과 대조하고 품질 규칙을 검사한다. 하나라도 어긋나면 종료 코드 1.
// 사용: DATABASE_URL=... node scripts/verify-db-load.mjs   (CI 임시 DB에서 import 두 번 뒤 실행)
import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import pg from "pg";

const p = (rel) => fileURLToPath(new URL(rel, import.meta.url));
const readJson = async (rel) => (existsSync(p(rel)) ? JSON.parse(await readFile(p(rel), "utf8")) : null);
const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
const one = async (sql, params = []) => Number((await pool.query(sql, params)).rows[0].n);
const results = [];
const check = (name, actual, expected) => results.push({ name, actual, expected, ok: actual === expected });

try {
  // 1) 건수 대조
  const camps = await readJson("../out/campgrounds.json");
  if (camps) {
    check("고캠핑 시설 = campgrounds.json", await one(`SELECT count(*) n FROM external_identifier e JOIN data_source s ON s.id = e.source_id WHERE s.code = 'gocamping' AND e.entity_type = 'CAMPGROUND'`), camps.campgrounds.length);
  }
  const toilets = await readJson("../out/toilets.json");
  if (toilets) {
    const valid = new Map();
    for (const t of toilets.toilets) {
      const osm = t.source === "osm";
      if (!t.name || (osm ? !Number.isFinite(t.lat) : !(t.road_address || t.jibun_address))) continue;
      valid.set(String(t.id), true);
    }
    check("공중화장실 = toilets.json(유효·중복 제거)", await one("SELECT count(*) n FROM public_toilet"), valid.size);
    const located = toilets.toilets.filter((t) => Number.isFinite(t.lat) && t.lat >= 32.9 && t.lat <= 38.7 && t.lng >= 124.5 && t.lng <= 132);
    check("좌표 있는 화장실 = JSON", await one("SELECT count(*) n FROM public_toilet WHERE latitude IS NOT NULL"), new Set(located.map((t) => String(t.id))).size);
  }
  const rest = await readJson("../out/rest-stops.json");
  if (rest) check("휴게소·졸음쉼터 = rest-stops.json", await one("SELECT count(*) n FROM rest_stop"), new Set(rest.stops.map((s) => s.id)).size);
  const cal = await readJson("../out/open-calendar.json");
  if (cal) {
    const rules = new Set((await readJson("../registry/booking-rules.json")).rules.map((r) => r.id));
    check("예약 일정 = open-calendar.json", await one("SELECT count(*) n FROM booking_event"), new Set(cal.events.filter((e) => rules.has(e.rule_id)).map((e) => e.id)).size);
  }

  // 2) 품질 규칙(모두 0이어야 한다)
  const zero = async (name, sql) => check(name, await one(sql), 0);
  await zero("현재 사실 뷰에 만료된 값", "SELECT count(*) n FROM campground_fact_current WHERE expires_at <= now()");
  await zero("현재 사실 뷰에 E등급", "SELECT count(*) n FROM campground_fact_current WHERE source_tier = 'E'");
  await zero("한국 밖 화장실 좌표", "SELECT count(*) n FROM public_toilet WHERE latitude IS NOT NULL AND NOT (latitude BETWEEN 32.9 AND 38.7 AND longitude BETWEEN 124.5 AND 132)");
  await zero("2km 넘는 주변 화장실 연계", "SELECT count(*) n FROM campground_nearby_toilet WHERE distance_m > 2000");
  await zero("출처 URL 없는 화장실", "SELECT count(*) n FROM public_toilet WHERE source_url IS NULL OR source_url !~ '^https?://'");
  await zero("만료 시각 없는 화장실", "SELECT count(*) n FROM public_toilet WHERE expires_at IS NULL");
  await zero("1일 넘는 유가 만료", "SELECT count(*) n FROM fuel_price_observation WHERE expires_at > observed_at + interval '1 day'");
  await zero("현재 규칙이 둘 이상인 규칙 키", "SELECT count(*) n FROM (SELECT rule_key FROM booking_rule WHERE is_current GROUP BY rule_key HAVING count(*) > 1) x");
  await zero("규칙 없는 일정", "SELECT count(*) n FROM booking_event e LEFT JOIN booking_rule r ON r.id = e.booking_rule_id WHERE r.id IS NULL");
  await zero("실패한 적재 실행(이번 검증)", "SELECT count(*) n FROM ingest_run WHERE status = 'FAILED'");

  // 3) 연계 현황(정보용)
  const info = {
    campgrounds_with_nearby_toilet: await one("SELECT count(DISTINCT campground_id) n FROM campground_nearby_toilet"),
    campgrounds_with_toilet_300m: await one("SELECT count(DISTINCT campground_id) n FROM campground_nearby_toilet WHERE distance_m <= 300"),
    rest_stops_with_fuel_price: await one("SELECT count(DISTINCT rest_stop_id) n FROM fuel_price_observation WHERE expires_at > now()"),
    free_registry_entries: await one("SELECT count(*) n FROM entity_link WHERE source_code = 'moyeora-free-registry'"),
    ingest_runs: await one("SELECT count(*) n FROM ingest_run"),
  };
  for (const r of results) console.log(`${r.ok ? "✓" : "✗"} ${r.name}: ${r.actual}${r.ok ? "" : ` (기대 ${r.expected})`}`);
  console.log(`연계 현황 ${JSON.stringify(info)}`);
  const failed = results.filter((r) => !r.ok);
  if (failed.length) { console.log(`::error title=DB 적재 검증 실패::${failed.map((f) => f.name).join(", ")}`); process.exitCode = 1; }
} finally {
  await pool.end();
}
