import { createHash } from "node:crypto";

const BATCH_SIZE = 250;
const SOURCE_CODES = [
  "mois-public-restroom", "openstreetmap", "drowsy-shelter", "korea-expressway",
  "public-facility-opening", "booking-rule-registry", "free-site-registry",
];

const cleanText = (value) => {
  const text = String(value ?? "").trim();
  return text || null;
};

const finiteNumber = (value) => {
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
};

const nonNegativeInt = (value) => {
  const number = Number(value);
  return Number.isInteger(number) && number >= 0 ? number : null;
};

const dateOnly = (value) => {
  const match = String(value ?? "").match(/^\d{4}-\d{2}-\d{2}/);
  return match ? match[0] : null;
};

const timestamp = (value) => {
  if (!value || Number.isNaN(Date.parse(value))) return null;
  return new Date(value).toISOString();
};

const json = (value) => JSON.stringify(value ?? {});
const hash = (value) => createHash("sha256").update(JSON.stringify(value)).digest("hex");
const chunks = (values, size = BATCH_SIZE) => Array.from({ length: Math.ceil(values.length / size) }, (_, index) => values.slice(index * size, (index + 1) * size));

function bulkValues(rows, columns) {
  const params = [];
  const values = rows.map((row, rowIndex) => {
    const cells = columns.map((column, columnIndex) => {
      params.push(row[column]);
      return `$${rowIndex * columns.length + columnIndex + 1}`;
    });
    return `(${cells.join(", ")})`;
  });
  return { values: values.join(", "), params };
}

function sourceCodeForToilet(toilet) {
  return toilet?.source === "osm" ? "openstreetmap" : "mois-public-restroom";
}

function sourceCodeForStop(stop) {
  if (stop?.source?.id === "osm") return "openstreetmap";
  if (stop?.source?.id === "drowsy-standard") return "drowsy-shelter";
  if (["ex-openapi", "korea-expressway"].includes(stop?.source?.id)) return "korea-expressway";
  return "openstreetmap";
}

function stateFromBoolean(value) {
  if (value === true) return "YES";
  if (value === false) return "NO";
  return "UNKNOWN";
}

function tierFromEvidence(evidence, fallback = "B") {
  const tiers = (Array.isArray(evidence) ? evidence : []).map((item) => item?.tier).filter((tier) => ["A", "B", "C", "D", "E"].includes(tier));
  return tiers.sort()[0] ?? fallback;
}

function verificationFor(tier, needsVerification = false) {
  return !needsVerification && ["A", "B"].includes(tier) ? "VERIFIED" : "PENDING_REVIEW";
}

async function sourceIdMap(pool) {
  const result = await pool.query("SELECT id, code FROM data_source WHERE code = ANY($1::text[])", [SOURCE_CODES]);
  const ids = new Map(result.rows.map((row) => [row.code, row.id]));
  for (const code of SOURCE_CODES) {
    if (!ids.has(code)) throw new Error(`data_source.${code}가 없습니다. db:migrate를 먼저 실행하세요.`);
  }
  return ids;
}

async function recordRun(client, sourceId, { datasetKey, sourceUrl, observedAt, received, accepted, payload, metadata = {} }) {
  await client.query(
    `INSERT INTO ingestion_run (
       data_source_id, dataset_key, source_url, completed_at, observed_at, status,
       received_count, accepted_count, rejected_count, payload_hash, completeness, metadata
     ) VALUES ($1, $2, $3, now(), COALESCE($4::timestamptz, now()), 'SUCCEEDED',
       $5, $6, $7, $8, $9::jsonb, $10::jsonb)`,
    [sourceId, datasetKey, sourceUrl ?? null, observedAt, received, accepted, Math.max(0, received - accepted), hash(payload), json({ complete: true }), json(metadata)],
  );
}

function normalizeToilet(toilet, sourceIds, observedAt) {
  const latitude = finiteNumber(toilet?.lat);
  const longitude = finiteNumber(toilet?.lng);
  if (!cleanText(toilet?.id) || !cleanText(toilet?.name) || !(cleanText(toilet?.road_address) || cleanText(toilet?.jibun_address))) return null;
  if ((latitude == null) !== (longitude == null)) return null;
  const sourceCode = sourceCodeForToilet(toilet);
  const osm = sourceCode === "openstreetmap";
  return {
    data_source_id: sourceIds.get(sourceCode), source_key: cleanText(toilet.id), name: cleanText(toilet.name), kind: cleanText(toilet.kind),
    owner_kind: cleanText(toilet.owner), road_address: cleanText(toilet.road_address), parcel_address: cleanText(toilet.jibun_address),
    open_hours: cleanText(toilet.open_hours), open_24h: typeof toilet.open_24h === "boolean" ? toilet.open_24h : null,
    disabled_stalls: nonNegativeInt(toilet.disabled_stalls), child_stalls: nonNegativeInt(toilet.child_stalls),
    has_emergency_bell: typeof toilet.emergency_bell === "boolean" ? toilet.emergency_bell : null,
    has_cctv: typeof toilet.cctv === "boolean" ? toilet.cctv : null,
    has_diaper_table: typeof toilet.diaper_table === "boolean" ? toilet.diaper_table : null,
    manager_name: cleanText(toilet.manager), manager_phone: cleanText(toilet.tel), latitude, longitude,
    geocode_method: latitude == null ? null : (osm ? "OSM_GEOMETRY" : toilet.precision === "EPSG5174" ? "SOURCE_EPSG5174" : "KAKAO_ADDRESS"),
    geocode_precision: cleanText(toilet.precision) ?? (osm && latitude != null ? "OSM" : null),
    geocoded_at: latitude == null ? null : observedAt,
    source_data_date: dateOnly(toilet.data_date), observed_at: observedAt,
    source_code: sourceCode,
  };
}

async function upsertToilets(client, rows) {
  const columns = [
    "data_source_id", "source_key", "name", "kind", "owner_kind", "road_address", "parcel_address", "open_hours", "open_24h",
    "disabled_stalls", "child_stalls", "has_emergency_bell", "has_cctv", "has_diaper_table", "manager_name", "manager_phone",
    "latitude", "longitude", "geocode_method", "geocode_precision", "geocoded_at", "source_data_date", "observed_at",
  ];
  for (const batch of chunks(rows)) {
    const { values, params } = bulkValues(batch, columns);
    await client.query(
      `INSERT INTO public_toilet (${columns.join(", ")}) VALUES ${values}
       ON CONFLICT (source_key) DO UPDATE SET
         data_source_id = EXCLUDED.data_source_id, name = EXCLUDED.name, kind = EXCLUDED.kind, owner_kind = EXCLUDED.owner_kind,
         road_address = EXCLUDED.road_address, parcel_address = EXCLUDED.parcel_address, open_hours = EXCLUDED.open_hours,
         open_24h = EXCLUDED.open_24h, disabled_stalls = EXCLUDED.disabled_stalls, child_stalls = EXCLUDED.child_stalls,
         has_emergency_bell = EXCLUDED.has_emergency_bell, has_cctv = EXCLUDED.has_cctv, has_diaper_table = EXCLUDED.has_diaper_table,
         manager_name = EXCLUDED.manager_name, manager_phone = EXCLUDED.manager_phone, latitude = EXCLUDED.latitude,
         longitude = EXCLUDED.longitude, geocode_method = EXCLUDED.geocode_method, geocode_precision = EXCLUDED.geocode_precision,
         geocoded_at = EXCLUDED.geocoded_at, source_data_date = EXCLUDED.source_data_date, observed_at = EXCLUDED.observed_at,
         updated_at = now()`,
      params,
    );
  }
}

function normalizeStop(stop, sourceIds, observedAt) {
  const latitude = finiteNumber(stop?.lat);
  const longitude = finiteNumber(stop?.lng);
  if (!cleanText(stop?.id) || !cleanText(stop?.name) || !["SERVICE_AREA", "DROWSY_SHELTER", "REST_AREA"].includes(stop?.kind) || latitude == null || longitude == null) return null;
  const sourceCode = sourceCodeForStop(stop);
  return {
    data_source_id: sourceIds.get(sourceCode), source_key: cleanText(stop.id), stop_kind: stop.kind, name: cleanText(stop.name),
    road_name: cleanText(stop.road), direction_text: cleanText(stop.direction), address_text: cleanText(stop.address), phone: cleanText(stop.tel),
    latitude, longitude, coordinate_method: sourceCode === "openstreetmap" ? "OSM_GEOMETRY" : "SOURCE", coordinate_precision: null,
    parking_spaces: nonNegativeInt(stop.parking_spaces), facilities: json(stop.facilities), source_payload: json(stop),
    source_data_date: dateOnly(stop?.source?.checked_at), observed_at: observedAt, source_code: sourceCode,
  };
}

async function upsertStops(client, rows) {
  const columns = [
    "data_source_id", "source_key", "stop_kind", "name", "road_name", "direction_text", "address_text", "phone", "latitude", "longitude",
    "coordinate_method", "coordinate_precision", "parking_spaces", "facilities", "source_payload", "source_data_date", "observed_at",
  ];
  for (const batch of chunks(rows)) {
    const { values, params } = bulkValues(batch, columns);
    await client.query(
      `INSERT INTO road_stop (${columns.join(", ")}) VALUES ${values}
       ON CONFLICT (data_source_id, source_key) DO UPDATE SET
         stop_kind = EXCLUDED.stop_kind, name = EXCLUDED.name, road_name = EXCLUDED.road_name, direction_text = EXCLUDED.direction_text,
         address_text = EXCLUDED.address_text, phone = EXCLUDED.phone, latitude = EXCLUDED.latitude, longitude = EXCLUDED.longitude,
         coordinate_method = EXCLUDED.coordinate_method, coordinate_precision = EXCLUDED.coordinate_precision, parking_spaces = EXCLUDED.parking_spaces,
         facilities = EXCLUDED.facilities, source_payload = EXCLUDED.source_payload, source_data_date = EXCLUDED.source_data_date,
         observed_at = EXCLUDED.observed_at, last_seen_at = now(), retired_at = NULL, updated_at = now()`,
      params,
    );
  }
}

async function upsertFuelObservations(client, stops) {
  const fuelRows = stops.filter((stop) => stop?.fuel?.prices_krw_per_l && cleanText(stop.id));
  for (const stop of fuelRows) {
    const sourceCode = sourceCodeForStop(stop);
    const found = await client.query(
      `SELECT road_stop.id FROM road_stop JOIN data_source ON data_source.id = road_stop.data_source_id
       WHERE data_source.code = $1 AND road_stop.source_key = $2`,
      [sourceCode, stop.id],
    );
    const roadStopId = found.rows[0]?.id;
    if (!roadStopId) continue;
    const prices = stop.fuel.prices_krw_per_l ?? {};
    const observedAt = timestamp(stop.fuel.checked_at) ?? new Date().toISOString();
    await client.query(
      `INSERT INTO road_stop_fuel_observation (
         road_stop_id, source_url, observed_at, gasoline_krw_per_l, diesel_krw_per_l, lpg_krw_per_l, brand, response_hash, expires_at
       ) VALUES ($1, $2, $3::timestamptz, $4, $5, $6, $7, $8, $3::timestamptz + interval '1 day')
       ON CONFLICT (road_stop_id, source_url, observed_at) DO NOTHING`,
      [roadStopId, stop.fuel.source_url, observedAt, nonNegativeInt(prices.gasoline), nonNegativeInt(prices.diesel), nonNegativeInt(prices.lpg), cleanText(stop.fuel.brand), hash(stop.fuel)],
    );
  }
  return fuelRows.length;
}

async function upsertCandidate(client, { externalKey, name, address = null, sourceId, sourceUrl, discoveryMethod, state = "NEEDS_REVIEW", evidence }) {
  const result = await client.query(
    `INSERT INTO campground_candidate (external_key, name, address, source_id, source_url, discovery_method, state, evidence)
     VALUES ($1, $2, $3, $4, $5, $6, $7::candidate_state, $8::jsonb)
     ON CONFLICT (external_key) WHERE external_key IS NOT NULL DO UPDATE SET
       name = EXCLUDED.name, address = EXCLUDED.address, source_id = EXCLUDED.source_id, source_url = EXCLUDED.source_url,
       discovery_method = EXCLUDED.discovery_method, state = EXCLUDED.state, evidence = EXCLUDED.evidence
     RETURNING id`,
    [externalKey, name, address, sourceId, sourceUrl, discoveryMethod, state, json(evidence)],
  );
  return result.rows[0].id;
}

async function upsertFreeRegistry(client, registry, sourceIds, observedAt) {
  const sourceId = sourceIds.get("free-site-registry");
  let assessments = 0;
  let candidates = 0;
  for (const site of registry?.sites ?? []) {
    if (!cleanText(site?.id) || !cleanText(site?.name)) continue;
    const evidence = Array.isArray(site.evidence) ? site.evidence : [];
    const tier = tierFromEvidence(evidence);
    const candidateId = await upsertCandidate(client, {
      externalKey: `free-site:${site.id}`, name: site.name, address: cleanText(site.address), sourceId,
      sourceUrl: evidence[0]?.url ?? null, discoveryMethod: "CURATED_FREE_SITE_REGISTRY", state: site.status ?? "NEEDS_REVIEW", evidence: site,
    });
    const feeState = site?.fee?.free === true ? "YES" : site?.fee?.free === false ? "NO" : "UNKNOWN";
    const cookingState = stateFromBoolean(site?.cooking?.allowed);
    const toiletState = stateFromBoolean(site?.toilet?.onsite);
    await client.query(
      `INSERT INTO free_camp_assessment (
         assessment_key, candidate_id, data_source_id, fee_state, cooking_state, toilet_state, free_from, free_until,
         source_url, evidence, source_tier, verification_status, observed_at, expires_at
       ) VALUES ($1, $2, $3, $4::context_fact_state, $5::context_fact_state, $6::context_fact_state, $7::date, $8::date,
         $9, $10::jsonb, $11::source_tier, 'PENDING_REVIEW', $12::timestamptz, $13::timestamptz)
       ON CONFLICT (assessment_key) DO UPDATE SET
         candidate_id = EXCLUDED.candidate_id, fee_state = EXCLUDED.fee_state, cooking_state = EXCLUDED.cooking_state,
         toilet_state = EXCLUDED.toilet_state, free_from = EXCLUDED.free_from, free_until = EXCLUDED.free_until,
         source_url = EXCLUDED.source_url, evidence = EXCLUDED.evidence, source_tier = EXCLUDED.source_tier,
         verification_status = EXCLUDED.verification_status, observed_at = EXCLUDED.observed_at, expires_at = EXCLUDED.expires_at, updated_at = now()`,
      [
        `free-site:${site.id}`, candidateId, sourceId, feeState, cookingState, toiletState, dateOnly(site?.fee?.free_from), dateOnly(site?.fee?.free_until),
        evidence[0]?.url ?? "https://github.com/pyw31337/camp/tree/main/pipeline/registry/free-sites.json", json({ site, criteria: registry?.criteria ?? {} }), tier,
        observedAt, site?.fee?.free_until ? `${dateOnly(site.fee.free_until)}T23:59:59+09:00` : null,
      ],
    );
    assessments += 1;
    candidates += 1;
  }
  for (const item of registry?.candidates ?? []) {
    if (!cleanText(item?.name)) continue;
    await upsertCandidate(client, {
      externalKey: `free-discovery:${hash([item.name, item.region, item.found_in]).slice(0, 24)}`,
      name: item.name, address: cleanText(item.region), sourceId, sourceUrl: cleanText(item.found_in), discoveryMethod: "COMMUNITY_DISCOVERY_ONLY",
      state: "NEEDS_REVIEW", evidence: item,
    });
    candidates += 1;
  }
  return { assessments, candidates };
}

async function upsertPublicFreeCandidates(client, payload, sourceIds) {
  const sourceId = sourceIds.get("public-facility-opening");
  let candidates = 0;
  for (const item of payload?.candidates ?? []) {
    const name = cleanText(item?.facilityNm ?? item?.fcltyNm ?? item?.name) ?? cleanText(Object.values(item ?? {}).find((value) => /야영|캠핑|캠프/.test(String(value))));
    if (!name) continue;
    await upsertCandidate(client, {
      externalKey: `public-facility:${hash(item).slice(0, 24)}`, name, address: cleanText(item?.rdnmadr ?? item?.lnmadr ?? item?.address), sourceId,
      sourceUrl: cleanText(payload.source), discoveryMethod: "PUBLIC_FACILITY_FREE_CANDIDATE", state: "NEEDS_REVIEW", evidence: item,
    });
    candidates += 1;
  }
  return candidates;
}

async function replaceNearbyToiletLinks(client, payload, authoritative) {
  if (!authoritative || !payload?.campgrounds || typeof payload.campgrounds !== "object") return { linked: 0, replaced: false };
  const externalIds = Object.keys(payload.campgrounds);
  const toiletKeys = [...new Set(Object.values(payload.campgrounds).flatMap((entry) => (entry?.nearest ?? []).map((near) => near.toilet_id).filter(Boolean)))];
  if (!externalIds.length || !toiletKeys.length) return { linked: 0, replaced: false };
  const [campgrounds, toilets] = await Promise.all([
    client.query(
      `SELECT external_identifier.external_id, external_identifier.campground_id
       FROM external_identifier JOIN data_source ON data_source.id = external_identifier.source_id
       WHERE data_source.code = 'gocamping' AND external_identifier.entity_type = 'CAMPGROUND' AND external_identifier.external_id = ANY($1::text[])`,
      [externalIds],
    ),
    client.query("SELECT id, source_key FROM public_toilet WHERE source_key = ANY($1::text[])", [toiletKeys]),
  ]);
  const campgroundIds = new Map(campgrounds.rows.map((row) => [row.external_id, row.campground_id]));
  const toiletIds = new Map(toilets.rows.map((row) => [row.source_key, row.id]));
  const rows = [];
  for (const [externalId, entry] of Object.entries(payload.campgrounds)) {
    const campgroundId = campgroundIds.get(externalId);
    if (!campgroundId) continue;
    for (const [index, near] of (entry?.nearest ?? []).entries()) {
      const toiletId = toiletIds.get(near.toilet_id);
      const distance = nonNegativeInt(near.distance_m);
      if (toiletId && distance != null) rows.push({ campground_id: campgroundId, public_toilet_id: toiletId, distance_m: distance, rank: index + 1 });
    }
  }
  await client.query("DELETE FROM campground_nearby_toilet");
  for (const batch of chunks(rows)) {
    const { values, params } = bulkValues(batch, ["campground_id", "public_toilet_id", "distance_m", "rank"]);
    await client.query(
      `INSERT INTO campground_nearby_toilet (campground_id, public_toilet_id, distance_m, rank)
       VALUES ${values} ON CONFLICT (campground_id, public_toilet_id) DO UPDATE SET distance_m = EXCLUDED.distance_m, rank = EXCLUDED.rank, computed_at = now()`,
      params,
    );
  }
  return { linked: rows.length, replaced: true };
}

async function upsertBookingRules(client, registry, calendar, sourceIds, observedAt) {
  const providers = await client.query("SELECT id, code FROM reservation_provider");
  const providerIds = new Map(providers.rows.map((row) => [row.code, row.id]));
  const templates = new Map();
  let ruleCount = 0;
  for (const rule of registry?.rules ?? []) {
    const providerId = providerIds.get(rule.provider_id);
    if (!providerId || !cleanText(rule?.id)) continue;
    const tier = rule?.source?.tier ?? "C";
    await client.query(
      `UPDATE provider_policy_template SET state = 'SUPERSEDED', updated_at = now()
       WHERE reservation_provider_id = $1 AND rule_key = $2 AND version <> $3 AND state = 'ACTIVE'`,
      [providerId, rule.id, Number(registry.version) || 1],
    );
    const result = await client.query(
      `INSERT INTO provider_policy_template (
         reservation_provider_id, rule_key, version, label, summary, applies_to, schedule_json,
         source_url, source_title, source_checked_at, source_tier, verification_status, valid_from, state, observed_at, response_hash
       ) VALUES ($1, $2, $3, $4, $5, $6, $7::jsonb, $8, $9, $10::date, $11::source_tier, $12::verification_status, $13::timestamptz, 'ACTIVE', $14::timestamptz, $15)
       ON CONFLICT (reservation_provider_id, rule_key, version) DO UPDATE SET
         label = EXCLUDED.label, summary = EXCLUDED.summary, applies_to = EXCLUDED.applies_to, schedule_json = EXCLUDED.schedule_json,
         source_url = EXCLUDED.source_url, source_title = EXCLUDED.source_title, source_checked_at = EXCLUDED.source_checked_at,
         source_tier = EXCLUDED.source_tier, verification_status = EXCLUDED.verification_status, valid_from = EXCLUDED.valid_from,
         state = 'ACTIVE', observed_at = EXCLUDED.observed_at, response_hash = EXCLUDED.response_hash, updated_at = now()
       RETURNING id`,
      [
        providerId, rule.id, Number(registry.version) || 1, rule.label, rule.summary ?? null, rule.applies_to ?? null, json(rule.schedule),
        rule.source?.url, rule.source?.title ?? null, dateOnly(rule.source?.checked_at), tier, verificationFor(tier), timestamp(rule.source?.checked_at), observedAt, hash(rule),
      ],
    );
    templates.set(rule.id, result.rows[0].id);
    ruleCount += 1;
  }
  let eventCount = 0;
  for (const event of calendar?.events ?? []) {
    const templateId = templates.get(event.rule_id);
    if (!templateId || !cleanText(event?.id) || !timestamp(event?.at)) continue;
    const tier = event?.source?.tier ?? "C";
    await client.query(
      `INSERT INTO booking_rule_event (
         provider_policy_template_id, event_key, event_type, occurs_at, time_known, stay_scope, note,
         source_url, source_tier, needs_verification, calculated_at, calculation_hash
       ) VALUES ($1, $2, $3, $4::timestamptz, $5, $6::jsonb, $7, $8, $9::source_tier, $10, $11::timestamptz, $12)
       ON CONFLICT (event_key) DO UPDATE SET
         provider_policy_template_id = EXCLUDED.provider_policy_template_id, event_type = EXCLUDED.event_type, occurs_at = EXCLUDED.occurs_at,
         time_known = EXCLUDED.time_known, stay_scope = EXCLUDED.stay_scope, note = EXCLUDED.note, source_url = EXCLUDED.source_url,
         source_tier = EXCLUDED.source_tier, needs_verification = EXCLUDED.needs_verification, calculated_at = EXCLUDED.calculated_at,
         calculation_hash = EXCLUDED.calculation_hash, updated_at = now()`,
      [templateId, event.id, event.type, event.at, event.time_known !== false, json(event.stay), event.note ?? null, event.source?.url, tier, event.needs_verification === true, timestamp(calendar.generated_at) ?? observedAt, hash(event)],
    );
    eventCount += 1;
  }
  await recordRun(client, sourceIds.get("booking-rule-registry"), {
    datasetKey: "provider-booking-rules", sourceUrl: "https://github.com/pyw31337/camp/tree/main/pipeline/registry/booking-rules.json",
    observedAt, received: ruleCount + eventCount, accepted: ruleCount + eventCount, payload: { registry, calendar }, metadata: { rules: ruleCount, events: eventCount },
  });
  return { rules: ruleCount, events: eventCount };
}

/**
 * Stores durable context data. It deliberately never writes availability_snapshot:
 * booking-rule events are schedules, not a facility/product inventory response.
 */
export async function importContextData(pool, input) {
  const sourceIds = await sourceIdMap(pool);
  const observedAt = timestamp(input?.toilets?.source?.fetched_at)
    ?? timestamp(input?.restStops?.generated_at)
    ?? timestamp(input?.calendar?.generated_at)
    ?? new Date().toISOString();
  // 일일 원천 파일에는 같은 키가 두 번 나오는 행이 있다(같은 쉼터 중복 등록, 같은 이름+주소 화장실). 한 INSERT 안의
  // 중복 키는 PostgreSQL이 “cannot affect row a second time”으로 거부하므로 키별 마지막 행만 남긴다.
  const lastByKey = (rows, key) => [...new Map(rows.map((row) => [key(row), row])).values()];
  const toiletRows = lastByKey((input?.toilets?.toilets ?? []).map((toilet) => normalizeToilet(toilet, sourceIds, observedAt)).filter(Boolean), (row) => row.source_key);
  const stopRows = lastByKey((input?.restStops?.stops ?? []).map((stop) => normalizeStop(stop, sourceIds, observedAt)).filter(Boolean), (row) => `${row.data_source_id}|${row.source_key}`);
  const officialToiletCount = toiletRows.filter((row) => row.source_code === "mois-public-restroom").length;
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    if (toiletRows.length) await upsertToilets(client, toiletRows);
    if (stopRows.length) await upsertStops(client, stopRows);
    const fuelObservations = await upsertFuelObservations(client, input?.restStops?.stops ?? []);
    const toiletLinks = await replaceNearbyToiletLinks(client, input?.campgroundToilets, officialToiletCount >= 100);
    const freeRegistry = await upsertFreeRegistry(client, input?.freeRegistry ?? {}, sourceIds, observedAt);
    const publicFreeCandidates = await upsertPublicFreeCandidates(client, input?.publicFreeCandidates ?? {}, sourceIds);
    const booking = await upsertBookingRules(client, input?.bookingRegistry ?? {}, input?.calendar ?? {}, sourceIds, observedAt);
    const byToiletSource = Object.groupBy(toiletRows, (row) => row.source_code);
    for (const [sourceCode, rows] of Object.entries(byToiletSource)) {
      await recordRun(client, sourceIds.get(sourceCode), {
        datasetKey: "public-toilets", sourceUrl: input?.toilets?.source?.url, observedAt, received: rows.length, accepted: rows.length,
        payload: rows, metadata: { coordinate_records: rows.filter((row) => row.latitude != null).length },
      });
    }
    const byStopSource = Object.groupBy(stopRows, (row) => row.source_code);
    for (const [sourceCode, rows] of Object.entries(byStopSource)) {
      await recordRun(client, sourceIds.get(sourceCode), {
        datasetKey: "road-stops", sourceUrl: input?.restStops?.sources?.[sourceCode] ?? null, observedAt, received: rows.length, accepted: rows.length,
        payload: rows, metadata: { fuel_observations: sourceCode === "korea-expressway" ? fuelObservations : 0 },
      });
    }
    await recordRun(client, sourceIds.get("free-site-registry"), {
      datasetKey: "free-site-review-registry", sourceUrl: "https://github.com/pyw31337/camp/tree/main/pipeline/registry/free-sites.json",
      observedAt, received: freeRegistry.candidates, accepted: freeRegistry.assessments, payload: input?.freeRegistry ?? {}, metadata: freeRegistry,
    });
    if (input?.publicFreeCandidates?.candidates?.length) {
      await recordRun(client, sourceIds.get("public-facility-opening"), {
        datasetKey: "public-free-candidates", sourceUrl: input.publicFreeCandidates.source, observedAt,
        received: input.publicFreeCandidates.candidates.length, accepted: publicFreeCandidates, payload: input.publicFreeCandidates,
      });
    }
    await client.query("COMMIT");
    return {
      toilets: toiletRows.length, official_toilets: officialToiletCount, road_stops: stopRows.length, fuel_observations: fuelObservations,
      toilet_links: toiletLinks.linked, toilet_links_replaced: toiletLinks.replaced,
      free_assessments: freeRegistry.assessments, free_candidates: freeRegistry.candidates + publicFreeCandidates,
      booking_rule_templates: booking.rules, booking_rule_events: booking.events,
    };
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}
