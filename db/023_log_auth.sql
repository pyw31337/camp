-- 023_log_auth.sql
-- 2026-10-23 소유자 요청: “로그 페이지(/log/)에 들어갈 때 비밀번호(처음 0602)를 입력하고, 로그 페이지에서 비밀번호를 재설정”.
-- 비밀번호는 bcrypt 해시(pgcrypto)로만 저장하고, 표는 공개 키(anon)로 읽을 수 없다. 화면은 아래 두 함수만 부른다.
--   log_auth_check(pw)         → 맞으면 true. 10번 연속 틀리면 10분 잠금(4자리 숫자 무차별 대입 방지).
--   log_auth_set(old_pw, new_pw) → 지금 비밀번호가 맞을 때만 새 비밀번호(4~64자)로 바꾼다.
-- 적용: Supabase 대시보드 → SQL Editor에 이 파일 내용을 붙여 넣고 Run (저장소 db:migrate는 CI 임시 DB에만 적용됨).
-- 다시 실행해도 안전: 이미 비밀번호가 있으면 0602로 되돌리지 않는다.
BEGIN;

CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS public.log_auth (
  id SMALLINT PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  pw_hash TEXT NOT NULL,
  failed SMALLINT NOT NULL DEFAULT 0,
  locked_until TIMESTAMPTZ,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.log_auth ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.log_auth FROM PUBLIC;
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN REVOKE ALL ON public.log_auth FROM anon; END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN REVOKE ALL ON public.log_auth FROM authenticated; END IF;
END $$;

-- pgcrypto는 일반 Postgres에선 public, Supabase에선 extensions 스키마에 있다. 둘 다 찾도록 search_path에 넣는다.
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_namespace WHERE nspname = 'extensions') THEN CREATE SCHEMA extensions; END IF;
END $$;

CREATE OR REPLACE FUNCTION public.log_auth_check(pw TEXT)
RETURNS BOOLEAN
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = public, extensions, pg_temp
AS $$
DECLARE
  r public.log_auth%ROWTYPE;
  ok BOOLEAN;
BEGIN
  SELECT * INTO r FROM public.log_auth WHERE id = 1 FOR UPDATE;
  IF NOT FOUND OR pw IS NULL THEN RETURN false; END IF;
  IF r.locked_until IS NOT NULL AND r.locked_until > now() THEN RETURN false; END IF;
  ok := crypt(pw, r.pw_hash) = r.pw_hash;
  IF ok THEN
    UPDATE public.log_auth SET failed = 0, locked_until = NULL WHERE id = 1;
  ELSE
    UPDATE public.log_auth
       SET failed = CASE WHEN r.failed + 1 >= 10 THEN 0 ELSE r.failed + 1 END,
           locked_until = CASE WHEN r.failed + 1 >= 10 THEN now() + interval '10 minutes' ELSE NULL END
     WHERE id = 1;
  END IF;
  RETURN ok;
END $$;

CREATE OR REPLACE FUNCTION public.log_auth_set(old_pw TEXT, new_pw TEXT)
RETURNS BOOLEAN
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = public, extensions, pg_temp
AS $$
BEGIN
  IF new_pw IS NULL OR length(new_pw) < 4 OR length(new_pw) > 64 THEN RETURN false; END IF;
  IF NOT public.log_auth_check(old_pw) THEN RETURN false; END IF;
  UPDATE public.log_auth SET pw_hash = crypt(new_pw, gen_salt('bf', 10)), updated_at = now() WHERE id = 1;
  RETURN true;
END $$;

-- 처음 비밀번호 0602(이미 있으면 그대로 둔다).
INSERT INTO public.log_auth (id, pw_hash) VALUES (1, crypt('0602', gen_salt('bf', 10)))
ON CONFLICT (id) DO NOTHING;

REVOKE ALL ON FUNCTION public.log_auth_check(TEXT) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.log_auth_set(TEXT, TEXT) FROM PUBLIC;
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
    GRANT EXECUTE ON FUNCTION public.log_auth_check(TEXT) TO anon;
    GRANT EXECUTE ON FUNCTION public.log_auth_set(TEXT, TEXT) TO anon;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
    GRANT EXECUTE ON FUNCTION public.log_auth_check(TEXT) TO authenticated;
    GRANT EXECUTE ON FUNCTION public.log_auth_set(TEXT, TEXT) TO authenticated;
  END IF;
END $$;

COMMIT;
