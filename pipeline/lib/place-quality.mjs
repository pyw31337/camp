// 캠핑장·주변 업체의 최소 신뢰 게이트.
// 원장 데이터를 삭제하지 않고, 잘못 분류된 업체를 기본 탐색/주변 추천에서 격리한다.

const NON_CAMPING = /스마트s*락|샷시|창호|방범창|유리|몰딩|철물|열쇠|부동산|분양|건축|제조|공장|인테리어|약국|병원|식당|카페|정육|마트|주식회사\s*락/i;
const CAMPING_TOKEN = /캠핑|야영|글램핑|카라반|오토캠핑|캠프|휴양림|자연휴양/i;
const CAMPING_TYPE = /야영|캠핑|글램핑|카라반/i;

export function campgroundQuality(c = {}) {
  const name = String(c.name ?? "").trim();
  const types = Array.isArray(c.types) ? c.types.join(" ") : String(c.types ?? "");
  const text = `${name} ${types} ${c.addr ?? ""}`;
  const negative = NON_CAMPING.test(name);
  const positiveName = CAMPING_TOKEN.test(name);
  const positiveType = CAMPING_TYPE.test(types);
  const evidence = [
    positiveName,
    positiveType,
    Boolean(c.booking?.url || c.homepage),
    Array.isArray(c.kinds) && c.kinds.length > 0,
    Array.isArray(c.sizes) && c.sizes.length > 0,
    Array.isArray(c.amenities) && c.amenities.length > 0,
    Boolean(c.fee),
  ].filter(Boolean).length;
  if (negative && !positiveName) return { status: "REJECTED", reason: "camping_operator_name_mismatch", evidence };
  if (!positiveName && !positiveType && evidence < 2) return { status: "REVIEW", reason: "insufficient_camping_evidence", evidence };
  return { status: "ACCEPTED", reason: positiveName ? "camping_name" : "camping_type_and_facts", evidence };
}

export function isCampingOperator(c) {
  return campgroundQuality(c).status === "ACCEPTED";
}

const FOOD_OR_PERSON = /대게|게찜|회|맛집|식당|카페|메뉴|주문|식사|먹방|인물|셀카|가족사진|사람|반려견만|강아지사진/i;
const PLACE_CONTEXT = /캠핑|야영|글램핑|카라반|오토캠핑|캠프|사이트|데크|파쇄석|텐트|숲속|휴양림/i;

/** 후기 대표 이미지가 업체 사진인지 텍스트 근거를 함께 확인한다. */
export function photoContextScore({ title = "", snippet = "", source = "", campName = "" } = {}) {
  const context = `${title} ${snippet} ${source}`.replace(/\s+/g, " ").trim();
  const core = String(campName).replace(/\s+/g, "").slice(0, 8);
  let score = 0;
  if (core && context.replace(/\s+/g, "").includes(core)) score += 3;
  if (PLACE_CONTEXT.test(context)) score += 2;
  if (FOOD_OR_PERSON.test(context)) score -= 4;
  return { score, status: score >= 3 ? "ACCEPTED" : "REVIEW", reason: score >= 3 ? "place_context" : "weak_or_non_place_context" };
}

