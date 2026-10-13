-- LOCALDATA 일반야영장업·자동차야영장업 인허가를 고캠핑 시설과 대조하기 위한 원천 등록.
-- 인허가 레코드는 기존 campground_candidate(external_key, matched_campground_id, evidence)에 적재한다(새 테이블 없음).
-- 전제: db/001 ~ db/007. 롤백: 이 원천의 campground_candidate 행을 확인·정리한 뒤
--   DELETE FROM source_usage_policy WHERE data_source_id = (SELECT id FROM data_source WHERE code = 'mois-campground-licence');
--   DELETE FROM data_source WHERE code = 'mois-campground-licence';

BEGIN;

INSERT INTO data_source (
  code, name, owner_name, base_url, source_tier, terms_url, license_summary,
  allows_persistent_storage, default_cache_seconds
) VALUES
  ('mois-campground-licence', '일반야영장업·자동차야영장업 인허가', '행정안전부·지방자치단체',
   'https://file.localdata.go.kr/', 'A', 'https://www.localdata.go.kr/',
   '인허가 상태·인허가일·폐업일·소재지·EPSG:5174 좌표. 업종 고유 열은 evidence.extra로 보존. 보존·재배포 범위 원문 검토 필요.', false, 86400)
ON CONFLICT (code) DO UPDATE SET
  name = EXCLUDED.name, owner_name = EXCLUDED.owner_name, base_url = EXCLUDED.base_url, terms_url = EXCLUDED.terms_url,
  license_summary = EXCLUDED.license_summary, default_cache_seconds = EXCLUDED.default_cache_seconds, updated_at = now();

INSERT INTO source_usage_policy (data_source_id, attribution_required, must_link_to_terms, policy_state, reviewer_note)
SELECT id, false, false, 'PENDING_REVIEW'::verification_status, 'Persistent storage/republication terms require source-specific operational review.'
FROM data_source WHERE code = 'mois-campground-licence'
ON CONFLICT (data_source_id) DO NOTHING;

COMMIT;
