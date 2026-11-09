// 정보가 빈약하거나 보강이 오래된 업장을 수집 배치 앞쪽에 둔다.
// 네트워크 호출은 하지 않으며, 소셜·영상·사진 수집기가 같은 우선순위를 공유한다.

const has = (v) => v != null && v !== "" && !(Array.isArray(v) && !v.length) && !(typeof v === "object" && !Array.isArray(v) && !Object.keys(v).length);
const ageDays = (v, now = Date.now()) => {
  const t = Date.parse(v ?? "");
  return Number.isFinite(t) ? Math.max(0, (now - t) / 864e5) : Infinity;
};

export function enrichmentGapScore(c, d = {}, now = Date.now()) {
  let score = 0;
  const gaps = [];
  const photo = has(c?.ph) || has(c?.img) || has(c?.sn) || has(c?.pt) || has(d?.photos?.length) || has(d?.photos_remote?.length);
  const reviews = Number(c?.soc?.[0] ?? 0) > 0 || Number(d?.reviews?.length ?? 0) + Number(d?.cafe?.length ?? 0) + Number(d?.web?.length ?? 0) > 0;
  const video = Number(c?.soc?.[1] ?? 0) > 0 || Number(d?.videos?.length ?? 0) > 0;
  if (!photo) { score += 45; gaps.push("photo"); }
  if (!reviews) { score += 28; gaps.push("reviews"); }
  if (!video) { score += 16; gaps.push("video"); }
  if (!has(c?.fee) && !d?.prices?.length) { score += 18; gaps.push("fee"); }
  if (!has(c?.ti?.i) && !has(c?.pf?.s)) { score += 10; gaps.push("checkin"); }
  if (!has(c?.ti?.o)) { score += 8; gaps.push("checkout"); }
  if (!has(c?.booking?.url) && !c?.booking?.channels?.length) { score += 8; gaps.push("booking"); }
  if (c?.du) score += 8; // 캠크닉·민간시설은 표준 고캠핑 데이터 밖인 경우가 많다.
  const socialAge = ageDays(d?.social_checked_at, now);
  const webAge = ageDays(d?.web_checked_at, now);
  if (socialAge > 7) score += Math.min(18, Math.round(socialAge));
  if (webAge > 7) score += Math.min(12, Math.round(webAge / 2));
  return { score, gaps, social_age_days: Number.isFinite(socialAge) ? Math.round(socialAge * 10) / 10 : null, web_age_days: Number.isFinite(webAge) ? Math.round(webAge * 10) / 10 : null };
}

export function prioritizeEnrichment(items, detailOf = () => ({}), now = Date.now()) {
  return [...items].map((c, i) => ({ c, i, gap: enrichmentGapScore(c, detailOf(c), now) }))
    .sort((a, b) => b.gap.score - a.gap.score || a.i - b.i)
    .map((x) => x.c);
}

export { ageDays };
