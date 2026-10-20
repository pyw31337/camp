// 발행 전 상식 검사: 후기에서 뽑은 장단점 라벨이 실제 사실(요금·반려동물 규정)이나 서로와 모순되면 뺀다.
// 소유자 2026-10-20: “1박 4만원인데 ‘가격 부담’ 마크” 같은 앞뒤가 안 맞는 정보는 미리 제거한다.

/** 카드 대표 1박 요금(사이트 요금 우선) */
export function siteFee(c) {
  const t = c?.fee?.tiers?.find((x) => x[0] === "site");
  const v = t ? t[1] : c?.fee?.min;
  return Number(v) > 0 ? Number(v) : null;
}

/** 전체 요금 분포의 분위수 { p25, p50, p75, p90 } */
export function feeStats(camps) {
  const v = camps.map(siteFee).filter(Boolean).sort((a, b) => a - b);
  const q = (p) => (v.length ? v[Math.min(v.length - 1, Math.floor(v.length * p))] : null);
  return { p25: q(0.25), p50: q(0.5), p75: q(0.75), p90: q(0.9) };
}

// 같은 곳에 동시에 붙으면 모순인 장단점 짝. 건수가 많은 쪽만 남기고, 같으면 둘 다 뺀다.
export const OPPOSITES = [
  ["가성비 좋음", "가격 부담"],
  ["그늘 많음", "그늘 부족"],
  ["사이트 넓음", "사이트 좁음"],
  ["온수 펑펑", "온수 약함"],
  ["주차 편함·옆 주차", "주차 불편·짐 옮김"],
  ["조용·한적", "소음·매너"],
  ["화장실·샤워장 깨끗", "화장실 멀거나 불편"],
];

/**
 * @param {{pros:Array<[string,number]>, cons:Array<[string,number]>}} dg
 * @returns {{pros, cons, dropped: Array<[string,string]>}} dropped = [[라벨, 이유]]
 */
export function sanitizeDigest(dg, camp, stats) {
  let pros = [...(dg.pros ?? [])], cons = [...(dg.cons ?? [])];
  const dropped = [];
  const drop = (list, label, why) => { const i = list.findIndex(([t]) => t === label); if (i >= 0) { list.splice(i, 1); dropped.push([label, why]); } };
  const fee = siteFee(camp);
  // 1) 요금 사실과 맞춰 본다: 상위 25%(p75) 미만 요금에 ‘가격 부담’, 상위 10%(p90) 이상 요금에 ‘가성비 좋음’은 뺀다.
  if (fee && stats?.p75 && fee < stats.p75) drop(cons, "가격 부담", `1박 ${fee}원 < 상위 25% ${stats.p75}원`);
  if (fee && stats?.p90 && fee >= stats.p90) drop(pros, "가성비 좋음", `1박 ${fee}원 ≥ 상위 10% ${stats.p90}원`);
  // 2) 반려동물 불가인 곳에 ‘반려견 동반 편함’은 뺀다.
  if (/불가/.test(String(camp?.pets ?? ""))) drop(pros, "반려견 동반 편함", "반려동물 불가");
  // 3) 서로 반대인 라벨
  for (const [p, c] of OPPOSITES) {
    const a = pros.find(([t]) => t === p), b = cons.find(([t]) => t === c);
    if (!a || !b) continue;
    if (a[1] >= b[1]) drop(cons, c, `반대 후기 ‘${p}’ ${a[1]}건 ≥ ${b[1]}건`);
    if (b[1] >= a[1]) drop(pros, p, `반대 후기 ‘${c}’ ${b[1]}건 ≥ ${a[1]}건`);
  }
  return { pros, cons, dropped };
}
