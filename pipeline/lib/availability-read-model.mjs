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

export const OBSERVATION_APPROVALS = new Set(["APPROVED_LIVE", "APPROVED_OBSERVATION"]);
const OBSERVATION_STATES = new Set([OBSERVED_AVAILABLE, OBSERVED_UNAVAILABLE, OBSERVATION_FAILED]);

const plusDaysKst = (dateStr, days) => {
  const [y, m, d] = dateStr.slice(0, 10).split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d + days)).toISOString().slice(0, 10);
};

// 사용자 노출 만료는 원천이 준 값과 기본 TTL 중 더 이른 쪽이다(오래된 관측을 늘려 보이지 않게).
function observationExpiresAt(obs, ttlMinutes) {
  const cap = plusMinutes(iso(obs.observed_at), ttlMinutes);
  const given = iso(obs.expires_at);
  return given && Date.parse(given) < Date.parse(cap) ? given : cap;
}

/** 관측 제출 계약(PILOT_INTAKE_CONTRACT 6절)을 어기면 이유를, 지키면 null을 돌려준다. */
export function observationRejectReason(obs, { catalogIds = null, observationTtlMinutes = DEFAULT_OBSERVATION_TTL_MINUTES } = {}) {
  if (!obs || typeof obs !== "object") return "invalid_record";
  if (!OBSERVATION_STATES.has(obs.state)) return "unknown_state";
  if (!obs.campground_id) return "missing_campground";
  if (catalogIds && !catalogIds.has(String(obs.campground_id))) return "campground_not_in_catalog";
  if (!/^\d{4}-\d{2}-\d{2}/.test(String(obs.target_date ?? ""))) return "missing_target_date";
  if (!iso(obs.observed_at)) return "missing_observed_at";
  if (!OBSERVATION_APPROVALS.has(obs.source_approval)) return "source_not_approved";
  if (!obs.provider) return "missing_provider";
  if (!/^https:\/\/[^/\s]+\.[^/\s]+/.test(String(obs.source_url ?? ""))) return "missing_source_url";
  if (!obs.evidence_ref) return "missing_evidence";
  const nights = Number(obs.stay_nights ?? 1);
  if (!Number.isInteger(nights) || nights < 1) return "invalid_stay_nights";
  if (!(observationTtlMinutes > 0)) return "invalid_ttl";
  return null;
}

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

  // 2. 최근 빈자리 관측 (PILOT_INTAKE_CONTRACT 6절)
  // 관측은 “특정 시각에, 특정 조건으로, 어느 상품에서 무엇을 봤는가”다. 근거가 빠진 관측은
  // 화면에 내보내지 않고 rejected로만 센다. 관측 시각을 실행 시각으로 채우거나, 승인되지
  // 않은 원천의 잔여 수량을 그대로 노출하지 않는다.
  const rawObservations = Array.isArray(observationsPayload)
    ? observationsPayload
    : Array.isArray(observationsPayload?.observations)
    ? observationsPayload.observations
    : [];
  const catalogIds = Array.isArray(campgrounds) && campgrounds.length
    ? new Set(campgrounds.map((c) => String(c?.id)))
    : null;
  const rejected = [];
  const accepted = [];
  for (const obs of rawObservations) {
    const reason = observationRejectReason(obs, { catalogIds, observationTtlMinutes });
    if (reason) rejected.push({ id: obs?.id ?? null, reason });
    else accepted.push(obs);
  }

  // (campground_id + target_date + stay_nights + product_name) 단위로 최신 관측을 판정한다.
  const obsGroups = new Map();
  for (const obs of accepted) {
    const key = [obs.campground_id, String(obs.target_date).slice(0, 10), Number(obs.stay_nights ?? 1), obs.product_name ?? ""].join("::");
    if (!obsGroups.has(key)) obsGroups.set(key, []);
    obsGroups.get(key).push(obs);
  }

  let observedAvailableCount = 0;
  let observedUnavailableCount = 0;
  let observationFailedCount = 0;
  const nowMs = Date.parse(generated_at);
  const todayKstStr = new Date(nowMs + 9 * 60 * 60 * 1000).toISOString().slice(0, 10);

  for (const obsList of obsGroups.values()) {
    obsList.sort((a, b) => Date.parse(b.observed_at) - Date.parse(a.observed_at));
    // 관측 실패는 이전 정상 관측을 지우지 않는다. 마지막 정상 관측의 만료가 지나가게 둔다.
    observationFailedCount += obsList.filter((o) => o.state === OBSERVATION_FAILED).length;
    const latest = obsList.find((o) => o.state === OBSERVED_AVAILABLE || o.state === OBSERVED_UNAVAILABLE);
    if (!latest) continue;
    const targetDateStr = String(latest.target_date).slice(0, 10);
    if (targetDateStr < todayKstStr) continue;
    const obsAt = iso(latest.observed_at);
    const expAt = observationExpiresAt(latest, observationTtlMinutes);
    if (Date.parse(expAt) < nowMs) continue;

    if (latest.state === OBSERVED_UNAVAILABLE) {
      observedUnavailableCount++;
      continue;
    }

    observedAvailableCount++;
    const stayNights = Number(latest.stay_nights ?? 1);
    const live = latest.source_approval === "APPROVED_LIVE" && latest.inventory_verified === true;
    records.push({
      id: latest.id ?? `obs:${latest.campground_id}:${targetDateStr}:${latest.product_name ?? "site"}`,
      campground_id: String(latest.campground_id),
      provider: latest.provider,
      state: OBSERVED_AVAILABLE,
      product_name: latest.product_name ?? "캠핑 사이트",
      status_text: "빈자리 관측",
      target_date: targetDateStr,
      stay_nights: stayNights,
      guest_capacity: latest.guest_capacity ?? null,
      receipt: null,
      use: { from: `${targetDateStr}T00:00:00+09:00`, to: `${plusDaysKst(targetDateStr, stayNights)}T00:00:00+09:00` },
      source_url: latest.source_url,
      dataset_url: latest.dataset_url ?? null,
      source_tier: latest.source_tier ?? "A",
      source_approval: latest.source_approval,
      evidence_ref: latest.evidence_ref,
      observed_at: obsAt,
      expires_at: expAt,
      match_confidence: latest.match_confidence ?? 1.0,
      // 수량은 실시간 재고 계약(APPROVED_LIVE)으로 확인된 경우에만 보인다.
      remaining_count: live && latest.remaining_count != null ? Number(latest.remaining_count) : null,
      inventory_verified: live,
    });
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
    scope: accepted.length > 0 ? "OFFICIAL_APPLICATION_AND_OBSERVATION" : "OFFICIAL_APPLICATION_STATUS",
    label: accepted.length > 0 ? "최근 빈자리 관측 및 공식 접수" : "공식 접수 중",
    disclaimer: accepted.length > 0
      ? "공식 API 및 허용된 원천의 최근 빈자리 관측 및 접수 상태입니다. 남은 사이트 수·결제 확정은 예약처에서 최종 확인해야 합니다."
      : "서울 공공서비스예약 Open API의 접수 상태입니다. 남은 사이트 수·특정 날짜의 결제 확정은 예약처에서 최종 확인해야 합니다.",
    source: {
      id: accepted.length > 0 ? "moyeora-availability" : "seoul-yeyak",
      name: accepted.length > 0 ? "공공 예약 및 허용 원천 관측" : "서울시 공공서비스예약 정보",
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
      observation_failed: observationFailedCount,
      observations_rejected: rejected.length,
      campgrounds_with_open_application: new Set(records.filter((r) => r.state === OFFICIAL_APPLICATION_OPEN).map((r) => r.campground_id)).size,
      campgrounds_with_observed_available: new Set(records.filter((r) => r.state === OBSERVED_AVAILABLE).map((r) => r.campground_id)).size,
      total_active_campgrounds: new Set(records.map((r) => r.campground_id)).size,
      unmatched_services: Math.max(0, services.length - [...matched.values()].reduce((count, items) => count + items.length, 0)),
    },
    rejected_observations: rejected,
    records,
  };
}

export function isFreshAvailabilityReadModel(model, now = new Date()) {
  const expires = Date.parse(model?.expires_at ?? "");
  const at = now instanceof Date ? now.getTime() : Date.parse(now);
  return Number.isFinite(expires) && Number.isFinite(at) && expires >= at;
}
