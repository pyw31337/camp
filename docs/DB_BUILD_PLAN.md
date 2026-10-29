# DB 구축 협의 결과 (Claude ↔ Codex)

> 갱신: 2026-10-13 KST · 기준 계획은 Codex의 [`DATA_FOUNDATION_PLAN.md`](./DATA_FOUNDATION_PLAN.md)다. 이 문서는 두 작업의 정렬 결과와 남은 확인 사항만 적는다.

## 1. 경위

- 같은 날 Claude(PR #1 브랜치)와 Codex(main)가 거의 같은 범위의 DB 확장(사실 수명주기, 화장실·휴게소·유가, 예약 규칙·일정, 무료 판정, 실행 기록)을 각각 `db/005~007`로 만들었다.
- 스키마가 둘이면 안 되므로 **먼저 main에 들어간 Codex 스키마(005_fact_lifecycle, 006_travel_context, 007_booking_rule_templates)를 기준**으로 삼고, Claude 쪽 중복분(005~009, `postgres-enrichment`, `verify-db-load`, `db-verify.yml`)은 걷어냈다.
- Claude 수집기(ZIP 파일명 해석, 도로공사 휴게소·유가, 화장실 전용 다운로드, Overpass 캐시)는 Codex가 main에 다듬어 반영했다. 충돌 파일은 main 버전을 따랐다.

## 2. Claude가 main 스키마 위에 더한 것

| 항목 | 내용 | 검증 |
| --- | --- | --- |
| `db/008_campground_licence_source.sql` | LOCALDATA 일반·자동차야영장업 인허가 원천 등록 + `source_usage_policy`(검토 대기). 새 테이블 없음 | 로컬 PostgreSQL 16: 001~008 적용·재실행 |
| `lib/localdata-campgrounds.mjs`, `scripts/sync-localdata-campgrounds.mjs` | 인허가 정규화(상태·인허가일·폐업일·EPSG:5174 좌표·업종 고유 열 보존) → 고캠핑 1:1 매칭(이름·좌표·도로명·전화). 플래그: `HIDDEN_CANDIDATE`(고캠핑에 없는 영업 중 시설), `LICENSE_CLOSED_BUT_LISTED`(인허가 폐업인데 고캠핑에 운영 중) | 단위 테스트 3 |
| `lib/postgres-licences.mjs`, `npm run db:import-licences` | Codex의 `campground_candidate`(external_key·matched_campground_id·evidence)에 적재. 0.9 이상만 연결, 사람이 검토한 행은 덮어쓰지 않음, `ingestion_run` 기록 | 통합 테스트(실제 DB) |
| `lib/postgres-context.mjs` 최소 수정 | **실데이터 중복 키 버그**: 같은 쉼터 두 번 등록·같은 화장실 해시가 한 INSERT에 들어가면 `ON CONFLICT DO UPDATE command cannot affect row a second time`으로 적재 전체가 실패(로컬 재현). 정규화 행을 키별 마지막 행으로 줄이는 두 줄 추가. 이어서 실데이터 검증 단계가 **주변 화장실 연계의 같은 화장실 중복**(같은 캠핑장 목록에 같은 toilet_id 두 번)도 잡아 같은 방식으로 수정 | `test/postgres-context-duplicates.test.mjs` |
| `data-sync.yml` | 인허가 수집 단계, 운영 DB 단계에 `db:import-licences`, **그날 실제 파일을 임시 PostgreSQL에 두 번 적재**하는 마지막 단계(고정 표본 검증이 못 잡는 실데이터 문제를 운영 전에 잡음) | CI |

## 3. Codex 확인 요청

1. `lib/postgres-context.mjs`의 중복 제거 두 줄(위 표). 이견이 없으면 그대로 유지해 달라.
2. `db/008`은 Codex 번호대 다음 번호를 썼다. 다음 Codex 마이그레이션은 009부터.
3. `data-sync.yml`의 운영 DB 단계에 `db:import-licences`를 붙였다(고캠핑 적재 뒤). 이용허락 검토 전에는 인허가 원천도 `PENDING_REVIEW`이며, 공개 발행 여부는 Codex의 정책 게이트를 따른다.
4. 화면 노출: 인허가 플래그(숨은 후보, 폐업 교차)는 검수 큐용이며 사용자 화면에 확정값으로 쓰지 않는다.

## 4. 무료 티어 운영 요약

수집·계산·검증은 GitHub Actions(공개 저장소 무료), 검증 DB는 실행마다 새로 띄우는 PostgreSQL 컨테이너, 공개는 GitHub Pages/Cloudflare Pages, 운영 DB는 소유자가 Neon 또는 Supabase 무료 Postgres(예상 100~200MB)를 고르면 `DATABASE_URL`만 등록해 시작한다.

## 5. Gemini가 main 스키마 위에 더한 것 (2026-10-16)

| 항목 | 내용 | 검증 |
| --- | --- | --- |
| `db/009_condition_facts_and_observations.sql` | 현장 조건 팩트(`condition_fact`), 대여품목(`rental_offer`), 시설특화(`facility_feature`), 관측 실행 및 관측 결과(`availability_observation`) 스키마 및 적재기 | `test/postgres-condition-facts.test.mjs` 통과 |
| `db/010_review_digest_and_ai_intelligence.sql` | AI 장단점 요약(`review_digest`), 소셜 블로그/카페 리뷰 원문(`review_post`), 유튜브 동영상 클립(`video_content`), 운영 이슈/시즌 이벤트(`operating_issue_event`) 통합 마이그레이션 | PostgreSQL 구문 검증 완료 |
| `pipeline/scripts/build-database.mjs` (`npm run build:db`) | Node.js 22+ 내장 `node:sqlite` 기반 로컬 SQLite DB(`db/moyeora_camping.db`, 32MB) 멱등 빌더. 3,116개 캠핑장, 1,245개 AI 다이제스트, 16,870개 리뷰, 6,732개 영상, 59,834개 사진, 16개 운영이벤트 전량 적재 | `/usr/bin/sqlite3` 쿼리 검증 완료 |
| `docs/AGENT_HANDOFF.md` | Claude/Codex 에이전트 연계 가이드, CLI 및 SQL 쿼리 레시피, 테이블 통계 공유 | 문서 갱신 완료 |

## 6. Claude & Codex 에이전트 연계 확인 사항

## 7. 댓글 첨부 사진 (2026-10-29)

- `db/025_campground_comment_media.sql`은 기존 댓글을 보존한 채 `image_url`·`image_alt` 열과 Supabase Storage `comment-media` 버킷을 추가한다. 운영 DB는 다음 `npm run db:migrate`에서 적용하며, 로컬 검증 DB에 Storage 스키마가 없어도 댓글 열 검증은 계속된다.
- 브라우저는 붙여넣은 이미지를 최대 1600px·2MB로 압축한 뒤 업로드하고, 댓글 본문과 별도로 안전한 HTTPS 이미지 URL만 렌더링한다.

1. **로컬 SQLite 데이터베이스 (`db/moyeora_camping.db`) 즉시 활용**:
   - Claude 및 Codex가 분석 작업, 추천 모델 튜닝, 추가 필터링 쿼리를 수행할 때 외부 DB 서버 연결 없이 저장소 루트의 `db/moyeora_camping.db`를 즉시 쿼리할 수 있습니다 (`sqlite3 db/moyeora_camping.db "SELECT ..."`).
   - 데이터가 갱신된 경우 언제든 `npm --prefix pipeline run build:db`를 실행하면 1초 안에 최신 정적 데이터로부터 SQLite DB가 재생성됩니다.
2. **PostgreSQL 운영 환경 마이그레이션**:
   - `DATABASE_URL`이 주어지는 서버 환경에서는 `db/001`부터 `db/010_review_digest_and_ai_intelligence.sql`까지 순차 적용하여 동일한 관계형 테이블로 적재할 수 있습니다.
