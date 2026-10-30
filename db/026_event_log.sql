-- 026_event_log.sql
-- 익명 사용 지표(소유자 2026-10-31: 방문·검색·상세·예약 클릭을 알아야 방향을 정한다).
-- 개인정보 없음: 탭마다 만든 무작위 세션 id(sid)만 두고, UA·IP는 저장하지 않는다. 쓰기만 공개, 읽기는 운영(서비스 키·DB)만.

BEGIN;

CREATE TABLE IF NOT EXISTS public.event_log (
  id BIGSERIAL PRIMARY KEY,
  event TEXT NOT NULL CHECK (event IN ('visit', 'search', 'search_zero', 'detail', 'booking_click', 'call_click', 'save', 'today_swipe')),
  sid TEXT,
  campground_id TEXT,
  q TEXT,
  path TEXT,
  screen TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT event_log_q_len CHECK (q IS NULL OR char_length(q) <= 60),
  CONSTRAINT event_log_sid_len CHECK (sid IS NULL OR char_length(sid) <= 32)
);

CREATE INDEX IF NOT EXISTS idx_event_log_created ON public.event_log (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_event_log_event_created ON public.event_log (event, created_at DESC);

ALTER TABLE public.event_log ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Public insert event log" ON public.event_log;
CREATE POLICY "Public insert event log" ON public.event_log FOR INSERT WITH CHECK (true);

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
    GRANT INSERT ON public.event_log TO anon;
    GRANT USAGE, SELECT ON SEQUENCE public.event_log_id_seq TO anon;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
    GRANT INSERT ON public.event_log TO authenticated;
    GRANT USAGE, SELECT ON SEQUENCE public.event_log_id_seq TO authenticated;
  END IF;
END $$;

COMMIT;
