-- 027_takedown_request.sql
-- 사진·글 내리기 요청(소유자 2026-10-31: 저작권·초상권 문의 대응 절차). 기존 운영자 제보 표(015)를 그대로 쓴다.
-- kind TAKEDOWN · submitter_role RIGHTS(권리자 본인·대리인). 공개 키는 여전히 INSERT만 가능하다.
-- 소유자가 Supabase에서 status를 APPROVED로 바꾸면 export-operator-submissions.mjs가 공개 비노출 목록(takedowns.json)을 만든다.

BEGIN;

ALTER TABLE public.operator_submission DROP CONSTRAINT IF EXISTS operator_submission_kind;
ALTER TABLE public.operator_submission ADD CONSTRAINT operator_submission_kind CHECK (kind IN ('UPDATE', 'NEW', 'TAKEDOWN'));
ALTER TABLE public.operator_submission DROP CONSTRAINT IF EXISTS operator_submission_role;
ALTER TABLE public.operator_submission ADD CONSTRAINT operator_submission_role CHECK (submitter_role IN ('OWNER', 'STAFF', 'AGENCY', 'RIGHTS'));
ALTER TABLE public.operator_submission DROP CONSTRAINT IF EXISTS operator_submission_target;
ALTER TABLE public.operator_submission ADD CONSTRAINT operator_submission_target CHECK ((kind IN ('UPDATE', 'TAKEDOWN') AND campground_id IS NOT NULL) OR kind = 'NEW');

COMMIT;
