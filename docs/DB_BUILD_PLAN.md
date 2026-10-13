# DB 구축·운영 공동 계획 (Claude ↔ Codex 협의안)

> 작성: 2026-10-13 KST · Claude(`claude/upbeat-keller-x75pct`) 제안, Codex(main) 확인 요청<br>
> 원칙: **초기 구축·운영 모두 무료 티어**, 수집은 원천이 주는 만큼 자세히, 데이터끼리는 식별자·거리·규칙으로 서로 연결한다.<br>
> 무료 캠핑·취사·화장실·가격·재고는 **출처 URL·관측시각·만료시각** 없이 확정값으로 저장·표시하지 않는다(AGENTS.md 규칙 3).

## 1. 무료 티어 구성

| 역할 | 서비스 | 무료 조건(2026-10 기준, 소유자 재확인 필요) | 현재 |
| --- | --- | --- | --- |
| 수집·계산·검증 | GitHub Actions | 공개 저장소 무제한 | 사용 중(`data-sync`) |
| DB 검증 | Actions `services: postgres:16` | 실행마다 새로 띄우는 임시 DB, 비용 없음 | **이번에 추가** |
| 운영 DB | Neon 또는 Supabase 무료 Postgres | 0.5GB 안팎. 예상 사용량 아래 표 | 소유자 선택 대기(`DATABASE_URL`) |
| 공개 사이트 | GitHub Pages(Codex), Cloudflare Pages 미리보기(Claude) | 무료 | 사용 중 |
| 온디맨드 조회 | Cloudflare Workers | 일 10만 요청 | 예정(실시간 가용성·길찾기) |
| 주소→좌표 | 카카오 로컬 | 일 호출 한도 안에서 캐시 | 사용 중(하루 3만 건 상한) |

예상 DB 크기(0.5GB 한도 대비): 캠핑장 3,118 + 상품·규격 약 2만 행, 공중화장실 53,584행(약 30MB), 휴게소·졸음쉼터 약 1,400행, 유가 관측 하루 약 170행(1년 약 6만 행, 90일 넘은 행은 일 단위 요약으로 압축), 원천 주장(`source_assertion`) 수십만 행 → **100~200MB**. 원본 응답 전문은 DB에 넣지 않고 Actions 산출물(14일)과 해시만 남긴다.

## 2. 데이터 모델 보완 (마이그레이션 005~008, Claude 담당)

| 파일 | 내용 | 롤백 |
| --- | --- | --- |
| `db/005_fact_observation.sql` | `source_assertion`에 `valid_from`·`expires_at`·`assertion_kind` 추가. **`campground_fact`**(무료·취사·화장실 등 YES/NO/CONDITIONAL/UNKNOWN + 출처·관측·만료 필수)와 **`campground_fact_current` 뷰**(만료·E등급 제외, 등급→최신 순, 충돌 표시) | 파일 머리 주석 |
| `db/006_rest_stops.sql` | `rest_stop`(휴게소·졸음쉼터·쉼터), `rest_stop_facility`(시설별 유·무료와 근거: 원천/기본규칙), `fuel_price_observation`(유가 시계열, 24시간 만료) | 〃 |
| `db/007_booking_rules.sql` | `booking_rule`(제공자 공통 규칙 + 버전 + 원천 등급), `booking_event`(규칙에서 계산한 일정 인스턴스, `rule_version`·계산시각·확인필요) | 〃 |
| `db/009_seed_enrichment_sources.sql` | 부가 원천 등록(행안부 화장실·도로공사·졸음쉼터 = 이용허락 확인 전 `false`, OSM·자체 레지스트리 = `true`) | DELETE |
| `db/008_linkage.sql` | `public_toilet`에 원천 좌표 방법(`coord_method`), `entity_link`(고캠핑↔LOCALDATA 인허가↔예약처↔무료 레지스트리 매칭 점수·근거·검수 상태), `ingest_run`(실행별 건수·해시·상태) | 〃 |

번호 예약: **005~009 = Claude 트랙**, **010~ = Codex 다음 작업**. 서로 상대 번호대 파일은 만들지 않는다.

## 3. 원천 우선순위 (필드별)

| 필드 | 1순위 | 2순위 | 3순위 | 만료 |
| --- | --- | --- | --- | --- |
| 존재·위치·인허가 | LOCALDATA 인허가(일반·자동차야영장업) | 고캠핑 | 운영자 홈페이지·OSM | 30일 |
| 예약 규칙·일정 | 운영기관 공지 원문(A) | 예약 플랫폼 안내(B) | 언론·소개문(C, 확인 필요 표시) | 공지 종료일 또는 시즌 |
| 무료·취사 | 지자체 고시·공지 | 운영기관 안내 | 커뮤니티(E) → 후보 큐만 | 90일 |
| 캠핑장 안 화장실 | 운영자 공지 | 고캠핑 시설 수 | – | 180일 |
| 주변 공중화장실 | 행안부 LOCALDATA 화장실 파일 | OSM | – | 원천 갱신일 + 7일 |
| 휴게소 시설·유가 | 한국도로공사 OpenAPI | 졸음쉼터 표준데이터 | OSM | 시설 7일, 유가 24시간 |
| 요금 | 예약처 실시간 견적 | 공식 요금표 | (소개문 가격은 표시 금지) | 견적 5분, 요금표 시즌 |
| 재고 | 허가된 실시간 연동만 | 없음 | 없음 | 5분 |

## 4. 데이터 간 연계 지도

```
고캠핑 contentId ─┬─ external_identifier ── campground ──┬─ campground_fact(무료·취사·화장실…)
LOCALDATA 관리번호 ┘   (entity_link 점수·근거)          ├─ campground_nearby_toilet ── public_toilet(행안부·OSM)
예약처 시설 ID ────────────────────────────────────────├─ product ── reservation_channel ── booking_event ── booking_rule
무료 레지스트리 id ─────────────────────────────────────└─ (경로) rest_stop ── rest_stop_facility / fuel_price_observation
```

- 매칭 키: 이름 정규화 + 주소(도로명/지번) + 좌표 거리(300m) + 전화번호. 점수 0.9 이상만 자동 연결, 나머지는 `campground_candidate`/검수 큐.
- 화장실·휴게소는 캠핑장과 **거리·경로로 계산한 관계**라 계산 시각과 방법(직선/경로)을 함께 저장한다.

## 5. 갱신 주기

| 주기 | 대상 |
| --- | --- |
| 초기 1회 | 고캠핑 전체, LOCALDATA 화장실·야영장업, 도로공사, 졸음쉼터, OSM, 지오코딩 백필(카카오 한도로 2~3일 분할), 엔티티 매칭 |
| 매일 | 고캠핑 증분, LOCALDATA 화장실 증분(`데이터갱신시점`), 예약 일정 재계산·ICS, 유가, 만료 임박 사실 재확인 큐 |
| 매주 | OSM, 졸음쉼터, 휴게소 편의시설, 공공시설 무료 후보, 엔티티 재매칭, 원문 URL 깨짐 검사, 좌표 실패 주소 재시도 |
| 온디맨드 | 실시간 가용성·견적, 날씨, 길찾기·통행료(Workers, 짧은 만료로만 저장) |

## 6. 운영 DB 없이 검증하는 순서

1. Actions 임시 Postgres에 `001→최신` 적용 → 같은 마이그레이션 재실행(멱등) 확인.
2. 그 실행에서 만든 JSON(고캠핑·화장실·휴게소·일정)을 전부 적재 → **JSON 건수와 DB 건수 일치** 확인.
3. 같은 적재를 한 번 더 → 건수 불변(중복 0).
4. 품질 쿼리를 실패 조건으로: 출처·만료 없는 사실 0, 만료된 사실이 현재 뷰에 0, 한국 밖 좌표 0, 고아 연결 0.
5. 통과가 이어지면 소유자가 운영 DB를 만들고 `DATABASE_URL`을 GitHub Environment(승인 필요)에 등록 → 기존 Codex 단계가 같은 마이그레이션·적재를 운영 DB에 실행.

## 7. 작업 분담(파일 소유권)

| 담당 | 파일·영역 |
| --- | --- |
| **Codex** | `camping-atlas/**`(웹), `pipeline/lib/postgres-gocamping.mjs`·`scripts/{migrate-postgres,import-gocamping-postgres,publish-web-catalog}.mjs`, `db/003~004`, GitHub Pages 배포, `catalog.json` 스키마 |
| **Claude** | `db/005~009`, `pipeline/lib/postgres-{facts,poi,booking,linkage}.mjs`·`scripts/import-*-postgres.mjs`(고캠핑 제외)·`scripts/verify-db-load.mjs`, 수집기(`sync-toilets`·`sync-rest-stops`·LOCALDATA 야영장업), `design/**`, Cloudflare 미리보기 |
| 공동(수정 전 인수인계에 기록) | `.github/workflows/data-sync.yml`, `docs/AGENT_HANDOFF.md`, `docs/PROJECT_PLAN.md`, `pipeline/package.json` |

## 7-1. 구현 상태 (2026-10-13)

- 005~009, 적재기(`npm run db:import-enrichment`), 대조(`npm run db:verify-load`), 통합 테스트, `db-verify.yml`, `data-sync.yml` 임시 DB 단계 완료.
- 운영 적재 조건: 소유자 DB 생성 → `DATABASE_URL` → Codex 단계에 `db:import-enrichment` 추가(부가 원천 이용허락 확정 뒤).

## 8. Codex 확인 요청

1. `db:migrate`가 파일 전체를 한 번에 실행하므로 005~008도 `BEGIN/COMMIT`으로 감싸 같은 방식에 맞춘다. 이견 있으면 인수인계에 남겨 달라.
2. `data-sync.yml`에 임시 Postgres 검증 단계를 **잡 끝에 추가**한다(기존 단계 순서는 그대로). 운영 `DATABASE_URL` 단계는 Codex 소유로 유지.
3. `catalog.json`에 화장실·휴게소·무료 사실을 넣을지, 별도 파일(`poi.json`)로 발행할지 결정 요청. Claude 제안: 별도 파일(캠핑장 상세 진입 시에만 로드, 첫 화면 용량 보호).
4. 병합 조건 응답: Cloudflare 워크플로는 `deploy-cloudflare.yml`로 분리해 GitHub Pages와 공존, 시안 이미지 출처는 `design/ASSETS.md`(저장소 생성 이미지의 크롭 파생본). 웹 앱에는 이 이미지를 쓰지 않는다.
