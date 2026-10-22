-- 공중화장실 외의 이동·무료 캠핑 맥락 데이터를 저장한다.
-- 전제: db/001_initial_schema.sql ~ db/005_fact_lifecycle.sql
-- 롤백: campground_nearby_road_stop, free_camp_assessment,
-- road_stop_fuel_observation, road_stop, context_fact_state를 제거하고 source registry 행은
-- 다른 데이터가 없음을 확인한 뒤 수동으로 제거한다.

BEGIN;

CREATE TYPE context_fact_state AS ENUM ('YES', 'NO', 'CONDITIONAL', 'UNKNOWN');

-- 기존 후보에는 안정적인 외부 키가 없어서 재실행 시 중복될 수 있었다.
ALTER TABLE campground_candidate ADD COLUMN external_key text;
CREATE UNIQUE INDEX campground_candidate_external_key_idx
  ON campground_candidate (external_key) WHERE external_key IS NOT NULL;

CREATE TABLE road_stop (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  data_source_id uuid NOT NULL REFERENCES data_source(id),
  source_key text NOT NULL,
  stop_kind text NOT NULL CHECK (stop_kind IN ('SERVICE_AREA', 'DROWSY_SHELTER', 'REST_AREA')),
  name text NOT NULL,
  road_name text,
  direction_text text,
  address_text text,
  phone text,
  latitude numeric(9, 6) NOT NULL CHECK (latitude BETWEEN 32.9 AND 38.7),
  longitude numeric(9, 6) NOT NULL CHECK (longitude BETWEEN 124.5 AND 132),
  coordinate_method text NOT NULL DEFAULT 'SOURCE',
  coordinate_precision text,
  parking_spaces integer CHECK (parking_spaces IS NULL OR parking_spaces >= 0),
  facilities jsonb NOT NULL DEFAULT '{}'::jsonb,
  source_payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  source_data_date date,
  observed_at timestamptz NOT NULL DEFAULT now(),
  last_seen_at timestamptz NOT NULL DEFAULT now(),
  retired_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (data_source_id, source_key)
);

CREATE INDEX road_stop_location_idx ON road_stop (latitude, longitude) WHERE retired_at IS NULL;
CREATE INDEX road_stop_kind_idx ON road_stop (stop_kind, road_name) WHERE retired_at IS NULL;

-- 연료 가격은 실시간에 가까운 시계열이며 road_stop 행에 덮어쓰지 않는다.
CREATE TABLE road_stop_fuel_observation (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  road_stop_id uuid NOT NULL REFERENCES road_stop(id) ON DELETE CASCADE,
  source_url text NOT NULL,
  observed_at timestamptz NOT NULL,
  gasoline_krw_per_l integer CHECK (gasoline_krw_per_l IS NULL OR gasoline_krw_per_l >= 0),
  diesel_krw_per_l integer CHECK (diesel_krw_per_l IS NULL OR diesel_krw_per_l >= 0),
  lpg_krw_per_l integer CHECK (lpg_krw_per_l IS NULL OR lpg_krw_per_l >= 0),
  brand text,
  response_hash text NOT NULL,
  expires_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (road_stop_id, source_url, observed_at),
  CHECK (expires_at >= observed_at)
);

CREATE INDEX road_stop_fuel_current_idx ON road_stop_fuel_observation (road_stop_id, expires_at DESC);

-- 경로 자체나 사용자의 출발 좌표는 저장하지 않는다. 캠핑장 근방 정적 안내만 필요한 경우
-- 계산 방법과 시각을 남겨 연결한다. 실제 '가는 길'은 요청 시 경로 엔진으로 계산한다.
CREATE TABLE campground_nearby_road_stop (
  campground_id uuid NOT NULL REFERENCES campground(id) ON DELETE CASCADE,
  road_stop_id uuid NOT NULL REFERENCES road_stop(id) ON DELETE CASCADE,
  distance_m integer NOT NULL CHECK (distance_m >= 0),
  rank smallint NOT NULL CHECK (rank >= 1),
  measurement_method text NOT NULL CHECK (measurement_method IN ('STRAIGHT_LINE', 'ROUTE')),
  computed_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (campground_id, road_stop_id)
);

CREATE INDEX campground_nearby_road_stop_rank_idx ON campground_nearby_road_stop (campground_id, rank);

-- 무료·취사·화장실은 독립 주장이다. 세 값 중 하나라도 UNKNOWN/만료/PENDING이면
-- 이 행을 '무료 캠핑 확정'으로 공개할 수 없다.
CREATE TABLE free_camp_assessment (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  assessment_key text NOT NULL UNIQUE,
  campground_id uuid REFERENCES campground(id) ON DELETE CASCADE,
  candidate_id uuid REFERENCES campground_candidate(id) ON DELETE CASCADE,
  data_source_id uuid NOT NULL REFERENCES data_source(id),
  fee_state context_fact_state NOT NULL DEFAULT 'UNKNOWN',
  cooking_state context_fact_state NOT NULL DEFAULT 'UNKNOWN',
  toilet_state context_fact_state NOT NULL DEFAULT 'UNKNOWN',
  free_from date,
  free_until date,
  source_url text NOT NULL,
  evidence jsonb NOT NULL DEFAULT '[]'::jsonb,
  source_tier source_tier NOT NULL,
  verification_status verification_status NOT NULL DEFAULT 'PENDING_REVIEW',
  observed_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz,
  reviewed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK (((campground_id IS NOT NULL)::integer + (candidate_id IS NOT NULL)::integer) = 1),
  CHECK (free_until IS NULL OR free_from IS NULL OR free_until >= free_from),
  CHECK (expires_at IS NULL OR expires_at >= observed_at)
);

CREATE INDEX free_camp_assessment_current_idx
  ON free_camp_assessment (verification_status, expires_at, free_from, free_until);

-- 수집기는 원천 코드로만 참조한다. 보관/재배포 허용 여부는 운영자가 실제 약관을
-- 검토할 때 source_usage_policy와 함께 확정한다.
INSERT INTO data_source (
  code, name, owner_name, base_url, source_tier, terms_url, license_summary,
  allows_persistent_storage, default_cache_seconds
) VALUES
  ('mois-public-restroom', '행정안전부 공중화장실정보', '행정안전부·지방자치단체',
   'https://file.localdata.go.kr/file/public_restroom_info/info', 'A',
   'https://www.data.go.kr/data/15075531/standard.do',
   '공중화장실정보. 2025-02부터 원천 WGS84 좌표 제공 중단; 주소 지오코딩 좌표는 별도 출처·정밀도로 보관.', false, 86400),
  ('openstreetmap', 'OpenStreetMap', 'OpenStreetMap contributors',
   'https://www.openstreetmap.org/', 'B', 'https://www.openstreetmap.org/copyright',
   'ODbL 1.0. 화면·내보내기에 © OpenStreetMap contributors 및 라이선스 링크를 표시하고 파생 DB 공개 의무를 별도 검토.', true, 604800),
  ('drowsy-shelter', '전국졸음쉼터표준데이터', '한국도로공사',
   'https://www.data.go.kr/', 'A', 'https://www.data.go.kr/',
   '공공데이터포털 이용조건과 개별 데이터셋 이용허락범위를 운영 전 재확인.', false, 604800),
  ('korea-expressway', '한국도로공사 고속도로 공공데이터', '한국도로공사',
   'https://data.ex.co.kr/', 'A', 'https://data.ex.co.kr/',
   '휴게소·편의시설·주유 가격. 계약·호출 한도·재배포 범위를 운영 전 확인.', false, 86400),
  ('public-facility-opening', '전국공공시설개방정보표준데이터', '행정안전부·지방자치단체',
   'https://www.data.go.kr/data/15013117/standard.do', 'A',
   'https://www.data.go.kr/data/15013117/standard.do',
   '분기 갱신 및 월초 전국 병합 시차가 있어 무료 후보 발견용으로만 사용. 공식 운영기관 근거 전에는 확정 무료·취사로 표시하지 않음.', false, 7776000),
  ('booking-rule-registry', '렛츠 캠핑 예약 규칙 레지스트리', '렛츠 캠핑',
   'https://github.com/pyw31337/camp/tree/main/pipeline/registry', 'B',
   'https://github.com/pyw31337/camp/tree/main/pipeline/registry',
   '사람이 공식 원문을 검토해 등록한 계산 규칙. 원문 URL·등급·확인일을 각 버전에 보존.', true, 86400),
  ('free-site-registry', '렛츠 캠핑 무료 캠프 후보 레지스트리', '렛츠 캠핑',
   'https://github.com/pyw31337/camp/tree/main/pipeline/registry', 'B',
   'https://github.com/pyw31337/camp/tree/main/pipeline/registry',
   '무료·취사·화장실의 각 근거를 보관하는 내부 검토 레지스트리. 후보와 확정 사실을 구분하며 원문 검토 전 공개 확정값으로 사용하지 않는다.', true, 86400)
ON CONFLICT (code) DO UPDATE SET
  name = EXCLUDED.name,
  owner_name = EXCLUDED.owner_name,
  base_url = EXCLUDED.base_url,
  source_tier = EXCLUDED.source_tier,
  terms_url = EXCLUDED.terms_url,
  license_summary = EXCLUDED.license_summary,
  default_cache_seconds = EXCLUDED.default_cache_seconds,
  updated_at = now();

INSERT INTO source_usage_policy (
  data_source_id, attribution_required, attribution_text, must_link_to_terms, policy_state, reviewer_note
)
SELECT id,
  code = 'openstreetmap',
  CASE WHEN code = 'openstreetmap' THEN '© OpenStreetMap contributors · ODbL 1.0' ELSE NULL END,
  code = 'openstreetmap',
  CASE WHEN code = 'openstreetmap' THEN 'VERIFIED'::verification_status ELSE 'PENDING_REVIEW'::verification_status END,
  CASE WHEN code = 'openstreetmap' THEN 'ODbL attribution and share-alike obligations recorded.' ELSE 'Persistent storage/republication terms require source-specific operational review.' END
FROM data_source
WHERE code IN ('mois-public-restroom', 'openstreetmap', 'drowsy-shelter', 'korea-expressway', 'public-facility-opening', 'booking-rule-registry', 'free-site-registry')
ON CONFLICT (data_source_id) DO NOTHING;

COMMIT;
