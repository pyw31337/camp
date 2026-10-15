import { themesOf } from "./themes.mjs";
import { classifyChannels } from "./booking-intel.mjs";

// 웹 탐색 화면용 데이터: 고캠핑 시설 + 주변 공중화장실 + 공식 안내 요금(TourAPI) + 예약처 규칙·다가오는 오픈 일정.
// 원칙: 각 값의 출처·확인 시각을 함께 싣는다. 실시간 재고·판매가는 만들지 않는다(예약은 공식 예약처로 연결).

const AREA = [
  [/서울|경기|인천/, "서울·경기"], [/강원/, "강원"], [/충청|충북|충남|대전|세종/, "충청"],
  [/전라|전북|전남|광주/, "전라"], [/경상|경북|경남|부산|대구|울산/, "경상"], [/제주/, "제주"],
];
export const areaOf = (sido) => AREA.find(([re]) => re.test(sido ?? ""))?.[1] ?? "기타";

const PROVIDER_BY_HOST = [
  [/foresttrip\.go\.kr/, "foresttrip"], [/reservation\.knps\.or\.kr|knps\.or\.kr/, "knps"], [/yeyak\.seoul\.go\.kr/, "seoul-yeyak"],
];
export function providerOf(url) {
  try { const host = new URL(url).host; return PROVIDER_BY_HOST.find(([re]) => re.test(host))?.[1] ?? null; } catch { return null; }
}
const clip = (s, n) => { const v = String(s ?? "").replace(/\s+/g, " ").trim(); return v ? (v.length > n ? `${v.slice(0, n - 1).trimEnd()}…` : v) : null; };
const httpUrl = (u) => { const s = String(u ?? "").trim(); if (!s) return null; const v = /^https?:\/\//i.test(s) ? s : `http://${s}`; try { return new URL(v).toString(); } catch { return null; } };

// 고캠핑 원천에는 ‘전기 있음’, 바닥재·규격·화로대 배치·장작 판매 여부까지는
// 들어오지만, 텐트 옆 주차/전력 W 제한/숯·장작 사용 허용은 표준 필드가 아니다.
// 비어 있는 값을 ‘불가’로 바꾸지 않고, 화면과 공개 데이터에서 명시적으로
// UNKNOWN으로 남긴다. 추후 운영자 공식 안내로 보강할 때도 같은 묶음에 합친다.
const productEntries = (campground) => Array.isArray(campground?.products)
  ? campground.products.map((p) => [p?.kind, p?.site_count])
  : Array.isArray(campground?.kinds) ? campground.kinds : [];
const floorEntries = (campground) => Array.isArray(campground?.floors)
  ? campground.floors.map((floor) => Array.isArray(floor) ? floor : [floor?.floor, floor?.count])
  : [];
const sizeEntries = (campground) => Array.isArray(campground?.site_sizes)
  ? campground.site_sizes.map((site) => [site?.width_m, site?.depth_m, site?.count])
  : Array.isArray(campground?.sizes) ? campground.sizes : [];

/**
 * 현장 조건의 공통 읽기 모델. UNKNOWN은 ‘없음/불가’가 아니라 원천에 값이
 * 없다는 뜻이다. 조건별 확인 화면을 추가할 때 이 모델을 단일 계약으로 쓴다.
 */
export function buildFieldConditions(campground) {
  const amenities = [...(Array.isArray(campground?.amenities) ? campground.amenities : []), ...(Array.isArray(campground?.amenities_etc) ? campground.amenities_etc : [])];
  const hasAmenity = (re) => amenities.some((value) => re.test(String(value)));
  const autoCampingSites = productEntries(campground)
    .filter(([kind]) => kind === "AUTO_PITCH")
    .reduce((total, [, count]) => total + (Number(count) || 0), 0) || null;
  const electricity = hasAmenity(/전기/);
  const firewoodSale = hasAmenity(/장작\s*판매/);
  const floors = floorEntries(campground)
    .filter(([floor]) => floor)
    .map(([floor, count]) => ({ type: floor, count: Number(count) || null }));
  const sizes = sizeEntries(campground)
    .filter(([width, depth]) => Number(width) > 0 && Number(depth) > 0)
    .map(([width, depth, count]) => ({ width_m: Number(width), depth_m: Number(depth), count: Number(count) || null }));
  const firePit = String(campground?.fire_pit ?? campground?.fire ?? "").trim() || null;
  const sourceUrl = campground?.gocamping_url ?? campground?.gc_url ?? null;
  const checkedAt = campground?.source?.fetched_at ?? campground?.modified_at ?? null;

  return {
    version: 1,
    parking: { state: "UNKNOWN", tent_side: null, auto_camping_sites: autoCampingSites },
    power: { state: electricity ? "PARTIAL" : "UNKNOWN", available: electricity || null, limit_w: null },
    ground: { state: floors.length ? "CONFIRMED" : "UNKNOWN", types: floors },
    charcoal: { state: "UNKNOWN", allowed: null },
    firewood: { state: firewoodSale ? "PARTIAL" : "UNKNOWN", sold: firewoodSale || null, allowed: null },
    fire_pit: { state: firePit ? "CONFIRMED" : "UNKNOWN", arrangement: firePit },
    site_size: { state: sizes.length ? "CONFIRMED" : "UNKNOWN", groups: sizes },
    source: { label: "한국관광공사 고캠핑 운영자 등록 정보", url: sourceUrl, checked_at: checkedAt, tier: "A" },
  };
}

// 운영자 또는 예약 플랫폼이 제공한 공지는 별도 승인 레지스트리로 들어온다.
// 공지 전문을 임의로 수집·복제하지 않고, 예약 판단에 필요한 짧은 요약과 원문
// 링크·확인 시각만 발행한다. source가 없는 항목은 공개하지 않는다.
export function buildImportantInfo(notices, campgroundId) {
  const raw = notices?.campgrounds?.[String(campgroundId)];
  if (!raw || !Array.isArray(raw.items)) return null;
  const fallbackSource = raw.source ?? null;
  const items = raw.items.map((item) => {
    const source = item?.source ?? fallbackSource;
    const title = clip(item?.title, 56);
    const summary = clip(item?.summary, 280);
    if (!title || !summary || !source?.url || !source?.checked_at) return null;
    return {
      kind: String(item.kind ?? "NOTICE").slice(0, 32),
      priority: ["critical", "high", "normal"].includes(item.priority) ? item.priority : "normal",
      title,
      summary,
      source: {
        label: clip(source.label, 80) ?? "운영자 공식 공지",
        url: httpUrl(source.url),
        checked_at: source.checked_at,
        tier: source.tier ?? "B",
      },
    };
  }).filter((item) => item?.source.url);
  return items.length ? { items } : null;
}

/**
 * @param {{campgrounds:object[], fetched_at?:string}} camps out/campgrounds.json
 * @param {{campgrounds?:Record<string,{count_2km:number,nearest:object[]}>}|null} toilets out/campground-toilets.json
 * @param {{records?:Record<string,object>}|null} fees out/tour-fees.json
 * @param {Map<string, object[]>} [seoul] matchSeoulToCampgrounds 결과(서울 공공예약 상품)
 */
export function buildExploreRecords(camps, toilets, fees, seoul = new Map(), notices = null) {
  return (camps.campgrounds ?? []).filter((c) => c.location && c.name).map((c) => {
    const id = String(c.external_id.id);
    const near = toilets?.campgrounds?.[id];
    const fee = fees?.records?.[id];
    const bookingUrl = httpUrl(c.reservation?.url);
    // `resveUrl`은 운영자가 고캠핑에 입력한 값이다. 한 개의 "예약하기" 버튼으로
    // 단정하지 않고, 홈페이지·전화까지 포함한 대체 경로와 신뢰도를 함께 보낸다.
    const channels = classifyChannels(c).map((ch) => ({
      platform_id: ch.platform_id,
      platform_name: ch.platform_name,
      url: ch.url,
      kind: ch.kind,
      confidence: ch.confidence,
      evidence: ch.evidence,
    }));
    return {
      id,
      name: c.name,
      sido: c.address?.sido ?? null,
      sigungu: c.address?.sigungu ?? null,
      area: areaOf(c.address?.sido),
      addr: [c.address?.line1, c.address?.line2].filter(Boolean).join(" ") || null,
      lat: Math.round(c.location.lat * 1e6) / 1e6,
      lng: Math.round(c.location.lng * 1e6) / 1e6,
      tel: c.contact?.tel ?? null,
      homepage: httpUrl(c.contact?.homepage),
      op: c.operator_type ?? "UNKNOWN",
      status: c.status_text ?? null,
      types: c.legal_business_types ?? [],
      kinds: (c.products ?? []).map((p) => [p.kind, p.site_count]),
      sizes: (c.site_sizes ?? []).map((s) => [s.width_m, s.depth_m, s.count]),
      floors: (c.floors ?? []).map((f) => [f.floor, f.count]),
      amenities: [...(c.amenities ?? []), ...(c.amenities_etc ?? [])],
      field_conditions: buildFieldConditions(c),
      important_info: buildImportantInfo(notices, id),
      env: c.environment ?? [],
      themes: c.themes ?? [],
      pets: c.pets ?? null,
      fire: c.fire_pit ?? null,
      trailer: c.trailer_allowed ?? null,
      caravan: c.caravan_allowed ?? null,
      toilets: c.toilets || null,
      showers: c.showers || null,
      sinks: c.sinks || null,
      rental: c.rental_equipment ?? [],
      seasons: c.operating_seasons ?? [],
      days: c.operating_days ?? [],
      booking: {
        methods: c.reservation?.methods ?? [],
        url: bookingUrl,
        provider: providerOf(bookingUrl),
        channels,
        source: {
          label: "고캠핑 운영자 등록 예약 정보",
          url: c.gocamping_url ?? null,
          checked_at: c.source?.fetched_at ?? null,
          tier: "C",
        },
      },
      img: httpUrl(c.hero_image_url),
      line: clip(c.intro?.line, 90),
      th: themesOf(c),
      gc_url: c.gocamping_url ?? null,
      fee: fee?.fee_text ? { text: fee.fee_text, min: fee.fee_range?.min_krw ?? null, max: fee.fee_range?.max_krw ?? null, checked_at: fee.checked_at, url: fee.source_url } : null,
      nearby_toilets: near ? { within_2km: near.count_2km, within_500m: near.count_500m ?? null, nearest: (near.nearest ?? []).slice(0, 3).map((t) => ({ name: t.name, m: t.distance_m, lat: t.lat ?? null, lng: t.lng ?? null, h24: t.open_24h ?? null, src: t.source ?? "mois" })) } : null,
      // 서울시 공공예약 원문의 접수 상태(확인 시각·원문 링크 포함). 빈자리 확정값이 아니다.
      seoul: (seoul.get(id) ?? []).slice(0, 8).map((s) => ({
        name: s.name, status: s.status,
        from: s.receipt?.from ?? null, to: s.receipt?.to ?? null,
        use_from: s.use?.from ?? null, use_to: s.use?.to ?? null,
        url: s.url, source_url: s.source_url, checked_at: s.checked_at,
      })),
      modified_at: c.source?.modified_at ?? null,
    };
  });
}

const NEARBY_GROUPS = ["tour", "food", "mart", "conv", "fuel", "gear", "medical", "rest"];
const compactPoi = (p) => Object.fromEntries(Object.entries({ n: p.name, k: p.kind, ty: p.type, m: p.distance_m, lat: p.lat, lng: p.lng, a: p.addr, t: p.tel, u: p.url, img: p.image, h: p.hours, b: p.brand, r: p.road, e: p.emergency || null }).filter(([, v]) => v != null && v !== ""));
/** 캠핑장별 상세 묶음(상세를 열 때만 내려받는다): 운영자 소개 + 주변 관광·맛집·마트·주유·의료·휴게소 */
export function buildCampDetails(camps, nearby = null) {
  const texts = buildExploreTexts(camps);
  const out = {};
  for (const c of camps.campgrounds ?? []) {
    if (!c.location || !c.name) continue;
    const id = String(c.external_id.id);
    const near = nearby?.campgrounds?.[id];
    const n = near ? Object.fromEntries(NEARBY_GROUPS.map((g) => [g, (near[g] ?? []).map(compactPoi)]).filter(([, v]) => v.length)) : null;
    out[id] = { ...(texts[id] ?? {}), ...(n && Object.keys(n).length ? { nearby: n } : {}) };
  }
  return out;
}

/** 상세를 열 때만 내려받는 긴 소개 문구(목록 데이터 크기를 늘리지 않으려고 분리) */
export function buildExploreTexts(camps) {
  const out = {};
  for (const c of camps.campgrounds ?? []) {
    if (!c.location || !c.name) continue;
    const t = { intro: clip(c.intro?.text, 700), feature: clip(c.intro?.feature, 400), nearby: c.nearby_facilities?.length ? c.nearby_facilities : null, programs: clip(c.programs, 200) };
    if (Object.values(t).some(Boolean)) out[String(c.external_id.id)] = Object.fromEntries(Object.entries(t).filter(([, v]) => v));
  }
  return out;
}

/** 예약처(제공자)별 규칙과 다가오는 일정 */
export function buildProviders(registry, calendar, now = new Date()) {
  const upcoming = (calendar?.events ?? []).filter((e) => Date.parse(e.at ?? e.date) >= now - 864e5).slice(0, 400);
  return (registry?.providers ?? []).map((p) => ({
    id: p.id, name: p.name, url: p.official_url, integration: p.integration, notes: p.notes ?? null,
    rules: (registry.rules ?? []).filter((r) => r.provider_id === p.id).map((r) => ({ id: r.id, label: r.label, summary: r.summary, source: r.source })),
    events: upcoming.filter((e) => e.provider_id === p.id).slice(0, 12).map((e) => ({ type: e.type, at: e.at, time_known: e.time_known, label: e.label, stay: e.stay ?? null, needs_verification: e.needs_verification, source: e.source })),
  }));
}
