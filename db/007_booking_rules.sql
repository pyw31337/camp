-- 예약 규칙(원본)과 규칙에서 계산한 일정(결과물)을 분리한다.
-- 원천: pipeline/registry/booking-rules.json(규칙·원문 URL·확인일·등급), pipeline/out/open-calendar.json(계산 결과).
-- booking_window·lottery_round(001)는 공식 공지로 확정된 실제 회차 전용으로 남긴다.
-- 비파괴 변경(새 테이블만 추가). 롤백(역순):
--   DROP TABLE IF EXISTS booking_event;
--   DROP TABLE IF EXISTS booking_rule;

BEGIN;

CREATE TABLE booking_rule (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  rule_key text NOT NULL,                     -- 레지스트리 rules[].id
  reservation_provider_id uuid REFERENCES reservation_provider(id) ON DELETE SET NULL,
  provider_key text NOT NULL,                 -- 레지스트리 providers[].id (제공자가 아직 DB에 없을 때도 추적)
  label text NOT NULL,
  summary text,
  applies_to text,
  schedule jsonb NOT NULL,                    -- 규칙 원문 구조(kind, 요일·시각·오프셋 등)
  source_url text NOT NULL CHECK (source_url ~ '^https?://'),
  source_title text,
  source_tier source_tier NOT NULL,
  checked_at date NOT NULL,                   -- 사람이 원문을 마지막으로 확인한 날
  registry_version text NOT NULL,
  rule_hash text NOT NULL,                    -- 같은 규칙이 바뀌었는지 판단
  is_current boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (rule_key, rule_hash)
);

CREATE UNIQUE INDEX booking_rule_current_idx ON booking_rule (rule_key) WHERE is_current;

CREATE TABLE booking_event (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event_key text NOT NULL UNIQUE,             -- rule_id:TYPE:시각 (open-calendar.json의 id)
  booking_rule_id uuid NOT NULL REFERENCES booking_rule(id) ON DELETE CASCADE,
  campground_id uuid REFERENCES campground(id) ON DELETE CASCADE,   -- NULL = 제공자 공통
  event_type text NOT NULL CHECK (event_type IN (
    'OPEN', 'LOTTERY_APPLY_START', 'LOTTERY_APPLY_END', 'LOTTERY_RESULT', 'PAYMENT_DEADLINE',
    'REOPEN', 'CLOSE', 'OTHER'
  )),
  occurs_at timestamptz NOT NULL,
  time_known boolean NOT NULL,                -- 시각을 원문이 밝히지 않았으면 false(날짜만 표시)
  label text NOT NULL,
  stay_from date,
  stay_to date,
  stay_day_types text[] NOT NULL DEFAULT '{}',
  note text,
  needs_verification boolean NOT NULL,
  source_url text NOT NULL CHECK (source_url ~ '^https?://'),
  source_tier source_tier NOT NULL,
  computed_at timestamptz NOT NULL,
  expires_at timestamptz NOT NULL,            -- 다음 재계산 전까지만 유효(기본 계산시각 + 2일)
  CHECK (stay_to IS NULL OR stay_from IS NULL OR stay_to >= stay_from),
  CHECK (expires_at > computed_at)
);

CREATE INDEX booking_event_upcoming_idx ON booking_event (occurs_at);
CREATE INDEX booking_event_campground_idx ON booking_event (campground_id, occurs_at) WHERE campground_id IS NOT NULL;

COMMIT;
