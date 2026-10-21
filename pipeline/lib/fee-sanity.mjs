// 1박 요금 상식 검사 (t41u-1). 전기 400W 미만처럼, 민간 캠핑장 1박 2만원 미만은 대개 추가인원·전기·주차·당일 요금을
// 1박 요금으로 잘못 읽은 값이다. 원본은 지우지 않고(fee_raw 보관) 표시에 쓸 값만 다음 유효 출처로 바꾸거나 숨긴다.
export const FEE_FLOOR = 20000;          // 민간 1박 하한
export const FEE_FLOOR_PUBLIC = 5000;    // 국·공립(국립공원·휴양림·지자체 관광지) 하한 — 1~1.9만원은 실제 공시 요금
export const FEE_CEIL = 2000000;         // 1박 상한(독채·대형 카라반 포함)
const PUB_OP = new Set(["LOCAL_GOVERNMENT", "NATIONAL_PARK", "NATURAL_RECREATION_FOREST", "PUBLIC"]);
const PUB_NAME = /(국립|공립|\[공립\]|도립|시립|군립|구립|휴양림|국립공원|자동차야영장|관광지|유원지|생태원|해수욕장|시설관리공단|과학관)/;
const PUB_BASIS = /(국립공원공단|자연휴양림 표준|시설관리|시청|군청|구청|시 공식|군 공식|공개 데이터|지자체|고캠핑)/;
const AUTH = new Set(["CONFIRMED", "OFFICIAL", "REFERENCE"]);

export function isPublicCamp(c) {
  return PUB_OP.has(c?.op) || PUB_NAME.test(c?.name ?? "") || (AUTH.has(c?.fee?.grade) && PUB_BASIS.test(c?.fee?.basis ?? ""));
}
// 당일(캠크닉·피크닉) 요금은 1박이 아니므로 하한 적용 안 함
export const isDayUse = (c) => Boolean(c?.du) || (c?.types ?? []).some((t) => /캠크닉|캠프닉|피크닉|당일/.test(t)) || /캠크닉|캠프닉|피크닉/.test(c?.name ?? "");
export const feeFloor = (c) => (isPublicCamp(c) || isDayUse(c) ? FEE_FLOOR_PUBLIC : FEE_FLOOR);
export const plausibleFee = (c, won) => Number.isFinite(won) && won >= feeFloor(c) && won <= FEE_CEIL;

/** fee 하나를 검사해 {fee, changed, reason} 반환. alt: 같은 업장의 다른 출처 금액들([{won,url,src,date}]) */
export function sanitizeFee(c, alt = []) {
  const f = c?.fee;
  if (!f || f.min == null || f.g === "FREE") return { fee: f, changed: false };
  const ok = (n) => plausibleFee(c, n);
  if (ok(f.min) && (f.max == null || ok(f.max))) return { fee: f, changed: false };
  const tiers = (f.tiers ?? []).filter((t) => ok(t[1]));
  const altOk = alt.filter((p) => ok(p.won));
  const vals = [f.min, f.max, ...tiers.map((t) => t[1]), ...tiers.map((t) => t[2])].filter(ok);
  if (vals.length) vals.push(...altOk.map((p) => p.won));
  const raw = { ...f };
  delete raw.tiers;
  if (vals.length) {
    const lo = Math.min(...vals), hi = Math.max(...vals);
    return { changed: true, reason: `최저 ${f.min}원 < 하한 ${feeFloor(c)} → 같은 출처 유효 범위로`, fee: { ...f, min: lo, max: hi, text: rangeText(lo, hi), tiers: f.tiers ? tiers : undefined, fee_raw: raw, sanity: "min_trimmed" } };
  }
  if (altOk.length) {
    const ws = altOk.map((p) => p.won).sort((a, b) => a - b), lo = ws[0], hi = ws[ws.length - 1], p0 = altOk.find((p) => p.won === lo);
    return { changed: true, reason: `${f.min}원 비현실 → 다음 유효 출처`, fee: { min: lo, max: hi, text: rangeText(lo, hi), basis: "방문자 후기 언급 1박 요금", grade: "MENTION", url: p0.url, checked_at: p0.date, fee_raw: raw, sanity: "fallback" } };
  }
  return { changed: true, reason: `${f.min}원 비현실 · 대체 출처 없음 → 숨김`, fee: { hidden: true, fee_raw: raw, sanity: "hidden" } };
}
const man = (n) => (n % 10000 === 0 ? `${n / 10000}만` : `${(n / 10000).toFixed(1).replace(/\.0$/, "")}만`);
export const rangeText = (lo, hi) => `${man(lo)}${hi > lo ? `~${man(hi)}` : ""}원${hi > lo ? "대" : ""}`;
