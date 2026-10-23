# 코덱스에게 줄 프롬프트 — 맥미니 야간 작업 설치·점검

Claude는 클라우드에서 일해서 영우 님 맥미니를 만질 수 없다. 맥미니에서 도는 코덱스에게 아래 내용을 그대로 붙여 넣는다.

---

너는 이 맥미니에서 일하는 에이전트다. 주인(박영우)은 개발자가 아니다. 주인이 직접 해야 하는 일(브라우저 로그인 승인, 관리자 비밀번호 입력)만 짧게 부탁하고, 나머지는 네가 알아서 끝까지 처리한 뒤 결과를 쉬운 한국어로 알려 줘.

## 목표
GitHub 저장소 `pyw31337/camp`(캠핑장 정보 사이트 ‘렛츠 캠핑’)의 **맥미니 야간·주말 데이터 품질 작업(nightshift)**을 이 맥에 설치하고, 실제로 한 번 돌려서 잘 되는지 확인한다.
- 설명서: `local/macmini/README.md`, 설치 스크립트: `local/macmini/install.sh` (main 브랜치. main에 아직 없으면 `claude/zealous-johnson-an2enq` 브랜치에서 가져온다)
- 이 작업은 평일 18:00~다음 날 08:00, 주말·공휴일에만 돌고, 이 맥에 원래 있던 정기 작업을 피해서 돈다.

## 할 일
1. **준비물 확인·설치**: `xcode-select -p`(없으면 `xcode-select --install`), Homebrew, `brew install node gh ollama`, `brew services start ollama`. Node는 22 이상이어야 한다.
2. **GitHub 로그인**: `gh auth status`가 실패하면 `gh auth login --web --scopes repo,workflow`를 실행하고, 주인에게 "브라우저에서 승인 버튼만 눌러 주세요"라고 부탁한다.
3. **설치**: 저장소를 받아 `bash local/macmini/install.sh`를 실행한다(또는 README의 curl 한 줄).
   - Swift 컴파일(`vision-ocr.swift`)이 실패하면 오류를 읽고 **그 파일만 최소한으로 고친다**. 고친 내용은 `codex/macmini-fix` 브랜치에 커밋하고 PR을 연다. main에 직접 push하지 않는다.
4. **판독기 점검**:
   - 한글이 적힌 그림 하나를 만들거나 받아서 `~/.letscamp/bin/vision-ocr --ocr <그림>`이 한글 줄을 돌려주는지 본다. 예: 사이트의 캠핑장 사진, 또는 `textutil`·미리보기로 만든 PNG.
   - `ollama list`에 `qwen2.5vl` 모델이 있는지 본다. 없으면 메모리에 맞춰 받는다(16GB 이상이면 `qwen2.5vl:7b`, 그보다 적으면 `:3b`). 받은 모델 이름을 `~/.letscamp/env`에 `export LOCAL_VLM_MODEL=…`로 적는다.
5. **기존 로컬 작업 피하기 — 가장 중요**:
   - `node ~/.letscamp/camp/local/macmini/detect-existing.mjs`가 찾은 목록을 확인한다.
   - 자동으로 못 찾는 작업을 찾아 `~/.letscamp/avoid.txt`에 적는다. 대상: 너(코덱스)의 예약 작업·자동화, 주인이 손으로 띄워 두는 스크립트, 백업, 사진 동기화 등. 확인할 곳은 `crontab -l`, `~/Library/LaunchAgents`, 실행 중인 프로세스, 코덱스 설정의 예약 작업이다.
   - 형식은 README에 있다. 예: `평일 21:00 90 코덱스 정리`, `proc codex`.
   - 무엇을 적었는지 주인에게 목록으로 알려 준다.
6. **잠자기**: `pmset -g`에서 잠자기가 켜져 있으면 주인에게 관리자 비밀번호를 부탁하고 `sudo pmset -c sleep 0`을 실행한다.
7. **시험 실행(작게)**: `NEARBY_MAC_MAX=30 node ~/.letscamp/camp/local/macmini/nightshift.mjs --force nearby-photos`
   - `~/.letscamp/logs/오늘날짜.log`를 읽어 "판독기: CLIP O · Apple Vision O · 비전 모델 …"과 "통과 N장"을 확인한다.
   - GitHub에 `bot/data-macmini-nearby-photos` 브랜치·PR이 생기고 검사 통과 후 병합되는지 본다(10~20분 걸림).
   - 실패하면 원인을 고치고 다시 한 번만 시도한다.
8. **예약 확인**: `launchctl list | grep letscamp`로 등록됐는지 보고, `node ~/.letscamp/camp/local/macmini/nightshift.mjs --dry-run` 결과를 확인한다.

## 지킬 것
- 사이트 화면 코드(`design/`, `camping-atlas/`)는 건드리지 않는다.
- 공유 데이터 값을 지우지 않는다(`docs/DATA_MERGE_POLICY.md`). 데이터는 nightshift가 `land-on-main.sh`로만 올린다.
- 무료만 쓴다. 유료 API, 유료 모델, 로그인이 필요한 사이트 수집은 하지 않는다. robots.txt와 캡차는 우회하지 않는다.
- 주인 계정의 비밀번호·토큰을 파일이나 커밋에 적지 않는다.
- 주인이 쓰는 다른 프로그램이나 폴더를 지우거나 바꾸지 않는다. 야간 작업은 `~/.letscamp`만 쓴다.

## 끝나면 주인에게 보고(쉬운 한국어, 10줄 안쪽)
- 설치 성공 여부, 맥 메모리, 받은 비전 모델
- 찾아서 피하도록 적은 기존 작업 목록
- 시험 실행 결과(사진 몇 장 판독, 몇 장 통과, GitHub 반영 여부)
- 주인이 더 해야 할 일(없으면 "없음")
- 마지막에 **Claude에게 전달할 요약**을 코드 블록 하나로 붙인다. 넣을 것: 로그 마지막 30줄, `~/.letscamp/busy.json`의 sources, 고친 파일과 PR 주소.
