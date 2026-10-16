// 한국관광공사 고캠핑 정보 조회서비스(data.go.kr 15101933) 수집·정규화.
// 필드명은 공개 활용 사례에서 쓰이는 응답 키 기준이며, 인증키 발급 후 실제 응답으로 고정한다(docs/RESEARCH_DATA_TO_UX.md 6장).

import { fetchDataGoKr, serviceKeyParam } from "./datagokr.mjs";

export { serviceKeyParam };
export const GOCAMPING_BASE = "https://apis.data.go.kr/B551011/GoCamping";

const OPERATOR = {
  지자체: "LOCAL_GOVERNMENT",
  국립공원: "NATIONAL_PARK",
  자연휴양림: "NATURAL_RECREATION_FOREST",
  국민여가: "PUBLIC_LEISURE",
  민간: "PRIVATE",
};
const FLOORS = [["siteBottomCl1", "GRASS"], ["siteBottomCl2", "CRUSHED_STONE"], ["siteBottomCl3", "DECK"], ["siteBottomCl4", "GRAVEL"], ["siteBottomCl5", "SOIL"]];
const SITE_COUNTS = [["gnrlSiteCo", "PITCH"], ["autoSiteCo", "AUTO_PITCH"], ["glampSiteCo", "GLAMPING"], ["caravSiteCo", "CARAVAN_RENTAL"], ["indvdlCaravSiteCo", "RV_PITCH"]];
// 고캠핑 필드로는 확정할 수 없는 상품 유형. 소개문에서 단서만 찾아 검토 큐로 보낸다.
const TEXT_HINTS = [[/타프\s*존|타프\s*사이트/, "TARP_ZONE"], [/쉘터\s*존|쉘터\s*사이트/, "SHELTER_ZONE"], [/캠프닉|당일\s*캠핑|피크닉\s*존/, "CAMPNIC_DAY"], [/텐트\s*대여|세팅\s*텐트|렌탈\s*텐트/, "RENTAL_TENT"]];

const int = (v) => {
  const n = Number(String(v ?? "").replace(/[^\d.-]/g, ""));
  return Number.isFinite(n) && n > 0 ? Math.round(n) : 0;
};
const list = (v) => String(v ?? "").split(",").map((s) => s.trim()).filter(Boolean);
const num = (v) => { const n = Number(v); return Number.isFinite(n) && n !== 0 ? n : null; };
const text = (v) => { const s = String(v ?? "").trim(); return s || null; };

// 고캠핑의 siteMg 규격은 보통 m 값이지만, 일부 등록값은 700·800처럼 cm 단위로
// 들어온다. 같은 물리량을 화면에서 700m로 보이지 않게 m로 표준화한다.
export function normalizeSiteDimension(v) {
  const n = Number(String(v ?? "").replace(/[^\d.-]/g, ""));
  if (!Number.isFinite(n) || n <= 0) return 0;
  const meters = n >= 100 && n <= 3000 ? n / 100 : n;
  return Math.round(meters * 100) / 100;
}

/** "20240105123000" 또는 "2024-01-05 12:30:00" → KST ISO */
export function parseGoCampingTime(v) {
  const digits = String(v ?? "").replace(/\D/g, "");
  if (digits.length < 8) return null;
  const [y, mo, d, h = "00", mi = "00", s = "00"] = [digits.slice(0, 4), digits.slice(4, 6), digits.slice(6, 8), digits.slice(8, 10), digits.slice(10, 12), digits.slice(12, 14)];
  return `${y}-${mo}-${d}T${h || "00"}:${mi || "00"}:${s || "00"}+09:00`;
}

export function normalizeCampground(item, fetchedAt) {
  const products = SITE_COUNTS.filter(([k]) => int(item[k]) > 0).map(([k, kind]) => ({ kind, site_count: int(item[k]), confirmed: true }));
  const intro = `${item.lineIntro ?? ""} ${item.intro ?? ""} ${item.featureNm ?? ""}`;
  const known = new Set(products.map((p) => p.kind));
  const kindCandidates = TEXT_HINTS.filter(([re, kind]) => re.test(intro) && !known.has(kind)).map(([, kind]) => kind);

  const siteSizes = [1, 2, 3]
    .map((i) => ({ width_m: normalizeSiteDimension(item[`siteMg${i}Width`]), depth_m: normalizeSiteDimension(item[`siteMg${i}Vrticl`]), count: int(item[`siteMg${i}Co`]) }))
    .filter((s) => s.width_m > 0 && s.depth_m > 0)
    .map((s) => ({ ...s, area_m2: s.width_m * s.depth_m, measurement_source: "GOCAMPING", applies_to: "SITE_GROUP" }));

  const floors = FLOORS.map(([k, floor]) => ({ floor, count: int(item[k]) })).filter((f) => f.count > 0);
  const lng = num(item.mapX);
  const lat = num(item.mapY);

  return {
    external_id: { provider: "gocamping", id: String(item.contentId) },
    name: text(item.facltNm),
    legal_business_types: list(item.induty),
    operator_type: OPERATOR[text(item.facltDivNm)] ?? "UNKNOWN",
    management: text(item.mangeDivNm),
    status_text: text(item.manageSttus),
    address: { sido: text(item.doNm), sigungu: text(item.sigunguNm), line1: text(item.addr1), line2: text(item.addr2) },
    location: lat != null && lng != null ? { lat, lng } : null,
    contact: { tel: text(item.tel), homepage: text(item.homepage) },
    environment: list(item.lctCl),
    themes: list(item.themaEnvrnCl),
    products,
    product_kind_candidates: kindCandidates,
    site_sizes: siteSizes,
    floors,
    amenities: list(item.sbrsCl),
    amenities_etc: list(item.sbrsEtc),
    pets: text(item.animalCmgCl),
    trailer_allowed: item.trlerAcmpnyAt === "Y" ? true : item.trlerAcmpnyAt === "N" ? false : null,
    caravan_allowed: item.caravAcmpnyAt === "Y" ? true : item.caravAcmpnyAt === "N" ? false : null,
    fire_pit: text(item.brazierCl),
    toilets: int(item.toiletCo),
    showers: int(item.swrmCo),
    sinks: int(item.wtrplCo),
    rental_equipment: list(item.eqpmnLendCl),
    operating_seasons: list(item.operPdCl),
    operating_days: list(item.operDeCl),
    reservation: { methods: list(item.resveCl), url: text(item.resveUrl) },
    hero_image_url: text(item.firstImageUrl),
    // 운영자가 고캠핑에 등록한 소개 문구(광고성 표현이 섞일 수 있어 화면에는 “운영자 소개”로 표시)
    intro: { line: text(item.lineIntro), text: text(item.intro), feature: text(item.featureNm) },
    nearby_facilities: list(item.posblFcltyCl),
    programs: text(item.exprnProgrm),
    gocamping_url: item.contentId ? `https://www.gocamping.or.kr/bsite/camp/info/read.do?c_no=${encodeURIComponent(item.contentId)}` : null,
    source: {
      provider: "gocamping",
      tier: "A",
      created_at: parseGoCampingTime(item.createdtime),
      modified_at: parseGoCampingTime(item.modifiedtime),
      fetched_at: fetchedAt,
    },
  };
}

export function extractItems(json) {
  const body = json?.response?.body;
  const header = json?.response?.header;
  if (header && header.resultCode && header.resultCode !== "0000") {
    throw new Error(`고캠핑 API 오류 ${header.resultCode}: ${header.resultMsg}`);
  }
  const raw = body?.items?.item ?? [];
  return { items: Array.isArray(raw) ? raw : [raw], totalCount: Number(body?.totalCount ?? 0) };
}

/** basedList 전체 페이지를 가져온다. fetchImpl은 테스트에서 교체한다. */
export async function fetchAllCampgrounds({ serviceKey, fetchImpl = fetch, pageSize = 1000, maxPages = 20, appName = "moyeora-camping" }) {
  if (!serviceKey) throw new Error("DATA_GO_KR_SERVICE_KEY가 필요합니다.");
  const all = [];
  let total = Infinity;
  for (let page = 1; page <= maxPages && all.length < total; page++) {
    const url = new URL(`${GOCAMPING_BASE}/basedList`);
    url.search = new URLSearchParams({ numOfRows: String(pageSize), pageNo: String(page), MobileOS: "ETC", MobileApp: appName, _type: "json" }).toString();
    const { res } = await fetchDataGoKr(url.toString(), serviceKey, { fetchImpl });
    if (!res.ok) throw new Error(`고캠핑 API HTTP ${res.status} (page ${page})`);
    const { items, totalCount } = extractItems(await res.json());
    total = totalCount;
    if (!items.length) break;
    all.push(...items);
  }
  if (Number.isFinite(total) && all.length < total) {
    throw new Error(`페이지 누락: ${all.length}/${total}건만 수신`);
  }
  return all;
}

export function summarize(campgrounds) {
  const byKind = {};
  const byOperator = {};
  let withSizes = 0;
  for (const c of campgrounds) {
    for (const p of c.products) byKind[p.kind] = (byKind[p.kind] ?? 0) + 1;
    byOperator[c.operator_type] = (byOperator[c.operator_type] ?? 0) + 1;
    if (c.site_sizes.length) withSizes += 1;
  }
  return { total: campgrounds.length, by_product_kind: byKind, by_operator: byOperator, with_site_sizes: withSizes };
}
