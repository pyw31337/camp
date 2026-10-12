// 무료 캠프 사이트 판정과 레지스트리 검증.
// 조건(무료·취사·화장실)은 각각 yes / no / unknown으로만 판정하고, 근거 없는 값은 unknown으로 둔다.

const TOILET_MAX_M = 300;
const EVIDENCE_TIERS = new Set(["A", "B", "C", "D"]); // E(커뮤니티)는 사실 근거 불가

const hasEvidence = (site, field) => (site.evidence ?? []).some((e) => e.field === field && EVIDENCE_TIERS.has(e.tier));

/** @param {string} today YYYY-MM-DD (KST) */
export function judgeFreeSite(site, today) {
  const fee = (() => {
    if (site.fee?.free !== true || !hasEvidence(site, "fee")) return site.fee?.free === false ? "no" : "unknown";
    if (site.fee.free_from && today < site.fee.free_from) return "no";
    if (site.fee.free_until && today > site.fee.free_until) return "no";
    return "yes";
  })();
  const cooking = site.cooking?.allowed === true && hasEvidence(site, "cooking") ? "yes" : site.cooking?.allowed === false ? "no" : "unknown";
  const toiletOk = site.toilet?.onsite === true || (Number.isFinite(site.toilet?.nearest_m) && site.toilet.nearest_m <= TOILET_MAX_M);
  const toilet = toiletOk && hasEvidence(site, "toilet") ? "yes" : site.toilet?.onsite === false && site.toilet?.nearest_m == null ? "no" : "unknown";
  const all = [fee, cooking, toilet];
  return {
    fee, cooking, toilet,
    qualifies: all.every((v) => v === "yes"),
    // 하나라도 no면 목록에서 빼고, unknown이 있으면 ‘확인 중’으로 보여 준다.
    display: all.includes("no") ? "HIDE" : all.every((v) => v === "yes") ? "VERIFIED" : "CHECKING",
  };
}

export function validateFreeSites(reg) {
  const errors = [];
  const ids = new Set();
  for (const s of reg.sites ?? []) {
    const w = s.id ?? "(id 없음)";
    if (!s.id) errors.push("site id 누락");
    if (ids.has(s.id)) errors.push(`site id 중복: ${s.id}`);
    ids.add(s.id);
    for (const k of ["name", "region", "operator"]) if (!s[k]) errors.push(`${w}: ${k} 누락`);
    if (typeof s.fee?.free !== "boolean") errors.push(`${w}: fee.free는 true/false`);
    for (const k of ["free_from", "free_until"]) if (s.fee?.[k] != null && !/^\d{4}-\d{2}-\d{2}$/.test(s.fee[k])) errors.push(`${w}: fee.${k}는 YYYY-MM-DD`);
    if (s.cooking?.allowed !== null && typeof s.cooking?.allowed !== "boolean") errors.push(`${w}: cooking.allowed는 true/false/null`);
    if (s.fee?.free === true && !hasEvidence(s, "fee")) errors.push(`${w}: 무료 근거(evidence field=fee) 필요`);
    if (s.cooking?.allowed === true && !hasEvidence(s, "cooking")) errors.push(`${w}: 취사 허용 근거 필요`);
    if ((s.toilet?.onsite === true || s.toilet?.nearest_m != null) && !hasEvidence(s, "toilet")) errors.push(`${w}: 화장실 근거 필요`);
    for (const e of s.evidence ?? []) {
      if (!/^https:\/\//.test(e.url ?? "")) errors.push(`${w}: evidence url은 https`);
      if (!/^\d{4}-\d{2}-\d{2}$/.test(e.checked_at ?? "")) errors.push(`${w}: evidence checked_at은 YYYY-MM-DD`);
      if (e.tier === "E") errors.push(`${w}: E 등급(커뮤니티)은 근거로 쓸 수 없음 — candidates로 옮길 것`);
      else if (!EVIDENCE_TIERS.has(e.tier)) errors.push(`${w}: evidence tier는 A~D`);
    }
  }
  for (const c of reg.candidates ?? []) {
    if (!c.name || !c.found_in || !c.next) errors.push(`후보 ${c.name ?? "(이름 없음)"}: name/found_in/next 필요`);
  }
  return errors;
}
