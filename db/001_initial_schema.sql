-- Camping discovery, availability, booking-policy, media, travel, and provenance model.
-- Target: PostgreSQL 16+. Apply with a migration runner; do not execute this file on
-- a production database without the normal migration review process.

BEGIN;

CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TYPE operator_type AS ENUM (
  'NATIONAL', 'LOCAL_GOVERNMENT', 'PUBLIC_AGENCY', 'PRIVATE', 'NONPROFIT', 'UNKNOWN'
);

CREATE TYPE legal_business_type AS ENUM (
  'GENERAL_CAMPGROUND', 'AUTO_CAMPGROUND', 'BOTH', 'NOT_REGISTERED', 'UNKNOWN'
);

CREATE TYPE campground_status AS ENUM (
  'REGISTERED', 'OPERATING', 'TEMPORARILY_CLOSED', 'CLOSED', 'PENDING_VERIFICATION', 'UNKNOWN'
);

CREATE TYPE product_kind AS ENUM (
  'PITCH', 'AUTO_PITCH', 'TARP_ZONE', 'SHELTER_ZONE', 'RENTAL_TENT',
  'GLAMPING', 'CARAVAN_RENTAL', 'RV_PITCH', 'CAMPNIC_DAY', 'ADD_ON', 'OTHER'
);

CREATE TYPE stay_mode AS ENUM ('OVERNIGHT', 'DAY_USE', 'BOTH');

CREATE TYPE reservation_mode AS ENUM (
  'FIRST_COME', 'LOTTERY', 'WAITLIST', 'REQUEST', 'PHONE', 'ON_SITE', 'MIXED', 'UNKNOWN'
);

CREATE TYPE integration_mode AS ENUM (
  'OFFICIAL_REDIRECT', 'PUBLIC_READ_API', 'CONTRACT_READ_API',
  'CONTRACT_BOOKING_API', 'OPERATOR_PORTAL', 'MANUAL_VERIFIED', 'UNKNOWN'
);

CREATE TYPE availability_state AS ENUM (
  'LIVE_AVAILABLE', 'LIVE_SOLD_OUT', 'OPEN_SCHEDULED', 'LOTTERY_OPEN',
  'WAITLIST_OPEN', 'OFFICIAL_CHECK_REQUIRED', 'STALE', 'UNKNOWN'
);

CREATE TYPE source_tier AS ENUM ('A', 'B', 'C', 'D', 'E');

CREATE TYPE verification_status AS ENUM (
  'VERIFIED', 'PENDING_REVIEW', 'CONFLICTED', 'REJECTED', 'EXPIRED'
);

CREATE TYPE media_role AS ENUM (
  'HERO', 'SITE_DIMENSION', 'FACILITY', 'GLAMPING_INTERIOR', 'CARAVAN_INTERIOR',
  'SEASON', 'ACTIVITY', 'ACCESS', 'SAFETY', 'RECENT_ATMOSPHERE', 'OTHER'
);

CREATE TYPE media_origin AS ENUM (
  'OPERATOR_UPLOAD', 'CONTRACTED_PROVIDER', 'PUBLIC_API', 'PLATFORM_EMBED', 'SEARCH_RESULT'
);

CREATE TYPE social_platform AS ENUM (
  'YOUTUBE', 'INSTAGRAM', 'TIKTOK', 'NAVER_BLOG', 'NAVER_SEARCH', 'DAUM_SEARCH', 'OTHER'
);

CREATE TYPE candidate_state AS ENUM ('NEW', 'MATCHED', 'VERIFIED', 'REJECTED', 'DUPLICATE', 'NEEDS_REVIEW');

CREATE TABLE data_source (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code text NOT NULL UNIQUE,
  name text NOT NULL,
  owner_name text NOT NULL,
  base_url text NOT NULL,
  source_tier source_tier NOT NULL,
  terms_url text,
  license_summary text,
  allows_persistent_storage boolean NOT NULL DEFAULT false,
  default_cache_seconds integer CHECK (default_cache_seconds IS NULL OR default_cache_seconds >= 0),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE reservation_provider (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  data_source_id uuid REFERENCES data_source(id),
  code text NOT NULL UNIQUE,
  name text NOT NULL,
  provider_type text NOT NULL,
  integration_mode integration_mode NOT NULL,
  booking_capabilities jsonb NOT NULL DEFAULT '{}'::jsonb,
  terms_reviewed_at timestamptz,
  rate_limit_note text,
  contract_status text NOT NULL DEFAULT 'NOT_STARTED',
  freshness_sla_seconds integer CHECK (freshness_sla_seconds IS NULL OR freshness_sla_seconds > 0),
  last_success_at timestamptz,
  incident_state text NOT NULL DEFAULT 'HEALTHY',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE campground (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  canonical_name text NOT NULL,
  legal_name text,
  legal_business_type legal_business_type NOT NULL DEFAULT 'UNKNOWN',
  operator_type operator_type NOT NULL DEFAULT 'UNKNOWN',
  operator_name text,
  status campground_status NOT NULL DEFAULT 'UNKNOWN',
  road_address text,
  parcel_address text,
  postal_code text,
  province text,
  city_county_district text,
  latitude numeric(9, 6),
  longitude numeric(9, 6),
  official_homepage_url text,
  official_phone text,
  description text,
  opened_at date,
  closed_at date,
  registered_at date,
  is_public boolean,
  last_verified_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK ((latitude IS NULL AND longitude IS NULL) OR
         (latitude BETWEEN -90 AND 90 AND longitude BETWEEN -180 AND 180))
);

CREATE INDEX campground_location_idx ON campground (latitude, longitude)
  WHERE latitude IS NOT NULL AND longitude IS NOT NULL;
CREATE INDEX campground_region_idx ON campground (province, city_county_district);
CREATE INDEX campground_status_idx ON campground (status, operator_type);

CREATE TABLE campground_alias (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  campground_id uuid NOT NULL REFERENCES campground(id) ON DELETE CASCADE,
  alias text NOT NULL,
  locale text NOT NULL DEFAULT 'ko-KR',
  source_id uuid REFERENCES data_source(id),
  UNIQUE (campground_id, alias)
);

CREATE TABLE external_identifier (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  campground_id uuid NOT NULL REFERENCES campground(id) ON DELETE CASCADE,
  source_id uuid NOT NULL REFERENCES data_source(id),
  entity_type text NOT NULL DEFAULT 'CAMPGROUND',
  external_id text NOT NULL,
  external_url text,
  observed_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (source_id, entity_type, external_id)
);

CREATE TABLE campground_zone (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  campground_id uuid NOT NULL REFERENCES campground(id) ON DELETE CASCADE,
  name text NOT NULL,
  zone_type text,
  vehicle_access boolean,
  site_spacing_m numeric(6, 2) CHECK (site_spacing_m IS NULL OR site_spacing_m >= 0),
  surface_types text[] NOT NULL DEFAULT '{}',
  facilities jsonb NOT NULL DEFAULT '{}'::jsonb,
  sort_order integer NOT NULL DEFAULT 0,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (campground_id, name)
);

CREATE TABLE product (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  campground_zone_id uuid REFERENCES campground_zone(id) ON DELETE SET NULL,
  campground_id uuid NOT NULL REFERENCES campground(id) ON DELETE CASCADE,
  name text NOT NULL,
  product_kind product_kind NOT NULL,
  stay_mode stay_mode NOT NULL,
  description text,
  check_in_time time,
  check_out_time time,
  day_use_start_time time,
  day_use_end_time time,
  base_adults smallint CHECK (base_adults IS NULL OR base_adults >= 0),
  base_children smallint CHECK (base_children IS NULL OR base_children >= 0),
  max_guests smallint CHECK (max_guests IS NULL OR max_guests > 0),
  max_vehicles smallint CHECK (max_vehicles IS NULL OR max_vehicles >= 0),
  pets_allowed boolean,
  vehicle_rules jsonb NOT NULL DEFAULT '{}'::jsonb,
  included_items jsonb NOT NULL DEFAULT '[]'::jsonb,
  required_to_bring jsonb NOT NULL DEFAULT '[]'::jsonb,
  amenity_flags jsonb NOT NULL DEFAULT '{}'::jsonb,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK (
    max_guests IS NULL OR (COALESCE(base_adults, 0) + COALESCE(base_children, 0) <= max_guests)
  )
);

CREATE INDEX product_search_idx ON product (campground_id, product_kind, stay_mode, is_active);

CREATE TABLE inventory_unit (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id uuid NOT NULL REFERENCES product(id) ON DELETE CASCADE,
  code text,
  name text,
  width_m numeric(7, 2) CHECK (width_m IS NULL OR width_m > 0),
  depth_m numeric(7, 2) CHECK (depth_m IS NULL OR depth_m > 0),
  area_m2 numeric(9, 2) CHECK (area_m2 IS NULL OR area_m2 > 0),
  measurement_source text,
  surface_type text,
  inventory_count integer NOT NULL DEFAULT 1 CHECK (inventory_count > 0),
  accessibility jsonb NOT NULL DEFAULT '{}'::jsonb,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE NULLS NOT DISTINCT (product_id, code)
);

CREATE TABLE reservation_channel (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  campground_id uuid NOT NULL REFERENCES campground(id) ON DELETE CASCADE,
  reservation_provider_id uuid REFERENCES reservation_provider(id),
  name text NOT NULL,
  integration_mode integration_mode NOT NULL,
  external_facility_id text,
  booking_url text,
  is_official boolean NOT NULL DEFAULT false,
  is_primary boolean NOT NULL DEFAULT false,
  supports_live_inventory boolean NOT NULL DEFAULT false,
  supports_live_quote boolean NOT NULL DEFAULT false,
  supports_booking boolean NOT NULL DEFAULT false,
  last_verified_at timestamptz,
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX reservation_channel_primary_idx ON reservation_channel (campground_id)
  WHERE is_primary AND active;

CREATE TABLE reservation_channel_product (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  reservation_channel_id uuid NOT NULL REFERENCES reservation_channel(id) ON DELETE CASCADE,
  product_id uuid NOT NULL REFERENCES product(id) ON DELETE CASCADE,
  external_product_id text,
  booking_url text,
  active boolean NOT NULL DEFAULT true,
  UNIQUE (reservation_channel_id, product_id),
  UNIQUE NULLS NOT DISTINCT (reservation_channel_id, external_product_id)
);

CREATE TABLE rate_plan (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id uuid NOT NULL REFERENCES product(id) ON DELETE CASCADE,
  reservation_channel_product_id uuid REFERENCES reservation_channel_product(id) ON DELETE SET NULL,
  name text NOT NULL,
  currency char(3) NOT NULL DEFAULT 'KRW',
  unit text NOT NULL,
  base_amount_krw integer CHECK (base_amount_krw IS NULL OR base_amount_krw >= 0),
  tax_included boolean,
  rule_json jsonb NOT NULL DEFAULT '{}'::jsonb,
  valid_from date,
  valid_to date,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK (valid_to IS NULL OR valid_from IS NULL OR valid_to >= valid_from)
);

CREATE TABLE policy_document (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  campground_id uuid NOT NULL REFERENCES campground(id) ON DELETE CASCADE,
  product_id uuid REFERENCES product(id) ON DELETE CASCADE,
  reservation_channel_id uuid REFERENCES reservation_channel(id) ON DELETE SET NULL,
  reservation_mode reservation_mode NOT NULL DEFAULT 'UNKNOWN',
  category text NOT NULL,
  title text NOT NULL,
  source_url text NOT NULL,
  source_published_at timestamptz,
  raw_text text,
  parsed_rule_json jsonb NOT NULL DEFAULT '{}'::jsonb,
  valid_from timestamptz,
  valid_to timestamptz,
  verification_status verification_status NOT NULL DEFAULT 'PENDING_REVIEW',
  reviewed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK (valid_to IS NULL OR valid_from IS NULL OR valid_to >= valid_from)
);

CREATE INDEX policy_document_scope_idx ON policy_document (campground_id, product_id, category, verification_status);

CREATE TABLE booking_window (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  policy_document_id uuid NOT NULL REFERENCES policy_document(id) ON DELETE CASCADE,
  product_id uuid REFERENCES product(id) ON DELETE CASCADE,
  window_type text NOT NULL,
  opens_at timestamptz NOT NULL,
  closes_at timestamptz,
  applies_to jsonb NOT NULL DEFAULT '{}'::jsonb,
  timezone text NOT NULL DEFAULT 'Asia/Seoul',
  CHECK (closes_at IS NULL OR closes_at >= opens_at)
);

CREATE INDEX booking_window_open_idx ON booking_window (opens_at, closes_at);

CREATE TABLE lottery_round (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  policy_document_id uuid NOT NULL REFERENCES policy_document(id) ON DELETE CASCADE,
  product_id uuid REFERENCES product(id) ON DELETE CASCADE,
  external_round_id text,
  application_opens_at timestamptz NOT NULL,
  application_closes_at timestamptz NOT NULL,
  draw_at timestamptz,
  payment_deadline_at timestamptz,
  stay_start_date date,
  stay_end_date date,
  eligibility_json jsonb NOT NULL DEFAULT '{}'::jsonb,
  state text NOT NULL DEFAULT 'SCHEDULED',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK (application_closes_at >= application_opens_at),
  CHECK (stay_end_date IS NULL OR stay_start_date IS NULL OR stay_end_date >= stay_start_date)
);

CREATE TABLE availability_snapshot (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  reservation_channel_product_id uuid NOT NULL REFERENCES reservation_channel_product(id) ON DELETE CASCADE,
  inventory_unit_id uuid REFERENCES inventory_unit(id) ON DELETE SET NULL,
  check_in_date date NOT NULL,
  check_out_date date NOT NULL,
  adults smallint NOT NULL DEFAULT 1 CHECK (adults >= 0),
  children smallint NOT NULL DEFAULT 0 CHECK (children >= 0),
  vehicles smallint NOT NULL DEFAULT 0 CHECK (vehicles >= 0),
  availability_state availability_state NOT NULL,
  remaining_count integer CHECK (remaining_count IS NULL OR remaining_count >= 0),
  quoted_total_krw integer CHECK (quoted_total_krw IS NULL OR quoted_total_krw >= 0),
  quote_is_final boolean NOT NULL DEFAULT false,
  quote_breakdown jsonb NOT NULL DEFAULT '[]'::jsonb,
  source_response_hash text NOT NULL,
  observed_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK (check_out_date > check_in_date),
  CHECK (expires_at >= observed_at)
);

CREATE INDEX availability_live_lookup_idx ON availability_snapshot (
  reservation_channel_product_id, check_in_date, check_out_date, expires_at DESC
);
CREATE INDEX availability_current_state_idx ON availability_snapshot (availability_state, expires_at DESC);

CREATE TABLE media_asset (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  campground_id uuid NOT NULL REFERENCES campground(id) ON DELETE CASCADE,
  campground_zone_id uuid REFERENCES campground_zone(id) ON DELETE SET NULL,
  product_id uuid REFERENCES product(id) ON DELETE SET NULL,
  data_source_id uuid REFERENCES data_source(id),
  origin media_origin NOT NULL,
  role media_role NOT NULL DEFAULT 'OTHER',
  external_media_id text,
  source_url text NOT NULL,
  delivery_url text,
  mime_type text,
  width_px integer CHECK (width_px IS NULL OR width_px > 0),
  height_px integer CHECK (height_px IS NULL OR height_px > 0),
  captured_at timestamptz,
  published_at timestamptz,
  alt_text text,
  caption text,
  rights_status verification_status NOT NULL DEFAULT 'PENDING_REVIEW',
  is_visible boolean NOT NULL DEFAULT false,
  last_checked_at timestamptz,
  removed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE NULLS NOT DISTINCT (data_source_id, external_media_id)
);

CREATE INDEX media_asset_gallery_idx ON media_asset (campground_id, product_id, role, is_visible)
  WHERE removed_at IS NULL;

CREATE TABLE media_right (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  media_asset_id uuid NOT NULL REFERENCES media_asset(id) ON DELETE CASCADE,
  rights_holder text NOT NULL,
  right_type text NOT NULL,
  agreement_reference text,
  usage_scope jsonb NOT NULL DEFAULT '{}'::jsonb,
  starts_at timestamptz,
  ends_at timestamptz,
  revoked_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK (ends_at IS NULL OR starts_at IS NULL OR ends_at >= starts_at)
);

CREATE TABLE social_connection (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  campground_id uuid NOT NULL REFERENCES campground(id) ON DELETE CASCADE,
  platform social_platform NOT NULL,
  account_external_id text NOT NULL,
  account_handle text,
  account_url text,
  ownership_verified_at timestamptz,
  granted_scopes text[] NOT NULL DEFAULT '{}',
  token_expires_at timestamptz,
  last_sync_at timestamptz,
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (platform, account_external_id)
);

CREATE TABLE social_item (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  campground_id uuid NOT NULL REFERENCES campground(id) ON DELETE CASCADE,
  social_connection_id uuid REFERENCES social_connection(id) ON DELETE SET NULL,
  platform social_platform NOT NULL,
  external_item_id text NOT NULL,
  canonical_url text NOT NULL,
  author_handle text,
  published_at timestamptz,
  discovered_at timestamptz NOT NULL DEFAULT now(),
  embed_allowed boolean NOT NULL DEFAULT false,
  match_score numeric(5, 4) CHECK (match_score IS NULL OR match_score BETWEEN 0 AND 1),
  match_evidence jsonb NOT NULL DEFAULT '{}'::jsonb,
  verification_status verification_status NOT NULL DEFAULT 'PENDING_REVIEW',
  display_expires_at timestamptz,
  removed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (platform, external_item_id)
);

CREATE INDEX social_item_feed_idx ON social_item (campground_id, published_at DESC)
  WHERE removed_at IS NULL AND embed_allowed;

CREATE TABLE weather_grid_mapping (
  campground_id uuid PRIMARY KEY REFERENCES campground(id) ON DELETE CASCADE,
  provider_code text NOT NULL,
  grid_x integer,
  grid_y integer,
  station_id text,
  mapping_method text NOT NULL,
  verified_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE weather_snapshot (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  campground_id uuid NOT NULL REFERENCES campground(id) ON DELETE CASCADE,
  data_source_id uuid REFERENCES data_source(id),
  observation_time timestamptz,
  issued_at timestamptz NOT NULL,
  valid_from timestamptz NOT NULL,
  valid_to timestamptz NOT NULL,
  payload jsonb NOT NULL,
  payload_hash text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK (valid_to >= valid_from)
);

CREATE INDEX weather_snapshot_current_idx ON weather_snapshot (campground_id, valid_from, valid_to DESC);

CREATE TABLE weather_alert (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  campground_id uuid NOT NULL REFERENCES campground(id) ON DELETE CASCADE,
  data_source_id uuid REFERENCES data_source(id),
  alert_type text NOT NULL,
  severity text,
  issued_at timestamptz NOT NULL,
  valid_from timestamptz NOT NULL,
  valid_to timestamptz,
  official_url text,
  state text NOT NULL DEFAULT 'ACTIVE',
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  CHECK (valid_to IS NULL OR valid_to >= valid_from)
);

CREATE INDEX weather_alert_active_idx ON weather_alert (campground_id, state, valid_from DESC);

CREATE TABLE nearby_place (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  campground_id uuid NOT NULL REFERENCES campground(id) ON DELETE CASCADE,
  data_source_id uuid REFERENCES data_source(id),
  external_place_id text,
  name text NOT NULL,
  category text,
  address text,
  latitude numeric(9, 6),
  longitude numeric(9, 6),
  source_url text,
  distance_m integer CHECK (distance_m IS NULL OR distance_m >= 0),
  recommendation_tags text[] NOT NULL DEFAULT '{}',
  official_verified boolean NOT NULL DEFAULT false,
  observed_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz,
  is_visible boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE NULLS NOT DISTINCT (campground_id, data_source_id, external_place_id)
);

CREATE INDEX nearby_place_search_idx ON nearby_place (campground_id, category, distance_m)
  WHERE is_visible;

CREATE TABLE campground_candidate (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  address text,
  latitude numeric(9, 6),
  longitude numeric(9, 6),
  source_id uuid REFERENCES data_source(id),
  source_url text,
  discovery_method text NOT NULL,
  state candidate_state NOT NULL DEFAULT 'NEW',
  matched_campground_id uuid REFERENCES campground(id) ON DELETE SET NULL,
  evidence jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  reviewed_at timestamptz
);

CREATE INDEX campground_candidate_review_idx ON campground_candidate (state, created_at);

CREATE TABLE source_assertion (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  data_source_id uuid NOT NULL REFERENCES data_source(id),
  campground_id uuid REFERENCES campground(id) ON DELETE CASCADE,
  entity_type text NOT NULL,
  entity_id uuid,
  field_name text NOT NULL,
  raw_value jsonb,
  normalized_value jsonb,
  source_url text,
  source_published_at timestamptz,
  observed_at timestamptz NOT NULL DEFAULT now(),
  response_hash text,
  source_tier source_tier NOT NULL,
  verification_status verification_status NOT NULL DEFAULT 'PENDING_REVIEW',
  superseded_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX source_assertion_entity_idx ON source_assertion (entity_type, entity_id, field_name, observed_at DESC);
CREATE INDEX source_assertion_campground_idx ON source_assertion (campground_id, field_name, observed_at DESC);

COMMIT;
