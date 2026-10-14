import assert from "node:assert/strict";
import test from "node:test";
import { buildAvailabilityReadModel, isFreshAvailabilityReadModel, OFFICIAL_APPLICATION_OPEN } from "../lib/availability-read-model.mjs";
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
