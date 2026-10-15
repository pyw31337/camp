-- 서비스 재정의 계획(docs/SERVICE_REINVENTION_PLAN.md)에 따른 구역·사이트별 현장 조건과 최근 관측 빈자리 스키마.
-- 실시간 재고(inventory_snapshot)와 최근 관측(availability_observation)을 엄격히 분리한다.
-- 전제: db/001_initial_schema.sql ~ db/008_campground_licence_source.sql
-- 롤백: 의존성 역순으로 table/type을 제거한다.

BEGIN;

DO $$ BEGIN
  CREATE TYPE fact_scope AS ENUM ('CAMPGROUND', 'ZONE', 'PRODUCT', 'INVENTORY_UNIT');
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
  CREATE TYPE parking_mode AS ENUM ('SITE_ADJACENT', 'SHARED_NEARBY', 'DROP_OFF_EXTERNAL', 'CART_REQUIRED');
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
  CREATE TYPE permission_status AS ENUM ('ALLOWED', 'PROHIBITED', 'DESIGNATED_ONLY', 'UNKNOWN');
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
  CREATE TYPE observation_state AS ENUM (
    'LIVE_AVAILABLE',
    'OBSERVED_AVAILABLE',
    'OBSERVED_UNAVAILABLE',
    'OFFICIAL_APPLICATION_OPEN',
    'UNKNOWN',
    'OBSERVATION_FAILED'
  );
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

-- 1. 구역/사이트 단위 조건 사실 (주차, 전력, 바닥, 사이트 크기, 화기, 쉘터 설치 규정, 위생시설)
CREATE TABLE IF NOT EXISTS condition_fact (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  scope_type fact_scope NOT NULL,
  campground_id uuid NOT NULL REFERENCES campground(id) ON DELETE CASCADE,
  campground_zone_id uuid REFERENCES campground_zone(id) ON DELETE CASCADE,
  product_id uuid REFERENCES product(id) ON DELETE CASCADE,
  inventory_unit_id uuid REFERENCES inventory_unit(id) ON DELETE CASCADE,
  field_code text NOT NULL,
  value_json jsonb NOT NULL,
  verification_status verification_status NOT NULL DEFAULT 'PENDING_REVIEW',
  source_url text,
  source_published_at timestamptz,
  observed_at timestamptz NOT NULL DEFAULT now(),
  valid_from timestamptz,
  expires_at timestamptz,
  reviewer text,
  supersedes_fact_id uuid REFERENCES condition_fact(id),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS condition_fact_lookup_idx
  ON condition_fact (campground_id, scope_type, field_code, observed_at DESC);

-- 2. 대여 물품 및 요금 (텐트, 화로, 전기장판 등)
CREATE TABLE IF NOT EXISTS rental_offer (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  campground_id uuid NOT NULL REFERENCES campground(id) ON DELETE CASCADE,
  product_id uuid REFERENCES product(id) ON DELETE CASCADE,
  item_name text NOT NULL,
  price_krw integer CHECK (price_krw IS NULL OR price_krw >= 0),
  deposit_krw integer CHECK (deposit_krw IS NULL OR deposit_krw >= 0),
  requires_reservation boolean NOT NULL DEFAULT false,
  available_quantity integer CHECK (available_quantity IS NULL OR available_quantity >= 0),
  source_url text,
  observed_at timestamptz NOT NULL DEFAULT now(),
  valid_from timestamptz,
  expires_at timestamptz
);

CREATE INDEX IF NOT EXISTS rental_offer_camp_idx
  ON rental_offer (campground_id, observed_at DESC);

-- 3. 부대/체험/자연 시설 (수영장, 에어바운스, 썰매, 방방이, 동물먹이, 계곡, 산책로, 화장실/샤워실 상세)
CREATE TABLE IF NOT EXISTS facility_feature (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  campground_id uuid NOT NULL REFERENCES campground(id) ON DELETE CASCADE,
  feature_type text NOT NULL,
  feature_name text NOT NULL,
  scope_type fact_scope NOT NULL DEFAULT 'CAMPGROUND',
  quantity integer CHECK (quantity IS NULL OR quantity >= 0),
  is_operational boolean NOT NULL DEFAULT true,
  operating_season text,
  fee_krw integer CHECK (fee_krw IS NULL OR fee_krw >= 0),
  age_restrictions text,
  source_url text,
  observed_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS facility_feature_camp_idx
  ON facility_feature (campground_id, feature_type);

-- 4. 최근 빈자리 관측 배치 실행 이력 (감사 및 재현성)
CREATE TABLE IF NOT EXISTS availability_observation_run (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  connector_code text NOT NULL,
  started_at timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz,
  condition_hash text NOT NULL,
  status text NOT NULL CHECK (status IN ('RUNNING', 'SUCCEEDED', 'PARTIAL', 'FAILED')),
  observed_count integer CHECK (observed_count IS NULL OR observed_count >= 0),
  evidence jsonb NOT NULL DEFAULT '{}'::jsonb
);

-- 5. 최근 빈자리 관측 결과 (날짜·인원별 관측 이력)
CREATE TABLE IF NOT EXISTS availability_observation (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  run_id uuid NOT NULL REFERENCES availability_observation_run(id) ON DELETE CASCADE,
  campground_id uuid NOT NULL REFERENCES campground(id) ON DELETE CASCADE,
  product_id uuid REFERENCES product(id) ON DELETE CASCADE,
  target_date date NOT NULL,
  stay_nights integer NOT NULL DEFAULT 1 CHECK (stay_nights >= 1),
  adult_count integer NOT NULL DEFAULT 2 CHECK (adult_count >= 1),
  child_count integer NOT NULL DEFAULT 0 CHECK (child_count >= 0),
  vehicle_count integer NOT NULL DEFAULT 1 CHECK (vehicle_count >= 0),
  state observation_state NOT NULL,
  available_quantity integer CHECK (available_quantity IS NULL OR available_quantity >= 0),
  source_url text,
  observed_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS availability_observation_query_idx
  ON availability_observation (campground_id, target_date, stay_nights, observed_at DESC);

COMMIT;
