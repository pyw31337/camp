// 사실 정제(docs/DATA_QUALITY_PROCESS.md 3단계 ‘검토’의 규칙화). 첫 품질 장부의 충돌 295건을 원문 대조로 분류해 보니,
// 대부분은 값이 정말 엇갈린 게 아니라 수집·해석이 틀린 경우였다(2026-10-22):
//   ① 다른 업장 페이지 섞임 — 같은 예약 플랫폼(campweek 등)에서 detail_id가 다른 캠핑장의 안내가 함께 수집됨
//      예: 용인반딧불캠핑장(7029) ← detail_id=3007029(불가)와 3007643(가능)
//   ② 범위가 좁은 금지를 전체 규칙으로 읽음 — “애견 입수 불가”(수영장), “카라반 실내 출입 불가”, “대형견 입장 금지”, “고양이는 불가”
//   ③ 홍보·목록 제목을 규칙으로 읽음 — “반려견·반려묘 동반 가능 캠핑장 모음”
//   ④ 사이트 종류·시기별로 다른 입퇴실 시각 — “데크 14:00 / 카라반 15:00”, “성수기·주말 15:00”
// ①③은 그 캠핑장의 사실이 아니므로 뺀다(뺀 값은 refine-log에 남긴다). ②는 크기 제한이면 SMALL_ONLY, 객실·구역 한정 허용이면 ZONE_ONLY로 바꾸고
// 나머지 범위 금지는 반려견 정책에서 뺀다. ④는 지우지 않고 scope(범위)를 붙여 대표값 경쟁에서만 뺀다(캠핑 사이트·비수기 평일 값이 대표).

const ID_PARAM = /^(detail_?id|camp_?id|campid|cmp_?id|place_?id|site_?id|prd_?id|goods_?id|shop_?id|cno|pno|sno|idx|seq|uid|no|id)$/i;
const OPERATOR_SRC = new Set(["operator_homepage", "operator_discovered", "booking_engine"]);

function urlParts(u) {
  try { const x = new URL(u); return { host: x.host.replace(/^www\./, ""), params: [...x.searchParams].filter(([k, v]) => ID_PARAM.test(k) && /\d/.test(v)) }; } catch { return null; }
}

/** ① 같은 호스트에서 id 매개변수 값이 서로 다른 페이지가 한 캠핑장 사실에 섞였으면, 그 캠핑장 것이 아닌 페이지의 사실을 뺀다. */
export function tenantFilter(facts, { cid, homepage } = {}) {
  const ops = facts.filter((f) => OPERATOR_SRC.has(f.src) && f.url);
  const seen = new Map(); // host|param → Set(values)
  for (const f of ops) { const p = urlParts(f.url); if (!p) continue; for (const [k, v] of p.params) { const key = `${p.host}|${k.toLowerCase()}`; (seen.get(key) ?? seen.set(key, new Set()).get(key)).add(v); } }
  const home = urlParts(homepage ?? "");
  const own = new Map(); // host|param → 이 캠핑장 값(없으면 null = 판단 불가 → 그 매개변수 페이지는 모두 뺀다)
  for (const [key, vals] of seen) {
    if (vals.size < 2) continue;
    const [host, k] = key.split("|");
    const fromHome = home?.host === host ? home.params.find(([hk]) => hk.toLowerCase() === k)?.[1] : null;
    const bySuffix = [...vals].filter((v) => cid && new RegExp(`0*${cid}$`).test(v));
    own.set(key, fromHome && vals.has(fromHome) ? fromHome : bySuffix.length === 1 ? bySuffix[0] : null);
  }
  if (!own.size) return { kept: facts, dropped: [] };
  const kept = [], dropped = [];
  for (const f of facts) {
    const p = OPERATOR_SRC.has(f.src) && f.url ? urlParts(f.url) : null;
    const bad = p?.params.some(([k, v]) => { const key = `${p.host}|${k.toLowerCase()}`; return own.has(key) && own.get(key) !== v; });
    (bad ? dropped : kept).push(bad ? { ...f, why: "다른 업장 페이지(같은 플랫폼의 다른 id)" } : f);
  }
  return { kept, dropped };
}

// ② 범위가 좁은 금지: 수영장·물놀이, 실내·객실 안, 특정 동물(고양이 등)·대형견, 미등록·공격적인 개, 산책, 조건 위반 시 등
const PET_SCOPED_NO = /객실|호실|\d+\s*호|vip|룸|램핑|변동|될\s*수|입수|수영장|물놀이|풀장|(?<![가-힣])풀(?![가-힣])|실내|객실\s*안|방\s*안|침대|카라반\s*(실내|안|내부)|내부에는|동승|펜션|팬션|대형견|중형견|고양이|반려묘|다른\s*동물|외\s*다른|등록이?\s*안\s*된|미등록|공격|짖음|입마개|산책|지켜지지|어길|위반|두려움|거부감|민원|식당|카페|매점|화장실|샤워|개수대|놀이터|외에|이외/;
const PET_SIZE = /소형견|\d{1,2}\s*kg\s*(이하|미만)|소형\s*(견|만)/i;
const PET_ROOM_ONLY = /(동반|입실)\s*가능\s*(객실|사이트|구역|동|룸|카라반|글램핑)|허용된\s*(객실|사이트|구역)|입실\s*가능\s*(펜션|객실)\s*외|애견\s*(동반)?\s*가능\s*[)/,·]|(전용|지정)\s*(객실|사이트|구역|존)/;
// “A사이트, B사이트에 가능”, “파쇄석캠핑장만 가능”, “표기된 객실만”, “(구름SITE) 만 출입 가능”, “캠핑사이트의 경우 협의 후 가능”
const PET_ONLY_HERE = /(사이트|site|객실|동|구역|존|캠핑장|펜션|카라반|글램핑)\s*\)?\s*(만|에만|에\s*(한해|한하여)|에\s*가능|의\s*경우)|표기된\s*(객실|사이트)|정해져\s*있|가능\s*동|애견\s*동\s*\d/i;
// ③ 홍보·목록 제목
const LISTING = /모음|추천\s*캠핑장|best|베스트|top\s*\d|순위|리스트/i;

/** ②③ 반려견 정책 문장 해석 → { value, drop, why } */
export function refinePet(f) {
  if (f.attr !== "PET_POLICY" || f.src === "gocamping" || f.src === "agent_review") return null;
  const q = String(f.quote ?? f.text ?? "");
  if (!q) return null;
  if (LISTING.test(q)) return { drop: true, why: "홍보·목록 제목(규칙 아님)" };
  if (f.value === "NOT_ALLOWED" && /(사이트|구역|객실|동|존)\s*(외|이외|제외)/.test(q)) return { value: "ZONE_ONLY", why: "지정 구역 외 금지 = 지정 구역만 허용" };
  // “G구역과 J구역은 동반 불가”, “카라반 6동(애견동반불가)” — 일부만 금지
  if (f.value === "NOT_ALLOWED" && /[A-Za-z가-힣0-9]\s*(구역|동|호|사이트)\s*(과|와|,|은|는|\()|\d+\s*동\s*\(/.test(q)) return { drop: true, why: "일부 구역·객실만의 금지를 동반 불가로 읽음" };
  if (f.value === "NOT_ALLOWED" && PET_SCOPED_NO.test(q)) {
    if (PET_SIZE.test(q) || /대형견|중형견/.test(q) && !/모든|전체|일체/.test(q)) return { value: "SMALL_ONLY", why: "크기 제한(대형견 불가 등)을 동반 불가로 읽음" };
    return { drop: true, why: "범위가 좁은 금지(수영장·실내·특정 동물 등)를 동반 불가로 읽음" };
  }
  if (f.value === "ALLOWED" && (PET_ROOM_ONLY.test(q) || PET_ONLY_HERE.test(q))) return { value: "ZONE_ONLY", why: "일부 객실·구역만 허용" };
  if (f.value === "ALLOWED" && PET_SIZE.test(q)) return { value: "SMALL_ONLY", why: "크기 제한 있는 허용" };
  return null;
}

// ④ 입퇴실 시각의 범위: 숙박형(카라반·글램핑·펜션 등) 또는 성수기·주말 한정
const LODGING = /카라반|글램핑|펜션|팬션|에코\s*하우스|객실|방갈로|캐빈|코티지|독채|트리\s*하우스|돔/;
const CAMP_SITE = /데크|파쇄석|잔디|일반\s*야영|오토\s*캠핑|캠핑\s*사이트|야영장|노지|캠핑(?!\s*(카라반|글램핑))/;
const PEAK = /성수기|주말|공휴일|토요일|금요일|연휴/;
const DAYUSE = /당일\s*(치기|예약|이용|캠핑|피크닉)|데이\s*캠핑|피크닉|비어\s*있는\s*경우|경우\s*\d/;
export function timeScope(f) {
  if (f.attr !== "CHECKIN_TIME" && f.attr !== "CHECKOUT_TIME") return null;
  const q = String(f.quote ?? f.text ?? "");
  if (!q) return null;
  // 한 문장에 여러 종류가 섞여 있으면 값 바로 앞의 말로 판단한다
  const hh = String(f.value ?? "").replace(/^0/, "");
  const at = hh ? q.search(new RegExp(`${hh.replace(":00", "")}(:00|시)`)) : -1;
  const near = at > 0 ? q.slice(Math.max(0, at - 24), at) : q;
  if (LODGING.test(near) && !CAMP_SITE.test(near)) return "숙박형(카라반·글램핑 등)";
  // “15:00 ~ 익일 11:00(성수기, 주말·공휴일)”처럼 뒤 괄호에 붙은 기간도 본다
  const after = at >= 0 ? q.slice(at, at + 40) : "";
  if (PEAK.test(near) || /\([^)]*(성수기|주말|공휴일|연휴)/.test(after)) return "성수기·주말";
  if (DAYUSE.test(near)) return "당일 이용·조건부";
  return null;
}

/**
 * 한 캠핑장의 사실 전체를 정제한다.
 * @returns {{ facts: object[], log: object[] }} log: 뺀 사실·바꾼 사실(원래 값과 이유)
 */
export function refineCampFacts(facts, camp = {}) {
  const log = [];
  const { kept, dropped } = tenantFilter(facts, { cid: camp.id != null ? String(camp.id) : null, homepage: camp.homepage ?? null });
  for (const f of dropped) log.push({ cid: f.cid, attr: f.attr, value: f.value, src: f.src, url: f.url ?? null, quote: f.quote ?? null, action: "drop", why: f.why });
  const out = [];
  for (const f of kept) {
    const p = refinePet(f);
    if (p?.drop) { log.push({ cid: f.cid, attr: f.attr, value: f.value, src: f.src, url: f.url ?? null, quote: f.quote ?? null, action: "drop", why: p.why }); continue; }
    if (p?.value && p.value !== f.value) { log.push({ cid: f.cid, attr: f.attr, value: f.value, to: p.value, src: f.src, url: f.url ?? null, quote: f.quote ?? null, action: "recode", why: p.why }); out.push({ ...f, value: p.value }); continue; }
    const sc = timeScope(f);
    if (sc) { out.push({ ...f, scope: sc, label: f.label ?? sc }); continue; }
    out.push(f);
  }
  return { facts: out, log };
}
