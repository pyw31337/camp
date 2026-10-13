// 위경도 거리 계산과 격자 색인(반경 검색).

const R = 6371008.8; // 지구 평균 반지름(m)
const rad = (d) => (d * Math.PI) / 180;

export function haversineM(lat1, lng1, lat2, lng2) {
  const dLat = rad(lat2 - lat1);
  const dLng = rad(lng2 - lng1);
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(rad(lat1)) * Math.cos(rad(lat2)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(a)));
}

/** 대한민국 범위 안의 좌표인지(제주·울릉·독도 포함, 대략) */
export function inKorea(lat, lng) {
  return Number.isFinite(lat) && Number.isFinite(lng) && lat >= 32.9 && lat <= 38.7 && lng >= 124.5 && lng <= 132;
}

/** 0.01°(약 1.1km) 격자에 점을 넣고 반경 안의 점을 거리순으로 찾는다. */
export class GridIndex {
  constructor(points, cell = 0.01) {
    this.cell = cell;
    this.map = new Map();
    for (const p of points) {
      const k = this.key(p.lat, p.lng);
      if (!this.map.has(k)) this.map.set(k, []);
      this.map.get(k).push(p);
    }
  }
  key(lat, lng) { return `${Math.floor(lat / this.cell)}:${Math.floor(lng / this.cell)}`; }
  /** @returns {{point: object, distance_m: number}[]} */
  within(lat, lng, radiusM, limit = Infinity) {
    const span = Math.ceil(radiusM / (this.cell * 111000 * Math.max(0.2, Math.cos(rad(lat))))) + 1;
    const cy = Math.floor(lat / this.cell);
    const cx = Math.floor(lng / this.cell);
    const out = [];
    for (let y = cy - span; y <= cy + span; y++) {
      for (let x = cx - span; x <= cx + span; x++) {
        for (const p of this.map.get(`${y}:${x}`) ?? []) {
          const d = haversineM(lat, lng, p.lat, p.lng);
          if (d <= radiusM) out.push({ point: p, distance_m: Math.round(d) });
        }
      }
    }
    return out.sort((a, b) => a.distance_m - b.distance_m).slice(0, limit);
  }
}
