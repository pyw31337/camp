// 서울 열린데이터광장 · 서울시 공공서비스예약 정보 → 서울시·자치구 공영 캠핑장 예약 상품의 접수 상태·접수 기간.
// 접수 상태(접수중/마감 등)는 서울시 원문 값이며, 실제 빈자리는 예약 화면(yeyak.seoul.go.kr)에서만 확정된다.
import { haversineM } from "./geo.mjs";
import { nameSimilarity } from "./localdata-campgrounds.mjs";

export const SEOUL_BASE = "http://openapi.seoul.go.kr:8088";
// 종합(OA-20497)을 먼저 쓰고, 실패하면 분야별(시설대관·체육시설) 서비스로 대신한다.
export const SEOUL_SERVICES = ["tvYeyakCOllect", "ListPublicReservationInstitution", "ListPublicReservationSport"];
export const SEOUL_DATASET_URL = "https://data.seoul.go.kr/dataList/OA-20497/S/1/datasetView.do";
const CAMP_RE = /캠핑|야영|글램핑|카라반|오토캠/;
const OPEN_STATUS_RE = /접수\s*중|예약\s*가능/;
const CLOSED_STATUS_RE = /마감|종료|취소|대기/;

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
// ‘난지캠핑장 옆 야구장’처럼 장소 설명에 캠핑장이 붙은 대관은 숙박 후보가 아니다.
// 당일 바비큐·피크닉도 날짜 범위는 있어도 텐트 사이트 예약이 아니므로 제외한다.
const NON_CAMPING_RE = /야구|축구|농구|배드민턴|테니스|족구|배구|풋살|운동장|체육관|체육시설|수영장/;
const DAY_USE_RE = /바비큐|피크닉|캠프닉|당일\s*(?:이용|대여|체험)|숙박\s*없이/;
export const isCampingService = (row) => {
  const name = String(row.SVCNM ?? "");
  const category = String(row.MINCLASSNM ?? "");
  if (!CAMP_RE.test(`${category} ${name}`)) return false;
  if (NON_CAMPING_RE.test(name) || DAY_USE_RE.test(name)) return false;
  return !(PROGRAM_RE.test(name) && !CAMP_RE.test(category));
};

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
 * 서울 공공예약 원문이 “접수중”이라고 응답한 경우만 참이다.
 * 이것은 특정 사이트의 잔여 수량이나 즉시 확정 가능을 뜻하지 않는다.
 */
export function isOfficialApplicationOpen(service) {
  const status = String(service?.status ?? "").replace(/\s+/g, "");
  return OPEN_STATUS_RE.test(status) && !CLOSED_STATUS_RE.test(status);
}

/** 원문의 접수 상태와 접수 기간이 모두 현재 시각을 포함하는지 확인한다. */
export function isReceiptOpen(service, now = new Date()) {
  if (!isOfficialApplicationOpen(service)) return false;
  const at = now instanceof Date ? now.getTime() : Date.parse(now);
  const from = Date.parse(service?.receipt?.from ?? "");
  const to = Date.parse(service?.receipt?.to ?? "");
  if (!Number.isFinite(at) || !Number.isFinite(from) || !Number.isFinite(to)) return false;
  return from <= at && at <= to;
}

const dateOnly = (value) => String(value ?? "").match(/^\d{4}-\d{2}-\d{2}/)?.[0] ?? null;
const utcDay = (value) => {
  const day = dateOnly(value);
  if (!day) return null;
  const [year, month, date] = day.split("-").map(Number);
  return Date.UTC(year, month - 1, date);
};
const previousDate = (value) => {
  const day = utcDay(value);
  return day == null ? null : new Date(day - 86400000).toISOString().slice(0, 10);
};

/**
 * 이용 기간이 숙박의 모든 밤을 덮는지 확인한다. 이용 기간이 누락되었거나
 * 당일 체험처럼 요청한 숙박 전체를 덮지 않으면 후보에 포함하지 않는다.
 */
export function serviceCoversStay(service, checkIn, checkOut) {
  const start = utcDay(service?.use?.from);
  const end = utcDay(service?.use?.to);
  const requestedStart = utcDay(checkIn);
  const requestedLastNight = utcDay(previousDate(checkOut));
  if ([start, end, requestedStart, requestedLastNight].some((value) => value == null)) return false;
  return start <= requestedStart && end >= requestedLastNight;
}

function campgroundCoordinates(campground) {
  const lat = Number(campground?.location?.lat ?? campground?.lat);
  const lng = Number(campground?.location?.lng ?? campground?.lng);
  return Number.isFinite(lat) && Number.isFinite(lng) ? { lat, lng } : null;
}

function campgroundId(campground) {
  const id = campground?.external_id?.id ?? campground?.id;
  return id == null ? null : String(id);
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
      const location = campgroundCoordinates(c);
      const id = campgroundId(c);
      if (!location || !id) continue;
      const d = s.lat != null ? haversineM(s.lat, s.lng, location.lat, location.lng) : null;
      if (d != null && d > 2000) continue;
      const name = Math.max(nameSimilarity(s.place, c.name), nameSimilarity(s.name, c.name));
      const score = d == null ? name : name * 0.6 + (d <= 300 ? 0.4 : d <= 1000 ? 0.25 : 0.1);
      if (score >= (d == null ? 0.8 : 0.5) && (!best || score > best.score)) best = { id, score };
    }
    if (best) { if (!out.has(best.id)) out.set(best.id, []); out.get(best.id).push({ ...s, match_score: Math.round(best.score * 100) / 100 }); }
  }
  return out;
}
