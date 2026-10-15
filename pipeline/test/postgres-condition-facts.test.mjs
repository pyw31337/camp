import assert from "node:assert/strict";
import test from "node:test";
import { importConditionFactsAndObservations } from "../lib/postgres-condition-facts.mjs";

test("조건 사실 및 최근 관측 매핑 로직 검증 (Mock DB Client)", async () => {
  const executedQueries = [];

  const mockPool = {
    async query(sql) {
      if (sql.includes("FROM external_identifier")) {
        return {
          rows: [
            { external_id: "3397", campground_id: "uuid-3397" },
            { external_id: "pilot-001-hoengseong", campground_id: "uuid-pilot-001" },
          ],
        };
      }
      if (sql.includes("FROM campground")) {
        return {
          rows: [
            { id: "uuid-3397", name: "한강공원 난지캠핑장" },
            { id: "uuid-pilot-001", name: "횡성자연휴양림 오토캠핑장" },
          ],
        };
      }
      return { rows: [] };
    },
    async connect() {
      return {
        async query(sql, params) {
          executedQueries.push({ sql, params });
          if (sql.includes("INSERT INTO availability_observation_run")) {
            return { rows: [{ id: "mock-run-id" }] };
          }
          return { rows: [] };
        },
        release() {},
      };
    },
  };

  const pilotFacts = {
    pilot_campgrounds: [
      {
        id: "pilot-001-hoengseong",
        name: "[사립] 횡성자연휴양림 오토캠핑장",
        parking_mode: "SITE_ADJACENT",
        power_max_w: 1000,
        firewood_allowed: "ALLOWED",
        charcoal_allowed: "ALLOWED",
        sanitary: { private_bathroom: false },
        rental_items: [{ name: "전기릴선", price: 5000 }],
        features: [{ type: "VALLEY", name: "휴양림 청정 계곡" }],
      },
    ],
  };

  const observations = [
    {
      campground_id: "3397",
      target_date: "2026-10-18",
      stay_nights: 1,
      guest_capacity: 4,
      state: "OBSERVED_AVAILABLE",
      remaining_count: 2,
    },
  ];

  const counts = await importConditionFactsAndObservations(mockPool, {
    pilotFacts,
    observations,
    fetchedAt: "2026-10-15T00:00:00Z",
  });

  assert.equal(counts.facts >= 4, true); // parking, power, firewood, sanitary
  assert.equal(counts.rentals, 1);
  assert.equal(counts.features, 1);
  assert.equal(counts.observation_runs, 1);
  assert.equal(counts.observations, 1);

  // 트랜잭션 정상 수행 확인 (BEGIN, COMMIT)
  assert.equal(executedQueries[0].sql, "BEGIN");
  assert.equal(executedQueries[executedQueries.length - 1].sql, "COMMIT");
});
