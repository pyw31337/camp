-- 016_shared_saves.sql
-- 지인 공용 찜. 한 목록을 모든 기기에서 같이 본다.
-- 로그는 누가 눌렀는지 나중에 볼 수 있게 남긴다.

BEGIN;

CREATE TABLE IF NOT EXISTS public.shared_save (
  campground_id TEXT PRIMARY KEY,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.save_log (
  id BIGSERIAL PRIMARY KEY,
  action TEXT NOT NULL,
  campground_id TEXT NOT NULL,
  user_agent TEXT,
  ip TEXT,
  language TEXT,
  timezone TEXT,
  screen TEXT,
  platform TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_save_log_created ON public.save_log (created_at DESC);

ALTER TABLE public.shared_save ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.save_log ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Public read shared saves" ON public.shared_save;
CREATE POLICY "Public read shared saves" ON public.shared_save FOR SELECT USING (true);
DROP POLICY IF EXISTS "Public write shared saves" ON public.shared_save;
CREATE POLICY "Public write shared saves" ON public.shared_save FOR INSERT WITH CHECK (true);
DROP POLICY IF EXISTS "Public delete shared saves" ON public.shared_save;
CREATE POLICY "Public delete shared saves" ON public.shared_save FOR DELETE USING (true);

DROP POLICY IF EXISTS "Public read save log" ON public.save_log;
CREATE POLICY "Public read save log" ON public.save_log FOR SELECT USING (true);
DROP POLICY IF EXISTS "Public insert save log" ON public.save_log;
CREATE POLICY "Public insert save log" ON public.save_log FOR INSERT WITH CHECK (true);

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
    GRANT SELECT, INSERT, DELETE ON public.shared_save TO anon;
    GRANT SELECT, INSERT ON public.save_log TO anon;
    GRANT USAGE, SELECT ON SEQUENCE public.save_log_id_seq TO anon;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
    GRANT SELECT, INSERT, DELETE ON public.shared_save TO authenticated;
    GRANT SELECT, INSERT ON public.save_log TO authenticated;
    GRANT USAGE, SELECT ON SEQUENCE public.save_log_id_seq TO authenticated;
  END IF;
END $$;

COMMIT;
