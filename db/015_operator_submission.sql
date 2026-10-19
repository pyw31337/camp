-- 015_operator_submission.sql
-- 운영자 셀프 등록(정보 수정 요청) — GitHub 계정 없이 사이트에서 바로 제출한다.
-- 공개(anon) 키로는 INSERT만 된다(읽기·수정·삭제 불가). 연락처는 공개되지 않는다.
-- 소유자가 Supabase 표 편집기에서 status를 APPROVED로 바꾸면, 파이프라인이 DATABASE_URL로 읽어
-- registry/operator-submissions.json(연락처 제외)을 만들고 사실 저장소에 OPERATOR 등급(operator_form)으로 넣는다.
-- 되돌리기: DROP TABLE IF EXISTS public.operator_submission;

BEGIN;

CREATE TABLE IF NOT EXISTS public.operator_submission (
  id BIGSERIAL PRIMARY KEY,
  campground_id TEXT,                         -- 고캠핑 id(기존 캠핑장 수정 요청). 새 캠핑장이면 NULL
  kind VARCHAR(10) NOT NULL DEFAULT 'UPDATE', -- UPDATE | NEW
  campground_name VARCHAR(100) NOT NULL,
  submitter_name VARCHAR(40) NOT NULL,
  submitter_role VARCHAR(20) NOT NULL,        -- OWNER | STAFF | AGENCY
  contact VARCHAR(120) NOT NULL,              -- 확인 연락용(전화 또는 이메일). 공개하지 않음
  fields JSONB NOT NULL DEFAULT '{}'::jsonb,  -- {CHECKIN_TIME, CHECKOUT_TIME, MANNER_TIME, PRICE_NIGHT, PET_POLICY, HOMEPAGE, BOOKING_URL, REFUND_POLICY, NOTE}
  evidence_url VARCHAR(500),                  -- 근거(공식 홈페이지·공지) 주소
  consent BOOLEAN NOT NULL DEFAULT FALSE,     -- 게시·확인 연락 동의
  status VARCHAR(12) NOT NULL DEFAULT 'PENDING', -- PENDING | APPROVED | REJECTED
  review_note TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  reviewed_at TIMESTAMPTZ,
  CONSTRAINT operator_submission_kind CHECK (kind IN ('UPDATE', 'NEW')),
  CONSTRAINT operator_submission_role CHECK (submitter_role IN ('OWNER', 'STAFF', 'AGENCY')),
  CONSTRAINT operator_submission_status CHECK (status IN ('PENDING', 'APPROVED', 'REJECTED')),
  CONSTRAINT operator_submission_fields_size CHECK (pg_column_size(fields) < 8000),
  CONSTRAINT operator_submission_target CHECK ((kind = 'UPDATE' AND campground_id IS NOT NULL) OR kind = 'NEW')
);

CREATE INDEX IF NOT EXISTS idx_operator_submission_status ON public.operator_submission (status, created_at DESC);

ALTER TABLE public.operator_submission ENABLE ROW LEVEL SECURITY;

-- 공개 키: 새 요청 넣기만(항상 PENDING, 동의 필수, 검토 칸은 비워 둠). 읽기 정책은 만들지 않는다.
DROP POLICY IF EXISTS "Public submit operator info" ON public.operator_submission;
CREATE POLICY "Public submit operator info" ON public.operator_submission
  FOR INSERT WITH CHECK (
    status = 'PENDING' AND consent = TRUE AND review_note IS NULL AND reviewed_at IS NULL
    AND char_length(contact) >= 5 AND char_length(submitter_name) >= 1 AND char_length(campground_name) >= 1
  );

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
    REVOKE ALL ON public.operator_submission FROM anon;
    GRANT INSERT ON public.operator_submission TO anon;
    GRANT USAGE ON SEQUENCE public.operator_submission_id_seq TO anon;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
    REVOKE ALL ON public.operator_submission FROM authenticated;
    GRANT INSERT ON public.operator_submission TO authenticated;
    GRANT USAGE ON SEQUENCE public.operator_submission_id_seq TO authenticated;
  END IF;
END $$;

COMMIT;
