// 사실 저장소 조회: 사용자 취향·조건을 조합해 캠핑장을 고르고, 왜 맞는지(근거)·무엇을 모르는지(확인필요)를 함께 돌려준다.
// - 조건 1개 = { attr, op, value?, must?, weight? }. op: eq·in·min·max·has·not
// - must 조건이 확인된 값으로 어긋나면 제외, 값이 없으면 ‘확인필요’(unknown)로 남기고 뒤로 보낸다(requireKnown이면 제외).
// - 등급: strict(기본)는 VERIFIED·OPERATOR·CONFIRMED만 근거로 쓰고, lenient는 MENTION(후기 언급)도 쓰되 grade로 표시한다.
// 사용처: 에이전트·화면·CLI(scripts/query-facts.mjs). 입력은 data/facts/*.ndjson 또는 같은 모양의 배열.
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { ATTR, GRADE_RANK } from "./fact-store.mjs";

/** data/facts 디렉터리 → { camps: Map(cid→기준표 행), facts: Map(cid→Map(attr→사실[])) }. 고캠핑 url·at 생략분을 채운다. */
export function loadFactStore(dir, { groups = null } = {}) {
  const lines = (f) => readFileSync(join(dir, f), "utf8").split("\n").filter(Boolean).map((l) => JSON.parse(l));
  const camps = new Map(lines("campgrounds.ndjson").map((r) => [r.cid, r]));
  const files = readdirSync(dir).filter((f) => f.endsWith(".ndjson") && f !== "campgrounds.ndjson" && (!groups || groups.includes(f.replace(/\.ndjson$/, ""))));
  const all = [];
  for (const f of files) for (const x of lines(f)) {
    if (x.src === "gocamping") { const r = camps.get(x.cid); x.url ??= r?.gc_url ?? null; x.at ??= r?.gc_at ?? null; }
    all.push(x);
  }
  return { camps, facts: indexFacts(all) };
}
export const factStoreExists = (dir) => existsSync(join(dir, "manifest.json"));

export function indexFacts(list) {
  const idx = new Map();
  for (const f of list) {
    const m = idx.get(f.cid) ?? idx.set(f.cid, new Map()).get(f.cid);
    (m.get(f.attr) ?? m.set(f.attr, []).get(f.attr)).push(f);
  }
  return idx;
}

/** 한 캠핑장·속성의 결정값: 허용 등급 중 가장 높은 등급의 값들. 같은 등급에서 값이 갈리면 conflict. */
export function resolveFact(list, { minGrade = "CONFIRMED" } = {}) {
  const ok = (list ?? []).filter((f) => GRADE_RANK[f.grade] >= GRADE_RANK[minGrade]);
  if (!ok.length) return null;
  const top = Math.max(...ok.map((f) => GRADE_RANK[f.grade]));
  const best = ok.filter((f) => GRADE_RANK[f.grade] === top);
  const values = [...new Set(best.map((f) => JSON.stringify(f.value)))].map((v) => JSON.parse(v));
  const multi = ATTR.get(best[0].attr)?.multi || ["PRICE_NIGHT", "PRICE_MENTION", "BOOKING_CHANNEL", "SITE_SURFACE", "SITE_SIZE", "RENTAL_ITEM"].includes(best[0].attr);
  const lower = ok.filter((f) => GRADE_RANK[f.grade] < top && !values.some((v) => JSON.stringify(v) === JSON.stringify(f.value)));
  return {
    attr: best[0].attr, values, value: values[0], grade: best[0].grade,
    conflict: !multi && values.length > 1,
    disagrees_below: lower.length ? lower.map((f) => ({ value: f.value, grade: f.grade, src: f.src })) : undefined,
    evidence: best.slice(0, 3).map((f) => ({ src: f.src, url: f.url ?? null, at: f.at ?? null, quote: f.quote ?? null, n: f.n ?? undefined })),
  };
}

/** 조건 하나를 결정값에 대어 본다: true(맞음) · false(어긋남) */
export function test1(cond, r) {
  const vs = r.values;
  const { op, value } = cond;
  if (op === "has") return vs.length > 0;
  if (op === "eq") return vs.some((v) => v === value);
  if (op === "not") return !vs.some((v) => v === value);
  if (op === "in") return vs.some((v) => value.includes(v));
  const nums = vs.map((v) => (typeof v === "string" && /^\d{2}:\d{2}$/.test(v) ? v : Number(v))).filter((v) => v === v);
  if (!nums.length) return false;
  // 시각(HH:MM)은 문자열 비교, 숫자는 수 비교. min: 하나라도 ≥, max: 하나라도 ≤(요금처럼 여러 값이면 가장 싼 값 기준)
  if (op === "min") return nums.some((v) => v >= value);
  if (op === "max") return nums.some((v) => v <= value);
  throw new Error(`알 수 없는 op ${op}`);
}

/**
 * 조건 조합으로 캠핑장 고르기.
 * @returns [{ cid, name, sido, sigungu, score, matched[], unknown[], failed[] }] 점수순
 */
export function matchCampgrounds(store, conditions, { mode = "strict", limit = 20, requireKnown = false } = {}) {
  for (const c of conditions) if (!ATTR.has(c.attr)) throw new Error(`사전에 없는 속성 ${c.attr} (data/facts/attributes.json)`);
  const minGrade = mode === "lenient" ? "MENTION" : "CONFIRMED";
  const out = [];
  for (const [cid, camp] of store.camps) {
    const m = store.facts.get(cid) ?? new Map();
    const row = { cid, name: camp.name, sido: camp.sido ?? null, sigungu: camp.sigungu ?? null, score: 0, matched: [], unknown: [], failed: [] };
    let drop = false;
    for (const cond of conditions) {
      let r = resolveFact(m.get(cond.attr), { minGrade });
      // 후기 주제는 요약한 후기가 있는데 언급이 없으면 0건이다(모름이 아님).
      if (!r && minGrade === "MENTION" && cond.attr.startsWith("REVIEW_") && m.has("REVIEW_COUNT")) {
        r = { attr: cond.attr, values: [0], value: 0, grade: "MENTION", conflict: false, evidence: [{ src: "review_search", n: m.get("REVIEW_COUNT")[0].value }] };
      }
      const w = cond.weight ?? (cond.must ? 3 : 1);
      if (!r) {
        row.unknown.push({ attr: cond.attr, label: ATTR.get(cond.attr).label, must: Boolean(cond.must) });
        if (cond.must && requireKnown) drop = true;
        continue;
      }
      const ok = test1(cond, r);
      // 값이 갈려도 갈린 값 모두가 조건을 만족하면(예: 동반 가능 / 지정 구역만 → ‘반려견 동반’) 맞음으로 본다.
      const allOk = r.conflict && r.values.every((v) => test1(cond, { values: [v] }));
      const item = { attr: cond.attr, label: ATTR.get(cond.attr).label, value: r.values.length > 1 ? r.values : r.value, grade: r.grade, conflict: r.conflict || undefined, evidence: r.evidence[0] };
      if (ok && (!r.conflict || allOk)) { row.matched.push(item); row.score += w * (GRADE_RANK[r.grade] / 4 + 0.5); }
      else if (r.conflict && ok) { row.unknown.push({ ...item, must: Boolean(cond.must), why: "원천끼리 값이 다름" }); }
      else { row.failed.push(item); if (cond.must) drop = true; else row.score -= w * 0.5; }
    }
    if (drop) continue;
    // 확인필요(필수 조건 미확인)는 점수를 깎아 확인된 곳이 먼저 오게 한다.
    row.score -= row.unknown.filter((u) => u.must).length * 1.5;
    row.score = Math.round(row.score * 100) / 100;
    out.push(row);
  }
  // 아무 조건도 확인되지 않은 곳은 결과에 넣지 않는다(전부 ‘확인필요’인 추천은 쓸모가 없다).
  return out.filter((r) => r.matched.length > 0).sort((a, b) => b.score - a.score || a.unknown.length - b.unknown.length || a.cid.localeCompare(b.cid)).slice(0, limit);
}

// 자주 쓰는 취향 묶음. 화면·에이전트가 “장작 불멍 + 반려견 + 계곡”처럼 골라 조합한다.
export const PRESETS = {
  firewood: { label: "장작 불멍", conditions: [{ attr: "FIRE_RULE", op: "eq", value: "FIREWOOD_OK", must: true }] },
  pet: { label: "반려견 동반", conditions: [{ attr: "PET_POLICY", op: "in", value: ["ALLOWED", "SMALL_ONLY", "ZONE_ONLY"], must: true }] },
  big_dog: { label: "대형견 동반", conditions: [{ attr: "PET_POLICY", op: "eq", value: "ALLOWED", must: true }] },
  winter_power: { label: "겨울 전기장판", conditions: [{ attr: "OPEN_WINTER", op: "eq", value: true, must: true }, { attr: "POWER_AVAILABLE", op: "eq", value: true, must: true }, { attr: "POWER_MAX_W", op: "min", value: 600 }] },
  high_power: { label: "고전력(1kW↑)", conditions: [{ attr: "POWER_MAX_W", op: "min", value: 1000, must: true }] },
  car_side: { label: "차 옆 텐트", conditions: [{ attr: "PARKING_MODE", op: "eq", value: "SITE_SIDE", must: true }] },
  car_camping: { label: "차박", conditions: [{ attr: "CAR_CAMPING", op: "eq", value: true, must: true }] },
  kids: { label: "아이와 함께", conditions: [{ attr: "AMENITY_PLAYGROUND", op: "eq", value: true }, { attr: "AMENITY_POOL", op: "eq", value: true }, { attr: "AMENITY_TRAMPOLINE", op: "eq", value: true }, { attr: "REVIEW_PRO_KIDS", op: "min", value: 1 }] },
  quiet: { label: "조용한 곳", conditions: [{ attr: "REVIEW_PRO_QUIET", op: "min", value: 1, weight: 2 }, { attr: "REVIEW_CON_NOISE", op: "max", value: 0 }, { attr: "SITE_TOTAL", op: "max", value: 30 }] },
  valley: { label: "계곡", conditions: [{ attr: "ENV_VALLEY", op: "eq", value: true, must: true }] },
  sea: { label: "바다", conditions: [{ attr: "ENV_BEACH", op: "eq", value: true, must: true }] },
  wifi: { label: "와이파이", conditions: [{ attr: "AMENITY_WIFI", op: "eq", value: true, must: true }] },
  hot_shower: { label: "온수 샤워", conditions: [{ attr: "HOT_WATER", op: "eq", value: true, must: true }] },
  private_bath: { label: "개별 화장실", conditions: [{ attr: "PRIVATE_BATHROOM", op: "eq", value: true, must: true }] },
  realtime: { label: "온라인 바로 예약", conditions: [{ attr: "BOOKING_REALTIME", op: "eq", value: true }] },
  public: { label: "공공 캠핑장", conditions: [{ attr: "OPERATOR_TYPE", op: "in", value: ["LOCAL_GOVERNMENT", "NATIONAL_PARK", "NATURAL_RECREATION_FOREST", "PUBLIC_LEISURE"], must: true }] },
  early_checkin: { label: "일찍 입실(13시 이전)", conditions: [{ attr: "CHECKIN_TIME", op: "max", value: "13:00", must: true }] },
};

/** "PET_POLICY in ALLOWED,SMALL_ONLY" · "POWER_MAX_W min 600" · "ENV_VALLEY eq true" → 조건 객체 */
export function parseCondition(text, { must = false } = {}) {
  const m = String(text).trim().match(/^([A-Z0-9_]+)\s+(eq|in|min|max|has|not)\s*(.*)$/);
  if (!m) throw new Error(`조건 형식: ATTR op 값 (예: POWER_MAX_W min 600) — 받은 값 "${text}"`);
  const [, attr, op, raw] = m;
  const cast = (v) => (v === "true" ? true : v === "false" ? false : /^-?\d+(\.\d+)?$/.test(v) ? Number(v) : v);
  const value = op === "has" ? undefined : op === "in" ? raw.split(",").map((s) => cast(s.trim())) : cast(raw.trim());
  return { attr, op, value, must };
}
