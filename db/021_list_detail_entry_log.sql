-- 020_list_detail_entry_log.sql
-- 목록 카드에서 상세로 들어온 행동만 인기 진입 집계에 사용한다.
-- 기존 018 행은 직접 접근/자동 테스트 여부를 판별할 수 없으므로 legacy로 격리한다.
-- 016의 테스트 정리 기준과 동일한 Linux x86_64 + Playwright 화면 조합만 보관 후 제거한다.

BEGIN;

ALTER TABLE public.view_log
  ADD COLUMN IF NOT EXISTS entry_source TEXT NOT NULL DEFAULT 'legacy';

CREATE INDEX IF NOT EXISTS idx_view_log_entry_camp_created
  ON public.view_log (entry_source, campground_id, created_at DESC);

CREATE TABLE IF NOT EXISTS public.view_log_test_archive (LIKE public.view_log INCLUDING ALL);

INSERT INTO public.view_log_test_archive
SELECT v.*
FROM public.view_log AS v
WHERE lower(coalesce(v.platform, '')) = 'linux x86_64'
  AND v.screen IN ('1366x900', '390x844')
ON CONFLICT (id) DO NOTHING;

DELETE FROM public.view_log AS v
WHERE lower(coalesce(v.platform, '')) = 'linux x86_64'
  AND v.screen IN ('1366x900', '390x844');

ALTER TABLE public.view_log ENABLE ROW LEVEL SECURITY;

DROP FUNCTION IF EXISTS public.safe_view_log_feed(INTEGER);
CREATE FUNCTION public.safe_view_log_feed(row_limit INTEGER DEFAULT 500)
RETURNS TABLE (
  created_at TIMESTAMPTZ,
  campground_id TEXT,
  entry_source TEXT,
  path TEXT,
  language TEXT,
  timezone TEXT,
  screen TEXT,
  platform TEXT
)
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT v.created_at, v.campground_id, v.entry_source, v.path, v.language, v.timezone, v.screen, v.platform
  FROM public.view_log AS v
  WHERE v.entry_source = 'list'
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
  WHERE v.entry_source = 'list'
  GROUP BY v.campground_id
  ORDER BY COUNT(*) DESC, MAX(v.created_at) DESC
  LIMIT LEAST(GREATEST(COALESCE(row_limit, 3000), 1), 10000);
$$;

-- 이름을 분리해 018만 적용된 환경의 오래된 전체 조회 집계를 실수로 노출하지 않는다.
CREATE OR REPLACE FUNCTION public.safe_list_detail_counts(row_limit INTEGER DEFAULT 3000)
RETURNS TABLE (campground_id TEXT, view_count BIGINT, last_view_at TIMESTAMPTZ)
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT v.campground_id, COUNT(*)::BIGINT, MAX(v.created_at)
  FROM public.view_log AS v
  WHERE v.entry_source = 'list'
  GROUP BY v.campground_id
  ORDER BY COUNT(*) DESC, MAX(v.created_at) DESC
  LIMIT LEAST(GREATEST(COALESCE(row_limit, 3000), 1), 10000);
$$;

REVOKE ALL ON FUNCTION public.safe_view_log_feed(INTEGER) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.safe_view_counts(INTEGER) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.safe_list_detail_counts(INTEGER) FROM PUBLIC;
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
    GRANT EXECUTE ON FUNCTION public.safe_view_log_feed(INTEGER) TO anon;
    GRANT EXECUTE ON FUNCTION public.safe_view_counts(INTEGER) TO anon;
    GRANT EXECUTE ON FUNCTION public.safe_list_detail_counts(INTEGER) TO anon;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
    GRANT EXECUTE ON FUNCTION public.safe_view_log_feed(INTEGER) TO authenticated;
    GRANT EXECUTE ON FUNCTION public.safe_view_counts(INTEGER) TO authenticated;
    GRANT EXECUTE ON FUNCTION public.safe_list_detail_counts(INTEGER) TO authenticated;
  END IF;
END $$;

COMMIT;
