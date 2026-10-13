-- GoCamping 기준 시설 카탈로그의 공개 보존 근거를 기록한다.
-- 적용 전제: db/001_initial_schema.sql, db/003_seed_source_registry.sql
-- 적용일: 2026-10-13 KST
-- 근거: https://www.data.go.kr/data/15101933/openapi.do
-- 공공데이터포털 표기 이용허락범위: 제한 없음
--
-- 롤백: 아래 UPDATE의 allows_persistent_storage를 false로 되돌리고,
--       public API/정적 카탈로그에서 해당 source를 제외한다. 원천 보관 이력은 삭제하지 않는다.

BEGIN;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM data_source WHERE code = 'gocamping') THEN
    RAISE EXCEPTION 'data_source gocamping is missing; apply db/003_seed_source_registry.sql first';
  END IF;
END $$;

UPDATE data_source
SET
  allows_persistent_storage = true,
  license_summary = '공공데이터포털 15101933(고캠핑) 이용허락범위 제한 없음; 2026-10-13 KST 원문 확인. 사진·실시간 재고·가격은 이 원천의 영구 공개 범위에 포함하지 않으며 각 공식 원천과 별도 검증한다.',
  updated_at = now()
WHERE code = 'gocamping';

COMMIT;
