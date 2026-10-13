-- 원천이 주장한 사실의 유효기간과 수집 실행 이력을 보존한다.
-- 전제: db/001_initial_schema.sql ~ db/004_confirm_gocamping_catalog_license.sql
-- 롤백: 이 마이그레이션이 만든 view/index/table/type/column을 의존성 역순으로 제거한다.

BEGIN;

CREATE TYPE assertion_kind AS ENUM ('OBSERVATION', 'OFFICIAL_NOTICE', 'OPERATOR_DECLARATION', 'DERIVED', 'DISCOVERY_HINT');

ALTER TABLE source_assertion
  ADD COLUMN assertion_kind assertion_kind NOT NULL DEFAULT 'OBSERVATION',
  ADD COLUMN valid_from timestamptz,
  ADD COLUMN expires_at timestamptz,
  ADD COLUMN review_note text,
  ADD CONSTRAINT source_assertion_valid_range
    CHECK (expires_at IS NULL OR valid_from IS NULL OR expires_at >= valid_from);

CREATE INDEX source_assertion_current_idx
  ON source_assertion (entity_type, entity_id, field_name, source_tier, observed_at DESC)
  WHERE superseded_at IS NULL;

-- 수집 실행 하나를 독립된 감사 단위로 남긴다. 원본 파일의 보존 가능 여부는
-- data_source/source_usage_policy에서 관리하고, 여기에는 재현용 해시와 건수만 남긴다.
CREATE TABLE ingestion_run (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  data_source_id uuid NOT NULL REFERENCES data_source(id),
  dataset_key text NOT NULL,
  source_url text,
  started_at timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz,
  observed_at timestamptz NOT NULL DEFAULT now(),
  status text NOT NULL CHECK (status IN ('RUNNING', 'SUCCEEDED', 'PARTIAL', 'FAILED', 'SKIPPED')),
  received_count integer CHECK (received_count IS NULL OR received_count >= 0),
  accepted_count integer CHECK (accepted_count IS NULL OR accepted_count >= 0),
  rejected_count integer CHECK (rejected_count IS NULL OR rejected_count >= 0),
  payload_hash text,
  completeness jsonb NOT NULL DEFAULT '{}'::jsonb,
  error_summary text,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  CHECK (completed_at IS NULL OR completed_at >= started_at)
);

CREATE INDEX ingestion_run_source_idx ON ingestion_run (data_source_id, dataset_key, observed_at DESC);

-- 원천별 보관·재배포·표시 의무를 데이터와 함께 검토한다.
CREATE TABLE source_usage_policy (
  data_source_id uuid PRIMARY KEY REFERENCES data_source(id) ON DELETE CASCADE,
  reviewed_at timestamptz,
  reviewer_note text,
  retention_days integer CHECK (retention_days IS NULL OR retention_days >= 0),
  redistribution_allowed boolean,
  attribution_required boolean NOT NULL DEFAULT false,
  attribution_text text,
  must_link_to_terms boolean NOT NULL DEFAULT false,
  policy_state verification_status NOT NULL DEFAULT 'PENDING_REVIEW'
);

-- 화면·API는 이 view의 state를 계산해 사용한다. 만료되었거나 E 등급만 남은
-- 사실은 UNKNOWN으로 내려가며, 원본 assertion은 감사·재검증을 위해 보존한다.
CREATE VIEW current_source_fact AS
WITH ranked AS (
  SELECT
    assertion.*,
    source.code AS source_code,
    ROW_NUMBER() OVER (
      PARTITION BY assertion.entity_type, assertion.entity_id, assertion.field_name
      ORDER BY
        CASE WHEN assertion.expires_at IS NULL OR assertion.expires_at > now() THEN 0 ELSE 1 END,
        assertion.source_tier ASC,
        assertion.observed_at DESC,
        assertion.created_at DESC
    ) AS precedence
  FROM source_assertion AS assertion
  JOIN data_source AS source ON source.id = assertion.data_source_id
  WHERE assertion.superseded_at IS NULL
    AND (assertion.valid_from IS NULL OR assertion.valid_from <= now())
)
SELECT
  id,
  data_source_id,
  source_code,
  campground_id,
  entity_type,
  entity_id,
  field_name,
  normalized_value,
  source_url,
  observed_at,
  valid_from,
  expires_at,
  source_tier,
  verification_status,
  CASE
    WHEN source_tier = 'E' OR (expires_at IS NOT NULL AND expires_at <= now()) THEN 'UNKNOWN'
    WHEN verification_status = 'CONFLICTED' THEN 'CONFLICT'
    WHEN verification_status = 'VERIFIED' AND source_tier IN ('A', 'B') THEN 'CONFIRMED'
    WHEN verification_status IN ('VERIFIED', 'PENDING_REVIEW') THEN 'LIKELY'
    ELSE 'UNKNOWN'
  END AS fact_state
FROM ranked
WHERE precedence = 1;

COMMIT;
