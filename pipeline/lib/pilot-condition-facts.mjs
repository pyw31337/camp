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

export function validatePilotConditionFacts(registry) {
  const errors = [];
  if (!registry || typeof registry !== "object") {
    return ["registry must be an object"];
  }

  const camps = registry.pilot_campgrounds;
  if (!Array.isArray(camps) || camps.length === 0) {
    return ["pilot_campgrounds must be a non-empty array"];
  }

  camps.forEach((camp, idx) => {
    const prefix = `camp[${idx}: ${camp?.name ?? camp?.id ?? "unknown"}]`;
    if (!camp.id) errors.push(`${prefix} missing id`);
    if (!camp.name) errors.push(`${prefix} missing name`);
    if (!camp.region) errors.push(`${prefix} missing region`);

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
      camp.zones.forEach((zone, zIdx) => {
        const zPrefix = `${prefix}.zone[${zIdx}: ${zone?.name}]`;
        if (!zone.name) errors.push(`${zPrefix} missing name`);
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
      });
    }

    // Evidence
    const ev = camp.evidence;
    if (!ev || typeof ev !== "object") {
      errors.push(`${prefix} missing evidence`);
    } else {
      if (!ev.source_url) errors.push(`${prefix} evidence missing source_url`);
      if (!ev.observed_at) errors.push(`${prefix} evidence missing observed_at`);
      if (ev.verification_status !== "VERIFIED") {
        errors.push(`${prefix} evidence verification_status must be VERIFIED`);
      }
    }
  });

  return errors;
}
