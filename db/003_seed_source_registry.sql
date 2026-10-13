-- 초기 수집 대상의 원천·예약 제공자 레지스트리.
-- PostgreSQL 16+, db/001_initial_schema.sql 적용 뒤 실행한다.
-- 이 마이그레이션은 예약 재고·가격을 적재하지 않으며, 공개 API/약관/계약 검토 상태를 명시한다.

BEGIN;

INSERT INTO data_source (
  code, name, owner_name, base_url, source_tier, terms_url,
  license_summary, allows_persistent_storage, default_cache_seconds
) VALUES
  ('gocamping', '고캠핑 정보 조회 API', '한국관광공사', 'https://apis.data.go.kr/B551011/GoCamping', 'A',
    'https://www.data.go.kr/data/15101933/openapi.do', '공공데이터포털 활용 신청·이용조건 및 영구 보존/재배포 범위 별도 검토', false, 86400),
  ('foresttrip', '숲나들e 예약안내', '산림청', 'https://www.foresttrip.go.kr/', 'B',
    'https://www.foresttrip.go.kr/', '공식 안내·예약 화면은 외부 이동 중심으로 제공하며 자동 재고 수집은 별도 허가 필요', false, 3600),
  ('knps-reservation', '국립공원공단 예약시스템', '국립공원공단', 'https://reservation.knps.or.kr/', 'B',
    'https://reservation.knps.or.kr/', '공식 예약 화면은 외부 이동 중심으로 제공하며 자동 재고 수집은 별도 허가 필요', false, 3600),
  ('seoul-yeyak', '서울시 공공서비스예약', '서울특별시', 'https://yeyak.seoul.go.kr/', 'A',
    'https://data.seoul.go.kr/', '서울 열린데이터광장 API 사용조건·키 발급 범위에 따라 적재', false, 3600),
  ('gpfmc', '가평군시설관리공단 자라섬캠핑장', '가평군시설관리공단', 'https://www.gpfmc.or.kr/', 'B',
    'https://www.gpfmc.or.kr/', '운영기관 시설 안내·공지 원문 링크. 사진은 외부 원문 표시만 허용된 범위로 사용', false, 86400)
ON CONFLICT (code) DO UPDATE SET
  name = EXCLUDED.name,
  owner_name = EXCLUDED.owner_name,
  base_url = EXCLUDED.base_url,
  source_tier = EXCLUDED.source_tier,
  terms_url = EXCLUDED.terms_url,
  license_summary = EXCLUDED.license_summary,
  allows_persistent_storage = EXCLUDED.allows_persistent_storage,
  default_cache_seconds = EXCLUDED.default_cache_seconds,
  updated_at = now();

INSERT INTO reservation_provider (
  data_source_id, code, name, provider_type, integration_mode,
  booking_capabilities, contract_status, freshness_sla_seconds
)
SELECT source.id, provider.code, provider.name, provider.provider_type, provider.integration_mode,
  provider.booking_capabilities::jsonb, 'NOT_STARTED', provider.freshness_sla_seconds
FROM (VALUES
  ('foresttrip', 'foresttrip', '숲나들e', 'PUBLIC_PORTAL', 'OFFICIAL_REDIRECT', '{"policy":true,"opening_schedule":true,"live_inventory":false,"booking":false}', 3600),
  ('knps-reservation', 'knps', '국립공원공단 예약시스템', 'PUBLIC_PORTAL', 'OFFICIAL_REDIRECT', '{"policy":true,"lottery":true,"live_inventory":false,"booking":false}', 3600),
  ('seoul-yeyak', 'seoul-yeyak', '서울시 공공서비스예약', 'PUBLIC_PORTAL', 'PUBLIC_READ_API', '{"policy":true,"opening_schedule":true,"live_inventory":false,"booking":false}', 3600),
  ('gpfmc', 'gpfmc-jarasum', '자라섬캠핑장 공식 예약안내', 'LOCAL_GOVERNMENT', 'OFFICIAL_REDIRECT', '{"policy":true,"opening_schedule":true,"live_inventory":false,"booking":false}', 3600)
) AS provider(source_code, code, name, provider_type, integration_mode, booking_capabilities, freshness_sla_seconds)
JOIN data_source AS source ON source.code = provider.source_code
ON CONFLICT (code) DO UPDATE SET
  data_source_id = EXCLUDED.data_source_id,
  name = EXCLUDED.name,
  provider_type = EXCLUDED.provider_type,
  integration_mode = EXCLUDED.integration_mode,
  booking_capabilities = EXCLUDED.booking_capabilities,
  freshness_sla_seconds = EXCLUDED.freshness_sla_seconds,
  updated_at = now();

COMMIT;
