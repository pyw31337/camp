import { isReceiptOpen, matchSeoulToCampgrounds } from "./seoul-yeyak.mjs";

export const OFFICIAL_APPLICATION_OPEN = "OFFICIAL_APPLICATION_OPEN";
export const OBSERVED_AVAILABLE = "OBSERVED_AVAILABLE";
export const OBSERVED_UNAVAILABLE = "OBSERVED_UNAVAILABLE";
export const OBSERVATION_FAILED = "OBSERVATION_FAILED";

export const AVAILABILITY_SCHEMA_VERSION = 2;
export const DEFAULT_STATUS_TTL_MINUTES = 75;
export const DEFAULT_OBSERVATION_TTL_MINUTES = 1440; // 24시간

const iso = (value) => {
  const at = Date.parse(value ?? "");
  return Number.isFinite(at) ? new Date(at).toISOString() : null;
};

const plusMinutes = (value, minutes) => new Date(Date.parse(value) + minutes * 60000).toISOString();

/**
 * 평일 08:00~18:00 KST 업무시간을 피하고, 야간·새벽 및 주말 저부하 시간대인지 판정한다.
 * - 주말(토/일 KST): 전 시간 허용
 * - 평일(월~금 KST): 08:00 이전 또는 18:00 이후에만 허용
 */
export function isSafeObservationTime(date = new Date()) {
  const d = date instanceof Date ? date : new Date(date);
  if (!Number.isFinite(d.getTime())) return false;
  // KST = UTC+9
  const kst = new Date(d.getTime() + 9 * 60 * 60 * 1000);
  const day = kst.getUTCDay(); // 0: 일, 6: 토
  const hour = kst.getUTCHours(); // 0..23
  if (day === 0 || day === 6) return true;
  return hour < 8 || hour >= 18;
}

/**
 * 원본 상태 및 최근 빈자리 관측을 최소 공개 읽기 모델로 바꾼다.
 * - 공식 API의 `접수중` + 현재 접수 기간만 결과에 남긴다 (OFFICIAL_APPLICATION_OPEN).
 * - 허용된 공공·파일럿 관측에서 확인된 빈자리는 OBSERVED_AVAILABLE로 발행한다.
 * - 다음 관측에서 빈자리가 없으면(OBSERVED_UNAVAILABLE) 더 최신의 관측이 이전 가능 상태를 억제하여 숨김 처리한다.
 * - remaining_count는 원천이 명시적으로 제공한 경우 외에는 절대 추정하지 않는다.
 */
export function buildAvailabilityReadModel({
  seoulPayload,
  observationsPayload,
  existingRecords = [],
  campgrounds,
  generatedAt = new Date().toISOString(),
  ttlMinutes = DEFAULT_STATUS_TTL_MINUTES,
  observationTtlMinutes = DEFAULT_OBSERVATION_TTL_MINUTES,
}) {
  const generated_at = iso(generatedAt);
  if (!generated_at) throw new Error("generatedAt은 유효한 ISO 시각이어야 합니다.");
  const checkedAt = iso(seoulPayload?.generated_at) ?? generated_at;
  const services = Array.isArray(seoulPayload?.services) ? seoulPayload.services : [];
  const matched = matchSeoulToCampgrounds(services, Array.isArray(campgrounds) ? campgrounds : []);
  const records = [];

  // 기존 보존 레코드(오프라인 폴백용)
  if (Array.isArray(existingRecords)) {
    for (const rec of existingRecords) {
      if (rec && rec.state === OFFICIAL_APPLICATION_OPEN) {
        records.push({ ...rec, expires_at: rec.expires_at || plusMinutes(generated_at, ttlMinutes) });
      }
    }
  }

  // 1. 공식 접수 상태 (서울 공공서비스예약)
  for (const [campgroundId, matches] of matched) {
    for (const service of matches) {
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

  // 2. 최근 빈자리 관측 (공공·파일럿 승인 원천)
  const rawObservations = Array.isArray(observationsPayload)
    ? observationsPayload
    : Array.isArray(observationsPayload?.observations)
    ? observationsPayload.observations
    : [];

  // (campground_id + target_date + product_name) 단위로 그룹핑하여 가장 최신 관측 판정
  const obsGroups = new Map();
  for (const obs of rawObservations) {
    if (!obs || !obs.campground_id || !obs.target_date) continue;
    const cid = String(obs.campground_id);
    const dateStr = String(obs.target_date).slice(0, 10);
    const pName = String(obs.product_name ?? "캠핑 사이트");
    const key = `${cid}::${dateStr}::${pName}`;
    if (!obsGroups.has(key)) obsGroups.set(key, []);
    obsGroups.get(key).push(obs);
  }

  let observedAvailableCount = 0;
  let observedUnavailableCount = 0;
  const nowMs = Date.parse(generated_at);
  const todayKstStr = new Date(nowMs + 9 * 60 * 60 * 1000).toISOString().slice(0, 10);

const plusDaysKst = (dateStr, days) => {
  const [y, m, d] = dateStr.slice(0, 10).split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d + days));
  return dt.toISOString().slice(0, 10);
};

  for (const [key, obsList] of obsGroups) {
    // observed_at 내림차순 정렬 (가장 최근 관측이 맨 앞)
    obsList.sort((a, b) => Date.parse(b.observed_at ?? 0) - Date.parse(a.observed_at ?? 0));
    const latest = obsList[0];
    const obsAt = iso(latest.observed_at) ?? generated_at;
    const expAt = iso(latest.expires_at) ?? plusMinutes(obsAt, observationTtlMinutes);

    // 지난 날짜는 제외
    const targetDateStr = String(latest.target_date).slice(0, 10);
    if (targetDateStr < todayKstStr) continue;

    // 만료된 관측은 제외
    if (Date.parse(expAt) < nowMs) continue;

    // 최신 관측이 UNAVAILABLE 또는 FAILED이면 이전 빈자리를 숨김 처리
    if (latest.state === OBSERVED_UNAVAILABLE || latest.state === OBSERVATION_FAILED) {
      observedUnavailableCount++;
      continue;
    }

    if (latest.state === OBSERVED_AVAILABLE) {
      observedAvailableCount++;
      const stayNights = Number(latest.stay_nights ?? 1);
      const useFrom = `${targetDateStr}T00:00:00+09:00`;
      const useToStr = plusDaysKst(targetDateStr, stayNights);
      const useTo = `${useToStr}T00:00:00+09:00`;

      records.push({
        id: latest.id ?? `obs:${latest.campground_id}:${targetDateStr}:${latest.product_name ?? "site"}`,
        campground_id: String(latest.campground_id),
        provider: latest.provider ?? "public-pilot",
        state: OBSERVED_AVAILABLE,
        product_name: latest.product_name ?? "캠핑 사이트",
        status_text: "빈자리 관측",
        target_date: targetDateStr,
        stay_nights: stayNights,
        guest_capacity: latest.guest_capacity ?? 4,
        receipt: null,
        use: { from: useFrom, to: useTo },
        source_url: latest.source_url ?? null,
        dataset_url: latest.dataset_url ?? null,
        source_tier: latest.source_tier ?? "A",
        observed_at: obsAt,
        expires_at: expAt,
        match_confidence: latest.match_confidence ?? 1.0,
        remaining_count: latest.remaining_count != null ? Number(latest.remaining_count) : null,
        inventory_verified: Boolean(latest.inventory_verified),
      });
    }
  }

  records.sort((a, b) => a.campground_id.localeCompare(b.campground_id) || a.product_name.localeCompare(b.product_name, "ko"));

  // 모델 만료 시각: 포함된 레코드 중 가장 늦은 만료 시각 또는 기본 TTL
  const allExpTimes = records.map((r) => Date.parse(r.expires_at)).filter(Number.isFinite);
  const maxExpMs = allExpTimes.length ? Math.max(...allExpTimes) : Date.parse(plusMinutes(generated_at, ttlMinutes));
  const modelExpiresAt = new Date(maxExpMs).toISOString();

  return {
    schema_version: AVAILABILITY_SCHEMA_VERSION,
    generated_at,
    expires_at: modelExpiresAt,
    freshness_minutes: ttlMinutes,
    scope: rawObservations.length > 0 ? "OFFICIAL_APPLICATION_AND_OBSERVATION" : "OFFICIAL_APPLICATION_STATUS",
    label: rawObservations.length > 0 ? "최근 빈자리 관측 및 공식 접수" : "공식 접수 중",
    disclaimer: rawObservations.length > 0
      ? "공식 API 및 허용된 원천의 최근 빈자리 관측 및 접수 상태입니다. 남은 사이트 수·결제 확정은 예약처에서 최종 확인해야 합니다."
      : "서울 공공서비스예약 Open API의 접수 상태입니다. 남은 사이트 수·특정 날짜의 결제 확정은 예약처에서 최종 확인해야 합니다.",
    source: {
      id: rawObservations.length > 0 ? "moyeora-availability" : "seoul-yeyak",
      name: rawObservations.length > 0 ? "공공 예약 및 허용 원천 관측" : "서울시 공공서비스예약 정보",
      tier: "A",
      dataset_url: services[0]?.source_url ?? "https://data.seoul.go.kr/dataList/OA-20497/S/1/datasetView.do",
      observed_at: checkedAt,
    },
    stats: {
      source_services: services.length,
      matched_campgrounds: matched.size,
      official_application_open: records.filter((r) => r.state === OFFICIAL_APPLICATION_OPEN).length,
      observed_available: observedAvailableCount,
      observed_unavailable: observedUnavailableCount,
      campgrounds_with_open_application: new Set(records.filter((r) => r.state === OFFICIAL_APPLICATION_OPEN).map((r) => r.campground_id)).size,
      campgrounds_with_observed_available: new Set(records.filter((r) => r.state === OBSERVED_AVAILABLE).map((r) => r.campground_id)).size,
      total_active_campgrounds: new Set(records.map((r) => r.campground_id)).size,
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
