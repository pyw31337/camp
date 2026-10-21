# 에이전트 안내

이 저장소의 작업 규칙은 [`AGENTS.md`](AGENTS.md)에 있다. 반드시 먼저 읽는다.

**필수: 데이터 누적 병합 정책** — [`docs/DATA_MERGE_POLICY.md`](docs/DATA_MERGE_POLICY.md)

- 공유 데이터에 쓸 때 기존 값을 지우거나 리셋하지 않는다.
- 우선순위: ① 빈 칸 채우기 ② 더 믿을 만하거나 더 최근일 때만 덮어쓰기(옛 값은 기록) ③ 논리 검사 ④ 서비스 표기로 정제.
- 코드에서는 `pipeline/lib/merge-policy.mjs`를 쓴다.
- 값을 지우는 PR은 필수 검사(`field-guard`)에서 막힌다. 의도한 정정은 `pipeline/registry/merge-overrides.json`에 이유와 함께 적는다.
