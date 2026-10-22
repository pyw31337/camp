# 에이전트 안내

이 저장소의 작업 규칙은 [`AGENTS.md`](AGENTS.md)에 있다. 반드시 먼저 읽는다.

**필수: 데이터 누적 병합 정책** — [`docs/DATA_MERGE_POLICY.md`](docs/DATA_MERGE_POLICY.md)

- 공유 데이터에 쓸 때 기존 값을 지우거나 리셋하지 않는다.
- 우선순위: ① 빈 칸 채우기 ② 더 믿을 만하거나 더 최근일 때만 덮어쓰기(옛 값은 기록) ③ 논리 검사 ④ 서비스 표기로 정제.
- 코드에서는 `pipeline/lib/merge-policy.mjs`를 쓴다.
- 값을 지우는 PR은 필수 검사(`field-guard`)에서 막힌다. 의도한 정정은 `pipeline/registry/merge-overrides.json`에 이유와 함께 적는다.

**필수: 데이터 품질 표준 프로세스** — [`docs/DATA_QUALITY_PROCESS.md`](docs/DATA_QUALITY_PROCESS.md)

- 작업 전 `node pipeline/scripts/agent-board.mjs list`로 다른 에이전트의 선점·질문을 확인하고, 바꿀 파일을 `claim`한다.
- 값이 엇갈리면 `data/quality/review-queue.json` → 원문 대조 → `quality-decide.mjs`로 판정한다(원문 URL 필수).
- 매일 `data/quality/REPORT.md`가 신뢰도·충돌·회귀를 알려 준다.

**필수: 정보량 점수 정렬** — [`AGENTS.md`](AGENTS.md) 📢 2026-10-23

- 목록·추천의 기본 순서는 카탈로그 `c.iq`(0~100, `pipeline/lib/info-score.mjs`) 높은 순이다. 자체 점수를 만들지 않는다.
- 다음 수집 우선순위는 `data/quality/info-score.json`의 `next_priorities`를 본다.
