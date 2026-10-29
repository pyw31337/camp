-- 025_campground_comment_media.sql
-- 댓글에 붙여넣은 사진을 Supabase Storage에 보관하기 위한 추가형 마이그레이션.
-- 기존 댓글·본문은 건드리지 않으며 image_url/image_alt만 선택적으로 채운다.
-- 롤백(필요할 때): image_url/image_alt 열과 comment-media 버킷·정책을 별도 점검 후 제거한다.

BEGIN;

ALTER TABLE public.campground_comment
  ADD COLUMN IF NOT EXISTS image_url TEXT,
  ADD COLUMN IF NOT EXISTS image_alt TEXT;

-- 로컬 PostgreSQL 검증 환경에는 Supabase Storage 스키마가 없을 수 있다.
-- 그 경우 댓글 열만 적용하고, Supabase 운영 DB에서는 버킷·정책을 함께 만든다.
DO $$
BEGIN
  IF to_regclass('storage.buckets') IS NOT NULL THEN
    INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
    VALUES ('comment-media', 'comment-media', TRUE, 2097152, ARRAY['image/webp', 'image/jpeg', 'image/png']::text[])
    ON CONFLICT (id) DO UPDATE SET
      public = EXCLUDED.public,
      file_size_limit = EXCLUDED.file_size_limit,
      allowed_mime_types = EXCLUDED.allowed_mime_types;
  END IF;

  IF to_regclass('storage.objects') IS NOT NULL THEN
    BEGIN
      EXECUTE 'CREATE POLICY "Public comment media read" ON storage.objects FOR SELECT USING (bucket_id = ''comment-media'')';
    EXCEPTION WHEN duplicate_object THEN NULL;
    END;
    BEGIN
      EXECUTE 'CREATE POLICY "Public comment media insert" ON storage.objects FOR INSERT TO anon, authenticated WITH CHECK (bucket_id = ''comment-media'')';
    EXCEPTION WHEN duplicate_object THEN NULL;
    END;
  END IF;
END $$;

COMMIT;
