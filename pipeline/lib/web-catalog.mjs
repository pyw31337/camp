// GitHub Pages에는 원천의 권리·보존 조건을 통과한 최소 읽기 모델만 내보낸다.
// 사진 URL, 예약 화면 응답, 가격/재고처럼 짧은 수명 또는 별도 권리 검토가 필요한
// 값은 이 카탈로그에 싣지 않는다.

const text = (value) => typeof value === "string" && value.trim() ? value.trim() : null;

function publicCampground(campground) {
  return {
    external_id: text(campground?.external_id?.id),
    name: text(campground?.name),
    region: {
      province: text(campground?.address?.sido),
      city_county_district: text(campground?.address?.sigungu),
    },
    legal_business_types: Array.isArray(campground?.legal_business_types) ? campground.legal_business_types : [],
    operator_type: text(campground?.operator_type) ?? "UNKNOWN",
    status_text: text(campground?.status_text),
    products: Array.isArray(campground?.products) ? campground.products.map((product) => ({
      kind: text(product?.kind),
      site_count: Number.isInteger(product?.site_count) ? product.site_count : 0,
      confirmed: product?.confirmed === true,
    })) : [],
    site_sizes: Array.isArray(campground?.site_sizes) ? campground.site_sizes.map((site) => ({
      width_m: Number.isFinite(site?.width_m) ? site.width_m : null,
      depth_m: Number.isFinite(site?.depth_m) ? site.depth_m : null,
      area_m2: Number.isFinite(site?.area_m2) ? site.area_m2 : null,
      count: Number.isInteger(site?.count) ? site.count : 0,
      measurement_source: text(site?.measurement_source),
    })) : [],
    reservation: {
      methods: Array.isArray(campground?.reservation?.methods) ? campground.reservation.methods.filter((value) => typeof value === "string") : [],
      has_official_url: Boolean(text(campground?.reservation?.url)),
    },
    source: {
      provider: text(campground?.source?.provider) ?? "gocamping",
      tier: text(campground?.source?.tier) ?? "A",
      fetched_at: text(campground?.source?.fetched_at),
      modified_at: text(campground?.source?.modified_at),
    },
  };
}

export function buildWebCatalog({ calendar, campgroundsPayload, publishGoCamping, generatedAt }) {
  const rawCampgrounds = Array.isArray(campgroundsPayload?.campgrounds) ? campgroundsPayload.campgrounds : [];
  const canPublish = publishGoCamping === true && rawCampgrounds.length > 0;
  const calendarEvents = Array.isArray(calendar?.events) ? calendar.events : [];

  return {
    schema_version: 1,
    generated_at: generatedAt,
    publication_scope: "READ_ONLY_DISCOVERY",
    counts: {
      opening_events: calendarEvents.length,
      gocamping_records: canPublish ? rawCampgrounds.length : null,
      official_pilot_products: 4,
    },
    sources: {
      open_calendar: {
        state: calendarEvents.length > 0 ? "PUBLISHED" : "MISSING",
        generated_at: text(calendar?.generated_at),
        registry_version: calendar?.registry_version ?? null,
      },
      gocamping: {
        state: canPublish ? "PUBLISHED" : rawCampgrounds.length > 0 ? "PENDING_PERSISTENCE_REVIEW" : "AWAITING_API_SYNC",
        source_url: "https://www.data.go.kr/data/15101933/openapi.do",
        fetched_at: text(campgroundsPayload?.fetched_at),
        persistence_review_required: !canPublish,
      },
    },
    campgrounds: canPublish ? rawCampgrounds.map(publicCampground).filter((campground) => campground.external_id && campground.name) : [],
  };
}

// 고캠핑 공개본은 대용량 기준 시설 카탈로그다. 일시적인 API 실패나 취소된
// 동기화가 이를 빈 배열로 바꾸면 검색 기능이 즉시 사라진다. 원천의 영구
// 보존 허가가 취소된 경우에만 호출자가 명시적으로 철회를 허용한다.
export function preservePublishedGoCampingCatalog({ candidate, existingCatalog, allowWithdrawal = false }) {
  const existingCampgrounds = Array.isArray(existingCatalog?.campgrounds) ? existingCatalog.campgrounds : [];
  const existingIsPublished = existingCatalog?.sources?.gocamping?.state === "PUBLISHED" && existingCampgrounds.length > 0;
  const candidateIsPublished = candidate?.sources?.gocamping?.state === "PUBLISHED";

  if (allowWithdrawal || !existingIsPublished || candidateIsPublished) {
    return { catalog: candidate, retainedPreviousGoCampingCatalog: false };
  }

  return {
    catalog: {
      ...candidate,
      counts: {
        ...candidate.counts,
        gocamping_records: existingCampgrounds.length,
      },
      sources: {
        ...candidate.sources,
        gocamping: existingCatalog.sources.gocamping,
      },
      campgrounds: existingCampgrounds,
    },
    retainedPreviousGoCampingCatalog: true,
  };
}
