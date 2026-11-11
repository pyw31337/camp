-- 운영자가 올린 사이트(상품) 사진 검수 대기열(2026-11-11 t62).
-- 미리보기에서는 쓰지 않는다(브라우저 localStorage). 운영 적용 시에만 실행.
-- 공개(anon)는 INSERT만. 상태는 항상 PENDING. 승인과 저장소 경로는 서비스 롤·관리자만.

create table if not exists public.operator_photo_submission (
  id uuid primary key default gen_random_uuid(),
  campground_id text not null,
  campground_name text,
  submitter_role text check (submitter_role in ('OWNER', 'STAFF', 'AGENCY')),
  verify_method text not null check (verify_method in ('OTP', 'BIZ')),
  -- 전화번호 원문은 넣지 않는다. 사업자번호는 서버에서만 보관하거나 끝 네 자리만 둔다.
  verify_meta jsonb not null default '{}'::jsonb,
  photos jsonb not null default '[]'::jsonb,
  auto_judge jsonb,
  status text not null default 'PENDING' check (status in ('PENDING', 'APPROVED', 'REJECTED')),
  review_note text,
  reviewed_at timestamptz,
  created_at timestamptz not null default now()
);

alter table public.operator_photo_submission enable row level security;

drop policy if exists operator_photo_insert on public.operator_photo_submission;
create policy operator_photo_insert
  on public.operator_photo_submission
  for insert
  to anon, authenticated
  with check (status = 'PENDING');

-- 읽기·수정은 서비스 롤(관리자 페이지·Edge Function)만. anon SELECT 정책 없음.

comment on table public.operator_photo_submission is
  '운영자 사이트 사진. OTP는 고캠핑 등록 전화만, 예비는 국세청 사업자 상태조회. 관리자 승인 전에 공개하지 않음.';
