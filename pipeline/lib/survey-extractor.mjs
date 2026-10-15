/**
 * @fileoverview 전국 3,116개 캠핑장 현장 조건 전수조사 및 정밀 추출 엔진.
 * 관광진흥법 야영장 안전·위생기준(시행규칙 별표 7) 및 한국관광공사 고캠핑 운영자 공식 등록값,
 * 공식 소개글(intro, feature, guide, programs)을 바탕으로 정형화된 사실 데이터를 추출한다.
 */

// 주차 동선 판별 정규식
// 주의: 고카트/카트체험 등 놀거리와 짐 운반용 수레를 엄격히 분리
const CART_TRANSPORT_RE = /(?:짐\s*을?\s*(?:싣고|가지고|옮|운반)|손수레|짐수레|리어카|카트로\s*짐|수레를\s*이용|수레로\s*짐|모노레일.*짐|차량\s*진입\s*(?:불가|금지)|주차장.*수레|주차\s*후\s*도보\s*(?:이동|진입)|도보\s*이동\s*사이트|카트.*(?:야영장|사이트|이동).*옮)/;
const RECREATIONAL_KART_RE = /(?:카트\s*경기|카트\s*체험|카트장|전동\s*카트\s*타기|레저\s*카트)/;

const TENT_SIDE_PARKING_RE = /(?:(?:텐트|사이트|차량|텐트\s*바로)\s*(?:바로\s*)?(?:옆|내|앞|구역|지정)\s*(?:주차|에\s*주차|차량\s*진입)|전\s*사이트\s*주차|사이트\s*내\s*주차|사이트\s*앞\s*주차|사이트\s*옆\s*주차|차량\s*옆\s*주차)/;
const SHARED_PARKING_RE = /(?:공용\s*주차장|지정\s*주차장|외부\s*주차장|주차장에\s*주차|주차장\s*이용)\s*(?:후|하고|바랍니다)/;

// 전력 W 및 차단기 판별 정규식
const POWER_WATT_RE = /(?:사이트당|천막당|개소당)?\s*(\d{3,4})\s*(?:[wW]|와트)|(1|2|3)\s*(?:[kK][wW]|킬로와트)/;
const HIGH_POWER_KEYWORD_RE = /(?:고전력|고출력|용량\s*넉넉|넉넉한\s*전기|2[kK][wW]|1[kK][wW]|1000\s*[wW]|1200\s*[wW])/;

// 화기(장작/불멍/숯) 판별 정규식
const FIRE_PROHIBITED_RE = /(?:장작\s*(?:사용)?\s*(?:금지|불가)|장작\s*반입\s*금지|숯만\s*(?:사용)?\s*가능|모닥불\s*(?:금지|불가)|화기\s*(?:엄금|금지)|산림\s*보호.*화기\s*금지)/;
const CHARCOAL_ONLY_RE = /(?:숯만\s*(?:사용)?\s*가능|숯\s*외\s*금지|장작\s*(?:사용)?\s*(?:금지|불가))/;
const FIREWOOD_ALLOWED_RE = /(?:불멍|장작\s*(?:피우|사용|가능)|개별\s*화로대|모닥불\s*(?:가능|피우))/;
const FIREWOOD_SALE_RE = /(?:장작\s*판매)/;

// 위생 시설(개별 욕실/화장실) 판별 정규식
const PRIVATE_BATH_RE = /(?:개별|단독|객실\s*내|전용|프라이빗)\s*(?:화장실|샤워실|욕실)/;
const HOT_WATER_24H_RE = /(?:24시간.*온수|온수.*24시간|항시.*온수)/;

// 놀거리/특화 시설 키워드 매핑
const FEATURE_PATTERNS = [
  { key: "SWIMMING_POOL", re: /(?:수영장|물놀이장|워터슬라이드|야외풀|어린이풀|유아풀|물놀이터)/ },
  { key: "VALLEY", re: /(?:계곡|시냇가|천변|홍천강|내린천|맑은\s*물)/ },
  { key: "TRAMPOLINE", re: /(?:트램폴린|트램펄린|방방|방방이)/ },
  { key: "AIR_BOUNCE", re: /(?:에어바운스|에어\s*바운스)/ },
  { key: "PLAYGROUND", re: /(?:어린이\s*놀이터|놀이터|모래놀이|키즈존|놀이방|실내놀이터|모래놀이터)/ },
  { key: "TUBE_SLED", re: /(?:사계절\s*썰매|눈썰매|물썰매|튜브썰매|썰매장)/ },
  { key: "EXPERIENCE", re: /(?:체험활동|동물체험|숲체험|갯벌체험|공방체험|목공체험|농장체험|곤충체험|먹이주기|승마체험|체험\s*프로그램|카트\s*경기\s*체험|체험)/ },
  { key: "FOREST_TRAIL", re: /(?:산책로|둘레길|등산로|트레킹|치유의\s*숲|피톤치드\s*숲길)/ },
  { key: "ANIMAL_FEEDING", re: /(?:동물\s*먹이|먹이주기|양떼|알파카|토끼\s*먹이)/ },
];

/**
 * 캠핑장 1곳의 텍스트와 메타데이터에서 현장 조건을 전수 추출·정형화한다.
 *
 * @param {object} camp 캠핑장 기본 레코드
 * @param {object|null} detail 캠핑장 상세 레코드 (intro, feature, guide, programs 등)
 * @param {object|null} pilotFact 파일럿 검증 데이터 (존재 시 최우선 반영)
 * @returns {object} 정규화된 field_conditions 객체
 */
const allowedOf = (code) => code === "ALLOWED" ? true : code === "PROHIBITED" ? false : null;

export function extractCampConditions(camp, detail = null, pilotFact = null) {
  // 1. 파일럿 검증 데이터가 있으면 최우선 적용
  if (pilotFact) {
    const zones = Array.isArray(pilotFact.zones) ? pilotFact.zones : [];
    const autoSites = zones
      .filter((z) => z.parking === "SITE_ADJACENT")
      .reduce((total, z) => total + (Number(z.site_count) || 0), 0) || null;
    const firewoodSale = (pilotFact.rental_offers || []).some((r) => /장작/.test(r.item)) || null;
    // 구역마다 주차 동선이 다를 수 있다. 모든 구역이 사이트 옆 주차일 때만 tent_side=true,
    // 일부만 그렇다면 null + 구역 수를 남겨 ‘조건부’로 판정하게 한다.
    const adjacentZones = zones.filter((z) => z.parking === "SITE_ADJACENT").length;
    const tentSide = zones.length
      ? adjacentZones === zones.length ? true : adjacentZones > 0 ? null : false
      : pilotFact.parking_mode === "SITE_ADJACENT" ? true : pilotFact.parking_mode ? false : null;

    return {
      version: 2,
      status: "VERIFIED",
      parking: {
        state: "VERIFIED",
        mode: pilotFact.parking_mode,
        tent_side: tentSide,
        tent_side_zones: zones.length ? { adjacent: adjacentZones, total: zones.length } : null,
        cart_required: pilotFact.parking_mode === "CART_REQUIRED",
        shared_nearby: pilotFact.parking_mode === "SHARED_NEARBY",
        drop_off_external: pilotFact.parking_mode === "DROP_OFF_EXTERNAL",
        auto_camping_sites: autoSites,
      },
      shelter_setup: {
        state: "VERIFIED",
        max_tents: pilotFact.shelter_setup_rule?.max_tents ?? null,
        max_tarps: pilotFact.shelter_setup_rule?.max_tarps ?? null,
        canopy_allowed: pilotFact.shelter_setup_rule?.canopy_allowed ?? null,
        note: pilotFact.shelter_setup_rule?.note ?? null,
      },
      power: {
        state: "VERIFIED",
        available: Number(pilotFact.power_max_w) > 0 ? true : null,
        limit_w: Number(pilotFact.power_max_w) > 0 ? Number(pilotFact.power_max_w) : null,
        breaker_capacity: pilotFact.breaker_capacity ?? null,
        individual_breaker: pilotFact.individual_breaker ?? null,
      },
      ground: {
        state: "VERIFIED",
        types: zones.map((z) => ({ type: z.surface, count: Number(z.site_count) || null })),
      },
      charcoal: {
        state: "VERIFIED",
        allowed: allowedOf(pilotFact.charcoal_allowed),
        rule: pilotFact.charcoal_allowed ?? null,
      },
      firewood: {
        state: "VERIFIED",
        allowed: allowedOf(pilotFact.firewood_allowed),
        rule: pilotFact.firewood_allowed ?? null,
        sold: firewoodSale,
      },
      fire_pit: {
        state: pilotFact.fire_pit_arrangement ? "VERIFIED" : "UNKNOWN",
        arrangement: pilotFact.fire_pit_arrangement ?? null,
      },
      site_size: {
        state: "VERIFIED",
        groups: zones.map((z) => ({
          width_m: Number(z.size_w),
          depth_m: Number(z.size_h),
          count: Number(z.site_count) || null,
          name: z.name,
          surface: z.surface,
          parking: z.parking,
        })),
      },
      sanitary: pilotFact.sanitary ?? null,
      features: pilotFact.features ?? [],
      rental_offers: pilotFact.rental_offers ?? [],
      source: {
        label: "모여라캠핑 파일럿 검증 (공식 원문 대조)",
        url: pilotFact.evidence?.source_url ?? null,
        checked_at: pilotFact.evidence?.observed_at ?? null,
        tier: "A",
        reviewer: pilotFact.evidence?.reviewer ?? null,
        next_review_due_at: pilotFact.evidence?.next_review_due_at ?? null,
        reviewed_field_codes: pilotFact.evidence?.reviewed_field_codes ?? [],
      },
    };
  }

  // 2. 전국 3,116개 전수조사 추출
  const amenities = [
    ...(Array.isArray(camp?.amenities) ? camp.amenities : []),
    ...(Array.isArray(camp?.amenities_etc) ? camp.amenities_etc : [])
  ];
  const hasAmenity = (re) => amenities.some((val) => re.test(String(val)));
  
  const textCorpus = [
    camp?.name,
    camp?.line,
    detail?.intro,
    detail?.feature,
    detail?.guide,
    detail?.programs,
    detail?.tour_info,
    ...amenities,
    ...(Array.isArray(camp?.themes) ? camp.themes : []),
    ...(Array.isArray(camp?.environment) ? camp.environment : []),
  ].filter(Boolean).join(" ");

  // --- [1. 주차 동선 분석] ---
  const autoPitchSites = (Array.isArray(camp?.kinds) ? camp.kinds : (Array.isArray(camp?.products) ? camp.products.map(p => [p?.kind, p?.site_count]) : []))
    .filter(([kind]) => kind === "AUTO_PITCH")
    .reduce((sum, [, count]) => sum + (Number(count) || 0), 0) || null;
  const isAutoBusiness = (camp?.legal_business_types || camp?.types || []).includes("자동차야영장");

  const hasCartMention = CART_TRANSPORT_RE.test(textCorpus) && !RECREATIONAL_KART_RE.test(textCorpus);
  const hasTentSideMention = TENT_SIDE_PARKING_RE.test(textCorpus);
  const hasSharedParkingMention = SHARED_PARKING_RE.test(textCorpus);

  let parkingMode = "UNKNOWN";
  let tentSide = null;
  let cartRequired = null;
  let sharedNearby = null;

  if (hasCartMention && !hasTentSideMention) {
    parkingMode = "CART_REQUIRED";
    tentSide = false;
    cartRequired = true;
    sharedNearby = false;
  } else if (hasTentSideMention) {
    parkingMode = "SITE_ADJACENT";
    tentSide = true;
    cartRequired = false;
    sharedNearby = false;
  } else if (hasSharedParkingMention) {
    parkingMode = "SHARED_NEARBY";
    tentSide = false;
    cartRequired = false;
    sharedNearby = true;
  }

  // --- [2. 전력 W 분석] ---
  const hasElectricityAmenity = hasAmenity(/전기/);
  const mentionsElectricity = hasElectricityAmenity || /전기|콘센트|분전함|배전함/.test(textCorpus);
  
  const wattMatch = textCorpus.match(POWER_WATT_RE);
  let limitW = null;
  let regulatoryReferenceW = null;

  if (wattMatch) {
    if (wattMatch[1]) {
      limitW = parseInt(wattMatch[1], 10);
    } else if (wattMatch[2]) {
      limitW = parseInt(wattMatch[2], 10) * 1000;
    }
  } else if (mentionsElectricity) {
    // 관광진흥법 시행규칙 별표 7 야영장의 안전·위생기준: 천막 1개소당 600W 이하 법정 기준
    regulatoryReferenceW = 600;
  }

  // 소개글에서 찾은 W 숫자는 발견 신호(SURVEYED)다. ‘고전력’ 같은 표현만으로 W를 만들지 않는다.
  const highPowerMention = HIGH_POWER_KEYWORD_RE.test(textCorpus);
  const powerState = limitW ? "SURVEYED" : (mentionsElectricity ? "PARTIAL" : "UNKNOWN");

  // --- [3. 화기 (불멍 / 바베큐 / 숯) 분석] ---
  const fireProhibited = camp?.fire === "불가" || FIRE_PROHIBITED_RE.test(textCorpus);
  const charcoalOnly = CHARCOAL_ONLY_RE.test(textCorpus);
  const firewoodSale = hasAmenity(/장작\s*판매/) || FIREWOOD_SALE_RE.test(textCorpus);
  const firePitIndividual = camp?.fire === "개별";
  const firewoodAllowedText = FIREWOOD_ALLOWED_RE.test(textCorpus);

  let firewoodAllowed = null;
  let charcoalAllowed = null;
  let firePitArrangement = String(camp?.fire_pit ?? camp?.fire ?? "").trim() || null;
  // 고캠핑 화로대 필드(camp.fire)에서 온 결론은 CONFIRMED, 소개글 문장에서 온 결론은 SURVEYED.
  let fireFrom = null;

  if (camp?.fire === "불가") {
    firewoodAllowed = false;
    charcoalAllowed = false;
    firePitArrangement = "화기 사용 전면 금지";
    fireFrom = "FIELD";
  } else if (charcoalOnly || (fireProhibited && !firewoodSale)) {
    firewoodAllowed = false;
    charcoalAllowed = true;
    firePitArrangement = "숯만 가능 (장작 금지)";
    fireFrom = "TEXT";
  } else if (firewoodAllowedText) {
    firewoodAllowed = true;
    charcoalAllowed = true;
    fireFrom = "TEXT";
  } else if (camp?.fire === "공동취사장") {
    firewoodAllowed = false;
    charcoalAllowed = true;
    firePitArrangement = "공동취사장 내에서만 가능";
    fireFrom = "FIELD";
  } else if (firePitIndividual) {
    charcoalAllowed = true;
    fireFrom = "FIELD";
  }
  const fireState = (known) => !known ? "UNKNOWN" : fireFrom === "FIELD" ? "CONFIRMED" : "SURVEYED";

  // --- [4. 위생 시설 분석] ---
  const privateBathField = (camp?.legal_business_types || camp?.types || []).some(t => /내부화장실|내부샤워실/.test(t));
  const hasPrivateBath = privateBathField || PRIVATE_BATH_RE.test(textCorpus);
  const is24hHotWater = HOT_WATER_24H_RE.test(textCorpus);
  const hasHotWater = is24hHotWater ? "24시간" : (hasAmenity(/온수/) || /온수/.test(textCorpus) ? "제공" : null);

  const sanitary = {
    state: (camp?.toilets > 0 || camp?.showers > 0 || hasPrivateBath) ? "CONFIRMED" : "UNKNOWN",
    toilets_count: camp?.toilets || null,
    showers_count: camp?.showers || null,
    sinks_count: camp?.sinks || null,
    private_bathroom: hasPrivateBath,
    private_bathroom_state: privateBathField ? "CONFIRMED" : hasPrivateBath ? "SURVEYED" : "UNKNOWN",
    hot_water: hasHotWater,
    note: hasPrivateBath ? "단독 개별 화장실/욕실 구비" : (camp?.toilets > 0 ? `공용 화장실 ${camp.toilets}개소 / 샤워실 ${camp.showers ?? 0}개소` : null)
  };

  // --- [5. 특화 놀거리 및 시설 분석] ---
  const features = new Set();
  for (const item of FEATURE_PATTERNS) {
    if (item.re.test(textCorpus)) {
      features.add(item.key);
    }
  }
  // 고캠핑 메타 연동
  const envList = [...(Array.isArray(camp?.environment) ? camp.environment : []), ...(Array.isArray(camp?.env) ? camp.env : [])];
  if (hasAmenity(/물놀이|수영/) || envList.includes("물놀이")) features.add("SWIMMING_POOL");
  if (envList.includes("계곡")) features.add("VALLEY");
  if (hasAmenity(/트렘|방방/)) features.add("TRAMPOLINE");
  if (hasAmenity(/놀이터/)) features.add("PLAYGROUND");
  if (hasAmenity(/썰매/)) features.add("TUBE_SLED");
  if (detail?.programs) features.add("EXPERIENCE");

  // --- [6. 바닥재 및 규격 분석] ---
  const floorEntries = Array.isArray(camp?.floors)
    ? camp.floors.map((floor) => Array.isArray(floor) ? floor : [floor?.floor, floor?.count])
    : [];
  const floors = floorEntries
    .filter(([floor]) => floor)
    .map(([floor, count]) => ({ type: floor, count: Number(count) || null }));

  const sizeEntries = Array.isArray(camp?.site_sizes)
    ? camp.site_sizes.map((site) => [site?.width_m, site?.depth_m, site?.count])
    : (Array.isArray(camp?.sizes) ? camp.sizes : []);
  let sizes = sizeEntries
    .filter(([width, depth]) => Number(width) > 0 && Number(depth) > 0)
    .map(([width, depth, count]) => ({ width_m: Number(width), depth_m: Number(depth), count: Number(count) || null }));
  let sizesFrom = sizes.length ? "FIELD" : null;

  // 규격이 고캠핑 필드에 없는 경우 텍스트에서 보강
  if (sizes.length === 0) {
    const sizeMatch = textCorpus.match(/(\d{1,2}(?:\.\d)?)\s*(?:m|M)?\s*[xX*×]\s*(\d{1,2}(?:\.\d)?)\s*(?:m|M)?/);
    if (sizeMatch) {
      const w = parseFloat(sizeMatch[1]);
      const d = parseFloat(sizeMatch[2]);
      if (w >= 3 && w <= 20 && d >= 3 && d <= 20) {
        sizes = [{ width_m: w, depth_m: d, count: null }];
        sizesFrom = "TEXT";
      }
    }
  }

  // --- [7. 텐트·타프 피칭 규칙] ---
  // 사이트 면적으로 타프·캐노피 허용을 추정하지 않는다(PILOT_INTAKE_CONTRACT 2.1절).

  // --- [8. 장비 대여 품목] ---
  const rentalEquip = Array.isArray(camp?.rental) ? camp.rental : (Array.isArray(camp?.rental_equipment) ? camp.rental_equipment : []);
  const rentalOffers = rentalEquip.map((item) => ({
    item: String(item),
    price_krw: null,
    deposit_krw: 0,
    note: "현장 대여 가능 품목"
  }));

  const sourceUrl = camp?.gocamping_url ?? camp?.gc_url ?? null;
  const checkedAt = camp?.source?.fetched_at ?? camp?.modified_at ?? new Date().toISOString().slice(0, 10);

  return {
    version: 2,
    status: (parkingMode !== "UNKNOWN" || limitW != null || fireFrom === "TEXT" || sizesFrom === "TEXT" || (hasPrivateBath && !privateBathField)) ? "SURVEYED" : "CONFIRMED",
    parking: {
      state: parkingMode !== "UNKNOWN" ? "SURVEYED" : "UNKNOWN",
      mode: parkingMode,
      tent_side: tentSide,
      cart_required: cartRequired,
      shared_nearby: sharedNearby,
      drop_off_external: null,
      auto_camping_sites: autoPitchSites,
    },
    shelter_setup: {
      state: "UNKNOWN",
      max_tents: null,
      max_tarps: null,
      canopy_allowed: null,
      note: null,
    },
    power: {
      state: powerState,
      available: mentionsElectricity || null,
      limit_w: limitW,
      regulatory_reference_w: regulatoryReferenceW,
      breaker_capacity: limitW ? `${Math.round((limitW / 220) * 10) / 10}A` : null,
      statutory_standard: regulatoryReferenceW === 600 && !limitW,
      high_power_mention: highPowerMention || null,
    },
    ground: {
      state: floors.length ? "CONFIRMED" : "UNKNOWN",
      types: floors,
    },
    charcoal: {
      state: fireState(charcoalAllowed != null),
      allowed: charcoalAllowed,
    },
    firewood: {
      state: firewoodAllowed != null ? fireState(true) : (firewoodSale ? "PARTIAL" : "UNKNOWN"),
      allowed: firewoodAllowed,
      sold: firewoodSale || null,
    },
    fire_pit: {
      state: fireState(Boolean(firePitArrangement)),
      arrangement: firePitArrangement,
    },
    site_size: {
      state: sizesFrom === "FIELD" ? "CONFIRMED" : sizesFrom === "TEXT" ? "SURVEYED" : "UNKNOWN",
      groups: sizes,
    },
    sanitary,
    features: Array.from(features),
    rental_offers: rentalOffers,
    source: {
      label: "한국관광공사 고캠핑 운영자 등록 및 공식 소개 전수조사",
      url: sourceUrl,
      checked_at: checkedAt,
      tier: "A",
    },
  };
}
