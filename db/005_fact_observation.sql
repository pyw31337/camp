-- 사실(무료·취사·화장실 등)은 “원천의 주장 + 관측시각 + 만료시각”으로만 저장한다.
-- AGENTS.md 규칙 3: 출처 URL·확인 시각·신뢰 등급 없이 확정값으로 저장·표시하지 않는다.
-- 비파괴 변경(열·테이블·뷰 추가). 롤백(역순):
--   DROP VIEW IF EXISTS campground_fact_current;
--   DROP TABLE IF EXISTS campground_fact;
--   DROP TYPE IF EXISTS fact_state;
--   DROP INDEX IF EXISTS source_assertion_live_idx;
--   ALTER TABLE source_assertion DROP CONSTRAINT IF EXISTS source_assertion_expiry_check,
--     DROP COLUMN IF EXISTS assertion_kind, DROP COLUMN IF EXISTS expires_at, DROP COLUMN IF EXISTS valid_from;

BEGIN;

ALTER TABLE source_assertion
  ADD COLUMN valid_from timestamptz,
  ADD COLUMN expires_at timestamptz,
  ADD COLUMN assertion_kind text NOT NULL DEFAULT 'OBSERVED'
    CHECK (assertion_kind IN ('OBSERVED', 'PUBLISHED_NOTICE', 'DERIVED', 'USER_REPORT')),
  ADD CONSTRAINT source_assertion_expiry_check CHECK (expires_at IS NULL OR expires_at >= observed_at);

CREATE INDEX source_assertion_live_idx ON source_assertion (entity_type, entity_id, field_name)
  WHERE superseded_at IS NULL;

-- 조건부(CONDITIONAL): 예) 취사는 버너만, 동절기 화장실 폐쇄. 조건 문구가 반드시 있어야 한다.
CREATE TYPE fact_state AS ENUM ('YES', 'NO', 'CONDITIONAL', 'UNKNOWN');

CREATE TABLE campground_fact (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  campground_id uuid NOT NULL REFERENCES campground(id) ON DELETE CASCADE,
  fact_key text NOT NULL CHECK (fact_key IN (
    'IS_FREE', 'COOKING_ALLOWED', 'CAMPFIRE_ALLOWED', 'TOILET_ON_SITE', 'SHOWER_ON_SITE',
    'DRINKING_WATER', 'ELECTRICITY', 'PET_ALLOWED', 'WINTER_OPEN', 'CAMPING_ALLOWED'
  )),
  state fact_state NOT NULL,
  condition_text text,
  numeric_value numeric,                      -- 예: 화장실 칸 수, 개수대 수
  data_source_id uuid NOT NULL REFERENCES data_source(id),
  source_url text NOT NULL,
  source_tier source_tier NOT NULL,
  evidence_excerpt text,                      -- 원문 근거 문장(짧게)
  observed_at timestamptz NOT NULL,
  expires_at timestamptz NOT NULL,
  verification_status verification_status NOT NULL DEFAULT 'PENDING_REVIEW',
  response_hash text,
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK (expires_at > observed_at),
  CHECK (state <> 'CONDITIONAL' OR condition_text IS NOT NULL),
  CHECK (source_url ~ '^https?://'),
  UNIQUE (campground_id, fact_key, data_source_id, observed_at)
);

CREATE INDEX campground_fact_lookup_idx ON campground_fact (campground_id, fact_key, expires_at DESC);

-- 화면이 읽는 “지금 유효한 값”. 만료·E등급·반려·만료 처리된 주장은 제외하고
-- 등급(A가 우선) → 최신 관측 순으로 하나를 고른다. 같은 등급에서 값이 다르면 CONFLICT.
-- 행이 없으면 화면은 “확인 필요”로 표시한다(UNKNOWN을 기본값으로 만들지 않는다).
CREATE VIEW campground_fact_current AS
WITH live AS (
  SELECT f.*
  FROM campground_fact f
  WHERE f.expires_at > now()
    AND f.source_tier IN ('A', 'B', 'C', 'D')
    AND f.verification_status NOT IN ('REJECTED', 'EXPIRED')
), ranked AS (
  SELECT live.*, row_number() OVER (
    PARTITION BY campground_id, fact_key ORDER BY source_tier, observed_at DESC
  ) AS rn
  FROM live
)
SELECT r.campground_id, r.fact_key, r.state, r.condition_text, r.numeric_value,
  r.source_url, r.source_tier, r.evidence_excerpt, r.observed_at, r.expires_at,
  CASE
    WHEN EXISTS (
      SELECT 1 FROM live o
      WHERE o.campground_id = r.campground_id AND o.fact_key = r.fact_key
        AND o.source_tier = r.source_tier AND o.state <> r.state
    ) THEN 'CONFLICT'
    WHEN r.source_tier IN ('A', 'B') THEN 'CONFIRMED'
    ELSE 'LIKELY'
  END AS display_status
FROM ranked r
WHERE r.rn = 1;

COMMIT;
