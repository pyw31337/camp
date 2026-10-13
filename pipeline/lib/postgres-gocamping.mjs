import { createHash } from "node:crypto";

export const GOCAMPING_SOURCE_URL = "https://www.data.go.kr/data/15101933/openapi.do";
const GOCAMPING_PREFIX = "고캠핑 · ";

const productKinds = new Set([
  "PITCH", "AUTO_PITCH", "TARP_ZONE", "SHELTER_ZONE", "RENTAL_TENT",
  "GLAMPING", "CARAVAN_RENTAL", "RV_PITCH", "CAMPNIC_DAY", "ADD_ON", "OTHER",
]);

const cleanText = (value) => {
  const text = String(value ?? "").trim();
  return text || null;
};

const cleanList = (values) => Array.isArray(values)
  ? values.map(cleanText).filter(Boolean)
  : [];

function legalBusinessType(values) {
  const types = cleanList(values);
  const general = types.some((value) => value.includes("일반야영장"));
  const auto = types.some((value) => value.includes("자동차야영장"));
  if (general && auto) return "BOTH";
  if (auto) return "AUTO_CAMPGROUND";
  if (general) return "GENERAL_CAMPGROUND";
  return "UNKNOWN";
}

function operatorType(value) {
  switch (value) {
    case "LOCAL_GOVERNMENT": return "LOCAL_GOVERNMENT";
    case "PRIVATE": return "PRIVATE";
    case "NATIONAL_PARK": return "NATIONAL";
    case "NATURAL_RECREATION_FOREST":
    case "PUBLIC_LEISURE": return "PUBLIC_AGENCY";
    default: return "UNKNOWN";
  }
}

function campgroundStatus(value) {
  const status = cleanText(value);
  if (!status) return "UNKNOWN";
  if (/폐업|폐장|종료/.test(status)) return "CLOSED";
  if (/휴장/.test(status)) return "TEMPORARILY_CLOSED";
  if (/운영|영업/.test(status)) return "OPERATING";
  if (/등록/.test(status)) return "REGISTERED";
  return "UNKNOWN";
}

function isPublic(operator) {
  if (operator === "PRIVATE") return false;
  if (["NATIONAL", "LOCAL_GOVERNMENT", "PUBLIC_AGENCY", "NONPROFIT"].includes(operator)) return true;
  return null;
}

function hash(value) {
  return createHash("sha256").update(JSON.stringify(value)).digest("hex");
}

export function gocampingFacilityUrl(externalId) {
  return `https://www.gocamping.or.kr/bsite/camp/info/read.do?c_no=${encodeURIComponent(String(externalId))}`;
}

/**
 * Maps the normalized API representation to the relational model without
 * inventing price, inventory, capacity, or a relation between a site size and
 * a specific product. Site sizes are stored beneath a dedicated OTHER product
 * when GoCamping does not identify the affected product type.
 */
export function mapGoCampingCampground(campground) {
  const externalId = cleanText(campground?.external_id?.id);
  const canonicalName = cleanText(campground?.name);
  if (!externalId || !canonicalName) throw new Error("고캠핑 레코드에 external_id 또는 name이 없습니다.");

  const operator = operatorType(campground.operator_type);
  const source = campground.source ?? {};
  const productRows = (Array.isArray(campground.products) ? campground.products : [])
    .filter((product) => productKinds.has(product?.kind) && Number.isInteger(product?.site_count) && product.site_count > 0)
    .map((product) => ({
      name: `${GOCAMPING_PREFIX}${product.kind}`,
      product_kind: product.kind,
      stay_mode: "OVERNIGHT",
      description: "고캠핑 등록 면수 기준의 상품 유형 요약. 요금·정원·실시간 재고는 공식 예약처에서 별도 확인해야 합니다.",
      amenity_flags: {
        source: "GOCAMPING",
        site_count: product.site_count,
        confirmed: product.confirmed === true,
        fetched_at: cleanText(source.fetched_at),
      },
    }));

  const siteSizes = (Array.isArray(campground.site_sizes) ? campground.site_sizes : [])
    .filter((size) => Number(size?.width_m) > 0 && Number(size?.depth_m) > 0)
    .map((size, index) => ({
      code: `GOCAMPING-SITE-GROUP-${index + 1}`,
      width_m: Number(size.width_m),
      depth_m: Number(size.depth_m),
      area_m2: Number(size.area_m2) > 0 ? Number(size.area_m2) : Number(size.width_m) * Number(size.depth_m),
      inventory_count: Number.isInteger(size.count) && size.count > 0 ? size.count : 1,
      measurement_source: cleanText(size.measurement_source) ?? "GOCAMPING",
    }));

  const snapshot = {
    external_id: externalId,
    name: canonicalName,
    legal_business_types: cleanList(campground.legal_business_types),
    operator_type: cleanText(campground.operator_type),
    management: cleanText(campground.management),
    status_text: cleanText(campground.status_text),
    address: {
      sido: cleanText(campground.address?.sido),
      sigungu: cleanText(campground.address?.sigungu),
      line1: cleanText(campground.address?.line1),
      line2: cleanText(campground.address?.line2),
    },
    location: campground.location?.lat != null && campground.location?.lng != null
      ? { lat: Number(campground.location.lat), lng: Number(campground.location.lng) }
      : null,
    contact: {
      tel: cleanText(campground.contact?.tel),
      homepage: cleanText(campground.contact?.homepage),
    },
    products: productRows.map(({ amenity_flags, ...product }) => ({ ...product, site_count: amenity_flags.site_count })),
    product_kind_candidates: cleanList(campground.product_kind_candidates),
    site_sizes: siteSizes,
    floors: Array.isArray(campground.floors) ? campground.floors : [],
    amenities: cleanList(campground.amenities),
    amenities_etc: cleanList(campground.amenities_etc),
    pets: cleanText(campground.pets),
    trailer_allowed: campground.trailer_allowed ?? null,
    caravan_allowed: campground.caravan_allowed ?? null,
    fire_pit: cleanText(campground.fire_pit),
    toilets: Number.isInteger(campground.toilets) ? campground.toilets : 0,
    showers: Number.isInteger(campground.showers) ? campground.showers : 0,
    sinks: Number.isInteger(campground.sinks) ? campground.sinks : 0,
    rental_equipment: cleanList(campground.rental_equipment),
    operating_seasons: cleanList(campground.operating_seasons),
    operating_days: cleanList(campground.operating_days),
    reservation: {
      methods: cleanList(campground.reservation?.methods),
      url: cleanText(campground.reservation?.url),
    },
    source: {
      created_at: cleanText(source.created_at),
      modified_at: cleanText(source.modified_at),
      fetched_at: cleanText(source.fetched_at),
    },
  };

  return {
    externalId,
    externalUrl: gocampingFacilityUrl(externalId),
    facility: {
      canonical_name: canonicalName,
      legal_business_type: legalBusinessType(campground.legal_business_types),
      operator_type: operator,
      operator_name: cleanText(campground.management),
      status: campgroundStatus(campground.status_text),
      road_address: cleanText(campground.address?.line1),
      parcel_address: cleanText(campground.address?.line2),
      province: cleanText(campground.address?.sido),
      city_county_district: cleanText(campground.address?.sigungu),
      latitude: snapshot.location?.lat ?? null,
      longitude: snapshot.location?.lng ?? null,
      official_homepage_url: snapshot.contact.homepage,
      official_phone: snapshot.contact.tel,
      is_public: isPublic(operator),
      last_verified_at: snapshot.source.fetched_at,
    },
    productRows,
    siteSizes,
    reservation: snapshot.reservation.url ? {
      name: "고캠핑 제공 예약 링크",
      booking_url: snapshot.reservation.url,
    } : null,
    snapshot,
    responseHash: hash(snapshot),
    observedAt: snapshot.source.fetched_at,
  };
}

async function upsertOne(client, sourceId, record) {
  const mapped = mapGoCampingCampground(record);
  const existing = await client.query(
    `SELECT campground_id FROM external_identifier
       WHERE source_id = $1 AND entity_type = 'CAMPGROUND' AND external_id = $2`,
    [sourceId, mapped.externalId],
  );

  let campgroundId = existing.rows[0]?.campground_id;
  const columns = [
    "canonical_name", "legal_business_type", "operator_type", "operator_name", "status",
    "road_address", "parcel_address", "province", "city_county_district", "latitude", "longitude",
    "official_homepage_url", "official_phone", "is_public", "last_verified_at",
  ];
  const values = columns.map((column) => mapped.facility[column]);

  if (campgroundId) {
    const assignments = columns.map((column, index) => `${column} = $${index + 2}`).join(", ");
    await client.query(`UPDATE campground SET ${assignments}, updated_at = now() WHERE id = $1`, [campgroundId, ...values]);
  } else {
    const placeholders = columns.map((_, index) => `$${index + 1}`).join(", ");
    const inserted = await client.query(`INSERT INTO campground (${columns.join(", ")}) VALUES (${placeholders}) RETURNING id`, values);
    campgroundId = inserted.rows[0].id;
  }

  await client.query(
    `INSERT INTO external_identifier (campground_id, source_id, entity_type, external_id, external_url, observed_at)
     VALUES ($1, $2, 'CAMPGROUND', $3, $4, COALESCE($5::timestamptz, now()))
     ON CONFLICT (source_id, entity_type, external_id) DO UPDATE
       SET campground_id = EXCLUDED.campground_id, external_url = EXCLUDED.external_url, observed_at = EXCLUDED.observed_at`,
    [campgroundId, sourceId, mapped.externalId, mapped.externalUrl, mapped.observedAt],
  );
  await client.query(
    `INSERT INTO campground_alias (campground_id, alias, source_id) VALUES ($1, $2, $3)
     ON CONFLICT (campground_id, alias) DO NOTHING`,
    [campgroundId, mapped.facility.canonical_name, sourceId],
  );

  // Only replace the generic products generated from this exact source. Contracted
  // products and their booking mappings use different names and remain intact.
  await client.query("DELETE FROM product WHERE campground_id = $1 AND name LIKE '고캠핑 · %'", [campgroundId]);
  let productCount = 0;
  for (const product of mapped.productRows) {
    await client.query(
      `INSERT INTO product (campground_id, name, product_kind, stay_mode, description, amenity_flags)
       VALUES ($1, $2, $3::product_kind, $4::stay_mode, $5, $6::jsonb)`,
      [campgroundId, product.name, product.product_kind, product.stay_mode, product.description, JSON.stringify(product.amenity_flags)],
    );
    productCount += 1;
  }

  let inventoryCount = 0;
  if (mapped.siteSizes.length) {
    const dimensionProduct = await client.query(
      `INSERT INTO product (campground_id, name, product_kind, stay_mode, description, amenity_flags)
       VALUES ($1, '고캠핑 · 사이트 규격(분류 미확정)', 'OTHER', 'OVERNIGHT', $2, $3::jsonb)
       RETURNING id`,
      [campgroundId, "고캠핑은 규격이 어느 예약 상품에 적용되는지 제공하지 않아, 규격을 별도 그룹으로 저장합니다.", JSON.stringify({ source: "GOCAMPING", mapping: "SITE_GROUP_UNCLASSIFIED" })],
    );
    for (const size of mapped.siteSizes) {
      await client.query(
        `INSERT INTO inventory_unit (product_id, code, width_m, depth_m, area_m2, measurement_source, inventory_count)
         VALUES ($1, $2, $3, $4, $5, $6, $7)`,
        [dimensionProduct.rows[0].id, size.code, size.width_m, size.depth_m, size.area_m2, size.measurement_source, size.inventory_count],
      );
      inventoryCount += 1;
    }
  }

  await client.query("DELETE FROM reservation_channel WHERE campground_id = $1 AND name = '고캠핑 제공 예약 링크'", [campgroundId]);
  let reservationChannels = 0;
  if (mapped.reservation) {
    await client.query(
      `INSERT INTO reservation_channel (campground_id, name, integration_mode, booking_url, is_official, is_primary, supports_live_inventory, supports_live_quote, supports_booking, last_verified_at)
       VALUES ($1, $2, 'UNKNOWN', $3, false, false, false, false, false, COALESCE($4::timestamptz, now()))`,
      [campgroundId, mapped.reservation.name, mapped.reservation.booking_url, mapped.observedAt],
    );
    reservationChannels = 1;
  }

  await client.query(
    `UPDATE source_assertion SET superseded_at = now()
     WHERE data_source_id = $1 AND campground_id = $2 AND entity_type = 'CAMPGROUND'
       AND field_name = 'gocamping.normalized_snapshot' AND superseded_at IS NULL
       AND response_hash IS DISTINCT FROM $3`,
    [sourceId, campgroundId, mapped.responseHash],
  );
  await client.query(
    `INSERT INTO source_assertion (
       data_source_id, campground_id, entity_type, entity_id, field_name,
       raw_value, normalized_value, source_url, source_published_at, observed_at,
       response_hash, source_tier, verification_status
     )
     SELECT $1, $2, 'CAMPGROUND', $2, 'gocamping.normalized_snapshot',
       $3::jsonb, $4::jsonb, $5, $6::timestamptz, COALESCE($7::timestamptz, now()),
       $8, 'A', 'VERIFIED'
     WHERE NOT EXISTS (
       SELECT 1 FROM source_assertion
       WHERE data_source_id = $1 AND campground_id = $2 AND entity_type = 'CAMPGROUND'
         AND field_name = 'gocamping.normalized_snapshot' AND response_hash = $8 AND superseded_at IS NULL
     )`,
    [
      sourceId, campgroundId, JSON.stringify(mapped.snapshot),
      JSON.stringify({ products: mapped.productRows, site_sizes: mapped.siteSizes, reservation: mapped.snapshot.reservation }),
      GOCAMPING_SOURCE_URL, mapped.snapshot.source.modified_at, mapped.observedAt, mapped.responseHash,
    ],
  );

  return { productCount, inventoryCount, reservationChannels };
}

export async function importGoCampingSnapshot(pool, campgrounds, { batchSize = 50 } = {}) {
  if (!Array.isArray(campgrounds) || !campgrounds.length) throw new Error("적재할 고캠핑 레코드가 없습니다.");
  const source = await pool.query("SELECT id FROM data_source WHERE code = 'gocamping'");
  if (!source.rows[0]?.id) throw new Error("data_source.gocamping이 없습니다. db/003_seed_source_registry.sql까지 먼저 적용하세요.");
  const sourceId = source.rows[0].id;
  const counts = { campgrounds: 0, products: 0, inventory_units: 0, reservation_channels: 0 };

  for (let index = 0; index < campgrounds.length; index += batchSize) {
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      for (const record of campgrounds.slice(index, index + batchSize)) {
        const added = await upsertOne(client, sourceId, record);
        counts.campgrounds += 1;
        counts.products += added.productCount;
        counts.inventory_units += added.inventoryCount;
        counts.reservation_channels += added.reservationChannels;
      }
      await client.query("COMMIT");
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  }
  return counts;
}
