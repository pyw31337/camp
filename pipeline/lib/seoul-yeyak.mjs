// 서울 열린데이터광장 · 서울시 공공서비스예약 정보 → 서울시·자치구 공영 캠핑장 예약 상품의 접수 상태·접수 기간.
// 접수 상태(접수중/마감 등)는 서울시 원문 값이며, 실제 빈자리는 예약 화면(yeyak.seoul.go.kr)에서만 확정된다.
import { haversineM } from "./geo.mjs";
import { nameSimilarity } from "./localdata-campgrounds.mjs";

export const SEOUL_BASE = "http://openapi.seoul.go.kr:8088";
// 종합(OA-20497)을 먼저 쓰고, 실패하면 분야별(시설대관·체육시설) 서비스로 대신한다.
export const SEOUL_SERVICES = ["tvYeyakCOllect", "ListPublicReservationInstitution", "ListPublicReservationSport"];
export const SEOUL_DATASET_URL = "https://data.seoul.go.kr/dataList/OA-20497/S/1/datasetView.do";
const CAMP_RE = /캠핑|야영|글램핑|카라반|오토캠/;

const pause = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const str = (v) => { const s = String(v ?? "").trim(); return s ? s : null; };
/** "2026-10-01 10:00:00.0" → "2026-10-01T10:00:00+09:00" */
export function seoulTime(v) {
  const m = String(v ?? "").match(/(\d{4})-?(\d{2})-?(\d{2})(?:[ T](\d{2}):?(\d{2})(?::?(\d{2}))?)?/);
  return m ? `${m[1]}-${m[2]}-${m[3]}T${m[4] ?? "00"}:${m[5] ?? "00"}:${m[6] ?? "00"}+09:00` : null;
}

/** 한 페이지 요청. 응답 형태: { [service]: { list_total_count, RESULT: {CODE, MESSAGE}, row: [] } } 또는 { RESULT } */
async function getPage(key, service, start, end, fetchImpl) {
  const url = `${SEOUL_BASE}/${encodeURIComponent(key)}/json/${service}/${start}/${end}/`;
  const response = await fetchImpl(url, { signal: AbortSignal.timeout(30000) });
  const text = await response.text();
  let body;
  try { body = JSON.parse(text); } catch { throw new Error(`${service} HTTP ${response.status} JSON 아님: ${text.slice(0, 120).replace(/\s+/g, " ")}`); }
  const block = body[service] ?? body;
  const code = block?.RESULT?.CODE ?? body?.RESULT?.CODE ?? null;
  if (code === "INFO-200") return { total: 0, rows: [] };
  if (code && code !== "INFO-000") throw new Error(`${service} ${code} ${block?.RESULT?.MESSAGE ?? body?.RESULT?.MESSAGE ?? ""}`.trim());
  return { total: Number(block?.list_total_count ?? 0), rows: block?.row ?? [] };
}

/** 서비스 전체를 1,000건씩 받는다(서울 API 한 번 최대 1,000건). */
export async function fetchSeoulService(key, service, { fetchImpl = fetch, wait = pause, maxRows = 20000 } = {}) {
  const rows = [];
  let total = Infinity;
  for (let start = 1; start <= Math.min(total, maxRows); start += 1000) {
    const page = await getPage(key, service, start, start + 999, fetchImpl);
    total = page.total;
    rows.push(...page.rows);
    if (!page.rows.length) break;
    await wait(200);
  }
  return { rows, total: Number.isFinite(total) ? total : rows.length };
}

// 장소명에만 “캠핑”이 들어간 숲체험·교육 프로그램(예: 중랑캠핑숲 유아 숲체험)은 빼고, 소분류나 상품명이 캠핑·야영인 것만 남긴다.
const PROGRAM_RE = /체험|교실|교육|강좌|탐험|해설|나들이|프로그램|축제|공연/;
export const isCampingService = (row) => CAMP_RE.test(`${row.MINCLASSNM ?? ""} ${row.SVCNM ?? ""}`) && !(PROGRAM_RE.test(row.SVCNM ?? "") && !CAMP_RE.test(row.MINCLASSNM ?? ""));

export function normalizeSeoulService(row, checkedAt) {
  let lng = Number(row.X), lat = Number(row.Y);
  if (lat > 100 && lng < 100) [lat, lng] = [lng, lat]; // 일부 행은 X·Y가 뒤바뀌어 있다.
  const located = lat > 33 && lat < 39 && lng > 124 && lng < 132;
  const id = str(row.SVCID);
  return {
    id,
    name: str(row.SVCNM),
    category: [str(row.MAXCLASSNM), str(row.MINCLASSNM)].filter(Boolean).join(" > ") || null,
    status: str(row.SVCSTATNM),
    place: str(row.PLACENM),
    district: str(row.AREANM),
    target: str(row.USETGTINFO),
    payment: str(row.PAYATNM),
    tel: str(row.TELNO),
    image_url: str(row.IMGURL),
    url: str(row.SVCURL) ?? (id ? `https://yeyak.seoul.go.kr/web/reservation/selectReservView.do?rsv_svc_id=${encodeURIComponent(id)}` : null),
    receipt: { from: seoulTime(row.RCPTBGNDT), to: seoulTime(row.RCPTENDDT) },
    use: { from: seoulTime(row.SVCOPNBGNDT), to: seoulTime(row.SVCOPNENDDT) },
    cancel_rule: str(row.REVSTDDAYNM) && str(row.REVSTDDAY) ? `${row.REVSTDDAYNM} ${row.REVSTDDAY}일 전` : null,
    lat: located ? lat : null,
    lng: located ? lng : null,
    checked_at: checkedAt,
    source_url: SEOUL_DATASET_URL,
    tier: "A",
  };
}

/**
 * 서울 예약 상품 → 고캠핑 캠핑장. 좌표가 있으면 2km 안에서 이름(장소명·상품명) 유사도로, 없으면 이름만으로 고른다.
 * @returns {Map<string, object[]>} 고캠핑 id → 서울 예약 상품 목록
 */
export function matchSeoulToCampgrounds(services, campgrounds) {
  const out = new Map();
  for (const s of services) {
    let best = null;
    for (const c of campgrounds) {
      if (!c.location) continue;
      const d = s.lat != null ? haversineM(s.lat, s.lng, c.location.lat, c.location.lng) : null;
      if (d != null && d > 2000) continue;
      const name = Math.max(nameSimilarity(s.place, c.name), nameSimilarity(s.name, c.name));
      const score = d == null ? name : name * 0.6 + (d <= 300 ? 0.4 : d <= 1000 ? 0.25 : 0.1);
      if (score >= (d == null ? 0.8 : 0.5) && (!best || score > best.score)) best = { id: String(c.external_id.id), score };
    }
    if (best) { if (!out.has(best.id)) out.set(best.id, []); out.get(best.id).push({ ...s, match_score: Math.round(best.score * 100) / 100 }); }
  }
  return out;
}
