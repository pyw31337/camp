import assert from "node:assert/strict";
import test from "node:test";
import {
  buildAvailabilityReadModel,
  isFreshAvailabilityReadModel,
  isSafeObservationTime,
  OFFICIAL_APPLICATION_OPEN,
  OBSERVED_AVAILABLE,
  OBSERVED_UNAVAILABLE,
  OBSERVATION_FAILED,
  observationRejectReason,
} from "../lib/availability-read-model.mjs";
import { isOfficialApplicationOpen, isReceiptOpen, serviceCoversStay } from "../lib/seoul-yeyak.mjs";

const service = {
  id: "S-1", name: "난지캠핑장 일반캠핑", status: "접수중", place: "난지캠핑장",
  lat: 37.568, lng: 126.877,
  receipt: { from: "2026-10-10T09:00:00+09:00", to: "2026-10-20T23:59:00+09:00" },
  use: { from: "2026-10-16T00:00:00+09:00", to: "2026-10-18T23:59:00+09:00" },
  url: "https://yeyak.seoul.go.kr/web/reservation/selectReservView.do?rsv_svc_id=S-1",
  source_url: "https://data.seoul.go.kr/dataList/OA-20497/S/1/datasetView.do",
  tier: "A", checked_at: "2026-10-14T00:00:00Z",
};
const camps = [{ id: "3397", name: "한강공원 난지캠핑장", lat: 37.5684, lng: 126.8771 }];

test("공식 접수 상태는 접수 기간 안에서만 열림으로 인정하고 숙박 기간을 교차 검증한다", () => {
  assert.equal(isOfficialApplicationOpen(service), true);
  assert.equal(isReceiptOpen(service, "2026-10-14T12:00:00+09:00"), true);
  assert.equal(isReceiptOpen(service, "2026-10-21T00:00:00+09:00"), false);
  assert.equal(serviceCoversStay(service, "2026-10-16", "2026-10-19"), true);
  assert.equal(serviceCoversStay(service, "2026-10-16", "2026-10-20"), false);
  assert.equal(isOfficialApplicationOpen({ status: "예약마감" }), false);
});

test("공식 접수 읽기 모델은 잔여 수를 만들지 않고 짧은 만료 시각을 부여한다", () => {
  const model = buildAvailabilityReadModel({
    seoulPayload: { generated_at: "2026-10-14T00:00:00Z", services: [service, { ...service, id: "S-2", status: "예약마감" }] },
    campgrounds: camps,
    generatedAt: "2026-10-14T03:00:00Z",
    ttlMinutes: 30,
  });
  assert.equal(model.scope, "OFFICIAL_APPLICATION_STATUS");
  assert.equal(model.records.length, 1);
  assert.equal(model.records[0].state, OFFICIAL_APPLICATION_OPEN);
  assert.equal(model.records[0].remaining_count, null);
  assert.equal(model.records[0].inventory_verified, false);
  assert.equal(model.records[0].campground_id, "3397");
  assert.equal(model.expires_at, "2026-10-14T03:30:00.000Z");
  assert.equal(isFreshAvailabilityReadModel(model, "2026-10-14T03:20:00Z"), true);
  assert.equal(isFreshAvailabilityReadModel(model, "2026-10-14T03:31:00Z"), false);
});

test("안심 수집 시간대(isSafeObservationTime): 평일 업무시간(08~18시 KST)을 회피한다", () => {
  // 2026-10-15 (목요일) 09:30 KST -> 00:30 UTC: 업무시간이므로 불가 (false)
  assert.equal(isSafeObservationTime("2026-10-15T00:30:00Z"), false);
  // 2026-10-15 (목요일) 14:00 KST -> 05:00 UTC: 업무시간이므로 불가 (false)
  assert.equal(isSafeObservationTime("2026-10-15T05:00:00Z"), false);
  // 2026-10-15 (목요일) 19:30 KST -> 10:30 UTC: 야간이므로 안전 (true)
  assert.equal(isSafeObservationTime("2026-10-15T10:30:00Z"), true);
  // 2026-10-15 (목요일) 06:30 KST -> 21:30 UTC (전날): 새벽이므로 안전 (true)
  assert.equal(isSafeObservationTime("2026-10-14T21:30:00Z"), true);
  // 2026-10-17 (토요일) 14:00 KST: 주말은 언제든 안전 (true)
  assert.equal(isSafeObservationTime("2026-10-17T05:00:00Z"), true);
});

test("최근 관측 읽기 모델: OBSERVED_AVAILABLE 발행 및 후속 OBSERVED_UNAVAILABLE에 의한 숨김 처리 검증", () => {
  const generatedAt = "2026-10-15T10:00:00Z"; // 19:00 KST
  const targetDate = "2026-10-18";

  // 1. 최초 09:00에 빈자리 관측됨
  const obs1 = {
    campground_id: "3397",
    product_name: "A존 데크",
    target_date: targetDate,
    state: OBSERVED_AVAILABLE,
    observed_at: "2026-10-15T00:00:00Z", // 09:00 KST
    expires_at: "2026-10-16T00:00:00Z",
    provider: "example-partner",
    source_approval: "APPROVED_OBSERVATION",
    source_url: "https://example.com/camps/3397",
    evidence_ref: "partner-run:2026-10-15T00:00Z#A",
    remaining_count: 2,
  };

  const model1 = buildAvailabilityReadModel({
    observationsPayload: [obs1],
    campgrounds: camps,
    generatedAt,
  });

  assert.equal(model1.scope, "OFFICIAL_APPLICATION_AND_OBSERVATION");
  assert.equal(model1.stats.observed_available, 1);
  assert.equal(model1.records.length, 1);
  assert.equal(model1.records[0].state, OBSERVED_AVAILABLE);
  // 관측 승인 원천의 수량은 실시간 재고가 아니므로 노출하지 않는다.
  assert.equal(model1.records[0].remaining_count, null);
  assert.equal(model1.records[0].inventory_verified, false);
  assert.equal(model1.records[0].use.from, "2026-10-18T00:00:00+09:00");
  assert.equal(model1.records[0].use.to, "2026-10-19T00:00:00+09:00");

  // 2. 다음 관측(10:00 KST)에서 빈자리가 사라짐 (OBSERVED_UNAVAILABLE)
  const obs2 = {
    ...obs1,
    campground_id: "3397",
    product_name: "A존 데크",
    target_date: targetDate,
    state: OBSERVED_UNAVAILABLE,
    observed_at: "2026-10-15T01:00:00Z", // 10:00 KST (obs1보다 최신)
    expires_at: "2026-10-16T01:00:00Z",
  };

  const model2 = buildAvailabilityReadModel({
    observationsPayload: [obs1, obs2],
    campgrounds: camps,
    generatedAt,
  });

  // 최신 관측이 UNAVAILABLE이므로 활성 records 목록에서 제외(숨김 처리)되어야 함!
  assert.equal(model2.records.length, 0);
  assert.equal(model2.stats.observed_available, 0);
  assert.equal(model2.stats.observed_unavailable, 1);
});


test("관측 제출 계약: 근거·승인·관측 시각·카탈로그 매칭이 없으면 발행하지 않는다", () => {
  const base = {
    campground_id: "3397", product_name: "A존", target_date: "2026-10-18", state: OBSERVED_AVAILABLE,
    observed_at: "2026-10-15T00:00:00Z", provider: "partner", source_approval: "APPROVED_OBSERVATION",
    source_url: "https://example.com/a", evidence_ref: "run-1",
  };
  const cases = [
    [{ ...base, observed_at: undefined }, "missing_observed_at"],
    [{ ...base, source_approval: undefined }, "source_not_approved"],
    [{ ...base, source_approval: "MANUAL_REVIEW_ONLY" }, "source_not_approved"],
    [{ ...base, evidence_ref: "" }, "missing_evidence"],
    [{ ...base, source_url: "http://example.com/a" }, "missing_source_url"],
    [{ ...base, campground_id: "pilot-001-hoengseong" }, "campground_not_in_catalog"],
  ];
  for (const [obs, reason] of cases) {
    assert.equal(observationRejectReason(obs, { catalogIds: new Set(["3397"]) }), reason);
  }
  const model = buildAvailabilityReadModel({
    observationsPayload: cases.map(([o]) => o),
    campgrounds: camps,
    generatedAt: "2026-10-15T10:00:00Z",
  });
  assert.equal(model.records.length, 0);
  assert.equal(model.stats.observations_rejected, cases.length);
  assert.equal(model.scope, "OFFICIAL_APPLICATION_STATUS");
});

test("관측 실패는 이전 정상 관측을 지우지 않고, 만료는 기본 TTL을 넘지 않는다", () => {
  const ok = {
    campground_id: "3397", product_name: "A존", target_date: "2026-10-18", state: OBSERVED_AVAILABLE,
    observed_at: "2026-10-15T00:00:00Z", expires_at: "2026-10-20T00:00:00Z", provider: "partner",
    source_approval: "APPROVED_LIVE", inventory_verified: true, remaining_count: 3,
    source_url: "https://example.com/a", evidence_ref: "api:req-1",
  };
  const failed = { ...ok, state: OBSERVATION_FAILED, observed_at: "2026-10-15T05:00:00Z", remaining_count: null };
  const model = buildAvailabilityReadModel({ observationsPayload: [ok, failed], campgrounds: camps, generatedAt: "2026-10-15T10:00:00Z" });
  assert.equal(model.records.length, 1);
  assert.equal(model.stats.observation_failed, 1);
  assert.equal(model.records[0].remaining_count, 3);
  assert.equal(model.records[0].inventory_verified, true);
  assert.equal(model.records[0].expires_at, "2026-10-16T00:00:00.000Z");
});
