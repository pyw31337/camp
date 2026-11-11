// t55u: 텐트 규격 필터와 Fit 뱃지는 같은 기준 — 각 사이트의 짧은 쪽.
// 캠핑장 합격은 ‘여유인 사이트가 하나라도 있는가’(짧은 쪽의 최댓값 ≥ 텐트 크기).
export function sizePairsOf(c = {}) {
  const out = [];
  const add = (w, d) => {
    const a = Number(w) || 0, b = Number(d) || 0;
    if (a && b) out.push([a, b]);
    else if (a || b) out.push([a || b, a || b]);
  };
  const groups = c.field_conditions?.site_size?.groups ?? [];
  if (groups.length) {
    for (const g of groups) add(g.width_m, g.depth_m);
  } else {
    for (const x of c.sizes ?? []) add(x?.[0], x?.[1]);
  }
  if (Array.isArray(c.tq?.mx)) add(c.tq.mx[0], c.tq.mx[1]);
  return out;
}
export function shortSideOf(w, d) {
  const a = Number(w) || 0, b = Number(d) || 0;
  if (a && b) return Math.min(a, b);
  return a || b || 0;
}
export function bestShortSide(c = {}) {
  const sides = sizePairsOf(c).map(([w, d]) => shortSideOf(w, d)).filter((n) => n > 0);
  return sides.length ? Math.max(...sides) : 0;
}
export function siteFitsTent(size, minSize) {
  if (!(minSize > 0) || !size) return "";
  const w = size.w ?? size[0], d = size.d ?? size[1];
  return shortSideOf(w, d) >= minSize ? "ok" : "tight";
}
