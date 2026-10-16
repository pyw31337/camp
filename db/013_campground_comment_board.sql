-- 013_campground_comment_board.sql
-- 일반 캠퍼를 위한 비회원 자유 댓글/방문 후기 게시판 스키마
-- GitHub 로그인 없이 닉네임과 간편 비밀번호만으로 자유롭게 후기 작성 가능

BEGIN;

CREATE TABLE IF NOT EXISTS public.campground_comment (
  id BIGSERIAL PRIMARY KEY,
  campground_id INT NOT NULL,
  nickname VARCHAR(50) NOT NULL,
  content TEXT NOT NULL,
  tag VARCHAR(20) DEFAULT '방문후기',
  password_hash VARCHAR(100),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  is_deleted BOOLEAN DEFAULT FALSE
);

CREATE INDEX IF NOT EXISTS idx_campground_comment_lookup 
  ON public.campground_comment (campground_id, created_at DESC) 
  WHERE is_deleted = FALSE;

-- Row Level Security (RLS) 활성화
ALTER TABLE public.campground_comment ENABLE ROW LEVEL SECURITY;

-- 누구나 삭제되지 않은 댓글을 자유롭게 읽을 수 있음
DROP POLICY IF EXISTS "Public read comments" ON public.campground_comment;
CREATE POLICY "Public read comments" ON public.campground_comment 
  FOR SELECT USING (is_deleted = FALSE);

-- 누구나 자유롭게 댓글을 등록할 수 있음
DROP POLICY IF EXISTS "Public insert comments" ON public.campground_comment;
CREATE POLICY "Public insert comments" ON public.campground_comment 
  FOR INSERT WITH CHECK (true);

-- 익명(anon) 및 인증 사용자 권한 부여 (PostgREST REST API 허용)
GRANT SELECT, INSERT ON public.campground_comment TO anon, authenticated;
GRANT USAGE, SELECT ON SEQUENCE public.campground_comment_id_seq TO anon, authenticated;

COMMIT;
