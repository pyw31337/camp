// 데이터 품질 표준(docs/DATA_QUALITY_PROCESS.md)의 계산부 — 사실 저장소(data/facts)의 원자 사실을
// (캠핑장, 속성)마다 묶어 ‘얼마나 믿을 만한가’를 같은 잣대로 매긴다. 수집이 늘수록 품질이 오르는 이유:
//  ① 서로 다른 원천이 같은 값을 말하면 신뢰도가 합쳐져 오른다(독립 원천 확증).
//  ② 값이 엇갈리면 CONFLICT로 검토 대기열에 올라가고, 사람·에이전트의 판정은 curated-pins로 고정돼 다시 틀리지 않는다.
//  ③ 오래된 값은 신뢰도가 서서히 내려가 새 수집이 자연스럽게 이긴다.
// 순수 함수만 둔다(파일 입출력은 scripts/quality-ledger.mjs).

/** 등급별 기본 신뢰도. 사실 저장소 등급(FACT_STORE.md)과 같은 이름을 쓴다. */
export const GRADE_W = { VERIFIED: 0.97, OPERATOR: 0.9, OFFICIAL: 0.88, OFFICIAL_TEXT: 0.88, CONFIRMED: 0.85, MENTION: 0.35, REFERENCE: 0.15 };
const STALE_DAYS = 540; // 18개월 지나면 신뢰도를 깎기 시작한다
const DAY = 86400000;

/** 값 비교용 정규화(공백·대소문자·쉼표 무시) */
export const normValue = (v) => (typeof v === "string" ? v.replace(/[\s,]/g, "").toLowerCase() : JSON.stringify(v));

/** 한 사실의 무게: 등급 × 후기 언급 수(n) 가산 × 오래됨 감쇠 */
export function factWeight(f, now = Date.now()) {
  let w = GRADE_W[f.grade] ?? 0.3;
  if (f.grade === "MENTION" && Number(f.n) > 1) w = Math.min(0.6, w + 0.05 * (Number(f.n) - 1));
  const t = Date.parse(f.at ?? "");
  if (Number.isFinite(t)) { const age = (now - t) / DAY; if (age > STALE_DAYS) w *= Math.max(0.5, 1 - (age - STALE_DAYS) / (STALE_DAYS * 2)); }
  return w;
}
const host = (u) => { try { return new URL(u).hostname.replace(/^www\./, ""); } catch { return ""; } };
/** 독립 원천 열쇠: 원천 종류 + 호스트(같은 블로그 글을 두 번 세지 않는다) */
export const sourceKey = (f) => `${f.src ?? "?"}|${host(f.url)}`;

/** 값이 하나여야 하는 속성인지(충돌 판정 대상). 여러 값이 정상인 속성(사이트 종류·바닥 등)은 제외. */
export function singleValued(def) {
  if (!def) return false;
  if (def.multi || def.code === "SITE_TYPE") return false;
  return ["bool", "enum", "time", "int", "count", "code"].includes(def.type);
}

/**
 * (캠핑장, 속성) 하나의 사실들 → 평가.
 * 반환 { value, confidence, sources, status, rival? }
 *  status: VERIFIED(0.95↑) · CONFIRMED(0.85↑) · CORROBORATED(독립 원천 2곳↑ 일치) · SINGLE · WEAK(<0.5) · CONFLICT
 */
export function assess(facts, def, now = Date.now()) {
  const byVal = new Map();
  for (const f of facts) {
    const k = normValue(f.value);
    const g = byVal.get(k) ?? byVal.set(k, { value: f.value, srcs: new Map() }).get(k);
    const sk = sourceKey(f), w = factWeight(f, now);
    if (!g.srcs.has(sk) || g.srcs.get(sk) < w) g.srcs.set(sk, w);
  }
  const ranked = [...byVal.values()].map((g) => ({ value: g.value, sources: g.srcs.size, confidence: 1 - [...g.srcs.values()].reduce((p, w) => p * (1 - w), 1) }))
    .sort((a, b) => b.confidence - a.confidence || b.sources - a.sources);
  const top = ranked[0];
  if (!top) return null;
  const rival = singleValued(def) ? ranked.slice(1).find((r) => numericClose(def, r.value, top.value) === false && !compatible(def, r.value, top.value) && r.confidence >= 0.6) : null;
  const confidence = Math.round(top.confidence * 1000) / 1000;
  const status = rival ? "CONFLICT" : confidence >= 0.95 ? "VERIFIED" : confidence >= 0.85 ? "CONFIRMED" : top.sources >= 2 ? "CORROBORATED" : confidence < 0.5 ? "WEAK" : "SINGLE";
  return { value: top.value, confidence, sources: top.sources, status, ...(rival ? { rival: { value: rival.value, confidence: Math.round(rival.confidence * 1000) / 1000, sources: rival.sources } } : {}) };
}
// 서로 모순이 아닌 값 묶음: “동반 가능”과 “소형견만”·“지정 구역만”은 같은 방향(허용)의 자세함 차이다. 충돌은 허용 ↔ 불가뿐(2026-10-22).
const COMPATIBLE = { PET_POLICY: [["ALLOWED", "SMALL_ONLY", "ZONE_ONLY"]] };
export function compatible(def, a, b) {
  return (COMPATIBLE[def?.code] ?? []).some((g) => g.includes(a) && g.includes(b));
}
// 숫자 속성은 20% 안이면 같은 값으로 본다(사이트 수 52 vs 50). 숫자가 아니면 그냥 다른 값.
function numericClose(def, a, b) {
  if (!["int", "count"].includes(def?.type)) return false;
  const x = Number(a), y = Number(b);
  if (!Number.isFinite(x) || !Number.isFinite(y)) return false;
  return Math.abs(x - y) <= Math.max(1, 0.2 * Math.max(x, y)) ? true : false;
}

/** 속성별 요약 지표 */
export function summarize(assessments, totalCamps) {
  const out = {};
  for (const [attr, list] of Object.entries(assessments)) {
    const n = list.length, st = {};
    for (const a of list) st[a.status] = (st[a.status] ?? 0) + 1;
    out[attr] = {
      coverage: n, coverage_pct: Math.round((n / Math.max(1, totalCamps)) * 1000) / 10,
      mean_confidence: Math.round((list.reduce((s, a) => s + a.confidence, 0) / Math.max(1, n)) * 1000) / 1000,
      confirmed_pct: Math.round((((st.VERIFIED ?? 0) + (st.CONFIRMED ?? 0)) / Math.max(1, n)) * 1000) / 10,
      corroborated: list.filter((a) => a.sources >= 2).length,
      conflicts: st.CONFLICT ?? 0, weak: st.WEAK ?? 0, status: st,
    };
  }
  return out;
}

/** 어제 대비 회귀(품질이 나빠진 속성). coverage-guard와 같은 문턱: max(20곳, 2%) */
export function regressions(prev, cur) {
  const out = [];
  for (const [attr, c] of Object.entries(cur)) {
    const p = prev?.[attr];
    if (!p) continue;
    const drop = p.coverage - c.coverage;
    if (drop > Math.max(20, p.coverage * 0.02)) out.push({ attr, kind: "coverage", from: p.coverage, to: c.coverage });
    if (p.mean_confidence - c.mean_confidence > 0.02) out.push({ attr, kind: "confidence", from: p.mean_confidence, to: c.mean_confidence });
    if (c.conflicts - p.conflicts > Math.max(5, p.conflicts * 0.1)) out.push({ attr, kind: "conflicts", from: p.conflicts, to: c.conflicts });
  }
  for (const attr of Object.keys(prev ?? {})) if (!cur[attr] && prev[attr].coverage > 20) out.push({ attr, kind: "vanished", from: prev[attr].coverage, to: 0 });
  return out;
}
