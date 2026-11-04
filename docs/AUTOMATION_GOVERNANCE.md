# 자동화 운영·충돌 방지 규칙

## 결론

Git 자체나 맥 자체가 단독 원인은 아니다. GitHub Actions와 맥미니가 같은 공개 데이터·미디어·발행 경로를 동시에 쓰는 운영 구조가 원인이었다. 이 문서는 수집 실패와 발행 실패를 분리하고, 어느 한 작업이 전체 배포를 붙잡지 않도록 하는 공통 계약이다.

## 1. 하나의 발행 큐

- `letscamp-data-publish`: `land-on-main.sh`, `publish-incremental`, `git push`로 공개 데이터를 쓰는 모든 GitHub Actions가 공유한다.
- `letscamp-media-publish`: `media` 브랜치에 사진을 쓰는 작업이 공유한다.
- `cancel-in-progress: false`를 유지한다. 앞 작업이 끝난 뒤 다음 작업이 순서대로 실행되며, 최신 결과를 임의로 취소하지 않는다.
- `pipeline/scripts/check-automation-governance.mjs`가 새 writer workflow의 공유 그룹 누락을 CI에서 차단한다.

## 2. 수집·검토·발행의 경계

- 외부 API·후기·사진 판독 실패는 해당 원천의 대기열(`data/quality/review-queue.json`, `pipeline/registry/data-enrichment-queue.json` 등)에 남기고 기존 값을 유지한다.
- `field-guard`, `coverage-guard`, `publish-sanity`, `value-sanity`, `release-gate`를 통과한 결과만 공개 카탈로그에 착지한다.
- `pipeline/scripts/release-gate.mjs`는 중복 ID, 이름 누락, 좌표 이상, 비정상적으로 작은 카탈로그를 발행 직전에 차단하고 `pipeline/out/release-gate.json`에 판정 결과를 남긴다.

## 3. 비동기 미디어·후기

- 미디어 브랜치/R2 조회에는 명령별 timeout이 있다. 실패하거나 timeout이면 텍스트·공공데이터 발행은 계속하고 사진 단계만 보류한다.
- 사진·후기·주변시설은 기존 값을 줄이지 않고 후보·판정 대기열로 누적한다.

## 4. 메인 착지

- 자동화는 `bot/data-*` 임시 브랜치에서 커밋한다.
- `.github/scripts/land-on-main.sh`가 최신 main에 재배치하고 field-guard로 기존 값을 복원한 뒤, 필수 Web quality 검사를 통과하면 병합한다.
- 자동화가 main에 직접 push하지 않는 것을 원칙으로 한다. 단, `collected-data`·`media`는 각각의 누적 브랜치 정책에 따라 force/lease push하며 이후 공개 발행 게이트를 거친다.

## 5. 맥미니 nightshift

- `com.letscamp.nightshift` 하나만 렛츠 캠핑 자동화로 등록한다.
- launchd·cron을 자동 발견하되, 발견된 예약 시각만으로 맥 전체를 차단하지 않는다. 실제 프로세스 실행과 CPU 부하를 확인하고, 사용자가 `~/.letscamp/avoid.txt`에 직접 기록한 예약만 강제 회피한다.
- `~/.letscamp/run.lock`으로 nightshift 중복 실행을 막고, 작업별 deadline·SIGTERM·SIGKILL로 무한 실행을 막는다.
- CultureFlow·Newsboard 등 다른 서비스의 예약은 삭제하거나 변경하지 않는다. 실제 실행 중이면 nightshift가 양보한다.

## 운영 확인 명령

```bash
gh run list --limit 20
gh workflow list
node pipeline/scripts/check-automation-governance.mjs
node ~/.letscamp/camp/local/macmini/detect-existing.mjs
node ~/.letscamp/camp/local/macmini/nightshift.mjs --dry-run
launchctl list | grep letscamp
```
