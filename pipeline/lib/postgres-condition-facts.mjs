// PostgreSQL db/009 테이블(condition_fact, rental_offer, facility_feature, availability_observation) 적재 모듈.
import crypto from "node:crypto";

export async function importConditionFactsAndObservations(pool, { pilotFacts, observations, fetchedAt = new Date().toISOString() }) {
  const { rows: ext } = await pool.query(
    `SELECT e.external_id, e.campground_id FROM external_identifier e JOIN data_source s ON s.id = e.source_id
      WHERE s.code = 'gocamping' AND e.entity_type = 'CAMPGROUND'`
  );
  const campgroundByGocampingId = new Map(ext.map((r) => [String(r.external_id), r.campground_id]));

  // 이름 기준 매핑 보조 (ID 매핑이 안 된 파일럿 캠핑장 대응)
  const { rows: camps } = await pool.query("SELECT id, name FROM campground");
  const campgroundByName = new Map(camps.map((r) => [r.name.trim(), r.id]));

  const resolveCampgroundId = (p) => {
    if (p.gocamping_id && campgroundByGocampingId.has(String(p.gocamping_id))) {
      return campgroundByGocampingId.get(String(p.gocamping_id));
    }
    if (campgroundByGocampingId.has(String(p.id))) {
      return campgroundByGocampingId.get(String(p.id));
    }
    const cleanName = (p.name ?? "").replace(/^\[.*?\]\s*/, "").trim();
    if (campgroundByName.has(cleanName)) {
      return campgroundByName.get(cleanName);
    }
    return null;
  };

  const client = await pool.connect();
  const counts = { facts: 0, rentals: 0, features: 0, observation_runs: 0, observations: 0, skipped_no_campground: 0 };

  try {
    await client.query("BEGIN");

    // 1. 파일럿 현장 조건 사실 적재
    const pilots = Array.isArray(pilotFacts?.pilot_campgrounds) ? pilotFacts.pilot_campgrounds : [];
    for (const p of pilots) {
      const campId = resolveCampgroundId(p);
      if (!campId) {
        counts.skipped_no_campground++;
        continue;
      }

      const sourceUrl = p.evidence?.source_url ?? p.primary_booking?.url ?? null;
      const observedAt = p.evidence?.observed_at ?? fetchedAt;
      const reviewer = p.evidence?.reviewer ?? "gemini-codex-pilot";

      const insertFact = async (fieldCode, value) => {
        if (!value) return;
        await client.query(
          `INSERT INTO condition_fact (
            scope_type, campground_id, field_code, value_json,
            verification_status, source_url, observed_at, reviewer
          ) VALUES ($1, $2, $3, $4::jsonb, 'VERIFIED', $5, $6, $7)`,
          ["CAMPGROUND", campId, fieldCode, JSON.stringify(value), sourceUrl, observedAt, reviewer]
        );
        counts.facts++;
      };

      if (p.parking_mode) {
        await insertFact("PARKING_MODE", {
          mode: p.parking_mode,
          tent_side: p.parking_mode === "SITE_ADJACENT",
          cart_required: p.parking_mode === "CART_REQUIRED",
          evidence_note: p.evidence?.parking_note ?? null,
        });
      }

      if (p.power_max_w != null) {
        await insertFact("POWER_LIMIT_W", {
          limit_w: p.power_max_w,
          individual_breaker: p.individual_breaker ?? true,
          breaker_capacity: p.breaker_capacity ?? null,
          evidence_note: p.evidence?.power_note ?? null,
        });
      }

      if (p.firewood_allowed || p.charcoal_allowed) {
        await insertFact("FIREWOOD_POLICY", {
          firewood_allowed: p.firewood_allowed,
          charcoal_allowed: p.charcoal_allowed,
          evidence_note: p.evidence?.firewood_note ?? null,
        });
      }

      if (p.shelter_setup_rule) {
        await insertFact("SHELTER_SETUP_RULE", p.shelter_setup_rule);
      }

      if (p.sanitary) {
        await insertFact("SANITARY_FACILITIES", p.sanitary);
      }

      // 대여 품목 적재
      for (const item of p.rental_items ?? []) {
        await client.query(
          `INSERT INTO rental_offer (campground_id, item_name, price_krw, source_url, observed_at)
           VALUES ($1, $2, $3, $4, $5)`,
          [campId, item.name, item.price ?? item.price_krw ?? null, sourceUrl, observedAt]
        );
        counts.rentals++;
      }

      // 부대·체험·아이 시설 적재
      for (const f of p.features ?? []) {
        await client.query(
          `INSERT INTO facility_feature (campground_id, feature_type, feature_name, is_operational, operating_season, source_url, observed_at)
           VALUES ($1, $2, $3, true, $4, $5, $6)`,
          [campId, f.type ?? "FEATURE", f.name ?? f, f.season ?? "상시", sourceUrl, observedAt]
        );
        counts.features++;
      }
    }

    // 2. 최근 빈자리 관측 적재
    const obsList = Array.isArray(observations) ? observations : Array.isArray(observations?.observations) ? observations.observations : [];
    if (obsList.length > 0) {
      const conditionHash = crypto.createHash("sha256").update(JSON.stringify(obsList)).digest("hex").slice(0, 16);
      const { rows: runRows } = await client.query(
        `INSERT INTO availability_observation_run (connector_code, started_at, completed_at, condition_hash, status, observed_count, evidence)
         VALUES ('moyeora-availability-observer', now(), now(), $1, 'SUCCEEDED', $2, $3::jsonb)
         RETURNING id`,
        [conditionHash, obsList.length, JSON.stringify({ source: "pilot-observations" })]
      );
      const runId = runRows[0].id;
      counts.observation_runs++;

      for (const obs of obsList) {
        const campId = resolveCampgroundId({ id: obs.campground_id, gocamping_id: obs.campground_id });
        if (!campId) {
          counts.skipped_no_campground++;
          continue;
        }

        await client.query(
          `INSERT INTO availability_observation (
            run_id, campground_id, target_date, stay_nights, adult_count, child_count, vehicle_count,
            state, available_quantity, source_url, observed_at
          ) VALUES ($1, $2, $3::date, $4, $5, $6, $7, $8::observation_state, $9, $10, $11)`,
          [
            runId,
            campId,
            obs.target_date,
            obs.stay_nights ?? 1,
            obs.guest_capacity ?? 2,
            0,
            1,
            obs.state ?? "OBSERVED_AVAILABLE",
            obs.remaining_count ?? null,
            obs.source_url ?? null,
            obs.observed_at ?? fetchedAt,
          ]
        );
        counts.observations++;
      }
    }

    await client.query("COMMIT");
    return counts;
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }
}
