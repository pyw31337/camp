-- 012_enable_rls_security.sql
-- Supabase 보안 가이드 준수: public 스키마 내 모든 테이블에 RLS(Row Level Security) 활성화
-- 및 기본 읽기 허용(SELECT) 정책 설정

DO $$
DECLARE
    tbl text;
BEGIN
    FOR tbl IN
        SELECT relname
        FROM pg_class
        WHERE relnamespace = 'public'::regnamespace
          AND relkind IN ('r', 'p')
    LOOP
        EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY;', tbl);
        EXECUTE format('DROP POLICY IF EXISTS "Public read access" ON public.%I;', tbl);
        EXECUTE format('CREATE POLICY "Public read access" ON public.%I FOR SELECT USING (true);', tbl);
    END LOOP;
END $$;
