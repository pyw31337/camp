// 주간 날씨 공통 로직(순수 함수). 네트워크·파일은 scripts/sync-forecast.mjs, build-condition-mapping.mjs. (산불·물때 파서는 활용신청·경로 확인 뒤 다시 쓰려고 남겨 둠)
// 원천(모두 공공데이터포털 같은 인증키, 서비스마다 활용신청 필요):
//   기상청 단기예보 15084084 · 중기예보 15059468 · 기상특보 15000415 · 에어코리아 대기오염정보 15073861·측정소정보 15073877
//   산림청 산불위험예보 15084817 · 국립해양조사원 조석예보(고·저조) 15156018
import { toKmaGrid } from "./kma-grid.mjs";

// 중기육상예보 구역(광역). 강원은 영동(동해안 7개 시군)·영서로 나눈다.
export const MID_LAND = { 서울: "11B00000", 인천: "11B00000", 경기: "11B00000", 강원영서: "11D10000", 강원영동: "11D20000", 대전: "11C20000", 세종: "11C20000", 충남: "11C20000",
  충북: "11C10000", 광주: "11F20000", 전남: "11F20000", 전북: "11F10000", 대구: "11H10000", 경북: "11H10000", 부산: "11H20000", 울산: "11H20000", 경남: "11H20000", 제주: "11G00000" };
const GANGWON_EAST = /강릉|동해|삼척|속초|고성|양양|태백/;
// 중기기온 도시(예보구역코드, 기상청 활용가이드 별첨). 좌표는 시청 부근 근사값 — 가장 가까운 도시를 고르는 데만 쓴다.
export const MID_TA_CITIES = [
  ["11B10101", "서울", 37.566, 126.978, "11B00000"], ["11B20201", "인천", 37.456, 126.705, "11B00000"], ["11B20601", "수원", 37.263, 127.029, "11B00000"], ["11B20305", "파주", 37.760, 126.780, "11B00000"],
  ["11D10301", "춘천", 37.881, 127.730, "11D10000"], ["11D10401", "원주", 37.342, 127.920, "11D10000"], ["11D20501", "강릉", 37.752, 128.876, "11D20000"],
  ["11C20401", "대전", 36.351, 127.385, "11C20000"], ["11C20101", "서산", 36.785, 126.450, "11C20000"], ["11C20404", "세종", 36.480, 127.289, "11C20000"], ["11C10301", "청주", 36.642, 127.489, "11C10000"],
  ["11G00201", "제주", 33.500, 126.531, "11G00000"], ["11G00401", "서귀포", 33.254, 126.560, "11G00000"],
  ["11F20501", "광주", 35.160, 126.852, "11F20000"], ["21F20801", "목포", 34.812, 126.392, "11F20000"], ["11F20401", "여수", 34.760, 127.662, "11F20000"],
  ["11F10201", "전주", 35.824, 127.148, "11F10000"], ["21F10501", "군산", 35.968, 126.737, "11F10000"],
  ["11H20201", "부산", 35.180, 129.075, "11H20000"], ["11H20101", "울산", 35.538, 129.311, "11H20000"], ["11H20301", "창원", 35.228, 128.681, "11H20000"],
  ["11H10701", "대구", 35.871, 128.601, "11H10000"], ["11H10501", "안동", 36.568, 128.730, "11H10000"], ["11H10201", "포항", 36.019, 129.343, "11H10000"],
];
const SIDO_SHORT = [[/서울/, "서울"], [/인천/, "인천"], [/경기/, "경기"], [/강원/, "강원"], [/대전/, "대전"], [/세종/, "세종"], [/충청남|충남/, "충남"], [/충청북|충북/, "충북"],
  [/광주/, "광주"], [/전라남|전남/, "전남"], [/전라북|전북/, "전북"], [/대구/, "대구"], [/경상북|경북/, "경북"], [/부산/, "부산"], [/울산/, "울산"], [/경상남|경남/, "경남"], [/제주/, "제주"]];
export const sidoShort = (s) => SIDO_SHORT.find(([re]) => re.test(String(s ?? "")))?.[1] ?? null;

export function haversineKm(a, b, c, d) {
  const r = Math.PI / 180, x = Math.sin(((c - a) * r) / 2) ** 2 + Math.cos(a * r) * Math.cos(c * r) * Math.sin(((d - b) * r) / 2) ** 2;
  return 12742 * Math.asin(Math.sqrt(x));
}
export function nearest(lat, lng, points, maxKm = Infinity) {
  let best = null;
  for (const p of points) { const km = haversineKm(lat, lng, p.lat, p.lng); if (km <= maxKm && (!best || km < best.km)) best = { ...p, km: Math.round(km * 10) / 10 }; }
  return best;
}

export function midLandOf(sido, sigungu) {
  const s = sidoShort(sido);
  if (s === "강원") return MID_LAND[GANGWON_EAST.test(String(sigungu ?? "")) ? "강원영동" : "강원영서"];
  return s ? MID_LAND[s] : null;
}
export function midTaOf(lat, lng, land) {
  const cities = MID_TA_CITIES.map(([code, name, la, ln, l]) => ({ code, name, lat: la, lng: ln, land: l }));
  return nearest(lat, lng, cities.filter((c) => c.land === land)) ?? nearest(lat, lng, cities);
}

/**
 * 캠핑장 → 수집 단위 대응표 1행. air·tide는 측정소·조석 예보지점 목록(좌표)을 API로 받았을 때만 채운다.
 * @returns {{nx,ny,land,ta,sido,sigungu,air?,air_km?,tide?,tide_km?}|null}
 */
export function mapCampground(c, { airStations = [], tideStations = [], tideMaxKm = 25 } = {}) {
  if (!Number.isFinite(c?.lat) || !Number.isFinite(c?.lng)) return null;
  const g = toKmaGrid(c.lat, c.lng);
  if (!g) return null;
  const land = midLandOf(c.sido, c.sigungu);
  const row = { nx: g.nx, ny: g.ny, land, ta: midTaOf(c.lat, c.lng, land)?.code ?? null, sido: sidoShort(c.sido), sigungu: c.sigungu ?? null };
  const air = airStations.length ? nearest(c.lat, c.lng, airStations, 40) : null;
  if (air) Object.assign(row, { air: air.name, air_km: air.km });
  const tide = tideStations.length ? nearest(c.lat, c.lng, tideStations, tideMaxKm) : null;
  if (tide) Object.assign(row, { tide: tide.code, tide_km: tide.km });
  return row;
}

// ── 발표 시각
const pad = (n) => String(n).padStart(2, "0");
const kst = (ms) => new Date(ms + 9 * 3600e3);
export const ymdOf = (d) => `${d.getUTCFullYear()}${pad(d.getUTCMonth() + 1)}${pad(d.getUTCDate())}`;
export const isoDay = (d) => `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`;
/** 단기예보 최신 발표(02·05·…·23시, 발표 10분 뒤부터 조회 가능) */
export function shortBase(nowMs = Date.now()) {
  const k = kst(nowMs - 15 * 60e3);
  const h = [23, 20, 17, 14, 11, 8, 5, 2].find((x) => x <= k.getUTCHours());
  if (h == null) { const y = kst(nowMs - 15 * 60e3 - 86400e3); return { base_date: ymdOf(y), base_time: "2300" }; }
  return { base_date: ymdOf(k), base_time: `${pad(h)}00` };
}
/** 중기예보 최신 발표 tmFc(06·18시) */
export function midTmFc(nowMs = Date.now()) {
  const k = kst(nowMs - 30 * 60e3), h = k.getUTCHours();
  if (h >= 18) return `${ymdOf(k)}1800`;
  if (h >= 6) return `${ymdOf(k)}0600`;
  return `${ymdOf(kst(nowMs - 30 * 60e3 - 86400e3))}1800`;
}
/** 다가오는 주말(토·일). 오늘이 토·일이면 이번 주말. */
export function upcomingWeekend(nowMs = Date.now()) {
  const k = kst(nowMs), dow = k.getUTCDay();
  const toSat = dow === 6 ? 0 : dow === 0 ? -1 : 6 - dow;
  const sat = new Date(k.getTime() + toSat * 86400e3), sun = new Date(sat.getTime() + 86400e3);
  const today = new Date(Date.UTC(k.getUTCFullYear(), k.getUTCMonth(), k.getUTCDate()));
  const daysAhead = Math.round((Date.UTC(sat.getUTCFullYear(), sat.getUTCMonth(), sat.getUTCDate()) - today.getTime()) / 86400e3);
  return { sat: isoDay(sat), sun: isoDay(sun), days_ahead: daysAhead };
}

// ── 응답 정리
export function itemsOf(json) {
  const it = json?.response?.body?.items?.item ?? json?.response?.body?.items ?? json?.body?.items?.item ?? json?.body?.items ?? json?.items ?? [];
  return Array.isArray(it) ? it : it ? [it] : [];
}
export function apiProblem(status, text) {
  if (/SERVICE_KEY_IS_NOT_REGISTERED|not registered|등록되지 않은|PERMISSION_DENIED/i.test(text)) return "NOT_REGISTERED";
  if (/LIMITED_NUMBER_OF_SERVICE_REQUESTS/i.test(text)) return "QUOTA";
  if (/DEADLINE_HAS_EXPIRED/i.test(text)) return "EXPIRED";
  if (status === 401 || /Unauthorized/i.test(text)) return "UNAUTHORIZED";
  if (status === 404 || /API not found|NO_OPENAPI_SERVICE/i.test(text)) return "NOT_FOUND";
  if (status >= 500) return `HTTP_${status}`;
  try {
    const j = JSON.parse(text), code = String(j?.response?.header?.resultCode ?? j?.header?.resultCode ?? "00");
    if (["00", "0000", "03"].includes(code)) return null; // 03 = NODATA
    return `CODE_${code}`;
  } catch { return /<returnAuthMsg>|<errMsg>/.test(text) ? "NOT_REGISTERED" : "NOT_JSON"; }
}

const SKY = { 1: "맑음", 3: "구름많음", 4: "흐림" };
const PTY = { 1: "비", 2: "비/눈", 3: "눈", 4: "소나기", 5: "빗방울", 6: "빗방울눈날림", 7: "눈날림" };
/** 단기예보 항목들 → 날짜별 요약 {YYYY-MM-DD: {tmin,tmax,pop,sky,pty,wsd,pcp}} */
export function summarizeShort(items) {
  const days = {};
  for (const it of items) {
    const d = `${it.fcstDate.slice(0, 4)}-${it.fcstDate.slice(4, 6)}-${it.fcstDate.slice(6, 8)}`, h = Number(String(it.fcstTime).slice(0, 2));
    const x = (days[d] ??= { tmin: null, tmax: null, pop: 0, sky: {}, pty: null, wsd: 0, rain: false });
    const v = it.fcstValue, n = Number(v);
    if (it.category === "TMN" && Number.isFinite(n)) x.tmin = n;
    else if (it.category === "TMX" && Number.isFinite(n)) x.tmax = n;
    else if (it.category === "TMP" && Number.isFinite(n)) { x._lo = Math.min(x._lo ?? n, n); x._hi = Math.max(x._hi ?? n, n); x._n = (x._n ?? 0) + 1; }
    else if (it.category === "POP" && Number.isFinite(n)) x.pop = Math.max(x.pop, n);
    else if (it.category === "SKY" && h >= 6 && h <= 21) x.sky[n] = (x.sky[n] ?? 0) + 1;
    else if (it.category === "PTY" && n > 0) { x.rain = true; x.pty ??= PTY[n] ?? "강수"; }
    else if (it.category === "WSD" && Number.isFinite(n)) x.wsd = Math.max(x.wsd, n);
  }
  for (const [d, x] of Object.entries(days)) {
    // 예보 끝자락(자정 한두 시간만 있는 날)은 하루 요약이 될 수 없어 뺀다.
    if (!Object.keys(x.sky).length && (x._n ?? 0) < 6 && x.tmin == null && x.tmax == null) { delete days[d]; continue; }
    x.tmin ??= x._lo ?? null; x.tmax ??= x._hi ?? null; delete x._lo; delete x._hi; delete x._n;
    const top = Object.entries(x.sky).sort((a, b) => b[1] - a[1])[0];
    x.sky = top ? SKY[top[0]] ?? null : null;
    if (!x.rain) x.pty = null;
    delete x.rain;
  }
  return days;
}
/** 중기육상(wf·rnSt)·중기기온(taMin·taMax) → n일 후 요약. tmFc 기준 날짜에 n일을 더한다. */
export function summarizeMid(land, ta, tmFc) {
  const base = Date.UTC(+tmFc.slice(0, 4), +tmFc.slice(4, 6) - 1, +tmFc.slice(6, 8));
  const out = {};
  for (let n = 4; n <= 10; n++) {
    const d = isoDay(new Date(base + n * 86400e3));
    const wf = land?.[`wf${n}Pm`] ?? land?.[`wf${n}`] ?? null, pop = Math.max(Number(land?.[`rnSt${n}Am`] ?? 0), Number(land?.[`rnSt${n}Pm`] ?? 0), Number(land?.[`rnSt${n}`] ?? 0));
    const tmin = ta?.[`taMin${n}`], tmax = ta?.[`taMax${n}`];
    if (wf == null && tmin == null) continue;
    const am = land?.[`wf${n}Am`] ?? land?.[`wf${n}`] ?? null, pm = land?.[`wf${n}Pm`] ?? land?.[`wf${n}`] ?? null;
    out[d] = { sky: wf, sky_am: am, sky_pm: pm, pop: Number.isFinite(pop) ? pop : null, tmin: tmin == null ? null : Number(tmin), tmax: tmax == null ? null : Number(tmax) };
  }
  return out;
}
/** 에어코리아 등급(1좋음~4매우나쁨). 등급 칸이 비면 환경부 기준으로 농도에서 계산 */
export function airGrade(pm10, pm25) {
  const g10 = pm10 == null ? null : pm10 <= 30 ? 1 : pm10 <= 80 ? 2 : pm10 <= 150 ? 3 : 4;
  const g25 = pm25 == null ? null : pm25 <= 15 ? 1 : pm25 <= 35 ? 2 : pm25 <= 75 ? 3 : 4;
  return Math.max(g10 ?? 0, g25 ?? 0) || null;
}
const num = (v) => { const n = Number(v); return v === "" || v == null || v === "-" || !Number.isFinite(n) ? null : n; };
export function summarizeAir(items) {
  const out = {};
  for (const it of items) {
    const pm10 = num(it.pm10Value), pm25 = num(it.pm25Value);
    if (!it.stationName || (pm10 == null && pm25 == null)) continue;
    out[it.stationName] = { pm10, pm25, grade: airGrade(pm10, pm25), at: it.dataTime ?? null, sido: it.sidoName ?? null };
  }
  return out;
}
const median = (xs) => { const v = xs.filter((x) => x != null).sort((a, b) => a - b); return v.length ? v[Math.floor((v.length - 1) / 2)] : null; };
// 2026년 전남·광주 통합(전남광주통합특별시)처럼 시도 이름이 원천마다 다를 수 있어 넓게 맞춘다.
const SIDO_GROUP = [["광주", "전남"]];
export function sidoKey(table, sido) {
  if (!sido || !table) return null;
  if (table[sido]) return sido;
  const group = SIDO_GROUP.find((g) => g.includes(sido)) ?? [sido];
  return Object.keys(table).find((k) => group.some((g) => k.includes(g))) ?? null;
}
/** 측정소 좌표(측정소정보 API)가 없을 때의 대안: 시도별 중앙값 */
export function airBySido(stations) {
  const by = {};
  for (const s of Object.values(stations)) if (s.sido) (by[s.sido] ??= []).push(s);
  return Object.fromEntries(Object.entries(by).map(([sido, list]) => {
    const pm10 = median(list.map((x) => x.pm10)), pm25 = median(list.map((x) => x.pm25));
    return [sido, { pm10, pm25, grade: airGrade(pm10, pm25), stations: list.length, at: list.map((x) => x.at).filter(Boolean).sort().at(-1) ?? null }];
  }));
}
/** 조석 고·저조 → [{t:"HH:MM", type:"고조"|"저조", h:cm}] (응답 필드명이 다를 수 있어 넓게 찾는다) */
export function summarizeTide(items) {
  const pick = (o, re) => { const k = Object.keys(o).find((x) => re.test(x)); return k ? o[k] : null; };
  return items.map((it) => {
    const t = String(pick(it, /^(predcDt|tph_time|recordTime|predcTm|.*[Dd]t)$/) ?? "");
    const kind = String(pick(it, /^(extrSe|hl_code|.*[Ss]e|.*[Cc]ode)$/) ?? "");
    const h = num(pick(it, /^(predcTdlvVl|tph_level|.*[Vv]l|.*[Ll]evel)$/));
    const hm = t.match(/(\d{2}):?(\d{2})(?::\d{2})?$/);
    return { t: hm ? `${hm[1]}:${hm[2]}` : null, type: /고|high|^[13]$/i.test(kind) ? "고조" : /저|low|^[24]$/i.test(kind) ? "저조" : null, h };
  }).filter((x) => x.t && x.type);
}
/** 산불위험예보 지수 → 등급(산림청 4단계 구간) */
export const fireGrade = (idx) => (idx == null ? null : idx >= 86 ? "매우높음" : idx >= 66 ? "높음" : idx >= 51 ? "다소높음" : "낮음");
/** 산불위험예보 1행(문서: doname·meanavg·maxi·d1~d4 면적 비율·analdate) → {name, idx, grade, at} */
export function fireRow(it) {
  const name = Object.entries(it).filter(([k, v]) => typeof v === "string" && /^(doname|sido.*|sigun.*|sigungu.*|.*nm|.*name)$/i.test(k) && !/^(resultMsg|searchcd)$/i.test(k)).map(([, v]) => v.trim()).filter(Boolean).join(" ");
  const idx = num(it.meanavg ?? it.meanAvg ?? it.maxi);
  if (!name || idx == null) return null;
  const share = [num(it.d1), num(it.d2), num(it.d3), num(it.d4)];
  const LABEL = ["낮음", "다소높음", "높음", "매우높음"];
  // 면적 비율이 있으면 10% 이상을 차지하는 가장 높은 등급, 없으면 평균 지수 구간
  const byShare = share.every((x) => x != null) ? LABEL[[3, 2, 1, 0].find((i) => share[i] >= 10) ?? 0] : null;
  return { name, idx: Math.round(idx), grade: byShare ?? fireGrade(idx), at: it.analdate ?? null };
}
