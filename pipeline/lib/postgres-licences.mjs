// LOCALDATA 야영장업 인허가 ↔ 고캠핑 연계 적재(Codex의 campground_candidate 모델 사용).
// - MATCHED(점수 0.9 이상, 1:1)만 matched_campground_id를 채운다. 0.6~0.9는 NEEDS_REVIEW, 그 밑은 NEW(숨은 후보).
// - 사람이 검토한 행(reviewed_at 있음)은 자동 결과로 상태·연결을 덮어쓰지 않는다.
// - 인허가 상태·인허가일·폐업일·업종 고유 열은 evidence에 원문 그대로 남긴다(사실로 승격하지 않음).

const keyOf = (record) => `localdata-licence:${record.id}`;

/** @param {{fetched_at:string, sources?:object[], records:object[]}} json out/localdata-campgrounds.json */
export async function importCampgroundLicences(pool, json) {
  const { rows: src } = await pool.query("SELECT id FROM data_source WHERE code = 'mois-campground-licence'");
  if (!src.length) throw new Error("data_source 'mois-campground-licence'가 없습니다. npm run db:migrate를 먼저 실행하세요.");
  const sourceId = src[0].id;
  const { rows: ext } = await pool.query(
    `SELECT e.external_id, e.campground_id FROM external_identifier e JOIN data_source s ON s.id = e.source_id
      WHERE s.code = 'gocamping' AND e.entity_type = 'CAMPGROUND'`);
  const campgroundOf = new Map(ext.map((row) => [String(row.external_id), row.campground_id]));
  const records = [...new Map((json.records ?? []).filter((r) => r?.id && r?.name).map((r) => [keyOf(r), r])).values()];
  const downloadUrl = (kind) => json.sources?.find((s) => s.kind === kind)?.download_url ?? "https://file.localdata.go.kr/";
  const client = await pool.connect();
  const counts = { received: (json.records ?? []).length, accepted: records.length, matched: 0, needs_review: 0, hidden_candidates: 0, closed_but_listed: 0 };
  try {
    await client.query("BEGIN");
    for (const r of records) {
      const campgroundId = r.match?.state === "MATCHED" ? campgroundOf.get(String(r.match.gocamping_id)) ?? null : null;
      const state = r.match?.state === "MATCHED" ? (campgroundId ? "MATCHED" : "NEEDS_REVIEW") : r.match?.state === "NEEDS_REVIEW" ? "NEEDS_REVIEW" : "NEW";
      counts[state === "MATCHED" ? "matched" : state === "NEEDS_REVIEW" ? "needs_review" : "hidden_candidates"]++;
      if (r.match?.flags?.includes("LICENSE_CLOSED_BUT_LISTED")) counts.closed_but_listed++;
      const evidence = {
        kind: r.kind, licence_no: r.license_no, local_gov_code: r.local_gov_code, status: r.status, status_text: r.status_text,
        licensed_at: r.licensed_at, closed_at: r.closed_at, suspended: r.suspended, phone: r.phone, road_address: r.road_address,
        parcel_address: r.parcel_address, coordinate_method: r.coord_method, source_updated_at: r.updated_at, observed_at: json.fetched_at,
        match: { gocamping_id: r.match?.gocamping_id ?? null, gocamping_name: r.match?.gocamping_name ?? null, score: r.match?.score ?? 0, evidence: r.match?.evidence ?? {}, flags: r.match?.flags ?? [] },
        extra: r.extra ?? {},
      };
      await client.query(
        `INSERT INTO campground_candidate (external_key, name, address, latitude, longitude, source_id, source_url, discovery_method, state, matched_campground_id, evidence)
         VALUES ($1, $2, $3, $4, $5, $6, $7, 'LOCALDATA_LICENCE', $8::candidate_state, $9, $10::jsonb)
         ON CONFLICT (external_key) WHERE external_key IS NOT NULL DO UPDATE SET
           name = EXCLUDED.name, address = EXCLUDED.address, latitude = EXCLUDED.latitude, longitude = EXCLUDED.longitude,
           source_id = EXCLUDED.source_id, source_url = EXCLUDED.source_url, evidence = EXCLUDED.evidence,
           state = CASE WHEN campground_candidate.reviewed_at IS NOT NULL THEN campground_candidate.state ELSE EXCLUDED.state END,
           matched_campground_id = CASE WHEN campground_candidate.reviewed_at IS NOT NULL THEN campground_candidate.matched_campground_id ELSE EXCLUDED.matched_campground_id END`,
        [keyOf(r), r.name, r.road_address || r.parcel_address, r.lat, r.lng, sourceId, downloadUrl(r.kind), state, campgroundId, JSON.stringify(evidence)],
      );
    }
    await client.query(
      `INSERT INTO ingestion_run (data_source_id, dataset_key, source_url, observed_at, completed_at, status, received_count, accepted_count, rejected_count, completeness)
       VALUES ($1, 'campground-licences', $2, $3, now(), 'SUCCEEDED', $4, $5, $6, $7::jsonb)`,
      [sourceId, "https://file.localdata.go.kr/", json.fetched_at ?? new Date().toISOString(), counts.received, counts.accepted, counts.received - counts.accepted, JSON.stringify(counts)],
    );
    await client.query("COMMIT");
    return counts;
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}
