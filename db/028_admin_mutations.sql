-- 028_admin_mutations.sql
-- 운영 대시보드에서만 사용하는 안전한 편집 RPC.
-- 비밀번호는 저장하지 않고 log_auth_check로 확인하며, 공개 키로 테이블 직접 쓰기는 허용하지 않는다.
BEGIN;

CREATE OR REPLACE FUNCTION public.admin_save_set(pw TEXT, p_campground_id TEXT, p_saved BOOLEAN)
RETURNS BOOLEAN
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = public, extensions, pg_temp
AS $$
BEGIN
  IF p_campground_id IS NULL OR length(trim(p_campground_id)) = 0 OR length(trim(p_campground_id)) > 120 THEN RETURN false; END IF;
  IF NOT public.log_auth_check(pw) THEN RETURN false; END IF;
  IF p_saved THEN
    INSERT INTO public.shared_save (campground_id) VALUES (trim(p_campground_id)) ON CONFLICT (campground_id) DO NOTHING;
    INSERT INTO public.save_log (action, campground_id, platform) VALUES ('add', trim(p_campground_id), 'admin');
  ELSE
    DELETE FROM public.shared_save WHERE campground_id = trim(p_campground_id);
    INSERT INTO public.save_log (action, campground_id, platform) VALUES ('remove', trim(p_campground_id), 'admin');
  END IF;
  RETURN true;
END $$;

CREATE OR REPLACE FUNCTION public.admin_comment_update(pw TEXT, p_comment_id BIGINT, p_content TEXT)
RETURNS BOOLEAN
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = public, extensions, pg_temp
AS $$
BEGIN
  IF p_comment_id IS NULL OR p_content IS NULL OR length(btrim(p_content)) = 0 OR length(p_content) > 500 THEN RETURN false; END IF;
  IF NOT public.log_auth_check(pw) THEN RETURN false; END IF;
  UPDATE public.campground_comment SET content = btrim(p_content), updated_at = now()
   WHERE id = p_comment_id AND is_deleted = false;
  RETURN FOUND;
END $$;

CREATE OR REPLACE FUNCTION public.admin_comment_delete(pw TEXT, p_comment_id BIGINT)
RETURNS BOOLEAN
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = public, extensions, pg_temp
AS $$
BEGIN
  IF p_comment_id IS NULL THEN RETURN false; END IF;
  IF NOT public.log_auth_check(pw) THEN RETURN false; END IF;
  UPDATE public.campground_comment SET is_deleted = true, updated_at = now()
   WHERE id = p_comment_id AND is_deleted = false;
  RETURN FOUND;
END $$;

REVOKE ALL ON FUNCTION public.admin_save_set(TEXT, TEXT, BOOLEAN) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.admin_comment_update(TEXT, BIGINT, TEXT) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.admin_comment_delete(TEXT, BIGINT) FROM PUBLIC;
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
    GRANT EXECUTE ON FUNCTION public.admin_save_set(TEXT, TEXT, BOOLEAN) TO anon;
    GRANT EXECUTE ON FUNCTION public.admin_comment_update(TEXT, BIGINT, TEXT) TO anon;
    GRANT EXECUTE ON FUNCTION public.admin_comment_delete(TEXT, BIGINT) TO anon;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
    GRANT EXECUTE ON FUNCTION public.admin_save_set(TEXT, TEXT, BOOLEAN) TO authenticated;
    GRANT EXECUTE ON FUNCTION public.admin_comment_update(TEXT, BIGINT, TEXT) TO authenticated;
    GRANT EXECUTE ON FUNCTION public.admin_comment_delete(TEXT, BIGINT) TO authenticated;
  END IF;
END $$;

COMMIT;
