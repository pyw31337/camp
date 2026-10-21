// 데이터 누적 병합 정책(소유자 2026-10-21 지시) — 모든 수집기·에이전트가 공유 데이터에 쓸 때 이 모듈을 거친다.
// 우선순위: ① 채우기(빈 칸만 채우고, 빈 값·더 적은 항목으로 바꾸지 않는다) ② 덮어쓰기는 더 최신·더 믿을 만할 때만,
// 옛 값은 이력으로 남긴다 ③ 항목 이름표에 논리적으로 맞는지 검사(맞지 않으면 격리) ④ 서비스 표기로 정제.
// 기존 출처 표기를 그대로 쓴다: 사실 저장소 등급(VERIFIED·OPERATOR·CONFIRMED·MENTION)·원천 코드(src)·
// field_conditions.source.tier(A/B/C)·checked_at/확인일(at). 새 출처 구조를 만들지 않는다. 문서: docs/DATA_MERGE_POLICY.md

/** 사실 저장소 등급(docs/FACT_STORE.md §3) → 점수 */
export const GRADE_RANK = { VERIFIED: 4, OPERATOR: 3, CONFIRMED: 2, MENTION: 1 };
/** 원천 코드 → 등급(사실 저장소와 같은 표). 모르는 원천은 MENTION 취급. */
export const SRC_GRADE = {
  pilot_verified: "VERIFIED", manual: "VERIFIED", owner: "VERIFIED", operator_submission: "VERIFIED",
  operator_homepage: "OPERATOR", operator_discovered: "OPERATOR", booking_engine: "OPERATOR", official_api: "OPERATOR",
  gocamping: "CONFIRMED", gocamping_intro: "CONFIRMED", gocamping_detail: "CONFIRMED", kakao_local: "CONFIRMED",
  localdata: "CONFIRMED", public_data: "CONFIRMED", urban_parks: "CONFIRMED", tour_api: "CONFIRMED",
  osm: "MENTION", review_search: "MENTION", kakao_web: "MENTION", naver_search: "MENTION", social: "MENTION",
};
const TIER_RANK = { A: 3, B: 2, C: 1 }; // field_conditions.source.tier

/** 출처 점수: {grade}|{src}|{tier} 중 아는 것 */
export function trustRank(p = {}) {
  if (p.grade && GRADE_RANK[p.grade]) return GRADE_RANK[p.grade];
  if (p.src && SRC_GRADE[p.src]) return GRADE_RANK[SRC_GRADE[p.src]];
  if (p.tier && TIER_RANK[p.tier]) return TIER_RANK[p.tier] + 0.5 - 1; // A≈2.5, B≈1.5, C≈0.5
  return 0;
}

export function isEmpty(v) {
  if (v === null || v === undefined) return true;
  if (typeof v === "string") return v.trim() === "" || /^(-|없음|null|undefined|N\/A)$/i.test(v.trim());
  if (Array.isArray(v)) return v.length === 0 || v.every(isEmpty);
  if (typeof v === "number") return Number.isNaN(v);
  if (typeof v === "object") return Object.values(v).every(isEmpty);
  return false;
}

/** 값의 "양" — 배열은 비어 있지 않은 항목 수, 객체는 비어 있지 않은 키 수 */
export function amount(v) {
  if (isEmpty(v)) return 0;
  if (Array.isArray(v)) return v.filter((x) => !isEmpty(x)).length;
  if (typeof v === "object") return Object.values(v).filter((x) => !isEmpty(x)).length;
  return 1;
}

const toTime = (s) => { const t = Date.parse(String(s ?? "")); return Number.isFinite(t) ? t : 0; };
const itemKey = (x) => (x && typeof x === "object" ? (x.url ?? x.id ?? x.cid ?? x.src ?? JSON.stringify(x)) : JSON.stringify(x));

// ───────── ③ 논리 검사 ─────────
const KR = { lat: [33.0, 38.7], lng: [124.5, 131.0] };
const JEJU = (lat) => lat < 33.7;
/** 시도별 대략 위도 범위 — 좌표와 시도가 크게 어긋나는 것(예: 의령 야영장이 제주 좌표)만 잡는다 */
const SIDO_LAT = { 제주: [33.0, 33.7], 서울: [37.4, 37.75], 부산: [34.9, 35.45], 강원: [37.0, 38.7], 경남: [34.5, 35.95], 전남: [33.9, 35.5] };

export function sidoShort(s) {
  const t = String(s ?? "").trim();
  if (!t) return t;
  const map = [["충청북", "충북"], ["충청남", "충남"], ["전라북", "전북"], ["전북특별", "전북"], ["전라남", "전남"], ["경상북", "경북"], ["경상남", "경남"]];
  for (const [a, b] of map) if (t.startsWith(a)) return b;
  return t.replace(/(특별자치시|특별자치도|특별시|광역시|도)$/, "").slice(0, 2);
}

/**
 * 값 하나를 항목 이름표에 비춰 검사한다. 문제가 있으면 이유 문자열, 없으면 null.
 * @param {string} field 필드 경로(예: "lat", "fee.min", "sido")
 */
export function validateField(field, value, record = {}) {
  if (isEmpty(value)) return null;
  const leaf = field.split(".").pop();
  if (leaf === "lat" && !(value >= KR.lat[0] && value <= KR.lat[1])) return `위도 범위 밖(${value})`;
  if (leaf === "lng" && !(value >= KR.lng[0] && value <= KR.lng[1])) return `경도 범위 밖(${value})`;
  if (leaf === "lat" && record.sido) {
    const r = SIDO_LAT[sidoShort(record.sido)];
    if (r && (value < r[0] - 0.15 || value > r[1] + 0.15)) return `좌표(${value})가 시도(${record.sido})와 맞지 않음`;
    if (!r && JEJU(value)) return `제주 좌표인데 시도가 ${record.sido}`;
  }
  if (/^(min|max|won|fee|price)$/.test(leaf) && typeof value === "number") {
    if (value < 0 || value > 2_000_000) return `요금 범위 밖(${value})`;
  }
  if (leaf === "fee" && value && typeof value === "object" && Number(value.min) > 0 && Number(value.max) > 0 && Number(value.min) > Number(value.max)) return `최저가(${value.min}) > 최고가(${value.max})`;
  if (leaf === "tel" && typeof value === "string" && !/^[0-9+()\-\s~,./]{7,}$/.test(value)) return `전화번호 형식 아님(${value})`;
  if (/^(homepage|url|resveUrl|booking)$/.test(leaf) && typeof value === "string" && !/^https?:\/\//.test(value)) return `URL 형식 아님(${value})`;
  if (/(_at|checked_at|확인일)$/.test(leaf) && typeof value === "string" && toTime(value) > Date.now() + 2 * 86400e3) return `미래 시각(${value})`;
  return null;
}

/** 레코드 단위 교차 검사(요금↔‘가격 부담’, 겨울 휴장↔겨울 운영 등). 문제 목록. */
export function crossCheck(rec = {}) {
  const out = [];
  const fee = Number(rec?.fee?.min);
  const cons = (rec?.digest?.cons ?? rec?.cons ?? []).map((x) => (Array.isArray(x) ? x[0] : x));
  if (fee > 0 && fee < 40000 && cons.includes("가격 부담")) out.push(`1박 ${fee}원인데 ‘가격 부담’`);
  if (rec?.winter === true && rec?.winterClosed === true) out.push("겨울 운영과 동계 휴장이 동시에 표시");
  if (typeof rec.lat === "number") { const r = validateField("lat", rec.lat, rec); if (r) out.push(r); }
  return out;
}

// ───────── ④ 정제 ─────────
const UNIT_FIX = [[/(\d)\s*와트/g, "$1W"], [/(\d)\s*w\b/g, "$1W"], [/(\d)\s*키로와트/g, "$1kW"], [/\s{2,}/g, " "]];
/**
 * 서비스 표기로 정제한다. sidoStyle은 기존 데이터의 표기("short"|"long")를 따른다(기존 형식을 바꾸지 않는다).
 */
export function normalizeField(field, value, { sidoStyle } = {}) {
  if (typeof value !== "string") return value;
  let v = value.replace(/\u00a0/g, " ").trim();
  const leaf = field.split(".").pop();
  if (leaf === "sido" && sidoStyle === "short") v = sidoShort(v);
  if (leaf === "tel") v = v.replace(/\s+/g, "").replace(/^(\d{2,4})\)/, "$1-");
  if (/^(homepage|url)$/.test(leaf) && /^www\./.test(v)) v = `http://${v}`;
  for (const [re, to] of UNIT_FIX) v = v.replace(re, to);
  return v;
}

// ───────── ①② 병합 ─────────
/**
 * 값 하나를 병합한다.
 * @param {*} oldV 기존 값  @param {*} newV 새 값
 * @param {{field?:string, old?:{grade?,src?,tier?,at?}, next?:{grade?,src?,tier?,at?}, record?:object, sidoStyle?:string}} ctx
 * @returns {{value:*, action:"keep"|"fill"|"overwrite"|"union"|"reject", reason?:string, previous?:*}}
 */
export function mergeValue(oldV, newV, ctx = {}) {
  const field = ctx.field ?? "";
  if (isEmpty(newV)) return { value: oldV, action: "keep", reason: "새 값이 비어 있음(지우지 않음)" };
  newV = normalizeField(field, newV, ctx);
  const bad = validateField(field, newV, ctx.record);
  if (bad) return { value: oldV, action: "reject", reason: bad };
  if (isEmpty(oldV)) return { value: newV, action: "fill" };
  if (JSON.stringify(oldV) === JSON.stringify(newV)) return { value: oldV, action: "keep" };
  if (Array.isArray(oldV) && Array.isArray(newV)) {
    const m = new Map(oldV.map((x) => [itemKey(x), x]));
    let added = 0;
    for (const x of newV) { const k = itemKey(x); if (!m.has(k)) added++; m.set(k, m.has(k) && typeof x === "object" ? { ...m.get(k), ...stripEmpty(x) } : x); }
    return { value: [...m.values()], action: added ? "union" : "keep" };
  }
  if (isPlain(oldV) && isPlain(newV)) {
    const out = mergeRecord(oldV, newV, ctx);
    return { value: out.record, action: out.changes.length ? "union" : "keep", changes: out.changes };
  }
  // 형식이 다르면(묶음·목록 → 단일 값 등) 더 풍부한 기존 구조를 단일 값으로 바꾸지 않는다(줄어듦 금지).
  if ((typeof oldV === "object") !== (typeof newV === "object")) return { value: oldV, action: "keep", reason: "형식이 다름(단일 값↔묶음) — 기존 유지, 검토 필요" };
  if (typeof oldV === "object" && ( Array.isArray(oldV) !== Array.isArray(newV) || amount(newV) < amount(oldV)))
    return { value: oldV, action: "keep", reason: "기존 값이 더 풍부한 다른 형식(덮으면 줄어듦)" };
  const ro = trustRank(ctx.old), rn = trustRank(ctx.next);
  const to = toTime(ctx.old?.at), tn = toTime(ctx.next?.at);
  if (rn > ro) return { value: newV, action: "overwrite", reason: `더 믿을 만한 출처(${rn}>${ro})`, previous: oldV };
  if (rn === ro && tn > to) return { value: newV, action: "overwrite", reason: `같은 등급·더 최근 확인(${ctx.next?.at})`, previous: oldV };
  return { value: oldV, action: "keep", reason: rn < ro ? `기존 출처가 더 믿을 만함(${ro}>${rn})` : "새 값이 더 최근이라는 근거 없음" };
}

const isPlain = (x) => x && typeof x === "object" && !Array.isArray(x);
function stripEmpty(o) { const r = {}; for (const [k, v] of Object.entries(o)) if (!isEmpty(v)) r[k] = v; return r; }

/**
 * 레코드(객체) 병합 — 키마다 mergeValue. 기존 키는 절대 사라지지 않는다.
 * @returns {{record:object, changes:Array<{field,action,reason?,previous?,value?}>}}
 */
export function mergeRecord(oldR = {}, newR = {}, ctx = {}) {
  const record = { ...(oldR ?? {}) };
  const changes = [];
  const prefix = ctx.field ? `${ctx.field}.` : "";
  for (const [k, nv] of Object.entries(newR ?? {})) {
    const r = mergeValue(record[k], nv, { ...ctx, field: prefix + k, record: ctx.record ?? { ...oldR, ...stripEmpty(newR ?? {}) } });
    if (r.changes) changes.push(...r.changes);
    else if (r.action !== "keep" || r.reason?.startsWith("기존")) changes.push({ field: prefix + k, action: r.action, reason: r.reason, previous: r.previous, value: r.action === "reject" ? nv : undefined });
    record[k] = r.value;
  }
  return { record, changes };
}

// ───────── 발행 전 손실 검사(필드 단위 no-shrink) ─────────
/** 레코드를 잎 경로 → 양(amount)으로 편다. 배열은 한 잎(항목 수)으로 본다. */
export function leafAmounts(o, prefix = "", out = {}, depth = 0) {
  if (isPlain(o) && depth < 4) { for (const [k, v] of Object.entries(o)) leafAmounts(v, prefix ? `${prefix}.${k}` : k, out, depth + 1); return out; }
  out[prefix] = amount(o);
  return out;
}

/**
 * 기존 레코드 대비 새 레코드에서 사라지거나 줄어든 잎 목록.
 * @param {(field:string)=>boolean} [isVolatile] 원래 매번 바뀌는(예보·실시간) 필드
 */
export function recordLosses(oldR, newR, isVolatile = () => false) {
  const a = leafAmounts(oldR), b = leafAmounts(newR ?? {});
  const out = [];
  for (const [f, n] of Object.entries(a)) {
    if (!n || isVolatile(f)) continue;
    const m = b[f] ?? 0;
    if (m < n) out.push({ field: f, before: n, after: m });
  }
  return out;
}

// ───────── 쓰기 도우미(수집기용) ─────────
/** 빈 값은 건너뛰고 덮는 Object.assign — `{...old, ...rec}` 대신 쓴다(빈 값으로 기존 값을 지우지 않게). */
export function assignNonEmpty(target, src) {
  for (const [k, v] of Object.entries(src ?? {})) if (!isEmpty(v)) target[k] = v;
  return target;
}

/**
 * 목록 병합(ctx는 객체 또는 (old,new)=>ctx): 기존 항목은 사라지지 않고(새 목록에 없으면 그대로 둔다), 같은 키는 mergeRecord로 합친다.
 * @returns {{list:object[], changes:object[]}}
 */
export function mergeList(oldList = [], newList = [], key, ctx = {}) {
  const out = oldList.map((x) => x);
  const idx = new Map(out.map((x, i) => [String(key(x)), i]));
  const changes = [];
  for (const n of newList) {
    const k = String(key(n));
    if (!idx.has(k)) { out.push(n); idx.set(k, out.length - 1); changes.push({ id: k, action: "add" }); continue; }
    const r = mergeRecord(out[idx.get(k)], n, typeof ctx === "function" ? ctx(out[idx.get(k)], n) : ctx);
    out[idx.get(k)] = r.record;
    for (const c of r.changes) changes.push({ id: k, ...c });
  }
  return { list: out, changes };
}

import { appendFileSync as _append } from "node:fs";
import { fileURLToPath as _f2p } from "node:url";
export const REVIEW_LOG_PATH = _f2p(new URL("../registry/merge-review.ndjson", import.meta.url));
/**
 * 검토 기록(append-only)에 한 줄 남긴다. action: removed(정당한 삭제 — field-guard가 통과시킴, reason 필수)·
 * rejected/quarantined(논리 검사 실패로 격리)·superseded(더 최신 값으로 교체, previous 보관)·restored.
 */
export function logReview(entry, path = REVIEW_LOG_PATH) {
  if (entry.action === "removed" && String(entry.reason ?? "").trim().length < 4) throw new Error("removed 기록에는 reason이 필요합니다");
  _append(path, JSON.stringify({ at: new Date().toISOString(), by: process.env.GITHUB_WORKFLOW ?? "local", ...entry }) + "\n");
}
