// 운영자 셀프 등록 — 제출 값 정리(화면·파이프라인 공통 규칙). 순수 함수.
export const FORM_FIELDS = {
  CHECKIN_TIME: { label: "입실 시각", type: "time" },
  CHECKOUT_TIME: { label: "퇴실 시각", type: "time" },
  MANNER_TIME: { label: "매너타임", type: "text", max: 60 },
  PRICE_NIGHT: { label: "1박 사이트 요금(원, 가장 일반적인 사이트)", type: "krw" },
  PET_POLICY: { label: "반려동물 동반", type: "enum", values: { ALLOWED: "동반 가능", SMALL_ONLY: "소형견만", ZONE_ONLY: "지정 구역만", NOT_ALLOWED: "동반 불가" } },
  HOMEPAGE: { label: "공식 홈페이지", type: "url" },
  REFUND_POLICY: { label: "취소·환불 규정", type: "text", max: 300 },
  EXTRA_PERSON_FEE: { label: "인원 추가 요금", type: "text", max: 120 },
};
const clean = (s, max = 300) => String(s ?? "").replace(/[\u0000-\u001f]+/g, " ").replace(/\s+/g, " ").trim().slice(0, max);
/** 값 하나 검사·정규화. 틀리면 null */
export function normalizeField(code, raw) {
  const f = FORM_FIELDS[code];
  const v = clean(raw, f?.max ?? 300);
  if (!f || !v) return null;
  if (f.type === "time") { const m = v.match(/^([01]?\d|2[0-3])\s*[:시]\s*([0-5]\d)?/); return m ? `${m[1].padStart(2, "0")}:${m[2] ?? "00"}` : null; }
  if (f.type === "krw") { const n = Number(v.replace(/[^\d]/g, "")); return n >= 1000 && n <= 2000000 ? n : null; }
  if (f.type === "enum") return f.values[v] ? v : null;
  if (f.type === "url") { try { const u = new URL(v); return /^https?:$/.test(u.protocol) ? u.href : null; } catch { return null; } }
  return v;
}
export function normalizeFields(obj = {}) {
  const out = {};
  for (const code of Object.keys(FORM_FIELDS)) { const v = normalizeField(code, obj[code]); if (v != null) out[code] = v; }
  return out;
}
/** 승인된 행 → 공개 registry 항목(연락처·제출자 이름 제외) */
export function publicItem(row) {
  if (row?.status !== "APPROVED" || row.kind !== "UPDATE" || !row.campground_id) return null;
  const fields = normalizeFields(row.fields ?? {});
  if (!Object.keys(fields).length) return null;
  let evidence = null;
  try { const u = new URL(row.evidence_url ?? ""); if (/^https?:$/.test(u.protocol)) evidence = u.href; } catch { /* 근거 없음 */ }
  return { id: Number(row.id), cid: String(row.campground_id), at: new Date(row.reviewed_at ?? row.created_at).toISOString(), role: row.submitter_role, evidence, fields };
}
/** registry 항목 → 사실 행(OPERATOR 등급, 원천 operator_form). 같은 캠핑장·속성은 가장 최근 승인만 */
export function operatorFormFacts(items = [], pageUrl = (cid) => `https://pyw31337.github.io/camp/place/${cid}/`) {
  const latest = new Map();
  for (const it of [...items].sort((a, b) => a.at.localeCompare(b.at))) {
    for (const [attr, value] of Object.entries(it.fields)) latest.set(`${it.cid}|${attr}`, { cid: it.cid, attr, value, grade: "OPERATOR", src: "operator_form", url: it.evidence ?? pageUrl(it.cid), at: it.at, text: `운영자 직접 등록(${it.role === "OWNER" ? "대표" : it.role === "STAFF" ? "직원" : "위탁 운영"}) · 검토 승인` });
  }
  return [...latest.values()];
}
