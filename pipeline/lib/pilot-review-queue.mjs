import { REQUIRED_PILOT_FIELD_CODES } from "./pilot-condition-facts.mjs";

const VALID_QUEUE_STATUSES = new Set(["QUEUED", "IN_REVIEW", "BLOCKED", "REJECTED", "PROMOTED"]);
const validHttpsUrl = (value) => {
  try { return new URL(String(value)).protocol === "https:"; } catch { return false; }
};

/**
 * 검수 대기열은 조건 사실이 아니다. 여기에는 공식 원문으로 사람이 대조할 후보와
 * 필요한 항목만 적고, 검증 완료 전에는 탐색 데이터·조건 필터에 합치지 않는다.
 */
export function validatePilotReviewQueue(queue) {
  const errors = [];
  if (!queue || typeof queue !== "object") return ["review queue must be an object"];
  if (!Array.isArray(queue.candidates) || !queue.candidates.length) return ["candidates must be a non-empty array"];
  const ids = new Set();
  const gocampingIds = new Set();
  for (const [index, candidate] of queue.candidates.entries()) {
    const prefix = `candidate[${index}: ${candidate?.name ?? candidate?.id ?? "unknown"}]`;
    if (!candidate?.id) errors.push(`${prefix} missing id`);
    else if (ids.has(candidate.id)) errors.push(`${prefix} duplicate id "${candidate.id}"`);
    else ids.add(candidate.id);
    if (!candidate?.name) errors.push(`${prefix} missing name`);
    if (!candidate?.region) errors.push(`${prefix} missing region`);
    if (!candidate?.gocamping_id) errors.push(`${prefix} missing gocamping_id`);
    else if (gocampingIds.has(String(candidate.gocamping_id))) errors.push(`${prefix} duplicate gocamping_id`);
    else gocampingIds.add(String(candidate.gocamping_id));
    if (!VALID_QUEUE_STATUSES.has(candidate?.status)) errors.push(`${prefix} invalid status "${candidate?.status}"`);
    if (candidate?.source?.approval_status !== "MANUAL_REVIEW_ONLY") {
      errors.push(`${prefix} source approval_status must be MANUAL_REVIEW_ONLY`);
    }
    if (!validHttpsUrl(candidate?.source?.official_url)) errors.push(`${prefix} source official_url must be HTTPS`);
    if (!validHttpsUrl(candidate?.source?.catalog_url)) errors.push(`${prefix} source catalog_url must be HTTPS`);
    const required = candidate?.required_field_codes;
    if (!Array.isArray(required)) errors.push(`${prefix} missing required_field_codes`);
    else {
      const missing = REQUIRED_PILOT_FIELD_CODES.filter((code) => !required.includes(code));
      if (missing.length) errors.push(`${prefix} missing core review fields: ${missing.join(", ")}`);
    }
    if (Object.hasOwn(candidate ?? {}, "condition_facts")) errors.push(`${prefix} review queue must not contain condition_facts`);
  }
  return errors;
}
