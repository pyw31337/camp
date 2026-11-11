// t55u: 텐트 규격 필터와 Fit 뱃지는 같은 기준 — 각 사이트의 짧은 쪽.
// 캠핑장 합격은 ‘여유인 사이트가 하나라도 있는가’(짧은 쪽의 최댓값 ≥ 텐트 크기).
// 레일에 보이는 규격만 필터에 쓴다. 땡큐 tq.mx·숨은 구역이 더 여유면 레일에도 올린다.

export function shortSideOf(w, d) {
  const a = Number(w) || 0, b = Number(d) || 0;
  if (a && b) return Math.min(a, b);
  return a || b || 0;
}

export function pairsEqual(a, b) {
  if (!a || !b) return false;
  const aw = Number(a.w ?? a[0]) || 0, ad = Number(a.d ?? a[1]) || 0;
  const bw = Number(b.w ?? b[0]) || 0, bd = Number(b.d ?? b[1]) || 0;
  const ak = [aw, ad].sort((x, y) => x - y).join("x");
  const bk = [bw, bd].sort((x, y) => x - y).join("x");
  return ak === bk;
}

function asGroup(w, d, extra = {}) {
  const a = Number(w) || 0, b = Number(d) || 0;
  if (!(a || b)) return null;
  return { w: a || b, d: b || a, n: 0, name: "", floor: "", ...extra };
}

export function sizeGroupsOf(c = {}) {
  const groups = c.field_conditions?.site_size?.groups ?? [];
  if (groups.length) {
    return groups
      .map((g) => asGroup(g.width_m, g.depth_m, { n: g.count || 0, name: g.name || "", floor: g.floor || g.ground || "" }))
      .filter(Boolean);
  }
  return (c.sizes ?? [])
    .map((x) => asGroup(x?.[0], x?.[1], { n: x?.[2] || 0 }))
    .filter(Boolean);
}

export function tqMxGroup(c = {}) {
  const mx = c.tq?.mx;
  if (!Array.isArray(mx)) return null;
  return asGroup(mx[0], mx[1], { from: "tq" });
}

export function pickTentSize(c = {}) {
  const unnamed = sizeGroupsOf(c).filter((g) => !g.name);
  if (!unnamed.length) return null;
  if (unnamed.length === 1) return unnamed[0];
  return [...unnamed].sort((a, b) => {
    const long = Math.max(b.w, b.d) - Math.max(a.w, a.d);
    if (long) return long;
    return shortSideOf(b.w, b.d) - shortSideOf(a.w, a.d);
  })[0];
}

// 레일에 올리는 규격: 이름 있는 구역 + 타입 타일에 붙는 tentSize +
// 그보다 짧은 쪽이 더 여유인 숨은 구역·땡큐 tq.mx(최대 사이트 타일).
export function visibleSizeGroups(c = {}) {
  const groups = sizeGroupsOf(c);
  const named = groups.filter((g) => g.name);
  const tent = pickTentSize(c);
  const visible = [];
  const add = (g) => {
    if (!g || visible.some((x) => pairsEqual(x, g))) return false;
    visible.push(g);
    return true;
  };
  for (const g of named) add(g);
  add(tent);
  const best = visible.length ? Math.max(...visible.map((g) => shortSideOf(g.w, g.d))) : 0;
  const extras = [];
  const hiddenUnnamed = groups.filter((g) => !g.name && !pairsEqual(g, tent));
  for (const g of [...hiddenUnnamed, tqMxGroup(c)]) {
    if (!g || visible.some((x) => pairsEqual(x, g))) continue;
    if (!best || shortSideOf(g.w, g.d) > best) {
      extras.push(g);
      add(g);
    }
  }
  extras.sort((a, b) => shortSideOf(b.w, b.d) - shortSideOf(a.w, a.d));
  return { visible, named, tent, extras };
}

export function sizePairsOf(c = {}) {
  return visibleSizeGroups(c).visible.map((g) => [g.w, g.d]);
}

export function bestSizeGroup(c = {}) {
  const vis = visibleSizeGroups(c).visible;
  if (!vis.length) return null;
  return vis.reduce((a, g) => {
    const as = shortSideOf(a.w, a.d), gs = shortSideOf(g.w, g.d);
    if (gs !== as) return gs > as ? g : a;
    return Math.max(g.w, g.d) > Math.max(a.w, a.d) ? g : a;
  });
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
