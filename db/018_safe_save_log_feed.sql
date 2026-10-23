-- 017_safe_save_log_feed.sql
-- 공개 운영 화면에는 식별 가능한 브라우저 원문/IP를 보내지 않는다.
-- 이 파일은 Supabase SQL Editor 또는 마이그레이션 파이프라인으로 적용한다.

BEGIN;

CREATE OR REPLACE FUNCTION public.safe_save_log_feed(row_limit INTEGER DEFAULT 400)
RETURNS TABLE (
  created_at TIMESTAMPTZ,
  action TEXT,
  campground_id TEXT,
  language TEXT,
  timezone TEXT,
  screen TEXT,
  platform TEXT
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT
    l.created_at,
    l.action,
    l.campground_id,
    l.language,
    l.timezone,
    l.screen,
    l.platform
  FROM public.save_log AS l
  ORDER BY l.created_at DESC
  LIMIT LEAST(GREATEST(COALESCE(row_limit, 400), 1), 500);
$$;

-- 과거 로그의 ip/user_agent 컬럼은 운영 DB에만 보존한다. 공개 클라이언트는
-- 위 함수의 최소 필드만 읽을 수 있다.
DROP POLICY IF EXISTS "Public read save log" ON public.save_log;
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
    REVOKE SELECT ON public.save_log FROM anon;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
    REVOKE SELECT ON public.save_log FROM authenticated;
  END IF;
END $$;

REVOKE ALL ON FUNCTION public.safe_save_log_feed(INTEGER) FROM PUBLIC;
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
    GRANT EXECUTE ON FUNCTION public.safe_save_log_feed(INTEGER) TO anon;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
    GRANT EXECUTE ON FUNCTION public.safe_save_log_feed(INTEGER) TO authenticated;
  END IF;
END $$;

COMMIT;
