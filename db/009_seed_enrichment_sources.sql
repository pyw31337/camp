-- 부가 원천(화장실·휴게소·졸음쉼터·유가·OSM·무료 레지스트리·예약 규칙 레지스트리) 등록.
-- allows_persistent_storage는 이용허락범위를 원문으로 확인하기 전까지 false로 둔다(OSM은 ODbL로 저장 허용, 출처 표시·동일조건 의무).
-- 운영 DB 적재기(pipeline/scripts/import-enrichment-postgres.mjs)는 false인 원천을 운영 DB에 쓰지 않는다.
-- 확인되면 db/004처럼 별도 마이그레이션으로 true로 바꾸고 근거 URL을 license_summary에 남긴다.
-- 롤백: DELETE FROM data_source WHERE code IN ('mois-localdata-restroom','ex-openapi','drowsy-shelter-standard','osm','moyeora-free-registry','moyeora-booking-registry');

BEGIN;

INSERT INTO data_source (
  code, name, owner_name, base_url, source_tier, terms_url,
  license_summary, allows_persistent_storage, default_cache_seconds
) VALUES
  ('mois-localdata-restroom', '공중화장실정보(LOCALDATA 파일)', '행정안전부',
    'https://file.localdata.go.kr/file/public_restroom_info/info', 'A',
    'https://www.data.go.kr/data/15012892/standard.do',
    '전국 공중화장실 파일(일 단위 갱신). 좌표는 주소 지오코딩(카카오) 값. 이용허락범위 원문 확인 필요', false, 86400),
  ('ex-openapi', '고속도로 공공데이터 포털 OpenAPI', '한국도로공사',
    'https://data.ex.co.kr/openapi/', 'A',
    'https://data.ex.co.kr/openapi/basicinfo/openApiInfoM?apiId=0312',
    '휴게소 좌표·편의시설·주유소 유가. 이용약관 원문 확인 필요', false, 86400),
  ('drowsy-shelter-standard', '전국졸음쉼터표준데이터', '한국도로공사 등',
    'https://api.data.go.kr/openapi/tn_pubr_public_drowsy_shelter_api', 'A',
    'https://www.data.go.kr/data/15028203/standard.do',
    '표준데이터 API. 이용허락범위 원문 확인 필요', false, 604800),
  ('osm', 'OpenStreetMap', 'OpenStreetMap contributors',
    'https://www.openstreetmap.org/', 'B',
    'https://www.openstreetmap.org/copyright',
    'ODbL 1.0: 저장·가공 허용, 출처 표시 의무, 공개 파생 DB는 동일조건 공개 의무(OSM 행은 source_code로 분리 유지)', true, 604800),
  ('moyeora-free-registry', '모여라 캠핑 무료 캠프 사이트 레지스트리', '모여라 캠핑',
    'https://github.com/pyw31337/camp/blob/main/pipeline/registry/free-sites.json', 'C',
    'https://github.com/pyw31337/camp',
    '조건별 근거 URL을 가진 사람 검수 레지스트리. 각 사실의 등급은 개별 근거의 등급을 따른다', true, 86400),
  ('moyeora-booking-registry', '모여라 캠핑 예약 규칙 레지스트리', '모여라 캠핑',
    'https://github.com/pyw31337/camp/blob/main/pipeline/registry/booking-rules.json', 'C',
    'https://github.com/pyw31337/camp',
    '규칙별 원문 URL·확인일·등급을 가진 사람 검수 레지스트리', true, 86400)
ON CONFLICT (code) DO UPDATE SET
  name = EXCLUDED.name,
  owner_name = EXCLUDED.owner_name,
  base_url = EXCLUDED.base_url,
  terms_url = EXCLUDED.terms_url,
  license_summary = EXCLUDED.license_summary,
  default_cache_seconds = EXCLUDED.default_cache_seconds,
  updated_at = now();
-- source_tier·allows_persistent_storage는 갱신하지 않는다(확인 마이그레이션이 바꾼 값을 덮어쓰지 않도록).

COMMIT;
