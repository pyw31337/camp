// EPSG:5174(Korean 1985 / Modified Central Belt, Bessel 1841, 보정계수 없는 중부원점 TM) → WGS84 변환.
// 행정안전부 LOCALDATA 계열(인허가·공중화장실 등) 파일의 좌표정보(X)/(Y)가 이 좌표계다.
// 정밀도: 3-파라미터 데이텀 변환(TOWGS84 -146.43, 507.89, 681.46)이라 수 m 오차가 있을 수 있다.

const BESSEL = { a: 6377397.155, f: 1 / 299.1528128 };
const WGS84 = { a: 6378137, f: 1 / 298.257223563 };
const P5174 = { lat0: 38, lon0: 127.0028902777778, k0: 1, x0: 200000, y0: 500000, towgs84: [-146.43, 507.89, 681.46] };
const RAD = Math.PI / 180;

function meridianArc(phi, a, e2) {
  const e4 = e2 * e2, e6 = e4 * e2;
  return a * ((1 - e2 / 4 - 3 * e4 / 64 - 5 * e6 / 256) * phi
    - (3 * e2 / 8 + 3 * e4 / 32 + 45 * e6 / 1024) * Math.sin(2 * phi)
    + (15 * e4 / 256 + 45 * e6 / 1024) * Math.sin(4 * phi)
    - (35 * e6 / 3072) * Math.sin(6 * phi));
}

/** 횡메르카토르 역변환(Snyder) → 타원체 위경도(도) */
function tmInverse(x, y, { a, f }, { lat0, lon0, k0, x0, y0 }) {
  const e2 = 2 * f - f * f, ep2 = e2 / (1 - e2);
  const M = meridianArc(lat0 * RAD, a, e2) + (y - y0) / k0;
  const mu = M / (a * (1 - e2 / 4 - 3 * e2 * e2 / 64 - 5 * e2 ** 3 / 256));
  const e1 = (1 - Math.sqrt(1 - e2)) / (1 + Math.sqrt(1 - e2));
  const phi1 = mu + (3 * e1 / 2 - 27 * e1 ** 3 / 32) * Math.sin(2 * mu) + (21 * e1 ** 2 / 16 - 55 * e1 ** 4 / 32) * Math.sin(4 * mu)
    + (151 * e1 ** 3 / 96) * Math.sin(6 * mu) + (1097 * e1 ** 4 / 512) * Math.sin(8 * mu);
  const C1 = ep2 * Math.cos(phi1) ** 2, T1 = Math.tan(phi1) ** 2;
  const N1 = a / Math.sqrt(1 - e2 * Math.sin(phi1) ** 2);
  const R1 = a * (1 - e2) / (1 - e2 * Math.sin(phi1) ** 2) ** 1.5;
  const D = (x - x0) / (N1 * k0);
  const lat = phi1 - (N1 * Math.tan(phi1) / R1) * (D ** 2 / 2 - (5 + 3 * T1 + 10 * C1 - 4 * C1 ** 2 - 9 * ep2) * D ** 4 / 24
    + (61 + 90 * T1 + 298 * C1 + 45 * T1 ** 2 - 252 * ep2 - 3 * C1 ** 2) * D ** 6 / 720);
  const lon = lon0 * RAD + (D - (1 + 2 * T1 + C1) * D ** 3 / 6 + (5 - 2 * C1 + 28 * T1 - 3 * C1 ** 2 + 8 * ep2 + 24 * T1 ** 2) * D ** 5 / 120) / Math.cos(phi1);
  return [lat / RAD, lon / RAD];
}

/** 순변환(검증용) */
export function tmForward(lat, lon, { a, f } = BESSEL, p = P5174) {
  const e2 = 2 * f - f * f, ep2 = e2 / (1 - e2);
  const phi = lat * RAD, lam = lon * RAD, lam0 = p.lon0 * RAD;
  const N = a / Math.sqrt(1 - e2 * Math.sin(phi) ** 2);
  const T = Math.tan(phi) ** 2, C = ep2 * Math.cos(phi) ** 2, A = (lam - lam0) * Math.cos(phi);
  const M = meridianArc(phi, a, e2), M0 = meridianArc(p.lat0 * RAD, a, e2);
  const x = p.x0 + p.k0 * N * (A + (1 - T + C) * A ** 3 / 6 + (5 - 18 * T + T * T + 72 * C - 58 * ep2) * A ** 5 / 120);
  const y = p.y0 + p.k0 * (M - M0 + N * Math.tan(phi) * (A * A / 2 + (5 - T + 9 * C + 4 * C * C) * A ** 4 / 24 + (61 - 58 * T + T * T + 600 * C - 330 * ep2) * A ** 6 / 720));
  return [x, y];
}

function geodeticToEcef(lat, lon, h, { a, f }) {
  const e2 = 2 * f - f * f, phi = lat * RAD, lam = lon * RAD;
  const N = a / Math.sqrt(1 - e2 * Math.sin(phi) ** 2);
  return [(N + h) * Math.cos(phi) * Math.cos(lam), (N + h) * Math.cos(phi) * Math.sin(lam), (N * (1 - e2) + h) * Math.sin(phi)];
}

function ecefToGeodetic(X, Y, Z, { a, f }) {
  const e2 = 2 * f - f * f, p = Math.hypot(X, Y);
  let phi = Math.atan2(Z, p * (1 - e2));
  for (let i = 0; i < 6; i++) {
    const N = a / Math.sqrt(1 - e2 * Math.sin(phi) ** 2);
    phi = Math.atan2(Z + e2 * N * Math.sin(phi), p);
  }
  return [phi / RAD, Math.atan2(Y, X) / RAD];
}

/** EPSG:5174 (x=동향, y=북향, m) → WGS84 [lat, lng] */
export function epsg5174ToWgs84(x, y) {
  const [latB, lonB] = tmInverse(Number(x), Number(y), BESSEL, P5174);
  const [X, Y, Z] = geodeticToEcef(latB, lonB, 0, BESSEL);
  const [dx, dy, dz] = P5174.towgs84;
  return ecefToGeodetic(X + dx, Y + dy, Z + dz, WGS84);
}
