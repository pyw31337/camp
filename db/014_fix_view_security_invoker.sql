-- 014_fix_view_security_invoker.sql
-- Supabase 보안 가이드 준수: 뷰(View)의 SECURITY DEFINER 동작을 SECURITY INVOKER로 변경하여
-- 뷰 조회 시 호출자의 RLS 권한을 따르도록 설정

ALTER VIEW IF EXISTS public.current_source_fact SET (security_invoker = true);
ALTER VIEW IF EXISTS public.campground_fact_best SET (security_invoker = true);
