// 기상청 단기예보 5km 격자(Lambert Conformal Conic) 변환. 기상청 「동네예보 조회서비스 활용가이드」의 공개 공식(lamcproj).
// 위경도 → (nx, ny). nx 1~149, ny 1~253 범위 밖이면 null.
const RE = 6371.00877, GRID = 5.0, SLAT1 = 30.0, SLAT2 = 60.0, OLON = 126.0, OLAT = 38.0, XO = 43, YO = 136;
const D = Math.PI / 180;
const re = RE / GRID, s1 = SLAT1 * D, s2 = SLAT2 * D, olon = OLON * D, olat = OLAT * D;
const sn = Math.log(Math.cos(s1) / Math.cos(s2)) / Math.log(Math.tan(Math.PI * 0.25 + s2 * 0.5) / Math.tan(Math.PI * 0.25 + s1 * 0.5));
const sf = (Math.tan(Math.PI * 0.25 + s1 * 0.5) ** sn * Math.cos(s1)) / sn;
const ro = (re * sf) / Math.tan(Math.PI * 0.25 + olat * 0.5) ** sn;

export function toKmaGrid(lat, lng) {
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
  const ra = (re * sf) / Math.tan(Math.PI * 0.25 + lat * D * 0.5) ** sn;
  let theta = lng * D - olon;
  if (theta > Math.PI) theta -= 2 * Math.PI;
  if (theta < -Math.PI) theta += 2 * Math.PI;
  theta *= sn;
  const nx = Math.floor(ra * Math.sin(theta) + XO + 0.5), ny = Math.floor(ro - ra * Math.cos(theta) + YO + 0.5);
  return nx >= 1 && nx <= 149 && ny >= 1 && ny <= 253 ? { nx, ny } : null;
}
