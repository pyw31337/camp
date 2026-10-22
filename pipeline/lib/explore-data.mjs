import { themesOf } from "./themes.mjs";
import { classifyChannels, selectBookingChannel } from "./booking-intel.mjs";
import { extractCampConditions } from "./survey-extractor.mjs";
import { normalizeSiteDimension } from "./gocamping.mjs";

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
 * 고캠핑 등록 부가값의 목록용 축약형(값이 하나도 없으면 null). 키: lic 인허가일 · ins 영업배상책임보험 가입(Y일 때만 true) ·
 * staff 상주 관리 인원 · org 운영기관 · area 전체 면적(㎡) · gap 사이트 간 거리(m) · sf [소화기, 방화수, 방화사, 화재감지기] · cl [휴장 시작, 종료].
 * 휴장 기간은 종료일이 지났으면 내보내지 않는다(now 기준, 테스트용 주입 가능).
 */
export function gxOf(c, now = new Date()) {
  const r = c?.registry ?? {}, sf = c?.safety ?? {};
  const today = new Date(now.getTime() + 9 * 3600e3).toISOString().slice(0, 10);
  const cl = c?.closure && (!c.closure.to || c.closure.to >= today) ? [c.closure.from ?? null, c.closure.to ?? null] : null;
  const safety = [sf.extinguishers, sf.fire_water, sf.fire_sand, sf.fire_sensors].map((n) => (Number(n) > 0 ? Number(n) : 0));
  const gx = {
    lic: r.licensed_on ?? null, ins: r.insured === true ? true : null, staff: r.staff_onsite ?? null, org: r.operating_org ?? null,
    tno: r.tourism_business_no ?? null, area: r.total_area_m2 ?? null, gap: c?.site_gap_m ?? null,
    sf: safety.some((n) => n > 0) ? safety : null, cl,
  };
  const kept = Object.fromEntries(Object.entries(gx).filter(([, v]) => v !== null && v !== undefined));
  return Object.keys(kept).length ? kept : null;
}

/**
 * 현장 조건의 공통 읽기 모델. UNKNOWN은 ‘없음/불가’가 아니라 원천에 값이
 * 없다는 뜻이다. 조건별 확인 화면을 추가할 때 이 모델을 단일 계약으로 쓴다.
 */
export function buildFieldConditions(campground, pilotFact = null, detail = null, { survey = false } = {}) {
  if (pilotFact) {
    return extractCampConditions(campground, detail, pilotFact);
  }
  if (survey) {
    return extractCampConditions(campground, detail, null);
  }

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
    .map(([width, depth, count]) => ({ width_m: normalizeSiteDimension(width), depth_m: normalizeSiteDimension(depth), count: Number(count) || null }));
  const firePit = String(campground?.fire_pit ?? campground?.fire ?? "").trim() || null;
  const sourceUrl = campground?.gocamping_url ?? campground?.gc_url ?? null;
  const checkedAt = campground?.source?.fetched_at ?? campground?.modified_at ?? null;

  return {
    version: 2,
    parking: { state: "UNKNOWN", tent_side: null, auto_camping_sites: autoCampingSites },
    // 고캠핑 표준값에는 1텐트·타프/쉘터·캐노피의 허용 수량이나 규격이 없다.
    // 캠핑장별 공지 원문이 들어오기 전에는 일반적인 관행을 허용값으로 만들지 않는다.
    shelter_setup: { state: "UNKNOWN", tent_count: null, tarp_or_shelter: null, canopy_allowed: null, max_structures: null },
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
 * @param {object|null} [notices] campground-notices.json
 * @param {object|null} [pilotFacts] pilot-condition-facts.json
 */
export function buildExploreRecords(camps, toilets, fees, seoul = new Map(), notices = null, pilotFacts = null, campDetails = null, options = {}) {
  const pilotMap = new Map();
  const matchedPilotIds = new Set();
  const pilots = Array.isArray(pilotFacts?.pilot_campgrounds) ? pilotFacts.pilot_campgrounds : [];
  for (const p of pilots) {
    if (p.gocamping_id) pilotMap.set(String(p.gocamping_id), p);
    pilotMap.set(String(p.id), p);
  }

  const records = (camps?.campgrounds ?? []).filter((c) => c.location && c.name).map((c) => {
    const id = String(c.external_id.id);
    const near = toilets?.campgrounds?.[id];
    const fee = fees?.records?.[id];
    const bookingUrl = httpUrl(c.reservation?.url);
    const pilotFact = pilotMap.get(id) || null;
    if (pilotFact) matchedPilotIds.add(pilotFact.id);
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
    const primaryChannel = selectBookingChannel(channels);
    return {
      id,
      name: c.name,
      sido: c.address?.sido ?? null,
      sigungu: c.address?.sigungu || sigunguFromAddr([c.address?.line1, c.address?.line2].filter(Boolean).join(" ")),
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
      field_conditions: buildFieldConditions(c, pilotFact, campDetails?.[id], options),
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
        // 모든 등록 경로는 보존하되, 화면 CTA는 이 한 경로만 사용한다.
        // 캠핏 → 네이버 예약 → 땡큐캠핑 → 기타 온라인 → 홈페이지 → 전화 순서다.
        primary: primaryChannel,
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
      // 고캠핑 등록 부가값(2026-10-19): 인허가일·보험·상주 인원·운영기관·면적·사이트 간 거리·안전시설 수·휴장 기간.
      // 사업자번호(registry.business_no)는 매칭 키로만 쓰고 공개 데이터에는 싣지 않는다.
      ...(gxOf(c) ? { gx: gxOf(c) } : {}),
    };
  });

  // Append pilot campgrounds that were not part of GoCamping catalog
  for (const p of pilots) {
    if (matchedPilotIds.has(p.id)) continue;
    const bookingUrl = httpUrl(p.primary_booking?.url);
    const channelName = p.primary_booking?.channel === "foresttrip" ? "숲나들e" : p.primary_booking?.channel === "camfit" ? "캠핏" : p.primary_booking?.channel === "naver" ? "네이버 예약" : "공식 예약처";
    const sido = p.region.split(" ")[0];
    const sigungu = p.region.split(" ")[1] ?? null;
    const totalSites = (p.zones || []).reduce((sum, z) => sum + (Number(z.site_count) || 0), 0);
    const op = p.name.includes("[공립]") ? "LOCAL_GOVERNMENT" : p.name.includes("[국립]") ? "NATIONAL_PARK" : "PRIVATE";

    const pilotChannels = [{
      platform_id: p.primary_booking?.channel,
      platform_name: channelName,
      url: bookingUrl,
      kind: "online",
      confidence: 1.0,
      evidence: ["pilot_verified"],
    }];
    records.push({
      id: p.id,
      name: p.name,
      sido,
      sigungu,
      area: areaOf(sido),
      addr: p.address,
      lat: p.lat ? Math.round(p.lat * 1e6) / 1e6 : 37.5,
      lng: p.lng ? Math.round(p.lng * 1e6) / 1e6 : 127.5,
      tel: null,
      homepage: bookingUrl,
      op,
      status: "운영",
      types: ["일반야영장", "자동차야영장"],
      kinds: [["AUTO_PITCH", totalSites]],
      sizes: (p.zones || []).map((z) => [z.size_w, z.size_h, z.site_count]),
      floors: (p.zones || []).map((z) => [z.surface, z.site_count]),
      amenities: ["전기", p.firewood_allowed === "ALLOWED" ? "장작판매" : null, ...(p.features || []).map((f) => f === "SWIMMING_POOL" ? "물놀이장" : f === "VALLEY" ? "계곡" : f === "TRAMPOLINE" ? "트렘폴린" : f === "AIR_BOUNCE" ? "에어바운스" : null)].filter(Boolean),
      field_conditions: buildFieldConditions(null, p),
      important_info: buildImportantInfo(notices, p.id),
      env: ["산", "숲"],
      themes: ["auto", "forest", (p.features || []).includes("VALLEY") ? "valley" : null, p.power_max_w >= 1000 ? "comfort" : null].filter(Boolean),
      pets: "불가능",
      fire: p.firewood_allowed === "ALLOWED" ? "개별" : "불가",
      trailer: null,
      caravan: null,
      toilets: p.sanitary?.toilets_count ?? null,
      showers: p.sanitary?.showers_count ?? null,
      sinks: null,
      rental: (p.rental_offers ?? []).map((r) => r.item),
      seasons: ["봄", "여름", "가을", "겨울"],
      days: ["평일+주말"],
      booking: {
        methods: ["온라인실시간예약"],
        url: bookingUrl,
        provider: providerOf(bookingUrl),
        channels: pilotChannels,
        primary: selectBookingChannel(pilotChannels),
        source: {
          label: "모여라캠핑 파일럿 검증 원천",
          url: p.evidence?.source_url ?? null,
          checked_at: p.evidence?.observed_at ?? null,
          tier: "A",
        },
      },
      img: null,
      line: `${p.name} · 검증된 현장 조건 파일럿`,
      th: ["auto", "forest", (p.features || []).includes("VALLEY") ? "valley" : null, p.power_max_w >= 1000 ? "comfort" : null].filter(Boolean),
      gc_url: null,
      fee: null,
      nearby_toilets: null,
      seoul: [],
      modified_at: p.evidence?.observed_at ?? null,
    });
  }
  return records;
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
    const t = {
      intro: clip(c.intro?.text, 700), feature: clip(c.intro?.feature, 400), nearby: c.nearby_facilities?.length ? c.nearby_facilities : null, programs: clip(c.programs, 200),
      // 2026-10-19: 고캠핑 등록 부가 문구(글램핑·카라반 내부시설, 자체 행사, 체험 프로그램 여부, 여행 시기, 주변 시설 기타, 오시는 길)
      inner: c.inner?.glamping?.length || c.inner?.caravan?.length ? Object.fromEntries(Object.entries({ glamping: c.inner.glamping, caravan: c.inner.caravan }).filter(([, v]) => v?.length)) : null,
      event: clip(c.culture_event, 120),
      exp: c.experience_program === true ? true : null,
      era: c.travel_seasons?.length ? c.travel_seasons : null,
      nearby_etc: c.nearby_facilities_etc?.length ? c.nearby_facilities_etc : null,
      direction: clip(c.directions, 400),
    };
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

/** 주소 문장에서 시·군·구를 꺼낸다(등록값에 시군구가 빠진 곳이 카드에 ‘강원’만 보이던 문제, 소유자 2026-10-22). 세종처럼 없으면 null. */
export function sigunguFromAddr(addr) {
  const m = String(addr ?? "").trim().match(/^\S+\s+(\S+?(?:시|군|구))(?:\s|$)/);
  return m ? m[1] : null;
}
