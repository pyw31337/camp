/**
 * Validates pilot condition facts against the schema specified in
 * docs/SERVICE_REINVENTION_PLAN.md (Section 4 & Section 7).
 */

const VALID_PARKING_MODES = new Set([
  "SITE_ADJACENT",
  "SHARED_NEARBY",
  "DROP_OFF_EXTERNAL",
  "CART_REQUIRED"
]);

const VALID_SURFACES = new Set([
  "DECK",
  "GRAVEL",
  "GRASS",
  "SOIL",
  "MIXED"
]);

const VALID_PERMISSION = new Set([
  "ALLOWED",
  "PROHIBITED",
  "DESIGNATED_ONLY",
  "UNKNOWN"
]);

// 파일럿에서만 쓰는 ‘깊이 검증’의 최소 근거다. 전국 카탈로그의 키워드/분류
// 추출값(SURVEYED)과 섞지 않는다. 각각은 원문 URL과 사람이 확인한 날짜를
// 반드시 공유해야 한다.
export const REQUIRED_PILOT_FIELD_CODES = [
  "PARKING_MODE",
  "POWER_MAX_W",
  "SITE_SURFACE",
  "SITE_SIZE",
  "FIREWOOD_ALLOWED",
  "CHARCOAL_ALLOWED",
  "SHELTER_SETUP_RULE",
  "SANITARY_TYPE_COUNT"
];

const VALID_SOURCE_TYPES = new Set([
  "OPERATOR_OFFICIAL_PAGE",
  "APPROVED_PUBLIC_PROVIDER_PAGE",
  "OPERATOR_CONFIRMED",
  "MANUAL_PRIMARY_PAGE_REVIEW"
]);

const parseDate = (value) => {
  const timestamp = Date.parse(String(value ?? ""));
  return Number.isFinite(timestamp) ? timestamp : null;
};

export function validatePilotConditionFacts(registry) {
  const errors = [];
  if (!registry || typeof registry !== "object") {
    return ["registry must be an object"];
  }

  const camps = registry.pilot_campgrounds;
  if (!Array.isArray(camps) || camps.length === 0) {
    return ["pilot_campgrounds must be a non-empty array"];
  }

  const campIds = new Set();
  const gocampingIds = new Set();
  camps.forEach((camp, idx) => {
    const prefix = `camp[${idx}: ${camp?.name ?? camp?.id ?? "unknown"}]`;
    if (!camp.id) errors.push(`${prefix} missing id`);
    else if (campIds.has(camp.id)) errors.push(`${prefix} duplicate id "${camp.id}"`);
    else campIds.add(camp.id);
    if (!camp.name) errors.push(`${prefix} missing name`);
    if (!camp.region) errors.push(`${prefix} missing region`);
    if (camp.gocamping_id) {
      const gocampingId = String(camp.gocamping_id);
      if (gocampingIds.has(gocampingId)) errors.push(`${prefix} duplicate gocamping_id "${gocampingId}"`);
      else gocampingIds.add(gocampingId);
    }

    // Parking mode
    if (!VALID_PARKING_MODES.has(camp.parking_mode)) {
      errors.push(`${prefix} invalid parking_mode "${camp.parking_mode}"`);
    }

    // Power
    if (typeof camp.power_max_w !== "number" || camp.power_max_w <= 0) {
      errors.push(`${prefix} power_max_w must be a positive integer`);
    }

    // Firewood & Charcoal
    if (!VALID_PERMISSION.has(camp.firewood_allowed)) {
      errors.push(`${prefix} invalid firewood_allowed "${camp.firewood_allowed}"`);
    }
    if (!VALID_PERMISSION.has(camp.charcoal_allowed)) {
      errors.push(`${prefix} invalid charcoal_allowed "${camp.charcoal_allowed}"`);
    }

    // Zones detail
    if (!Array.isArray(camp.zones) || camp.zones.length === 0) {
      errors.push(`${prefix} zones must be a non-empty array`);
    } else {
      const zoneNames = new Set();
      camp.zones.forEach((zone, zIdx) => {
        const zPrefix = `${prefix}.zone[${zIdx}: ${zone?.name}]`;
        if (!zone.name) errors.push(`${zPrefix} missing name`);
        else if (zoneNames.has(zone.name)) errors.push(`${zPrefix} duplicate zone name`);
        else zoneNames.add(zone.name);
        if (typeof zone.size_w !== "number" || zone.size_w <= 0) {
          errors.push(`${zPrefix} size_w must be > 0`);
        }
        if (typeof zone.size_h !== "number" || zone.size_h <= 0) {
          errors.push(`${zPrefix} size_h must be > 0`);
        }
        if (!VALID_SURFACES.has(zone.surface)) {
          errors.push(`${zPrefix} invalid surface "${zone.surface}"`);
        }
        if (!VALID_PARKING_MODES.has(zone.parking)) {
          errors.push(`${zPrefix} invalid parking "${zone.parking}"`);
        }
        if (!Number.isInteger(zone.site_count) || zone.site_count <= 0) {
          errors.push(`${zPrefix} site_count must be a positive integer`);
        }
      });
    }

    // Evidence
    const ev = camp.evidence;
    if (!ev || typeof ev !== "object") {
      errors.push(`${prefix} missing evidence`);
    } else {
      if (!ev.source_url) errors.push(`${prefix} evidence missing source_url`);
      if (!ev.observed_at) errors.push(`${prefix} evidence missing observed_at`);
      if (ev.source_url && !/^https:\/\//.test(ev.source_url)) {
        errors.push(`${prefix} evidence source_url must be HTTPS`);
      }
      const observedAt = parseDate(ev.observed_at);
      if (!observedAt) errors.push(`${prefix} evidence observed_at must be an ISO date`);
      if (ev.verification_status !== "VERIFIED") {
        errors.push(`${prefix} evidence verification_status must be VERIFIED`);
      }
      if (!VALID_SOURCE_TYPES.has(ev.source_type)) {
        errors.push(`${prefix} evidence invalid source_type "${ev.source_type}"`);
      }
      if (!String(ev.reviewer ?? "").trim()) errors.push(`${prefix} evidence missing reviewer`);
      if (!Array.isArray(ev.reviewed_field_codes)) {
        errors.push(`${prefix} evidence missing reviewed_field_codes`);
      } else {
        const missing = REQUIRED_PILOT_FIELD_CODES.filter((code) => !ev.reviewed_field_codes.includes(code));
        if (missing.length) errors.push(`${prefix} evidence missing core field coverage: ${missing.join(", ")}`);
      }
      const dueAt = parseDate(ev.next_review_due_at);
      if (!dueAt) {
        errors.push(`${prefix} evidence next_review_due_at must be an ISO date`);
      } else if (observedAt && dueAt <= observedAt) {
        errors.push(`${prefix} evidence next_review_due_at must be after observed_at`);
      } else if (observedAt && dueAt - observedAt > 180 * 24 * 60 * 60 * 1000) {
        errors.push(`${prefix} evidence next_review_due_at must be within 180 days`);
      }
    }
  });

  return errors;
}
