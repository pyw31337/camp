-- 가는 길의 휴게소·졸음쉼터·쉼터와 시설별 유·무료, 휴게소 주유소 유가(시계열).
-- 원천: 한국도로공사 OpenAPI(data.ex.co.kr, A), 전국졸음쉼터표준데이터(A), OpenStreetMap(B, ODbL).
-- 비파괴 변경(새 타입·테이블만 추가). 롤백(역순):
--   DROP TABLE IF EXISTS fuel_price_observation;
--   DROP TABLE IF EXISTS rest_stop_facility;
--   DROP TABLE IF EXISTS rest_stop;
--   DROP TYPE IF EXISTS fee_kind; DROP TYPE IF EXISTS rest_stop_kind;

BEGIN;

CREATE TYPE rest_stop_kind AS ENUM ('SERVICE_AREA', 'DROWSY_SHELTER', 'REST_AREA');
CREATE TYPE fee_kind AS ENUM ('FREE', 'PAID', 'VARIES', 'UNKNOWN');

CREATE TABLE rest_stop (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  data_source_id uuid NOT NULL REFERENCES data_source(id),
  external_id text NOT NULL,                  -- 예: ex-A00001, drowsy-…, osm-way-…
  kind rest_stop_kind NOT NULL,
  name text NOT NULL,
  road_name text,
  direction text,                             -- 원천 표기(예: 부산, 서울방향)
  address text,
  phone text,
  brands text,
  truck_rest boolean,
  maintenance boolean,
  parking_spaces integer CHECK (parking_spaces IS NULL OR parking_spaces >= 0),
  latitude numeric(9, 6) NOT NULL,
  longitude numeric(9, 6) NOT NULL,
  source_url text NOT NULL CHECK (source_url ~ '^https?://'),
  source_tier source_tier NOT NULL,
  attribution text,
  observed_at timestamptz NOT NULL,
  expires_at timestamptz NOT NULL,
  last_seen_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK (expires_at > observed_at),
  CHECK (latitude BETWEEN 32.9 AND 38.7 AND longitude BETWEEN 124.5 AND 132),
  UNIQUE (data_source_id, external_id)
);

CREATE INDEX rest_stop_location_idx ON rest_stop (latitude, longitude);

-- fee_basis: SOURCE(원천에 유·무료 표기) | DEFAULT_RULE(시설 종류의 일반 규칙, 화면에 “일반적으로” 표시)
CREATE TABLE rest_stop_facility (
  rest_stop_id uuid NOT NULL REFERENCES rest_stop(id) ON DELETE CASCADE,
  facility text NOT NULL CHECK (facility IN (
    'toilet', 'nursing', 'water', 'wifi', 'parking', 'fuel', 'ev_charging', 'food',
    'convenience', 'pharmacy', 'laundry', 'shower', 'sleep'
  )),
  available boolean,                          -- NULL = 원천에 정보 없음
  fee fee_kind NOT NULL DEFAULT 'UNKNOWN',
  fee_basis text NOT NULL DEFAULT 'DEFAULT_RULE' CHECK (fee_basis IN ('SOURCE', 'DEFAULT_RULE')),
  observed_at timestamptz NOT NULL,
  expires_at timestamptz NOT NULL,
  PRIMARY KEY (rest_stop_id, facility),
  CHECK (expires_at > observed_at)
);

-- 유가는 덮어쓰지 않고 관측마다 쌓는다. 24시간이 지나면 화면에서 가격을 숨긴다.
CREATE TABLE fuel_price_observation (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  rest_stop_id uuid NOT NULL REFERENCES rest_stop(id) ON DELETE CASCADE,
  station_name text NOT NULL,
  brand text,
  gasoline_krw integer CHECK (gasoline_krw IS NULL OR gasoline_krw BETWEEN 500 AND 5000),
  diesel_krw integer CHECK (diesel_krw IS NULL OR diesel_krw BETWEEN 500 AND 5000),
  lpg_krw integer CHECK (lpg_krw IS NULL OR lpg_krw BETWEEN 300 AND 3000),
  source_url text NOT NULL CHECK (source_url ~ '^https?://'),
  source_tier source_tier NOT NULL DEFAULT 'A',
  observed_at timestamptz NOT NULL,
  expires_at timestamptz NOT NULL,
  CHECK (expires_at > observed_at),
  UNIQUE (rest_stop_id, observed_at)
);

CREATE INDEX fuel_price_latest_idx ON fuel_price_observation (rest_stop_id, observed_at DESC);

COMMIT;
