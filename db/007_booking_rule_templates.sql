-- 공급자 공통 예약 규칙과 계산된 오픈 일정을 시설별 정책과 분리해 저장한다.
-- 전제: db/001_initial_schema.sql ~ db/006_travel_context.sql
-- 롤백: booking_rule_event, provider_policy_template, booking_rule_state를 순서대로 제거한다.

BEGIN;

CREATE TYPE booking_rule_state AS ENUM ('ACTIVE', 'SUPERSEDED', 'RETIRED');

CREATE TABLE provider_policy_template (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  reservation_provider_id uuid NOT NULL REFERENCES reservation_provider(id) ON DELETE CASCADE,
  rule_key text NOT NULL,
  version integer NOT NULL CHECK (version > 0),
  label text NOT NULL,
  summary text,
  applies_to text,
  schedule_json jsonb NOT NULL,
  source_url text NOT NULL,
  source_title text,
  source_checked_at date,
  source_tier source_tier NOT NULL,
  verification_status verification_status NOT NULL DEFAULT 'PENDING_REVIEW',
  valid_from timestamptz,
  expires_at timestamptz,
  state booking_rule_state NOT NULL DEFAULT 'ACTIVE',
  observed_at timestamptz NOT NULL DEFAULT now(),
  response_hash text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (reservation_provider_id, rule_key, version),
  CHECK (expires_at IS NULL OR valid_from IS NULL OR expires_at >= valid_from)
);

CREATE INDEX provider_policy_template_current_idx
  ON provider_policy_template (reservation_provider_id, state, expires_at DESC);

-- 계산 결과의 날짜마다 원본 규칙 버전·계산 시각·검증 필요 여부를 남긴다.
-- 실제 시설별 공지·추첨 회차는 기존 policy_document/booking_window/lottery_round에만 넣는다.
CREATE TABLE booking_rule_event (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  provider_policy_template_id uuid NOT NULL REFERENCES provider_policy_template(id) ON DELETE CASCADE,
  event_key text NOT NULL UNIQUE,
  event_type text NOT NULL,
  occurs_at timestamptz NOT NULL,
  time_known boolean NOT NULL DEFAULT true,
  stay_scope jsonb NOT NULL DEFAULT '{}'::jsonb,
  note text,
  source_url text NOT NULL,
  source_tier source_tier NOT NULL,
  needs_verification boolean NOT NULL DEFAULT false,
  calculated_at timestamptz NOT NULL,
  calculation_hash text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX booking_rule_event_occurs_idx ON booking_rule_event (occurs_at, needs_verification);

COMMIT;
