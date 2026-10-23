-- 022_delete_agent_save_log_rows.sql
-- 2026-10-23 소유자 요청: “리눅스 같은 헤드리스 브라우저를 통해 에이전트가 남겼던 로그는 모두 제거”.
-- 대상: 운영 찜 기록(public.save_log) 중 platform 'Linux x86_64' 이고 화면이 자동 테스트 뷰포트(1366x900·390x844)인 행
--       (2026-10-23 조회 141건, id 1~209 사이 — HeadlessChrome 또는 CI 테스트. 사람 기기 iPhone·Mac 기록은 남김).
-- 사본: pipeline/registry/archive/save_log-agent-rows-2026-10-23.json(ip 제외) · 기록: merge-overrides.json, merge-review.ndjson.
-- 공용 찜(shared_save)은 건드리지 않는다. 다시 실행해도 안전(조건에 맞는 행만).
-- 적용: Supabase 대시보드 → SQL Editor에 이 파일 내용을 붙여 넣고 Run (저장소 db:migrate는 CI 임시 DB에만 적용됨).
BEGIN;
DO $$
BEGIN
  IF to_regclass('public.save_log') IS NOT NULL THEN
    DELETE FROM public.save_log
    WHERE platform = 'Linux x86_64'
      AND screen IN ('1366x900', '390x844')
      AND id <= 209;
  END IF;
END $$;
COMMIT;
