-- 019_reconcile_shared_saves.sql
-- save_log에는 남았지만 shared_save에 누락된 과거 찜 상태를 마지막 이벤트 기준으로 복구한다.
-- 기존 값은 삭제하지 않고, 현재 마지막 이벤트가 add인 업장만 보충한다.

BEGIN;

WITH latest AS (
  SELECT DISTINCT ON (campground_id) campground_id, action, created_at
  FROM public.save_log
  WHERE action IN ('add', 'remove')
  ORDER BY campground_id, created_at DESC, id DESC
)
INSERT INTO public.shared_save (campground_id, created_at)
SELECT campground_id, created_at
FROM latest
WHERE action = 'add'
ON CONFLICT (campground_id) DO NOTHING;

COMMIT;
