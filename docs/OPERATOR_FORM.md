# 운영자 셀프 등록 (Phase 3)

캠핑장 운영자는 **GitHub 계정 없이** 상세 화면 맨 아래 ‘캠핑장 운영자이신가요? 정보 바로잡기’에서 정보를 고쳐 달라고 보낼 수 있습니다.

## 동작
1. **폼**(`camping-atlas/public/operator/form.js`)에서 보낼 수 있는 항목:
   - 입실·퇴실 시각, 매너타임, 1박 요금, 반려동물 동반, 공식 홈페이지, 취소·환불 규정, 인원 추가 요금
   - 근거 주소, 관계(대표·직원·위탁), 이름·연락처(공개 안 함), 동의
   - 미끼 칸(봇 방지)이 있고, 같은 브라우저에서는 10분에 한 번만 보낼 수 있습니다.
2. 이미 있는 Supabase(공개 키)의 `public.operator_submission`에 **넣기만** 합니다(`db/015_operator_submission.sql`).
   - RLS가 공개 키에는 INSERT만 허용합니다. 읽기·수정·삭제는 안 됩니다.
   - 상태는 항상 `PENDING`이고, 동의가 필수입니다.
3. **소유자 검토**: Supabase 대시보드 → Table Editor → `operator_submission`에서 내용을 봅니다.
   - 필요하면 연락처로 확인합니다.
   - `status`를 `APPROVED` 또는 `REJECTED`로 바꾸고, `reviewed_at`을 지금 시각으로 넣습니다.
4. 워크플로 **Operator submissions**(매일 02:50 KST)가 `DATABASE_URL`로 승인분만 읽어 `pipeline/registry/operator-submissions.json`을 만듭니다(연락처·이름 제외).
5. 다음 **Data sync**의 `build-fact-store`가 이 파일을 읽어 사실 저장소에 넣습니다. 등급은 `OPERATOR`, 원천은 `operator_form`이고, 근거 주소나 상세 페이지 주소가 함께 들어갑니다.

## 필요한 것
- 새 계정·새 Secret은 **없습니다**. 기존 `SUPABASE_ANON_KEY`(사이트), `DATABASE_URL`/`DATABASE_SSL`(Actions)을 씁니다.
- 표는 main의 Data sync가 `npm run db:migrate`로 만듭니다. 그 전까지 폼은 “접수 창구 준비 중”이라고 안내합니다.

## 소유자 결정이 필요한 것
- **새 캠핑장 등록**(고캠핑에 없는 곳): 표에는 `kind=NEW`가 있지만, 화면 폼은 아직 기존 캠핑장 수정만 받습니다. 새 곳을 받을지는 정해 주세요.
- **스팸 대응**: 지금은 미끼 칸, 브라우저당 10분 제한, 길이·형식 검사만 있습니다. 스팸이 많아지면 Cloudflare Turnstile(무료, 사이트 키 등록 필요)을 붙이는 방안을 권합니다.
- **개인정보**: 연락처를 보관하는 기간과 삭제 주기를 정하고, 개인정보 처리방침에 반영해야 합니다(권장: 검토 후 90일 안에 연락처 지우기).
