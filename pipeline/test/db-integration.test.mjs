// 실제 PostgreSQL 통합 테스트. TEST_DATABASE_URL(관리 권한 연결)이 있을 때만 실행한다.
// 매번 새 DB를 만들고 db/*.sql 전체 적용 → 고캠핑(Codex 적재기) → 부가 데이터 적재 → 두 번 적재해도 같은지 → 제약·뷰 동작을 확인한다.
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { importGoCampingSnapshot } from "../lib/postgres-gocamping.mjs";
import { importBooking, importFreeRegistry, importLocaldataCampgrounds, importRestStops, importToilets, loadSources } from "../lib/postgres-enrichment.mjs";

const adminUrl = process.env.TEST_DATABASE_URL;
const now = new Date().toISOString();
const camp = (id, name, lat, lng) => ({
  external_id: { provider: "gocamping", id }, name, legal_business_types: ["일반야영장"], operator_type: "LOCAL_GOVERNMENT",
  management: "테스트군", status_text: "운영", address: { sido: "강원특별자치도", sigungu: "홍천군", line1: `강원 홍천군 테스트로 ${id}`, line2: null },
  location: { lat, lng }, contact: { tel: null, homepage: null }, products: [{ kind: "PITCH", site_count: 10, confirmed: true }], site_sizes: [],
  reservation: { methods: [], url: null }, source: { modified_at: now, fetched_at: now },
});
const toiletsJson = {
  source: { url: "https://file.localdata.go.kr/file/public_restroom_info/info", fetched_at: now },
  toilets: [
    { id: "aaa", name: "계곡 입구 화장실", road_address: "강원 홍천군 테스트로 1", lat: 37.7001, lng: 128.1001, precision: "ROAD", open_24h: true, disabled_stalls: 2, source: "mois", data_date: "2026-10-01" },
    { id: "bbb", name: "마을회관 화장실", jibun_address: "강원 홍천군 테스트리 2", lat: null, lng: null, source: "mois" },
    { id: "osm-node-1", name: "공원 화장실", lat: 37.7101, lng: 128.1101, precision: "OSM", source: "osm" },
    { id: "ccc", name: "주소 없음", source: "mois" },
  ],
};
const linksJson = { generated_at: now, campgrounds: { 900001: { nearest: [{ toilet_id: "aaa", distance_m: 120 }, { toilet_id: "osm-node-1", distance_m: 1500 }] } } };
const restJson = {
  generated_at: now,
  stops: [
    { id: "ex-A00001", kind: "SERVICE_AREA", name: "테스트(부산)휴게소", lat: 37.45, lng: 127.04, road: "경부선", direction: "부산",
      facilities: { toilet: { available: true, fee: "FREE" }, shower: { available: true, fee: null }, fuel: { available: true, fee: "PAID" } },
      fuel: { station: "테스트(부산)주유소", brand: "알뜰주유소", prices_krw_per_l: { gasoline: 1814, diesel: 1853, lpg: null }, checked_at: now, source_url: "https://data.ex.co.kr/openapi/business/curStateStation" },
      source: { url: "https://data.ex.co.kr/openapi/locationinfo/locationinfoRest", tier: "A" } },
    { id: "drowsy-abc", kind: "DROWSY_SHELTER", name: "테스트졸음쉼터", lat: 36.5, lng: 127.5, facilities: { toilet: { available: true, fee: "FREE" } }, source: { tier: "A" } },
    { id: "osm-way-9", kind: "REST_AREA", name: "쉼터", lat: 35.5, lng: 128.5, facilities: {}, source: { tier: "B" } },
    { id: "drowsy-abc", kind: "DROWSY_SHELTER", name: "테스트졸음쉼터(중복 등록)", lat: 36.5, lng: 127.5, facilities: { toilet: { available: true, fee: "FREE" } }, source: { tier: "A" } },
  ],
};
const registry = {
  version: 1,
  rules: [{ id: "rule-a", provider_id: "knps", label: "추첨", schedule: { kind: "MONTHLY_LOTTERY" }, source: { url: "https://reservation.knps.or.kr/", tier: "B", checked_at: "2026-10-12" } }],
};
const future = new Date(Date.now() + 5 * 864e5).toISOString();
const calendar = { generated_at: now, range: { from: now }, events: [
  { id: "rule-a:LOTTERY_APPLY_START:x", rule_id: "rule-a", type: "LOTTERY_APPLY_START", at: future, time_known: false, label: "접수 시작", needs_verification: true, source: { url: "https://reservation.knps.or.kr/", tier: "B" } },
] };
const licenses = { fetched_at: now, records: [
  { id: "AUTO:4200000:1", kind: "AUTO", license_no: "1", name: "테스트 캠핑장", status: "OPERATING", road_address: "강원 홍천군 테스트로 900001", lat: 37.7001, lng: 128.1001, extra: { 시설총규모: "1000" },
    match: { state: "MATCHED", gocamping_id: "900001", score: 0.95, evidence: { name: 1, distance_m: 12 }, flags: [] } },
  { id: "GENERAL:4200000:2", kind: "GENERAL", license_no: "2", name: "숨은 야영장", status: "OPERATING", road_address: "강원 인제군 숨은로 1", lat: 38.0, lng: 128.3, extra: {},
    match: { state: "NEW", flags: ["HIDDEN_CANDIDATE"] } },
] };
const freeRegistry = {
  sites: [{ id: "free-1", name: "무료 노지", address: "강원 홍천군 어딘가", status: "VERIFIED", fee: { free: true }, cooking: { allowed: false }, toilet: { onsite: null },
    evidence: [{ field: "fee", url: "https://www.example.go.kr/notice/1", tier: "A", checked_at: "2026-10-12" }, { field: "cooking", url: "https://cafe.example.com/1", tier: "E", checked_at: "2026-10-12" }] }],
  candidates: [{ name: "후보 노지", region: "강원", claim: "무료", found_in: "https://www.youtube.com/watch?v=x", tier: "E" }],
};

test("PostgreSQL 전체 마이그레이션·적재·멱등·품질 규칙", { skip: !adminUrl && "TEST_DATABASE_URL 없음" }, async () => {
  const { default: pg } = await import("pg"); // pg가 없는 환경(npm ci 생략)에서도 이 파일을 불러올 수 있게
  const dbName = `camp_it_${process.pid}`;
  const admin = new pg.Client({ connectionString: adminUrl });
  await admin.connect();
  await admin.query(`DROP DATABASE IF EXISTS ${dbName}`);
  await admin.query(`CREATE DATABASE ${dbName}`);
  const url = new URL(adminUrl); url.pathname = `/${dbName}`;
  const pool = new pg.Pool({ connectionString: url.toString() });
  try {
    const migrate = () => execFileSync("node", [fileURLToPath(new URL("../scripts/migrate-postgres.mjs", import.meta.url))], { env: { ...process.env, DATABASE_URL: url.toString() } }).toString();
    assert.match(migrate(), /migration check complete/);
    assert.doesNotMatch(migrate(), /applied/, "두 번째 마이그레이션은 아무것도 적용하지 않아야 한다");

    const load = async () => {
      await importGoCampingSnapshot(pool, [camp("900001", "테스트 캠핑장", 37.7, 128.1), camp("900002", "둘째 캠핑장", 36.1, 127.9)]);
      const source = await loadSources(pool, { allowUnverified: true });
      return {
        toilets: await importToilets(pool, toiletsJson, linksJson, source),
        rest: await importRestStops(pool, restJson, source),
        booking: await importBooking(pool, registry, calendar),
        free: await importFreeRegistry(pool, freeRegistry, source),
        lic: await importLocaldataCampgrounds(pool, licenses, source),
      };
    };
    const first = await load();
    const count = async (t) => Number((await pool.query(`SELECT count(*) n FROM ${t}`)).rows[0].n);
    const snapshot = async () => Object.fromEntries(await Promise.all(["campground", "public_toilet", "campground_nearby_toilet", "rest_stop", "rest_stop_facility",
      "fuel_price_observation", "booking_rule", "booking_event", "entity_link", "campground_fact"].map(async (t) => [t, await count(t)])));
    const a = await snapshot();
    await load();
    assert.deepEqual(await snapshot(), a, "두 번 적재해도 건수가 같아야 한다(중복 0)");

    assert.equal(first.toilets.skipped.invalid, 1, "주소도 좌표도 없는 행안부 행은 버린다");
    assert.equal(a.public_toilet, 3);
    assert.equal(a.campground_nearby_toilet, 2);
    assert.equal(a.rest_stop, 3);
    assert.equal(a.fuel_price_observation, 1);
    assert.equal(a.booking_event, 1);
    assert.equal(a.campground, 3, "고캠핑 2 + 검수 완료 무료 사이트 1");
    assert.equal(a.campground_fact, 1, "E등급 근거(취사)는 사실로 올리지 않는다");
    const links = (await pool.query("SELECT external_id, state, campground_id IS NOT NULL AS linked FROM entity_link WHERE source_code LIKE 'localdata-%' ORDER BY external_id")).rows;
    assert.deepEqual(links, [{ external_id: "AUTO:4200000:1", state: "MATCHED", linked: true }, { external_id: "GENERAL:4200000:2", state: "NEW", linked: false }]);
    // 사람이 검수한 연결은 다음 자동 적재가 덮어쓰지 않는다
    await pool.query("UPDATE entity_link SET state = 'REJECTED', campground_id = NULL, reviewed_at = now() WHERE external_id = 'AUTO:4200000:1'");
    await importLocaldataCampgrounds(pool, licenses, await loadSources(pool, { allowUnverified: true }));
    assert.equal((await pool.query("SELECT state FROM entity_link WHERE external_id = 'AUTO:4200000:1'")).rows[0].state, "REJECTED");

    const fact = (await pool.query("SELECT fact_key, state, display_status FROM campground_fact_current")).rows;
    assert.deepEqual(fact, [{ fact_key: "IS_FREE", state: "YES", display_status: "CONFIRMED" }]);
    // 만료되면 현재 뷰에서 빠진다
    await pool.query("UPDATE campground_fact SET observed_at = now() - interval '100 days', expires_at = now() - interval '1 day'");
    assert.equal(await count("campground_fact_current"), 0);
    // 출처 없는 사실·만료 없는 사실은 DB가 거부한다
    const cg = (await pool.query("SELECT id FROM campground LIMIT 1")).rows[0].id;
    const ds = (await pool.query("SELECT id FROM data_source WHERE code = 'osm'")).rows[0].id;
    await assert.rejects(pool.query("INSERT INTO campground_fact (campground_id, fact_key, state, data_source_id, source_url, source_tier, observed_at, expires_at) VALUES ($1,'IS_FREE','YES',$2,'',  'A', now(), now() + interval '1 day')", [cg, ds]));
    await assert.rejects(pool.query("INSERT INTO campground_fact (campground_id, fact_key, state, data_source_id, source_url, source_tier, observed_at, expires_at) VALUES ($1,'COOKING_ALLOWED','CONDITIONAL',$2,'https://x.go.kr','A', now(), now() + interval '1 day')", [cg, ds]), "조건부는 조건 문구가 필요하다");
    // 운영 모드: 이용허락 미확인 원천은 쓰지 않는다
    const strict = await loadSources(pool);
    assert.equal(strict("mois-localdata-restroom").allows, false);
    assert.equal(strict("osm").allows, true);
  } finally {
    await pool.end();
    await admin.query(`DROP DATABASE IF EXISTS ${dbName}`);
    await admin.end();
  }
});
