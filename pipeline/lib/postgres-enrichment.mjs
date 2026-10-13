// 부가 데이터(화장실·휴게소·유가·예약 규칙/일정·무료 레지스트리)를 PostgreSQL에 멱등 적재한다.
// 고캠핑 시설 적재(postgres-gocamping.mjs, Codex 담당)가 먼저 끝나 있어야 캠핑장 연계가 채워진다.
// 원칙(AGENTS.md 규칙 3): 사실·가격은 출처 URL·관측시각·만료시각과 함께만 쓴다. 근거 없는 값은 만들지 않는다.

import { createHash } from "node:crypto";

const DAY = 864e5;
const sha = (v) => createHash("sha256").update(typeof v === "string" ? v : JSON.stringify(v)).digest("hex");
const iso = (ms) => new Date(ms).toISOString();
const plusDays = (at, days) => iso(Date.parse(at) + days * DAY);
const dateOrNull = (v) => {
  const m = String(v ?? "").match(/(\d{4})[-.]?(\d{2})[-.]?(\d{2})/);
  return m ? `${m[1]}-${m[2]}-${m[3]}` : null;
};
const intOrNull = (v) => (Number.isFinite(Number(v)) && v !== null && v !== "" ? Math.round(Number(v)) : null);

/** 원천 코드 → {id, allows}. 이용허락이 확인되지 않은 원천은 운영 DB에 쓰지 않는다(검증용 임시 DB만 예외). */
export async function loadSources(db, { allowUnverified = false } = {}) {
  const { rows } = await db.query("SELECT id, code, allows_persistent_storage FROM data_source");
  const map = new Map(rows.map((r) => [r.code, { id: r.id, allows: r.allows_persistent_storage || allowUnverified }]));
  return (code) => {
    const s = map.get(code);
    if (!s) throw new Error(`data_source '${code}'가 없습니다. npm run db:migrate를 먼저 실행하세요.`);
    return s;
  };
}

/** 여러 행을 한 번에 넣는다(파라미터 6만 개 한도 안으로 자른다). */
async function insertMany(db, sqlHead, columns, rows, sqlTail = "", chunk = 0) {
  if (!rows.length) return 0;
  const per = chunk || Math.max(1, Math.floor(60000 / columns.length));
  let written = 0;
  for (let i = 0; i < rows.length; i += per) {
    const part = rows.slice(i, i + per);
    const params = [];
    const values = part.map((row) => `(${columns.map((c) => { params.push(row[c] ?? null); return `$${params.length}`; }).join(", ")})`);
    const r = await db.query(`${sqlHead} (${columns.join(", ")}) VALUES ${values.join(", ")} ${sqlTail}`, params);
    written += r.rowCount;
  }
  return written;
}

export async function startRun(db, sourceCode, input) {
  const { rows } = await db.query(
    `INSERT INTO ingest_run (source_code, started_at, status, input_hash, ci_run_url)
     VALUES ($1, now(), 'RUNNING', $2, $3) RETURNING id`,
    [sourceCode, input ? sha(input) : null, process.env.GITHUB_RUN_ID ? `${process.env.GITHUB_SERVER_URL}/${process.env.GITHUB_REPOSITORY}/actions/runs/${process.env.GITHUB_RUN_ID}` : null],
  );
  return rows[0].id;
}
export async function finishRun(db, id, status, rowsRead, rowsWritten, notes = {}) {
  await db.query(
    "UPDATE ingest_run SET finished_at = now(), status = $2, rows_read = $3, rows_written = $4, notes = $5 WHERE id = $1",
    [id, status, rowsRead, rowsWritten, JSON.stringify(notes)],
  );
}

/** 고캠핑 contentId → campground.id */
export async function gocampingIndex(db) {
  const { rows } = await db.query(
    `SELECT e.external_id, e.campground_id FROM external_identifier e
       JOIN data_source s ON s.id = e.source_id
      WHERE s.code = 'gocamping' AND e.entity_type = 'CAMPGROUND'`,
  );
  return new Map(rows.map((r) => [String(r.external_id), r.campground_id]));
}

// ── 화장실 ────────────────────────────────────────────────────────────────

const GEOCODE = { ROAD: ["KAKAO_ADDRESS", "ROAD"], PARCEL: ["KAKAO_ADDRESS", "PARCEL"], EPSG5174: ["EPSG5174", "SOURCE"], SOURCE: ["SOURCE", "SOURCE"], OSM: ["OSM", "SOURCE"] };

export function mapToiletRow(t, { fetchedAt, sourceUrl, sourceId }) {
  const osm = t.source === "osm";
  const [method, precision] = GEOCODE[t.precision] ?? [null, null];
  const located = Number.isFinite(t.lat) && Number.isFinite(t.lng);
  return {
    data_source_id: sourceId,
    source_key: String(t.id),
    name: t.name,
    kind: t.kind ?? null,
    owner_kind: t.owner ?? null,
    road_address: t.road_address || null,
    parcel_address: t.jibun_address || null,
    open_hours: t.open_hours ?? null,
    open_24h: t.open_24h ?? null,
    disabled_stalls: intOrNull(t.disabled_stalls),
    child_stalls: intOrNull(t.child_stalls),
    has_emergency_bell: t.emergency_bell ?? null,
    has_cctv: t.cctv ?? null,
    has_diaper_table: t.diaper_table ?? null,
    manager_name: t.manager ?? null,
    manager_phone: t.tel ?? null,
    latitude: located ? t.lat : null,
    longitude: located ? t.lng : null,
    geocode_method: located ? method : null,
    geocode_precision: located ? precision : null,
    source_data_date: dateOrNull(t.data_date),
    observed_at: fetchedAt,
    source_code: osm ? "osm" : "mois-localdata",
    source_tier: osm ? "B" : "A",
    source_url: osm ? `https://www.openstreetmap.org/${String(t.id).replace(/^osm-/, "").replace("-", "/")}` : sourceUrl,
    expires_at: plusDays(fetchedAt, osm ? 14 : 8),
    last_seen_at: fetchedAt,
  };
}

const TOILET_COLS = ["data_source_id", "source_key", "name", "kind", "owner_kind", "road_address", "parcel_address", "open_hours", "open_24h",
  "disabled_stalls", "child_stalls", "has_emergency_bell", "has_cctv", "has_diaper_table", "manager_name", "manager_phone", "latitude", "longitude",
  "geocode_method", "geocode_precision", "source_data_date", "observed_at", "source_code", "source_tier", "source_url", "expires_at", "last_seen_at"];

/**
 * @param {{source:{url:string,fetched_at:string}, toilets:object[]}} toiletsJson out/toilets.json
 * @param {{campgrounds:Record<string,{nearest:{toilet_id:string,distance_m:number}[]}>}|null} linksJson out/campground-toilets.json
 */
export async function importToilets(db, toiletsJson, linksJson, source) {
  const fetchedAt = toiletsJson.source?.fetched_at ?? new Date().toISOString();
  const mois = source("mois-localdata-restroom"), osm = source("osm");
  const rows = [];
  const skipped = { license: 0, invalid: 0 };
  for (const t of toiletsJson.toilets ?? []) {
    const s = t.source === "osm" ? osm : mois;
    if (!s.allows) { skipped.license++; continue; }
    const row = mapToiletRow(t, { fetchedAt, sourceUrl: toiletsJson.source?.url, sourceId: s.id });
    if (!row.name || (row.source_code !== "osm" && !row.road_address && !row.parcel_address) || (row.source_code === "osm" && row.latitude == null)) { skipped.invalid++; continue; }
    if (row.latitude != null && !(row.latitude >= 32.9 && row.latitude <= 38.7 && row.longitude >= 124.5 && row.longitude <= 132)) { row.latitude = null; row.longitude = null; row.geocode_method = null; row.geocode_precision = null; }
    rows.push(row);
  }
  // 같은 이름+주소 해시가 파일 안에서 겹치면 마지막 행을 쓴다(원천 중복 등록).
  const unique = [...new Map(rows.map((r) => [r.source_key, r])).values()];
  const update = TOILET_COLS.filter((c) => c !== "source_key").map((c) => `${c} = EXCLUDED.${c}`).join(", ");
  const written = await insertMany(db, "INSERT INTO public_toilet", TOILET_COLS, unique, `ON CONFLICT (source_key) DO UPDATE SET ${update}, updated_at = now()`);

  let links = 0, unmatchedCamps = 0;
  if (linksJson?.campgrounds) {
    const camp = await gocampingIndex(db);
    const keys = unique.map((r) => r.source_key);
    const { rows: ids } = await db.query("SELECT id, source_key FROM public_toilet WHERE source_key = ANY($1)", [keys]);
    const toiletId = new Map(ids.map((r) => [r.source_key, r.id]));
    const linkRows = [];
    for (const [gocampingId, v] of Object.entries(linksJson.campgrounds)) {
      const campgroundId = camp.get(String(gocampingId));
      if (!campgroundId) { unmatchedCamps++; continue; }
      (v.nearest ?? []).forEach((n, i) => {
        const tid = toiletId.get(String(n.toilet_id));
        if (tid) linkRows.push({ campground_id: campgroundId, public_toilet_id: tid, distance_m: Math.round(n.distance_m), rank: i + 1, computed_at: linksJson.generated_at ?? fetchedAt });
      });
    }
    // 거리 관계는 계산 결과라 매번 통째로 바꾼다.
    await db.query("DELETE FROM campground_nearby_toilet");
    links = await insertMany(db, "INSERT INTO campground_nearby_toilet", ["campground_id", "public_toilet_id", "distance_m", "rank", "computed_at"], linkRows, "ON CONFLICT DO NOTHING");
  }
  return { toilets_read: (toiletsJson.toilets ?? []).length, toilets_written: written, toilets_unique: unique.length, skipped, links, unmatched_campgrounds: unmatchedCamps };
}

// ── 휴게소·졸음쉼터·유가 ───────────────────────────────────────────────────

function restStopSource(stop) {
  if (stop.id.startsWith("ex-")) return { code: "ex-openapi", days: 7, url: stop.source?.url ?? "https://data.ex.co.kr/openapi/" };
  if (stop.id.startsWith("drowsy-")) return { code: "drowsy-shelter-standard", days: 7, url: "https://www.data.go.kr/data/15028203/standard.do" };
  const m = stop.id.match(/^osm-(node|way|relation)-(\d+)$/);
  return { code: "osm", days: 14, url: m ? `https://www.openstreetmap.org/${m[1]}/${m[2]}` : "https://www.openstreetmap.org/" };
}

/** @param {{generated_at:string, stops:object[]}} json out/rest-stops.json */
export async function importRestStops(db, json, source) {
  const at = json.generated_at ?? new Date().toISOString();
  const stops = [], facilities = [], prices = [];
  const skipped = { license: 0 };
  for (const s of json.stops ?? []) {
    const meta = restStopSource(s);
    const src = source(meta.code);
    if (!src.allows) { skipped.license++; continue; }
    stops.push({
      data_source_id: src.id, external_id: s.id, kind: s.kind, name: s.name, road_name: s.road ?? null, direction: s.direction ?? null,
      address: s.address ?? null, phone: s.tel ?? null, brands: s.brands ?? null, truck_rest: s.truck_rest ?? null, maintenance: s.maintenance ?? null,
      parking_spaces: intOrNull(s.parking_spaces), latitude: s.lat, longitude: s.lng, source_url: meta.url,
      source_tier: s.source?.tier ?? (meta.code === "osm" ? "B" : "A"), attribution: s.source?.attribution ?? null,
      observed_at: at, expires_at: plusDays(at, meta.days), last_seen_at: at,
    });
    for (const [facility, f] of Object.entries(s.facilities ?? {})) {
      const fee = f?.fee === "FREE" ? "FREE" : f?.fee === "PAID" ? "PAID" : f?.available ? "VARIES" : "UNKNOWN";
      facilities.push({ external_id: s.id, data_source_id: src.id, facility, available: f?.available ?? null, fee, fee_basis: "DEFAULT_RULE", observed_at: at, expires_at: plusDays(at, meta.days) });
    }
    if (s.fuel?.prices_krw_per_l) {
      const p = s.fuel.prices_krw_per_l;
      const obs = s.fuel.checked_at && !Number.isNaN(Date.parse(s.fuel.checked_at)) ? s.fuel.checked_at : at;
      prices.push({ external_id: s.id, data_source_id: src.id, station_name: s.fuel.station, brand: s.fuel.brand ?? null, gasoline_krw: p.gasoline, diesel_krw: p.diesel, lpg_krw: p.lpg, source_url: s.fuel.source_url, observed_at: obs, expires_at: plusDays(obs, 1) });
    }
  }
  const cols = ["data_source_id", "external_id", "kind", "name", "road_name", "direction", "address", "phone", "brands", "truck_rest", "maintenance",
    "parking_spaces", "latitude", "longitude", "source_url", "source_tier", "attribution", "observed_at", "expires_at", "last_seen_at"];
  const upd = cols.filter((c) => !["data_source_id", "external_id"].includes(c)).map((c) => `${c} = EXCLUDED.${c}`).join(", ");
  const written = await insertMany(db, "INSERT INTO rest_stop", cols, stops, `ON CONFLICT (data_source_id, external_id) DO UPDATE SET ${upd}, updated_at = now()`);

  const { rows: ids } = await db.query("SELECT id, data_source_id, external_id FROM rest_stop");
  const idOf = new Map(ids.map((r) => [`${r.data_source_id}|${r.external_id}`, r.id]));
  const withId = (rows) => rows.map((r) => ({ ...r, rest_stop_id: idOf.get(`${r.data_source_id}|${r.external_id}`) })).filter((r) => r.rest_stop_id);
  const facRows = withId(facilities);
  const facWritten = await insertMany(db, "INSERT INTO rest_stop_facility", ["rest_stop_id", "facility", "available", "fee", "fee_basis", "observed_at", "expires_at"], facRows,
    "ON CONFLICT (rest_stop_id, facility) DO UPDATE SET available = EXCLUDED.available, fee = EXCLUDED.fee, fee_basis = EXCLUDED.fee_basis, observed_at = EXCLUDED.observed_at, expires_at = EXCLUDED.expires_at");
  const priceRows = withId(prices).filter((r) => [r.gasoline_krw, r.diesel_krw, r.lpg_krw].some((v) => v != null) && /^https?:\/\//.test(r.source_url ?? ""));
  const priceWritten = await insertMany(db, "INSERT INTO fuel_price_observation", ["rest_stop_id", "station_name", "brand", "gasoline_krw", "diesel_krw", "lpg_krw", "source_url", "observed_at", "expires_at"], priceRows,
    "ON CONFLICT (rest_stop_id, observed_at) DO NOTHING");
  return { stops_read: (json.stops ?? []).length, stops_written: written, facilities_written: facWritten, fuel_prices_written: priceWritten, skipped };
}

// ── 예약 규칙·일정 ─────────────────────────────────────────────────────────

/**
 * @param {object} registry pipeline/registry/booking-rules.json
 * @param {{generated_at:string, events:object[]}} calendar out/open-calendar.json
 */
export async function importBooking(db, registry, calendar) {
  const { rows: providers } = await db.query("SELECT id, code FROM reservation_provider");
  const providerId = new Map(providers.map((p) => [p.code, p.id]));
  const ruleIds = new Map();
  let rulesWritten = 0;
  for (const r of registry.rules ?? []) {
    const hash = sha({ ...r, source: { ...r.source } });
    const res = await db.query(
      `INSERT INTO booking_rule (rule_key, reservation_provider_id, provider_key, label, summary, applies_to, schedule,
         source_url, source_title, source_tier, checked_at, registry_version, rule_hash, is_current)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,false)
       ON CONFLICT (rule_key, rule_hash) DO UPDATE SET registry_version = EXCLUDED.registry_version
       RETURNING id, (xmax = 0) AS inserted`,
      [r.id, providerId.get(r.provider_id) ?? null, r.provider_id, r.label, r.summary ?? null, r.applies_to ?? null, JSON.stringify(r.schedule ?? {}),
        r.source.url, r.source.title ?? null, r.source.tier, r.source.checked_at, String(registry.version ?? registry.updated_at ?? "unknown"), hash],
    );
    // 같은 규칙의 이전 버전은 현재 표시에서 내린다(기록은 남김).
    await db.query("UPDATE booking_rule SET is_current = (id = $2) WHERE rule_key = $1", [r.id, res.rows[0].id]);
    ruleIds.set(r.id, res.rows[0].id);
    if (res.rows[0].inserted) rulesWritten++;
  }
  const at = calendar.generated_at ?? new Date().toISOString();
  const events = (calendar.events ?? []).filter((e) => ruleIds.has(e.rule_id) && /^https?:\/\//.test(e.source?.url ?? "")).map((e) => ({
    event_key: e.id, booking_rule_id: ruleIds.get(e.rule_id), event_type: e.type, occurs_at: e.at ?? `${e.date}T00:00:00+09:00`,
    time_known: Boolean(e.time_known), label: e.label, stay_from: e.stay?.from ?? null, stay_to: e.stay?.to ?? null,
    stay_day_types: e.stay?.day_types ?? [], note: e.note ?? null, needs_verification: Boolean(e.needs_verification),
    source_url: e.source.url, source_tier: e.source.tier, computed_at: at, expires_at: plusDays(at, 2),
  }));
  const cols = ["event_key", "booking_rule_id", "event_type", "occurs_at", "time_known", "label", "stay_from", "stay_to", "stay_day_types", "note",
    "needs_verification", "source_url", "source_tier", "computed_at", "expires_at"];
  const upd = cols.filter((c) => c !== "event_key").map((c) => `${c} = EXCLUDED.${c}`).join(", ");
  const written = await insertMany(db, "INSERT INTO booking_event", cols, events, `ON CONFLICT (event_key) DO UPDATE SET ${upd}`);
  // 이번 계산 범위 안인데 결과에 없는 미래 일정은 규칙이 바뀐 것이므로 지운다.
  const from = calendar.range?.from ?? at;
  const removed = await db.query("DELETE FROM booking_event WHERE occurs_at >= $1 AND NOT (event_key = ANY($2))", [from, events.map((e) => e.event_key)]);
  return { rules_read: (registry.rules ?? []).length, rules_new_versions: rulesWritten, events_read: (calendar.events ?? []).length, events_written: written, events_removed: removed.rowCount };
}

// ── 무료 캠프 사이트 레지스트리 ─────────────────────────────────────────────

/**
 * 검수 완료(VERIFIED) 사이트만 캠핑장·사실로 올리고, 나머지는 entity_link 후보로만 둔다.
 * 각 사실의 등급·URL·확인일은 그 필드의 근거(evidence)에서 가져온다. 근거 없는 필드는 쓰지 않는다.
 */
export async function importFreeRegistry(db, registry, source) {
  const reg = source("moyeora-free-registry");
  const at = new Date().toISOString();
  let candidates = 0, facts = 0, promoted = 0;
  const all = [
    ...(registry.sites ?? []).map((s) => ({ ...s, kind: "site" })),
    ...(registry.candidates ?? []).map((c, i) => ({ id: `candidate-${sha(c.name + (c.region ?? "")).slice(0, 12)}`, name: c.name, region: c.region, status: "NEW", evidence: [{ field: "claim", url: c.found_in, tier: c.tier, title: c.claim }], kind: "candidate", index: i })),
  ];
  for (const s of all) {
    const state = s.status === "VERIFIED" ? "VERIFIED" : s.status === "REJECTED" ? "REJECTED" : s.kind === "candidate" ? "NEW" : "NEEDS_REVIEW";
    await db.query(
      `INSERT INTO entity_link (source_code, external_id, external_name, external_address, match_score, match_evidence, state, observed_at)
       VALUES ('moyeora-free-registry', $1, $2, $3, 0, $4, $5, $6)
       ON CONFLICT (source_code, external_id) DO UPDATE SET external_name = EXCLUDED.external_name, external_address = EXCLUDED.external_address,
         match_evidence = EXCLUDED.match_evidence, state = CASE WHEN entity_link.state IN ('MATCHED','VERIFIED') THEN entity_link.state ELSE EXCLUDED.state END,
         observed_at = EXCLUDED.observed_at, updated_at = now()`,
      [s.id, s.name, s.address ?? s.region ?? null, JSON.stringify({ evidence: s.evidence ?? [], region: s.region ?? null, fee: s.fee ?? null, cooking: s.cooking ?? null, toilet: s.toilet ?? null }), state, at],
    );
    candidates++;
    if (state !== "VERIFIED" || !reg.allows) continue;
    // 검수 완료 사이트 → 캠핑장(미등록 시설) + 근거가 있는 사실만
    const ext = await db.query(
      "SELECT campground_id FROM external_identifier WHERE source_id = $1 AND entity_type = 'CAMPGROUND' AND external_id = $2", [reg.id, s.id]);
    let campgroundId = ext.rows[0]?.campground_id;
    if (!campgroundId) {
      const c = await db.query(
        `INSERT INTO campground (canonical_name, legal_business_type, operator_name, status, parcel_address, is_public)
         VALUES ($1, 'NOT_REGISTERED', $2, 'PENDING_VERIFICATION', $3, true) RETURNING id`, [s.name, s.operator ?? null, s.address ?? null]);
      campgroundId = c.rows[0].id;
      await db.query("INSERT INTO external_identifier (campground_id, source_id, entity_type, external_id) VALUES ($1, $2, 'CAMPGROUND', $3)", [campgroundId, reg.id, s.id]);
      promoted++;
    }
    const ev = (field) => (s.evidence ?? []).find((e) => e.field === field && /^https?:\/\//.test(e.url ?? "") && e.tier && e.tier !== "E");
    const put = async (key, state2, condition, evidence, expires) => {
      if (!evidence) return;
      const observed = evidence.checked_at ? `${evidence.checked_at}T00:00:00+09:00` : at;
      const until = expires ?? plusDays(observed, 90);
      if (Date.parse(until) <= Date.parse(observed)) return; // 이미 끝난 무료 기간 등은 쓰지 않는다
      await db.query(
        `INSERT INTO campground_fact (campground_id, fact_key, state, condition_text, data_source_id, source_url, source_tier, evidence_excerpt, observed_at, expires_at, verification_status)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,'VERIFIED') ON CONFLICT (campground_id, fact_key, data_source_id, observed_at) DO NOTHING`,
        [campgroundId, key, state2, condition, reg.id, evidence.url, evidence.tier, evidence.title ?? null, observed, until]);
      facts++;
    };
    const tri = (v) => (v === true ? "YES" : v === false ? "NO" : "UNKNOWN");
    if (s.fee?.free != null) await put("IS_FREE", s.fee.free_until ? "CONDITIONAL" : tri(s.fee.free), s.fee.free_until ? `${s.fee.free_from ?? ""}~${s.fee.free_until} 무료${s.fee.note ? ` (${s.fee.note})` : ""}` : null, ev("fee"), s.fee.free_until ? `${s.fee.free_until}T23:59:59+09:00` : null);
    if (s.cooking?.allowed != null) await put("COOKING_ALLOWED", tri(s.cooking.allowed), null, ev("cooking"));
    if (s.toilet?.onsite != null) await put("TOILET_ON_SITE", tri(s.toilet.onsite), null, ev("toilet"));
  }
  return { registry_entries: candidates, promoted_campgrounds: promoted, facts_written: facts };
}
