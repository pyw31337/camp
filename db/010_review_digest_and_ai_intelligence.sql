-- 010_review_digest_and_ai_intelligence.sql
-- 후기·영상·소셜 검색 결과 및 인공지능 분석(장점·단점·운영이슈·시즌이벤트) 스키마
-- 전제: db/001_initial_schema.sql ~ db/009_condition_facts_and_observations.sql
-- 롤백: 의존성 역순으로 table/type을 제거한다.

BEGIN;

CREATE TABLE IF NOT EXISTS review_digest (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  campground_id text NOT NULL,
  total_reviews integer NOT NULL DEFAULT 0,
  pros_json jsonb NOT NULL DEFAULT '[]'::jsonb,
  cons_json jsonb NOT NULL DEFAULT '[]'::jsonb,
  issues_json jsonb NOT NULL DEFAULT '[]'::jsonb,
  top_pros_summary text,
  top_cons_summary text,
  generated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS review_digest_camp_idx ON review_digest (campground_id);

CREATE TABLE IF NOT EXISTS review_post (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  campground_id text NOT NULL,
  platform text NOT NULL DEFAULT 'NAVER_BLOG',
  title text NOT NULL,
  snippet text,
  url text NOT NULL,
  author text,
  published_at text,
  information_score integer,
  thumbnail_url text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS review_post_camp_idx ON review_post (campground_id, information_score DESC);

CREATE TABLE IF NOT EXISTS video_content (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  campground_id text NOT NULL,
  platform text NOT NULL DEFAULT 'YOUTUBE',
  video_id text,
  title text NOT NULL,
  url text NOT NULL,
  author text,
  duration_seconds integer,
  thumbnail_url text,
  kind text NOT NULL DEFAULT 'video',
  published_at text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS video_content_camp_idx ON video_content (campground_id);

CREATE TABLE IF NOT EXISTS operating_issue_event (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  campground_id text NOT NULL,
  category text NOT NULL,
  title text NOT NULL,
  value_text text,
  source_label text,
  valid_period text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS operating_issue_event_camp_idx ON operating_issue_event (campground_id);

COMMIT;
