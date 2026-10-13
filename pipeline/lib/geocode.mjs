// 주소 → 좌표(WGS84). 카카오 로컬 주소 검색을 쓰고, 결과를 캐시해 같은 주소는 다시 묻지 않는다.
// 공중화장실 좌표는 2025-02부터 원천에서 빠져 주소 지오코딩 값(건물·필지 대표점)이라 실제 위치와 수십~수백 m 다를 수 있다.

import { inKorea } from "./geo.mjs";

const KAKAO_URL = "https://dapi.kakao.com/v2/local/search/address.json";

/** 카카오 주소 검색 1건. 실패·없음은 null */
export async function kakaoGeocode(query, { key, fetchImpl = fetch }) {
  const res = await fetchImpl(`${KAKAO_URL}?query=${encodeURIComponent(query)}&size=1`, {
    headers: { Authorization: `KakaoAK ${key}` },
    signal: AbortSignal.timeout(10000),
  });
  if (res.status === 429) { const e = new Error("카카오 호출 한도 초과"); e.code = "RATE_LIMIT"; throw e; }
  if (res.status === 401 || res.status === 403) { const e = new Error(`카카오 인증 실패(HTTP ${res.status})`); e.code = "AUTH"; throw e; }
  if (!res.ok) return null;
  const doc = (await res.json())?.documents?.[0];
  if (!doc) return null;
  const lat = Number(doc.y), lng = Number(doc.x);
  return inKorea(lat, lng) ? { lat, lng, precision: doc.road_address ? "ROAD" : "PARCEL" } : null;
}

/**
 * 캐시를 써서 여러 주소를 지오코딩한다.
 * @param {string[]} queries
 * @param {Record<string, {lat:number,lng:number,precision:string}|{miss:true,at:string}>} cache 변경된다
 * @param {{geocode:(q:string)=>Promise<any>, maxCalls?:number, concurrency?:number, missRetryDays?:number, today?:string}} opts
 */
export async function geocodeAll(queries, cache, { geocode, maxCalls = 30000, concurrency = 8, missRetryDays = 30, today = new Date().toISOString().slice(0, 10) }) {
  const stale = (v) => v?.miss && (Date.parse(today) - Date.parse(v.at)) / 864e5 >= missRetryDays;
  const todo = [...new Set(queries.filter((q) => q && (!(q in cache) || stale(cache[q]))))];
  const batch = todo.slice(0, maxCalls);
  let calls = 0, hits = 0, misses = 0, stopped = null;
  let i = 0;
  const worker = async () => {
    while (i < batch.length && !stopped) {
      const q = batch[i++];
      try {
        calls++;
        const r = await geocode(q);
        if (r) { cache[q] = r; hits++; } else { cache[q] = { miss: true, at: today }; misses++; }
      } catch (e) {
        if (e.code === "RATE_LIMIT" || e.code === "AUTH") stopped = e;
      }
    }
  };
  await Promise.all(Array.from({ length: Math.min(concurrency, batch.length) }, worker));
  return { requested: todo.length, calls, hits, misses, remaining: Math.max(0, todo.length - calls), stopped: stopped?.message ?? null };
}
