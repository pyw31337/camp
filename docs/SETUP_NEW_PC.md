# 새 PC에서 백지 상태로 시작하기

이 저장소(GitHub `pyw31337/camp`)에 사이트 코드·화면 원본·수집 데이터·등록부·문서가 **전부** 들어 있다.
깃에 없는 것은 세 가지뿐이다.
- **다시 만들 수 있는 것**: `node_modules`, 빌드 결과, 캐시. 아래 명령으로 되살린다.
- **비밀**: API 키. GitHub Secrets에 보관한다.
- **맥미니 야간 작업 상태**: `~/.letscamp`. 설치하면 새로 생긴다.

## 1. 받기
```bash
xcode-select --install          # 맥: git·컴파일러(없을 때만)
brew install node gh            # Node 22 이상, GitHub CLI
gh auth login
gh repo clone pyw31337/camp -- --filter=blob:none   # 지난 판 데이터는 필요할 때만 받음(처음 받는 양이 수 GB → 수백 MB)
cd camp
```

## 2. 되살리기(다시 만들 수 있는 것)
```bash
(cd pipeline && npm ci)         # 수집·검증 도구
(cd camping-atlas && npm ci)    # 사이트 빌드 도구(배포는 GitHub이 하므로 고칠 때만)
```

## 3. 사이트 화면 고치고 미리 보기
- 원본: `design/renewal/app.js`, `style.css`, `shell.css`, `index.html`
- 발행본: `camping-atlas/public/`. 원본을 고친 뒤 아래 명령으로 반영한다.
  ```bash
  cp design/renewal/{app.js,style.css,shell.css} camping-atlas/public/
  node scripts/publish-explorer-pages.mjs --shell-only camping-atlas/public
  ```
- 미리 보기: `cd camping-atlas/public && python3 -m http.server 8765` → http://127.0.0.1:8765/
- 운영 기록 화면: `camping-atlas/public/log/index.html`(이 파일이 원본)

## 4. 검사(올리기 전에)
```bash
(cd pipeline && node --test)                              # 단위 테스트
bash camping-atlas/scripts/run-browser-tests.sh http://127.0.0.1:8765/   # 화면 테스트(CI와 같은 목록)
```

## 5. 비밀(깃에 올리지 않음)
GitHub → 저장소 Settings → Secrets and variables → Actions에 있다. 로컬에서 수집기를 직접 돌릴 때만 같은 이름의 환경 변수로 넣는다.

- Secrets
  - 카카오: `KAKAO_REST_API_KEY` · `KAKAO_JS_KEY`
  - 네이버: `NAVER_API_HUB_CLIENT_ID` · `NAVER_API_HUB_CLIENT_SECRET`
  - 공공데이터: `DATA_GO_KR_SERVICE_KEY` · `SEOUL_OPEN_API_KEY` · `EX_API_KEY`
  - 유튜브: `YOUTUBE_API_KEY`
  - Supabase: `SUPABASE_URL` · `SUPABASE_ANON_KEY` · `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`
  - DB: `DATABASE_URL` · `DATABASE_SSL`
- Variables(켜기·끄기·상한): `NAVER_API_ENABLED`, `NAVER_MONTHLY_CAP`, `NEARBY_PHOTOS_ENABLED`, `SHORTS_SYNC_ENABLED`, `THANKQ_ENABLED`, `GOCAMPING_*` 등

`.env` 같은 비밀 파일은 깃에 올리지 않는다. `scripts/local-maintenance.mjs backup`도 비밀로 보이는 파일은 자동으로 뺀다.

## 6. 맥미니 야간·주말 작업(선택)
`local/macmini/README.md`를 보고 `install.sh`를 한 번 실행한다. 코덱스에게 맡길 때는 `local/macmini/CODEX_PROMPT.md`를 쓴다.

## 7. 로컬 폴더 정리·백업
```bash
node scripts/local-maintenance.mjs report            # 상태: 추적 파일·깃에 없는 새 파일·다시 만들 수 있는 것·.git 크기
node scripts/local-maintenance.mjs backup --apply    # 깃에 없는 작업을 backup/<기기>-<날짜> 브랜치로 올림(main은 그대로)
node scripts/local-maintenance.mjs clean --apply     # node_modules·빌드·캐시·OS 찌꺼기 삭제 + git gc + main에 합쳐진 로컬 브랜치 정리
```
- 순서는 **backup → clean**이다.
- clean은 깃이 추적하는 파일과 깃에 없는 새 파일을 지우지 않는다.
- 전후 기록은 `~/.letscamp/maintenance/`에 남는다.
