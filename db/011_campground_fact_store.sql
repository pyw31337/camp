-- 캠핑장 원자 사실 저장소(docs/FACT_STORE.md). data/facts/*.ndjson과 같은 내용을 SQL로 조회·조합한다.
-- 사실 1행 = (캠핑장, 속성, 값, 등급, 원천, 원천 URL, 확인 시각, 근거 문장). 같은 속성의 여러 원천·충돌 값을 모두 남긴다.
-- 기존 condition_fact(db/009, 구역·상품 단위 파일럿 검증값)와 source_assertion(db/001, 원천 단언)은 그대로 둔다.
-- 이 테이블은 전국 캠핑장 수준의 파생 원장이며 data/facts를 원본으로 매 실행 통째로 다시 적재한다(import-facts-postgres.mjs).
-- 전제: db/001 ~ db/010. 파괴적 변경 없음(새 테이블·뷰만 추가).
-- 롤백: DROP VIEW IF EXISTS campground_fact_best; DROP TABLE IF EXISTS campground_fact; DROP TABLE IF EXISTS fact_attribute;
--       (원본은 data/facts에 있으므로 다시 적재하면 복구된다)

BEGIN;

CREATE TABLE IF NOT EXISTS fact_attribute (
  code text PRIMARY KEY,
  grp text NOT NULL,
  label text NOT NULL,
  value_type text NOT NULL,
  unit text,
  filter_op text,
  preference_question text,
  enum_values jsonb,
  note text
);

CREATE TABLE IF NOT EXISTS campground_fact (
  id bigserial PRIMARY KEY,
  external_campground_id text NOT NULL,           -- 고캠핑 contentId 또는 파일럿 id (data/facts의 cid)
  campground_id uuid REFERENCES campground(id) ON DELETE SET NULL, -- external_identifier로 맞춘 내부 id(없으면 NULL)
  attr text NOT NULL REFERENCES fact_attribute(code),
  value_json jsonb NOT NULL,
  value_num numeric,
  value_text text,
  grade text NOT NULL CHECK (grade IN ('VERIFIED', 'OPERATOR', 'CONFIRMED', 'MENTION')),
  grade_rank smallint NOT NULL CHECK (grade_rank BETWEEN 1 AND 4),
  source_code text NOT NULL,
  source_url text,
  observed_at timestamptz,
  quote text,
  display_text text,
  mentions integer,
  period text,
  label text,
  extra_num numeric,
  loaded_at timestamptz NOT NULL DEFAULT now(),
  -- 확정 등급은 원천 URL 없이 저장하지 않는다(AGENTS.md 3번).
  CONSTRAINT campground_fact_source_required CHECK (grade = 'MENTION' OR source_url IS NOT NULL)
);

CREATE INDEX IF NOT EXISTS campground_fact_attr_idx ON campground_fact (attr, value_num, value_text);
CREATE INDEX IF NOT EXISTS campground_fact_camp_idx ON campground_fact (external_campground_id, attr);

-- 캠핑장·속성마다 가장 높은 등급의 값(같은 등급 여러 값은 모두)
CREATE OR REPLACE VIEW campground_fact_best AS
SELECT f.*
FROM campground_fact f
JOIN (
  SELECT external_campground_id, attr, max(grade_rank) AS r FROM campground_fact GROUP BY 1, 2
) b ON b.external_campground_id = f.external_campground_id AND b.attr = f.attr AND b.r = f.grade_rank;

COMMIT;
