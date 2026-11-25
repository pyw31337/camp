-- 029_campground_comment_campground_id_text.sql
-- campground_comment.campground_id를 INT에서 TEXT로 변경하여
-- 범바위포레스트(loc-872363c1), 국립공원/휴양림(park-*), 노지(osm-*) 등
-- 모든 형태의 캠핑장 ID에서 비회원 댓글 및 찜 한마디를 작성하고 조회할 수 있도록 지원.
--
-- 롤백(필요시):
-- ALTER TABLE public.campground_comment ALTER COLUMN campground_id TYPE INT USING (campground_id::INTEGER);

BEGIN;

-- 1. campground_id 열을 TEXT로 변경 (기존 정수 ID는 그대로 문자열로 변환됨)
ALTER TABLE public.campground_comment
  ALTER COLUMN campground_id TYPE TEXT USING campground_id::TEXT;

-- 2. 검색 인덱스 갱신 (TEXT 타입 대상)
DROP INDEX IF EXISTS public.idx_campground_comment_lookup;
CREATE INDEX IF NOT EXISTS idx_campground_comment_lookup 
  ON public.campground_comment (campground_id, created_at DESC) 
  WHERE is_deleted = FALSE;

COMMIT;
