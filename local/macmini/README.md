# 맥미니 야간·주말 작업 (nightshift)

소유자 요청(2026-10-23): 맥미니는 평일 18시~다음 날 08시, 토·일·공휴일에 켜진 채 쉬고 있다. 이 시간에 **GitHub 무료 서버(GPU 없음·작업당 수 시간 제한)로는 못 하던 무거운 판독**을 돌려 데이터 품질을 올린다.

## 왜 맥미니인가

| | GitHub Actions(무료) | 맥미니 |
|---|---|---|
| 사진 판독 | CLIP ViT-B/32만(간판 글자 못 읽음, 표본 정확도 약 85%) | CLIP + **Apple Vision 한글 OCR(간판 글자 대조)** + **로컬 비전 모델(Ollama qwen2.5vl)** |
| 요금표 이미지 OCR | tesseract(한글 표에 약함) | **Apple Vision**(Neural Engine, 한글 표를 훨씬 잘 읽음) |
| 시간 | 작업당 최대 수 시간, 주 1회 3천 장 | 밤마다 수 시간, 주말 종일 — 밀린 것을 다 처리 |
| 비용 | 무료 | 무료(전기만) — 외부 API 호출 없음 |

## 하는 일(데이터 품질에 도움이 큰 순)

| 작업 | 언제 | 결과 파일 | 피하는 CI 시간(같은 파일) |
|---|---|---|---|
| `nearby-photos` 주변시설 검색 사진 판독: CLIP + 간판 글자 + 비전 모델. 통과한 사진만 상세 ‘주변시설’에 붙는다 | 20시간마다 | `pipeline/registry/nearby-photos.json` (`j.by: "mac"`) | 금 05:23 |
| `review-photos` 후기 사진 판정 밀린 것 전부(음식·인물·차 안 사진 숨김) | 20시간마다 | `photo-judgments.json` | 화 04:17 |
| `texts` 후기·카페·웹문서 글 판정 밀린 것 전부(식당·광고·부동산 글 숨김) | 20시간마다 | `text-judgments.json` | 화 04:17 |
| `operator-sites` 운영자 홈페이지 다시 읽기 + 요금표 이미지 Apple Vision OCR | 주말·공휴일, 6일마다 | `operator-site-snippets.json` | 일 03:41 |

결과는 데이터 봇과 같은 길(`.github/scripts/land-on-main.sh`)로 올린다: 최신 main 위로 옮기고, 줄어든 값은 field-guard가 되살리고, 검사(Lint and build·Rail swipe) 통과 후 병합. 다음 `data-sync`(매일 03:17)가 화면에 반영한다.

## 언제 돌고, 언제 쉬나(`nightshift.mjs`)

- launchd가 15분마다 깨우면, 아래를 모두 만족할 때만 작업 하나를 시작한다.
  - 평일 18:00~다음 날 08:00, 또는 토·일·공휴일(`holidays-kr.json` + `~/.letscamp/holidays.txt`).
  - 맥에 원래 있던 정기 작업(launchd·cron, `detect-existing.mjs`가 매일 다시 찾음)의 시작 10분 전부터 예상 시간 동안은 쉰다.
  - 그 작업의 프로세스가 돌고 있거나, 1분 평균 부하가 코어당 0.5 이상이면 쉰다.
- 끝낼 시각 = min(창 끝-10분, 작업 최대 시간, 같은 파일을 쓰는 CI 시각). 평일 아침 07:50 전에 반드시 멈춘다.
- 작업 중에도 1분마다 확인한다. 기존 작업이 시작되면 **양보**(중단). 판독은 중간 저장하므로 다음 차례에 이어서 한다.
- 실행 중에는 `caffeinate -i`로 잠들지 않게 하고, `nice 10`·낮은 디스크 우선순위로 돌린다.
- 작업 공간은 전용 클론(`~/.letscamp/camp`)이라 평소 쓰는 폴더를 건드리지 않는다.

## 설치(맥미니에서 한 번)

```bash
xcode-select --install          # 없을 때만(Swift 컴파일러·git)
brew install node gh            # Node 22 이상, GitHub CLI
gh auth login                   # repo·workflow 권한
brew install ollama && brew services start ollama   # 선택(권장): 로컬 비전 모델
curl -fsSL https://raw.githubusercontent.com/pyw31337/camp/main/local/macmini/install.sh | bash
sudo pmset -c sleep 0           # 권장: 전원 연결 시 잠자기 끄기
```

- 메모리 16GB 이상이면 `qwen2.5vl:7b`(약 6GB), 그보다 작으면 `qwen2.5vl:3b`를 받는다.
- 다시 실행해도 안전하다(업데이트).

## 기존 로컬 작업과 겹치지 않게 직접 적기 — `~/.letscamp/avoid.txt`

```
# <요일> <HH:MM> <분> <이름>
평일 21:00 90 코덱스 정리
매일 02:30 60 사진 백업
토,일 10:00 120 NAS 동기화
# 이 프로세스가 돌고 있으면 쉬기
proc codex
proc /Users/me/scripts/sync.py
```

적은 뒤 `node ~/.letscamp/camp/local/macmini/detect-existing.mjs`로 바로 반영된다. 하루에 한 번은 자동으로 다시 읽는다.

## 확인·끄기

- 로그: `~/.letscamp/logs/YYYY-MM-DD.log`, 마지막 결과: `~/.letscamp/status.json`
- 지금 돌릴 작업 미리 보기: `node ~/.letscamp/camp/local/macmini/nightshift.mjs --dry-run`
- 바로 한 번 돌리기(시간 무시): `node ~/.letscamp/camp/local/macmini/nightshift.mjs --force nearby-photos`
- 끄기: `bash ~/.letscamp/camp/local/macmini/uninstall.sh`

## 다음 후보

- 로컬 언어 모델(Ollama)로 후기·운영자 문장에서 사실 후보(반려견·전기 W·장작 등)를 원문 인용과 함께 뽑아 `data/quality/review-queue.json`에 올리기. 검토를 거쳐 판정하고, 바로 덮어쓰지는 않는다.
- 카드 대표 사진 후보를 비전 모델로 다시 확인하기(배치도·야경·텐트 사이트 우선).
