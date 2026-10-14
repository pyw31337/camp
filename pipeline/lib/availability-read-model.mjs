// 공개 원천의 “접수 상태”를 예약 가능 재고와 섞지 않는 읽기 모델.
// 현재는 서울 공공서비스예약 Open API만 포함한다. `OFFICIAL_APPLICATION_OPEN`은
// 공식 접수창이 열렸다는 의미이고, 남은 사이트 수나 결제 확정값이 아니다.
import { isReceiptOpen, matchSeoulToCampgrounds } from "./seoul-yeyak.mjs";

export const OFFICIAL_APPLICATION_OPEN = "OFFICIAL_APPLICATION_OPEN";
export const AVAILABILITY_SCHEMA_VERSION = 1;
export const DEFAULT_STATUS_TTL_MINUTES = 75;

const iso = (value) => {
  const at = Date.parse(value ?? "");
  return Number.isFinite(at) ? new Date(at).toISOString() : null;
};

const plusMinutes = (value, minutes) => new Date(Date.parse(value) + minutes * 60000).toISOString();

/**
 * 원본 상태를 최소 공개 읽기 모델로 바꾼다.
 * - 공식 API의 `접수중` + 현재 접수 기간만 결과에 남긴다.
 * - remaining_count/가격은 API가 제공하지 않으므로 절대 추정하지 않는다.
 * - 짧은 expires_at을 두어 갱신 실패를 “예약 가능”으로 재사용하지 않는다.
 */
export function buildAvailabilityReadModel({ seoulPayload, campgrounds, generatedAt = new Date().toISOString(), ttlMinutes = DEFAULT_STATUS_TTL_MINUTES }) {
  const generated_at = iso(generatedAt);
  if (!generated_at) throw new Error("generatedAt은 유효한 ISO 시각이어야 합니다.");
  const checkedAt = iso(seoulPayload?.generated_at) ?? generated_at;
  const services = Array.isArray(seoulPayload?.services) ? seoulPayload.services : [];
  const matched = matchSeoulToCampgrounds(services, Array.isArray(campgrounds) ? campgrounds : []);
  const records = [];

  for (const [campgroundId, matches] of matched) {
    for (const service of matches) {
      // 서울 API의 상태 텍스트는 연계 지연이 있을 수 있으므로, 상태와 접수 기간을 모두 확인한다.
      if (!isReceiptOpen(service, generated_at)) continue;
      const observed_at = iso(service.checked_at) ?? checkedAt;
      records.push({
        id: `seoul-yeyak:${service.id}`,
        campground_id: campgroundId,
        provider: "seoul-yeyak",
        state: OFFICIAL_APPLICATION_OPEN,
        product_name: service.name ?? "서울 공공예약 상품",
        status_text: service.status ?? "접수중",
        receipt: { from: service.receipt?.from ?? null, to: service.receipt?.to ?? null },
        use: { from: service.use?.from ?? null, to: service.use?.to ?? null },
        source_url: service.url,
        dataset_url: service.source_url,
        source_tier: service.tier ?? "A",
        observed_at,
        expires_at: plusMinutes(generated_at, ttlMinutes),
        match_confidence: service.match_score ?? null,
        remaining_count: null,
        inventory_verified: false,
      });
    }
  }

  records.sort((a, b) => a.campground_id.localeCompare(b.campground_id) || a.product_name.localeCompare(b.product_name, "ko"));
  return {
    schema_version: AVAILABILITY_SCHEMA_VERSION,
    generated_at,
    expires_at: plusMinutes(generated_at, ttlMinutes),
    freshness_minutes: ttlMinutes,
    scope: "OFFICIAL_APPLICATION_STATUS",
    label: "공식 접수 중",
    disclaimer: "서울 공공서비스예약 Open API의 접수 상태입니다. 남은 사이트 수·특정 날짜의 결제 확정은 예약처에서 최종 확인해야 합니다.",
    source: {
      id: "seoul-yeyak",
      name: "서울시 공공서비스예약 정보",
      tier: "A",
      dataset_url: services[0]?.source_url ?? "https://data.seoul.go.kr/dataList/OA-20497/S/1/datasetView.do",
      observed_at: checkedAt,
    },
    stats: {
      source_services: services.length,
      matched_campgrounds: matched.size,
      official_application_open: records.length,
      campgrounds_with_open_application: new Set(records.map((record) => record.campground_id)).size,
      unmatched_services: Math.max(0, services.length - [...matched.values()].reduce((count, items) => count + items.length, 0)),
    },
    records,
  };
}

export function isFreshAvailabilityReadModel(model, now = new Date()) {
  const expires = Date.parse(model?.expires_at ?? "");
  const at = now instanceof Date ? now.getTime() : Date.parse(now);
  return Number.isFinite(expires) && Number.isFinite(at) && expires >= at;
}
