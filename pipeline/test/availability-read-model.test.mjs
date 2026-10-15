import assert from "node:assert/strict";
import test from "node:test";
import {
  buildAvailabilityReadModel,
  isFreshAvailabilityReadModel,
  isSafeObservationTime,
  OFFICIAL_APPLICATION_OPEN,
  OBSERVED_AVAILABLE,
  OBSERVED_UNAVAILABLE,
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
    source_url: "https://example.com/camps/3397",
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
  assert.equal(model1.records[0].remaining_count, 2);
  assert.equal(model1.records[0].use.from, "2026-10-18T00:00:00+09:00");
  assert.equal(model1.records[0].use.to, "2026-10-19T00:00:00+09:00");

  // 2. 다음 관측(10:00 KST)에서 빈자리가 사라짐 (OBSERVED_UNAVAILABLE)
  const obs2 = {
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

