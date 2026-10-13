-- 전국 공중화장실과 캠핑장 주변 화장실 연계.
-- 원천: 행정안전부 공중화장실정보(data.go.kr 15075531, 일 단위 갱신). 2025-02부터 원천 좌표가 빠져
-- 좌표는 주소 지오코딩 값이며 geocode_* 열에 방법·정밀도를 남긴다.
-- 비파괴 변경(새 테이블만 추가). 롤백: 아래 DROP 두 줄을 역순으로 실행한다.
--   DROP TABLE IF EXISTS campground_nearby_toilet;
--   DROP TABLE IF EXISTS public_toilet;

BEGIN;

CREATE TABLE public_toilet (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  data_source_id uuid REFERENCES data_source(id),
  source_key text NOT NULL UNIQUE,            -- 이름+주소 해시(pipeline/lib/toilets.mjs)
  name text NOT NULL,
  kind text,
  owner_kind text,
  road_address text,
  parcel_address text,
  open_hours text,
  open_24h boolean,
  disabled_stalls integer CHECK (disabled_stalls IS NULL OR disabled_stalls >= 0),
  child_stalls integer CHECK (child_stalls IS NULL OR child_stalls >= 0),
  has_emergency_bell boolean,
  has_cctv boolean,
  has_diaper_table boolean,
  manager_name text,
  manager_phone text,
  latitude numeric(9, 6),
  longitude numeric(9, 6),
  geocode_method text,                        -- 예: KAKAO_ADDRESS
  geocode_precision text,                     -- ROAD | PARCEL
  geocoded_at timestamptz,
  source_data_date date,
  observed_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK (road_address IS NOT NULL OR parcel_address IS NOT NULL),
  CHECK ((latitude IS NULL AND longitude IS NULL) OR
         (latitude BETWEEN 32.9 AND 38.7 AND longitude BETWEEN 124.5 AND 132))
);

CREATE INDEX public_toilet_location_idx ON public_toilet (latitude, longitude)
  WHERE latitude IS NOT NULL AND longitude IS NOT NULL;

-- 캠핑장별 가까운 화장실(반경 2km, 거리순 상위 N). 매 동기화 때 다시 계산해 교체한다.
CREATE TABLE campground_nearby_toilet (
  campground_id uuid NOT NULL REFERENCES campground(id) ON DELETE CASCADE,
  public_toilet_id uuid NOT NULL REFERENCES public_toilet(id) ON DELETE CASCADE,
  distance_m integer NOT NULL CHECK (distance_m >= 0),   -- 직선거리(지오코딩 기준)
  rank smallint NOT NULL CHECK (rank >= 1),
  computed_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (campground_id, public_toilet_id)
);

CREATE INDEX campground_nearby_toilet_rank_idx ON campground_nearby_toilet (campground_id, rank);

COMMIT;
