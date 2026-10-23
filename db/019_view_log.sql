-- 018_view_log.sql
-- 캠핑장 상세 조회를 공유 원장에 기록한다. 원문 UA/IP는 저장하지 않고 기존 찜 로그와 같은 최소 접속 메타만 보관한다.

BEGIN;

CREATE TABLE IF NOT EXISTS public.view_log (
  id BIGSERIAL PRIMARY KEY,
  campground_id TEXT NOT NULL,
  path TEXT,
  language TEXT,
  timezone TEXT,
  screen TEXT,
  platform TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_view_log_camp_created ON public.view_log (campground_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_view_log_created ON public.view_log (created_at DESC);

ALTER TABLE public.view_log ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Public insert view log" ON public.view_log;
CREATE POLICY "Public insert view log" ON public.view_log FOR INSERT WITH CHECK (true);
DROP POLICY IF EXISTS "Public read view log" ON public.view_log;
CREATE POLICY "Public read view log" ON public.view_log FOR SELECT USING (true);

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
    GRANT INSERT ON public.view_log TO anon;
    GRANT USAGE, SELECT ON SEQUENCE public.view_log_id_seq TO anon;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
    GRANT INSERT ON public.view_log TO authenticated;
    GRANT USAGE, SELECT ON SEQUENCE public.view_log_id_seq TO authenticated;
  END IF;
END $$;

CREATE OR REPLACE FUNCTION public.safe_view_log_feed(row_limit INTEGER DEFAULT 500)
RETURNS TABLE (
  created_at TIMESTAMPTZ,
  campground_id TEXT,
  path TEXT,
  language TEXT,
  timezone TEXT,
  screen TEXT,
  platform TEXT
)
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT v.created_at, v.campground_id, v.path, v.language, v.timezone, v.screen, v.platform
  FROM public.view_log AS v
  ORDER BY v.created_at DESC
  LIMIT LEAST(GREATEST(COALESCE(row_limit, 500), 1), 1000);
$$;

CREATE OR REPLACE FUNCTION public.safe_view_counts(row_limit INTEGER DEFAULT 3000)
RETURNS TABLE (campground_id TEXT, view_count BIGINT, last_view_at TIMESTAMPTZ)
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT v.campground_id, COUNT(*)::BIGINT, MAX(v.created_at)
  FROM public.view_log AS v
  GROUP BY v.campground_id
  ORDER BY COUNT(*) DESC, MAX(v.created_at) DESC
  LIMIT LEAST(GREATEST(COALESCE(row_limit, 3000), 1), 10000);
$$;

REVOKE ALL ON FUNCTION public.safe_view_log_feed(INTEGER) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.safe_view_counts(INTEGER) FROM PUBLIC;
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
    GRANT EXECUTE ON FUNCTION public.safe_view_log_feed(INTEGER) TO anon;
    GRANT EXECUTE ON FUNCTION public.safe_view_counts(INTEGER) TO anon;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
    GRANT EXECUTE ON FUNCTION public.safe_view_log_feed(INTEGER) TO authenticated;
    GRANT EXECUTE ON FUNCTION public.safe_view_counts(INTEGER) TO authenticated;
  END IF;
END $$;

COMMIT;
