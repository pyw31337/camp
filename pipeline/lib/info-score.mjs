// 업장 정보량 점수(소유자 2026-10-23: “업체별 정보량을 점수로 환산해, 목록·배열에서 정보가 많은 업체를 맨 위에”).
// 모든 에이전트·자동화가 같은 점수를 쓴다(docs/DATA_QUALITY_PROCESS.md ‘정보량 점수’). 계산은 매일 data-sync·증분 발행에서
// apply-info-score.mjs가 하고, 카탈로그 c.iq(0~100 정수)로 나간다. 화면의 기본 정렬(rich)은 c.iq를 쓴다.
//
// 원칙
//  1) 방문 전에 묻는 정보(요금·입퇴실·반려견·전기·주차·사이트 규격 등)에 무게를 더 준다.
//  2) 값의 개수가 아니라 ‘믿을 만한 정도’를 센다: 속성마다 신뢰도(lib/quality.mjs assess, 독립 원천 확증 반영)를 곱한다.
//     법령·표준 조례 기본값(REFERENCE)과 숙박형·성수기 한정 값(scope)은 그 업장의 정보가 아니므로 세지 않는다. 충돌(CONFLICT)은 절반.
//  3) 사진(공식 > 후기)·후기 수는 상한을 둔다(사진만 많은 곳이 위로 오지 않게).
//  4) 같은 입력이면 같은 점수(결정적). 가중치를 바꾸면 SCORE_VERSION을 올린다.

import { assess } from "./quality.mjs";

export const SCORE_VERSION = 1;

/** 속성별 최대 점수(방문 전 질문 중요도). 목록에 없는 속성은 묶음 단위 보너스로만 센다. */
export const ATTR_WEIGHTS = {
  PRICE_NIGHT: 12, CHECKIN_TIME: 5, CHECKOUT_TIME: 4, MANNER_TIME: 3,
  PET_POLICY: 5, POWER_MAX_W: 8, POWER_AVAILABLE: 2, PARKING_MODE: 4, CAR_CAMPING: 2,
  FIRE_RULE: 3, FIREWOOD_ALLOWED: 1, CHARCOAL_ALLOWED: 1,
  SITE_SIZE: 5, SITE_SURFACE: 4, SITE_TYPE: 3, SITE_TOTAL: 2,
  TOILET_COUNT: 2, SHOWER_COUNT: 2, HOT_WATER: 3,
  REFUND_POLICY: 3, EXTRA_PERSON_FEE: 2, MIN_STAY: 1,
  BOOKING_CHANNEL: 4, BOOKING_REALTIME: 2, PHONE: 2, HOMEPAGE: 2, RENTAL_ITEM: 2,
};
/** 묶음 보너스: 편의시설·주변 환경은 개수만큼(상한) */
const GROUP_BONUS = { amenity: { per: 0.5, cap: 4 }, env: { per: 0.5, cap: 1.5 } };
const PRICE_MENTION_W = 4; // 확정 요금이 없을 때 후기 속 요금 언급
const MEDIA = { officialPer: 2, officialCap: 5, reviewPhoto: 3, reviewsCap: 6, reviewSummary: 2 };

// 만점(정규화 기준): 속성 합 + 묶음 상한 + 사진·후기 상한
const RAW_MAX = Object.values(ATTR_WEIGHTS).reduce((a, b) => a + b, 0) + Object.values(GROUP_BONUS).reduce((a, b) => a + b.cap, 0)
  + MEDIA.officialPer * MEDIA.officialCap + MEDIA.reviewsCap + MEDIA.reviewSummary;

/**
 * 한 캠핑장의 정보량 점수.
 * @param {{facts: object[], defs: Record<string, object>, photos?: number, reviewPhotos?: number, reviews?: number, now?: number}} x
 *   facts: 이 캠핑장의 원자 사실(data/facts 행). defs: 속성 사전(code → 정의). photos: 공식 사진 수. reviewPhotos: 판정 통과 후기 사진 수. reviews: 후기·글 수
 * @returns {{score: number, raw: number, parts: Record<string, number>, missing: string[]}}
 *   missing: 점수에 크게 기여할 수 있는데 비어 있는 속성(다음 수집 우선순위)
 */
export function scoreCamp({ facts = [], defs = {}, photos = 0, reviewPhotos = 0, reviews = 0, now = Date.now() }) {
  const byAttr = new Map();
  for (const f of facts) {
    if (!f?.attr || f.grade === "REFERENCE" || f.scope) continue;
    (byAttr.get(f.attr) ?? byAttr.set(f.attr, []).get(f.attr)).push(f);
  }
  const conf = (attr) => {
    const fs = byAttr.get(attr);
    if (!fs?.length) return 0;
    const a = assess(fs, defs[attr], now);
    if (!a) return 0;
    return a.confidence * (a.status === "CONFLICT" ? 0.5 : 1);
  };
  const parts = {};
  let raw = 0;
  for (const [attr, w] of Object.entries(ATTR_WEIGHTS)) {
    let p = w * conf(attr);
    if (attr === "PRICE_NIGHT" && p === 0) p = PRICE_MENTION_W * conf("PRICE_MENTION");
    if (p > 0) { parts[attr] = Math.round(p * 10) / 10; raw += p; }
  }
  for (const [group, { per, cap }] of Object.entries(GROUP_BONUS)) {
    let n = 0;
    for (const [attr] of byAttr) if (defs[attr]?.group === group) n += conf(attr);
    const p = Math.min(cap, n * per);
    if (p > 0) { parts[group] = Math.round(p * 10) / 10; raw += p; }
  }
  const official = Math.min(photos, MEDIA.officialCap) * MEDIA.officialPer;
  const photoPart = official || (reviewPhotos > 0 ? MEDIA.reviewPhoto : 0);
  if (photoPart) { parts.photos = photoPart; raw += photoPart; }
  const rv = Math.min(MEDIA.reviewsCap, Math.log2(1 + reviews) * 1.5);
  if (rv > 0) { parts.reviews = Math.round(rv * 10) / 10; raw += rv; }
  if ([...byAttr.keys()].some((k) => k.startsWith("REVIEW_PRO_") || k.startsWith("REVIEW_CON_"))) { parts.review_summary = MEDIA.reviewSummary; raw += MEDIA.reviewSummary; }
  const missing = Object.entries(ATTR_WEIGHTS).filter(([a, w]) => w >= 3 && !parts[a]).sort((a, b) => b[1] - a[1]).map(([a]) => a);
  return { score: Math.round((raw / RAW_MAX) * 100), raw: Math.round(raw * 10) / 10, parts, missing };
}

/** 정렬 비교: 점수 높은 순(같으면 0). 목록·배열 어디서든 이 순서를 기본으로 쓴다. */
export const byInfoScore = (a, b) => (Number(b?.iq) || 0) - (Number(a?.iq) || 0);
export { RAW_MAX };
