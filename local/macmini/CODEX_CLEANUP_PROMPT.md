# 코덱스에게 줄 프롬프트 — 로컬 폴더 정리·깃 백업

맥미니에서 코덱스를 열고 아래 내용을 그대로 붙여 넣는다.

---

너는 이 맥에서 일하는 에이전트다. 주인(박영우)은 개발자가 아니다. 끝까지 알아서 처리하고, 결과는 쉬운 한국어로 보고해 줘.

## 목표
이 맥에 있는 **렛츠 캠핑 저장소(`pyw31337/camp`) 사본**을 모두 찾아서 두 가지를 한다.
1. 깃에 없는 작업을 GitHub에 백업한다.
2. 불필요한 파일(다시 만들 수 있는 것)을 지운다.

그리고 전후의 파일 수와 용량을 보고한다. 다른 PC에서 백지 상태로 이어 갈 수 있게 하는 것이 목적이다(`docs/SETUP_NEW_PC.md`).

## 할 일
1. **사본 찾기**: `~` 아래에서 `git remote -v`가 `pyw31337/camp`인 폴더를 모두 찾는다(`~/.letscamp/camp` 포함).
   ```bash
   find ~ -maxdepth 5 -name .git -type d 2>/dev/null
   ```
   찾은 폴더 중 원격이 pyw31337/camp인 것만 대상이다. 다른 프로젝트(cctv, cultureflow 등)는 건드리지 않는다.
2. **사본마다** 다음을 한다. 맥미니 야간 작업 클론(`~/.letscamp/camp`)은 1)·2)만 한다(작업 공간이라 지우면 다음 실행이 느려짐).
   1. `git fetch origin main`을 한다. 사본에 `scripts/local-maintenance.mjs`가 없으면 main에서 그 파일만 가져온다.
      ```bash
      git show origin/main:scripts/local-maintenance.mjs > /tmp/lm.mjs
      ```
      이후 명령의 `scripts/local-maintenance.mjs`는 `/tmp/lm.mjs`로 바꿔 쓴다.
   2. `node scripts/local-maintenance.mjs report`로 정리 전 상태를 기록한다.
   3. `node scripts/local-maintenance.mjs backup`(미리 보기)을 보고 문제가 없으면 `backup --apply`를 실행한다.
      - 깃에 없는 새 파일, 고친 파일, stash, 안 올린 커밋이 `backup/<기기>-<날짜>` 브랜치로 올라간다.
      - main에는 올리지 않는다.
      - 비밀로 보이는 파일(.env, 키 등)과 50MB가 넘는 파일은 올리지 않는다. 목록만 보고에 넣는다.
   4. `node scripts/local-maintenance.mjs clean`(미리 보기)을 보고 `clean --apply`를 실행한다.
      - 지우는 것: node_modules, 빌드, 캐시, OS 찌꺼기, git gc, main에 이미 합쳐진 로컬 브랜치.
      - 깃이 추적하는 파일과 깃에 없는 새 파일은 지우지 않는다.
   5. 정리 후 수치를 기록한다. 스크립트가 전후를 출력하고, `~/.letscamp/maintenance/`에도 남는다.
3. **되살리기 확인**(대표 사본 하나):
   ```bash
   (cd pipeline && npm ci) && (cd pipeline && node --test 2>&1 | tail -3)
   ```
   테스트가 통과하는지 본다.
4. **야간 작업 확인**: `launchctl list | grep letscamp`가 그대로인지 본다. `~/.letscamp`의 bin·env·avoid.txt·state.json은 지우지 않는다.

## 지킬 것
- main 브랜치에 직접 push하지 않는다. 백업은 `backup/...` 브랜치에만 올린다.
- 깃이 추적하는 파일, 주인의 다른 폴더·프로젝트, `~/.letscamp` 설정은 지우지 않는다.
- 비밀(키·토큰·.env)은 어디에도 올리지 않는다.

## 보고(쉬운 한국어)
- 사본별 표: 폴더, 정리 전 → 후(파일 수·용량, .git 크기), 지운 것 요약, 백업 브랜치 이름(있으면).
- 올리지 않은 비밀·큰 파일 목록(있으면).
- 주인이 더 할 일(없으면 "없음").
- 마지막에 **Claude에게 전달할 요약**을 코드 블록 하나로 붙인다. 넣을 것: 위 표, 백업 브랜치, `~/.letscamp/maintenance/` 파일 이름.
