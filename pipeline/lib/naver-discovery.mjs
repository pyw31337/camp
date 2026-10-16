// 네이버 검색 API(NAVER API HUB, 지역 검색)로 캠핑장의 네이버 등록 장소를 맞춘다.
// 얻는 것: 업장이 네이버에 등록한 홈페이지 링크·전화·분류·주소·좌표. 업장 사실이므로 교차 확인·홈페이지 발굴에 쓴다.
// HUB는 한시 무료(월 775,000건, 키당 50 RPS) — 유료 전환 공지 시 워크플로 입력값으로 호출을 0으로 줄인다.
// 인증 헤더: X-NCP-APIGW-API-KEY-ID / X-NCP-APIGW-API-KEY (저장소 비밀값 NAVER_API_HUB_CLIENT_ID / _SECRET)
import { isClosedHost, isOperatorHost } from "./operator-site.mjs";
import { nameSimilarity } from "./kakao-discovery.mjs";
import { haversineM } from "./geo.mjs";
import { isBillingError } from "./naver-guard.mjs";

export const NAVER_HUB_BASE = "https://naverapihub.apigw.ntruss.com";
// 문서마다 경로 표기가 달라 순서대로 시도하고, 처음 성공한 경로를 실행 동안 고정한다.
export const LOCAL_PATHS = ["/search/v1/local", "/search/v1/local.json", "/v1/search/local.json"];

const strip = (s) => String(s ?? "").replace(/<[^>]+>/g, "").replace(/&amp;/g, "&").replace(/&[a-z]+;|&#\d+;/g, " ").trim();
const digits = (s) => String(s ?? "").replace(/\D/g, "");
const CAMP_CATEGORY = /캠핑|야영|글램핑|카라반|숙박|휴양림|펜션|오토캠핑/;

/** 지역 검색 mapx/mapy → 위경도. 신규 응답은 WGS84×1e7 정수, 옛 응답은 KATECH라 범위로 구분한다. */
export function naverXY(mapx, mapy) {
  const x = Number(mapx), y = Number(mapy);
  if (!Number.isFinite(x) || !Number.isFinite(y)) return null;
  if (x > 1e8 && y > 1e7) return { lng: x / 1e7, lat: y / 1e7 };
  return null; // KATECH 등 다른 좌표계는 거리 계산에 쓰지 않는다
}

export function localUrl(path, query, display = 5) {
  const q = new URLSearchParams({ query, display: String(display), start: "1", sort: "random" });
  return `${NAVER_HUB_BASE}${path}?${q}`;
}

/** 검색어: 대괄호 지역 표기는 빼고, 시군구를 붙여 동명 업소를 줄인다. */
export const queryOf = (c) => `${String(c.name ?? "").replace(/\[[^\]]*\]\s*/g, "").trim()} ${c.sigungu ?? ""}`.trim();

/** 결과 중 이 캠핑장으로 볼 1곳(또는 null). 전화 일치 > 이름 + 거리 + 분류 */
export function matchNaver(c, items) {
  const tel = digits(c.tel);
  let best = null;
  for (const it of items ?? []) {
    const name = strip(it.title);
    const sim = nameSimilarity(c.name, name);
    const phone = Boolean(tel.length >= 8 && digits(it.telephone) === tel);
    const camp = CAMP_CATEGORY.test(it.category ?? "");
    const xy = naverXY(it.mapx, it.mapy);
    const dist = xy && Number.isFinite(c.lat) ? haversineM(c.lat, c.lng, xy.lat, xy.lng) : null;
    let score = sim * 60 + (phone ? 50 : 0) + (camp ? 15 : 0);
    if (dist != null) score += dist <= 300 ? 20 : dist <= 1000 ? 12 : dist <= 3000 ? 4 : -25;
    const ok = phone ? sim >= 0.3 || (dist != null && dist <= 1000) : sim >= 0.6 && (camp || sim >= 0.9) && (dist == null || dist <= 3000);
    if (ok && (!best || score > best.score)) best = { it, name, xy, score, sim, phone, dist };
  }
  if (!best) return null;
  const { it } = best;
  const link = it.link && /^https?:\/\//i.test(it.link) ? it.link : null;
  return {
    name: best.name, category: it.category || null, phone: it.telephone || null,
    road_address: it.roadAddress || null, address: it.address || null,
    link, link_is_operator: Boolean(link && isOperatorHost(link) && !isClosedHost(link)),
    lat: best.xy?.lat ?? null, lng: best.xy?.lng ?? null,
    match: { score: Math.round(best.score), name: Number(best.sim.toFixed(2)), phone: best.phone, distance_m: best.dist == null ? null : Math.round(best.dist) },
  };
}

/** HUB 호출 1회 → items. 한도·인증 오류는 code로 구분해 throw. */
export async function naverGet(url, { id, secret, fetchImpl = fetch, timeoutMs = 10000 }) {
  const res = await fetchImpl(url, { headers: { "X-NCP-APIGW-API-KEY-ID": id, "X-NCP-APIGW-API-KEY": secret }, signal: AbortSignal.timeout(timeoutMs) });
  const text = await res.text();
  if (!res.ok) {
    const e = new Error(`네이버 HUB HTTP ${res.status}: ${text.slice(0, 200)}`);
    e.status = res.status;
    e.code = isBillingError(res.status, text) ? "BILLING" : res.status === 429 ? "RATE_LIMIT" : res.status === 401 || res.status === 403 ? "AUTH" : res.status === 404 ? "NOT_FOUND" : "HTTP";
    throw e;
  }
  const j = JSON.parse(text);
  return Array.isArray(j?.items) ? j.items : [];
}
