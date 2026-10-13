-- 데이터 간 연계와 수집 실행 기록.
-- 1) public_toilet: 원천(행안부/OSM)·등급·만료·최근 확인 시각을 남겨 화면이 출처를 함께 보여 준다.
-- 2) entity_link: 고캠핑 ↔ LOCALDATA 인허가 ↔ 예약처 ↔ 무료 레지스트리 ↔ OSM을 점수·근거와 함께 연결(자동 연결은 0.9 이상).
-- 3) ingest_run: 실행별 원천·건수·파일 해시·상태. 재적재·차이 비교·장애 추적용.
-- 비파괴 변경. 롤백(역순):
--   DROP TABLE IF EXISTS ingest_run;
--   DROP TABLE IF EXISTS entity_link;
--   ALTER TABLE campground_nearby_toilet DROP COLUMN IF EXISTS distance_method;
--   ALTER TABLE public_toilet DROP CONSTRAINT IF EXISTS public_toilet_osm_has_coords_check,
--     DROP CONSTRAINT IF EXISTS public_toilet_address_or_osm_check,
--     ADD CONSTRAINT public_toilet_address_check CHECK (road_address IS NOT NULL OR parcel_address IS NOT NULL);
--   ALTER TABLE public_toilet DROP COLUMN IF EXISTS source_code, DROP COLUMN IF EXISTS source_tier,
--     DROP COLUMN IF EXISTS source_url, DROP COLUMN IF EXISTS expires_at, DROP COLUMN IF EXISTS last_seen_at;

BEGIN;

ALTER TABLE public_toilet
  ADD COLUMN source_code text NOT NULL DEFAULT 'mois-localdata' CHECK (source_code IN ('mois-localdata', 'osm')),
  ADD COLUMN source_tier source_tier NOT NULL DEFAULT 'A',
  ADD COLUMN source_url text,
  ADD COLUMN expires_at timestamptz,
  ADD COLUMN last_seen_at timestamptz NOT NULL DEFAULT now();

-- 002의 “주소 필수” 검사는 행안부 원천에만 적용한다(OSM 화장실은 주소 없이 좌표만 있는 경우가 많다).
DO $$
DECLARE c record;
BEGIN
  FOR c IN SELECT conname FROM pg_constraint
    WHERE conrelid = 'public_toilet'::regclass AND contype = 'c'
      AND pg_get_constraintdef(oid) LIKE '%road_address IS NOT NULL%'
  LOOP
    EXECUTE format('ALTER TABLE public_toilet DROP CONSTRAINT %I', c.conname);
  END LOOP;
END $$;
ALTER TABLE public_toilet ADD CONSTRAINT public_toilet_address_or_osm_check
  CHECK (source_code = 'osm' OR road_address IS NOT NULL OR parcel_address IS NOT NULL);
ALTER TABLE public_toilet ADD CONSTRAINT public_toilet_osm_has_coords_check
  CHECK (source_code <> 'osm' OR latitude IS NOT NULL);

ALTER TABLE campground_nearby_toilet
  ADD COLUMN distance_method text NOT NULL DEFAULT 'HAVERSINE' CHECK (distance_method IN ('HAVERSINE', 'ROUTE'));

CREATE TABLE entity_link (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  campground_id uuid REFERENCES campground(id) ON DELETE CASCADE,    -- NULL = 아직 대응하는 시설 없음(후보)
  source_code text NOT NULL,                  -- 예: localdata-general-campground, localdata-auto-campground, free-registry, osm
  external_id text NOT NULL,
  external_name text,
  external_address text,
  latitude numeric(9, 6),
  longitude numeric(9, 6),
  match_score numeric(4, 3) NOT NULL CHECK (match_score BETWEEN 0 AND 1),
  match_evidence jsonb NOT NULL DEFAULT '{}'::jsonb,   -- {name:0.92, address:"same_road", distance_m:40, phone:true}
  state candidate_state NOT NULL DEFAULT 'NEW',
  observed_at timestamptz NOT NULL,
  reviewed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (source_code, external_id),
  CHECK (state <> 'MATCHED' OR campground_id IS NOT NULL)
);

CREATE INDEX entity_link_campground_idx ON entity_link (campground_id) WHERE campground_id IS NOT NULL;
CREATE INDEX entity_link_review_idx ON entity_link (state, match_score DESC) WHERE state IN ('NEW', 'NEEDS_REVIEW');

CREATE TABLE ingest_run (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  source_code text NOT NULL,
  started_at timestamptz NOT NULL,
  finished_at timestamptz,
  status text NOT NULL CHECK (status IN ('RUNNING', 'SUCCEEDED', 'PARTIAL', 'FAILED')),
  rows_read integer NOT NULL DEFAULT 0 CHECK (rows_read >= 0),
  rows_written integer NOT NULL DEFAULT 0 CHECK (rows_written >= 0),
  input_hash text,
  ci_run_url text,
  notes jsonb NOT NULL DEFAULT '{}'::jsonb,
  CHECK (finished_at IS NULL OR finished_at >= started_at)
);

CREATE INDEX ingest_run_source_idx ON ingest_run (source_code, started_at DESC);

COMMIT;
