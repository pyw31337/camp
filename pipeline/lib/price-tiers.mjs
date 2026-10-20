// 1박 요금을 숙박 형태별로 나눈다(2026-10-19 소유자: “1박 10만원대를 넘으면 카라반·글램핑, 20만원대를 넘으면 펜션인 경우가 많다”).
// 한 캠핑장의 ‘3만~25만원’ 같은 범위는 텐트 사이트·글램핑·펜션 요금이 섞인 것이라, 텐트 사이트 요금과 따로 보여야 한다.
// 1) 요금 문장에 형태 이름(글램핑·카라반·펜션·오토·데크…)이 있으면 그것을 쓴다(est=0).
// 2) 이름이 없으면 금액으로 짐작한다(est=1): 10만원 미만 = 캠핑 사이트, 10만~20만원 미만 = 글램핑·카라반, 20만원 이상 = 펜션·숙박동.
//    짐작한 이름은 그 캠핑장에 실제로 있는 형태(사이트 타입 c.st)로 좁힌다.

export const TIER_LABEL = { site: "캠핑 사이트", glamp: "글램핑", caravan: "카라반", gc: "글램핑·카라반", lodge: "펜션·숙박동" };
const ORDER = ["site", "glamp", "caravan", "gc", "lodge"];

const LODGE = /펜션|객실|독채|방갈로|캐빈|숙박\s*동|한옥|오두막|코티지|빌라|스테이|룸\b|민박|모텔|호텔/;
const GLAMP = /글램핑|글램/;
const CARAVAN = /카라반|트레일러|캠핑\s*카|캠핑카|모터\s*홈/;
const SITE = /오토|데크|파쇄석|사이트|텐트|노지|일반\s*캠핑|야영|타프|차박|잔디|마사토|\b[A-Z]\s*(존|구역)|존\b|구역/;

/** 금액만으로 짐작한 형태 */
export function tierByAmount(won) {
  if (won >= 200000) return "lodge";
  if (won >= 100000) return "gc";
  return "site";
}

/** 요금 하나 → 형태: 이름표(label)가 가장 믿을 만하고, 없으면 금액 */
export function tierOf(won, label) {
  const l = String(label ?? "");
  if (l) {
    // 금액이 이름표와 맞지 않으면(소유자 기준: 글램핑·카라반은 대개 10만원대) 이름표를 그대로 믿지 않는다.
    // 7만원 미만 ‘카라반’은 개인 카라반을 세우는 사이트 요금, 5만원 미만 ‘글램핑’은 추가 요금·잘못 읽은 값이 대부분이다.
    if (GLAMP.test(l)) return won < 50000 ? null : { t: "glamp", est: 0 };
    if (CARAVAN.test(l)) return won < 70000 ? { t: "site", est: 0 } : { t: "caravan", est: 0 };
    if (LODGE.test(l)) return { t: "lodge", est: 0 };
    // 사이트 이름표인데 20만원 이상이면 장박·월 요금일 가능성이 커서 뺀다
    if (SITE.test(l)) return won >= 200000 ? null : { t: "site", est: 0 };
  }
  return { t: tierByAmount(won), est: 1 };
}

/**
 * 요금 목록 → [[형태, 최저, 최고, 짐작여부]] (형태 순서: 사이트·글램핑·카라반·글램핑·카라반·펜션)
 * prices: [{ won, label }] · types: 캠핑장 사이트 타입 코드(c.st의 첫 값) 목록
 */
export function feeTiers(prices, types = [], name = "") {
  const has = new Set(types);
  const siteKinds = ["PITCH", "AUTO", "DECK", "DUPLEX_DECK", "TARP_ZONE", "CAR_CAMP", "SOLO", "RV", "PET_SITE", "EQUIPPED"];
  const hasSite = siteKinds.some((k) => has.has(k)) || (!types.length && !GLAMP.test(name) && !CARAVAN.test(name));
  const glamp = has.has("GLAMPING") || GLAMP.test(name), caravan = has.has("CARAVAN") || CARAVAN.test(name), lodge = has.has("HOUSE") || LODGE.test(name);
  // 금액으로 짐작한 형태를 그 캠핑장에 실제로 있는 형태로 좁힌다
  const narrow = (t) => {
    const gc = glamp && !caravan ? "glamp" : caravan && !glamp ? "caravan" : glamp || caravan ? "gc" : null;
    if (t === "site" && !hasSite) return gc ?? (lodge ? "lodge" : "site");
    // 사이트 타입을 아는데 글램핑·카라반·숙박동이 하나도 없으면 10만원대도 사이트 요금(성수기·대형 사이트)으로 본다
    const none = types.length && !glamp && !caravan && !lodge;
    if (t === "gc") return gc ?? (lodge ? "lodge" : none ? "site" : "gc");
    // 20만원 이상: 이름이 ‘글램핑·카라반’인 곳은 그 형태, 숙박동이 없으면 있는 형태로
    if (t === "lodge" && (GLAMP.test(name) || CARAVAN.test(name))) return GLAMP.test(name) ? "glamp" : "caravan";
    if (t === "lodge" && !lodge) return gc ?? (none ? null : "lodge");
    return t;
  };
  const obs = [];
  for (const p of prices ?? []) {
    const won = Number(p?.won);
    if (!Number.isFinite(won) || won < 10000 || won > 1000000) continue;
    const r = tierOf(won, p.label);
    if (r) obs.push({ won, ...r });
  }
  const labeled = obs.filter((o) => !o.est);
  const acc = new Map();
  for (const o of obs) {
    // 이름표가 붙은 같은 금액(±5%)이 있으면 짐작은 버린다(목록 범위의 양 끝은 대개 이름표 있는 언급에서 왔다)
    if (o.est && labeled.some((l) => Math.abs(l.won - o.won) <= o.won * 0.05)) continue;
    const t = o.est ? narrow(o.t) : o.t;
    if (!t) continue;
    const cur = acc.get(t) ?? { min: o.won, max: o.won, est: o.est };
    cur.min = Math.min(cur.min, o.won); cur.max = Math.max(cur.max, o.won); cur.est = Math.min(cur.est, o.est);
    acc.set(t, cur);
  }
  // 확실한 글램핑·카라반이 있으면 짐작한 ‘글램핑·카라반’ 범위는 그 안으로 합친다
  if (acc.has("gc") && acc.get("gc").est && (acc.has("glamp") || acc.has("caravan"))) {
    const g = acc.get("gc"), x = acc.get(acc.has("glamp") ? "glamp" : "caravan");
    x.min = Math.min(x.min, g.min); x.max = Math.max(x.max, g.max);
    acc.delete("gc");
  }
  return ORDER.filter((t) => acc.has(t)).map((t) => [t, acc.get(t).min, acc.get(t).max, acc.get(t).est]);
}
