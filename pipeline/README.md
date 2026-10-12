# pipeline — 공공 데이터 수집과 예약 오픈 캘린더

의존성 없는 Node 22 스크립트 모음이다. GitHub Actions(`data-sync.yml`)가 매일 실행하고 결과를 아티팩트로 올린다.

| 경로 | 역할 |
| --- | --- |
| `registry/booking-rules.json` | 예약 제공자와 오픈 규칙. **사람이 공식 원문을 확인해 PR로 수정**한다. 규칙마다 `source.url`·`checked_at`·`tier`가 필수이고, E 등급(제보·블로그)은 등록할 수 없다. |
| `lib/booking-windows.mjs` | 규칙 → 캘린더 이벤트 계산, 레지스트리 검증 |
| `lib/gocamping.mjs` | 고캠핑 API 전체 페이지 수집, 상품 유형·사이트 규격·바닥 정규화 |
| `lib/kst.mjs` | 실행 환경 시간대와 무관한 KST 계산 |
| `scripts/*` | `npm run validate`, `npm run calendar -- [일수] [기준일]`, `npm run sync:gocamping` |

```bash
cd pipeline
npm test
npm run validate
npm run calendar -- 90 2026-10-12   # out/open-calendar.json
DATA_GO_KR_SERVICE_KEY=... npm run sync:gocamping   # out/campgrounds.json
```

## 규칙 추가 방법

1. 공식 예약 사이트의 공지·FAQ 원문을 연다(블로그·카페 인용 금지).
2. `rules`에 항목을 추가하고 `schedule.kind`를 고른다: `MONTHLY_OPEN`, `MONTHLY_LOTTERY`, `MONTHLY_REOPEN`, `WEEKLY_OPEN`, `DAILY_ROLLING`, `API_WINDOW`.
3. 원문에 시각이 없으면 `*_time`을 `null`로 두고 `*_note`에 원문 표현(예: “오전까지”)을 적는다. 추정해서 채우지 않는다.
4. 언론 보도처럼 공식 원문을 직접 보지 못했으면 `tier: "C"`로 둔다. 캘린더에 ‘확인 필요’로 표시된다.
5. `npm test && npm run validate` 통과 후 PR.
