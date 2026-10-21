-- 016_delete_test_save_log_rows.sql
-- 2026-10-21 자동 테스트(Playwright, 상자·CI)가 운영 찜 기록(public.save_log)에 남긴 찜/해제 67건(id 90~156) 삭제.
-- 근거: 2026-10-21 04:10:56~04:47:45 UTC(13:10~13:47 KST) 테스트 실행 시간대, 모두 platform 'Linux x86_64' · 화면 1366x900/390x844(테스트 뷰포트).
-- 소유자 승인(2026-10-21), DATA_MERGE_POLICY 의도한 삭제: pipeline/registry/merge-overrides.json · merge-review.ndjson 기록,
-- 삭제 전 행 사본: pipeline/registry/archive/save_log-test-rows-2026-10-21.json (되돌리기: 사본 행을 다시 INSERT).
-- 표가 없는 DB(검증용 임시 DB)에서는 아무것도 하지 않는다. 조건이 모두 맞는 행만 지운다(다시 실행해도 안전).
BEGIN;
DO $$
BEGIN
  IF to_regclass('public.save_log') IS NOT NULL THEN
    DELETE FROM public.save_log
    WHERE id BETWEEN 90 AND 156
      AND platform = 'Linux x86_64'
      AND screen IN ('1366x900', '390x844')
      AND created_at >= '2026-10-21T04:10:56Z' AND created_at <= '2026-10-21T04:47:45Z';
  END IF;
END $$;
COMMIT;
