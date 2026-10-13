// 이동 경로(위경도 폴리라인) 주변의 휴게소·졸음쉼터를 출발지부터의 거리순으로 고른다.
// 브라우저·Worker에서도 그대로 쓸 수 있도록 Node 전용 API를 쓰지 않는다.

const RAD = Math.PI / 180;
const M_PER_DEG = 111320;

/** 기준 위도에서의 평면 근사(수백 km 범위에서 오차 1% 미만) */
function project(lat, lng, lat0) {
  return [lng * M_PER_DEG * Math.cos(lat0 * RAD), lat * M_PER_DEG];
}

/** 점 P와 선분 AB의 최단거리와 선분 위 비율 t(0~1) */
function pointToSegment(p, a, b) {
  const dx = b[0] - a[0], dy = b[1] - a[1];
  const len2 = dx * dx + dy * dy;
  const t = len2 === 0 ? 0 : Math.max(0, Math.min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / len2));
  const x = a[0] + t * dx, y = a[1] + t * dy;
  return { d: Math.hypot(p[0] - x, p[1] - y), t, segLen: Math.sqrt(len2) };
}

/**
 * @param {[number, number][]} path [[lat, lng], ...] 출발 → 도착
 * @param {{lat:number,lng:number}[]} stops
 * @param {{bufferM?:number, minGapKm?:number}} opts bufferM: 경로에서 이 거리 안(고속도로 휴게소는 본선 옆 300m 안팎)
 * @returns {{stop:object, along_km:number, offset_m:number}[]}
 */
export function stopsAlongRoute(path, stops, { bufferM = 400 } = {}) {
  if (!path || path.length < 2) return [];
  const lat0 = path.reduce((s, p) => s + p[0], 0) / path.length;
  const pts = path.map(([la, ln]) => project(la, ln, lat0));
  const cum = [0];
  for (let i = 1; i < pts.length; i++) cum.push(cum[i - 1] + Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]));
  // 경로 경계 상자로 1차 거르기
  const lats = path.map((p) => p[0]), lngs = path.map((p) => p[1]);
  const pad = bufferM / M_PER_DEG * 1.5;
  const box = [Math.min(...lats) - pad, Math.max(...lats) + pad, Math.min(...lngs) - pad * 1.3, Math.max(...lngs) + pad * 1.3];
  const out = [];
  for (const s of stops) {
    if (s.lat < box[0] || s.lat > box[1] || s.lng < box[2] || s.lng > box[3]) continue;
    const p = project(s.lat, s.lng, lat0);
    let best = null;
    for (let i = 1; i < pts.length; i++) {
      const r = pointToSegment(p, pts[i - 1], pts[i]);
      if (!best || r.d < best.d) best = { d: r.d, along: cum[i - 1] + r.t * r.segLen };
    }
    if (best && best.d <= bufferM) out.push({ stop: s, along_km: Math.round(best.along / 100) / 10, offset_m: Math.round(best.d) });
  }
  return out.sort((a, b) => a.along_km - b.along_km);
}

/** 운전 피로 기준(2시간마다 휴식 권장)으로 쉬기 좋은 지점을 표시한다. */
export function suggestBreaks(along, totalKm, { everyKm = 120 } = {}) {
  const marks = [];
  for (let k = everyKm; k < totalKm - 20; k += everyKm) {
    const pick = along.filter((a) => a.stop.kind === "SERVICE_AREA" || a.stop.kind === "DROWSY_SHELTER")
      .reduce((best, a) => (!best || Math.abs(a.along_km - k) < Math.abs(best.along_km - k) ? a : best), null);
    if (pick && !marks.includes(pick)) marks.push(pick);
  }
  return marks;
}
