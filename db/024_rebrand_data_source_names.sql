-- 024_rebrand_data_source_names.sql
-- 2026-10-24: 서비스 이름 변경(모여라 캠핑 → 렛츠 캠핑, #302)을 데이터 출처 이름에 반영한다.
-- #302가 이미 적용된 006_travel_context.sql을 직접 고쳐 운영 DB 마이그레이션이 체크섬 불일치로 멈췄다
-- (data-sync run 40026519178). 006은 원래 내용으로 되돌리고, 이름 변경은 이 새 마이그레이션으로 한다.
-- 다시 실행해도 안전(같은 값으로 갱신).
BEGIN;

UPDATE data_source
   SET name = '렛츠 캠핑 예약 규칙 레지스트리', owner_name = '렛츠 캠핑'
 WHERE code = 'booking-rule-registry';

UPDATE data_source
   SET name = '렛츠 캠핑 무료 캠프 후보 레지스트리', owner_name = '렛츠 캠핑'
 WHERE code = 'free-site-registry';

COMMIT;
