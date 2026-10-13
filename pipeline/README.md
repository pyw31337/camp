# pipeline — 공공 데이터 수집과 예약 오픈 캘린더

의존성 없는 Node 22 스크립트 모음이다. GitHub Actions(`data-sync.yml`)가 매일 실행하고 결과를 아티팩트로 올린다.

| 경로 | 역할 |
| --- | --- |
| `registry/booking-rules.json` | 예약 제공자와 오픈 규칙. **사람이 공식 원문을 확인해 PR로 수정**한다. 규칙마다 `source.url`·`checked_at`·`tier`가 필수이고, E 등급(제보·블로그)은 등록할 수 없다. |
| `lib/booking-windows.mjs` | 규칙 → 캘린더 이벤트 계산, 레지스트리 검증 |
| `lib/gocamping.mjs` | 고캠핑 API 전체 페이지 수집, 상품 유형·사이트 규격·바닥 정규화 |
| `lib/ics.mjs` | 캘린더 구독 피드(`out/ics/all.ics`, `provider-*.ics`) 생성. 하루 전·10분 전 알림 포함, 시각 미확정 일정은 종일 일정 |
| `lib/kst.mjs` | 실행 환경 시간대와 무관한 KST 계산 |
| `lib/postgres-context.mjs` | 화장실·이동 시설·무료 후보·예약 규칙을 출처별 실행 이력과 함께 적재 |
| `scripts/*` | `npm run validate`, `npm run calendar -- [일수] [기준일]`, `npm run sync:gocamping`, DB 명령 |

```bash
cd pipeline
npm test
npm run validate
npm run calendar -- 90 2026-10-12   # out/open-calendar.json
npm run ics -- 120 2026-10-12       # out/ics/*.ics
DATA_GO_KR_SERVICE_KEY=... npm run sync:gocamping   # out/campgrounds.json
DATABASE_URL=postgres://... npm run db:migrate      # db/001~007 순서 적용
DATABASE_URL=postgres://... npm run db:import-gocamping # 정규화 스냅샷을 시설·상품·규격·원천 증빙으로 적재
DATABASE_URL=postgres://... npm run db:import-context   # 화장실·도로 시설·무료 후보·예약 규칙/일정 적재
```

`db:import-gocamping`은 `out/campgrounds.json`을 입력으로 사용한다. 외부 식별자(`gocamping:contentId`)로 재실행 가능하며, 고캠핑이 제공하지 않는 가격·정원·실시간 재고는 만들지 않는다. 사이트 규격은 API가 어느 상품에 적용되는지 식별하지 않으므로 `고캠핑 · 사이트 규격(분류 미확정)` 아래에 별도로 적재한다. 운영 연결 문자열은 `DATABASE_URL` 비밀값으로만 전달하고 저장소·정적 카탈로그에 쓰지 않는다.

`db:import-context`는 `out/toilets.json`, `out/campground-toilets.json`, `out/rest-stops.json`, `out/public-free-candidates.json`, `out/open-calendar.json`과 두 레지스트리를 읽는다. 행안부 원천 화장실이 100건 이상 정상 수신된 경우에만 전체 캠핑장-화장실 연결을 교체한다. 예약 오픈 일정은 실제 재고가 아니므로 `availability_snapshot`에 쓰지 않는다. 무료 후보는 세 조건 모두 확인될 때까지 `free_camp_assessment`의 검토 상태로 남는다.

## 규칙 추가 방법

1. 공식 예약 사이트의 공지·FAQ 원문을 연다(블로그·카페 인용 금지).
2. `rules`에 항목을 추가하고 `schedule.kind`를 고른다: `MONTHLY_OPEN`, `MONTHLY_LOTTERY`, `MONTHLY_REOPEN`, `WEEKLY_OPEN`, `DAILY_ROLLING`, `API_WINDOW`.
3. 원문에 시각이 없으면 `*_time`을 `null`로 두고 `*_note`에 원문 표현(예: “오전까지”)을 적는다. 추정해서 채우지 않는다.
4. 언론 보도처럼 공식 원문을 직접 보지 못했으면 `tier: "C"`로 둔다. 캘린더에 ‘확인 필요’로 표시된다.
5. `npm test && npm run validate` 통과 후 PR.
