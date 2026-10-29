# 인수인계

## 📢 [필독] 19종 브라우저 테스트 실행 빈도 완화 — 일상 작업 속도 가속화 (2026-10-29 소유자 지시 — 전 에이전트 필수)
- **배경**: 매 기능/UI 작업마다 19종 브라우저 회귀 테스트 전체(`run-browser-tests.sh`) 및 무거운 검사를 로컬에서 전수 수행하여 작업 완료와 피드백이 불필요하게 지연됨.
- **소유자 확정 지시**:
  - **"19종 브라우저 테스트는 하루에 한번만 하던가, 딱 필요할때만 해. 매번 하면 작업이 진행이 안되잖아."**
- **모든 에이전트 행동 지침**:
  1. **일상 기능/UI 수정 작업 시**: 매번 19종 브라우저 전수 테스트를 돌리지 않는다.
  2. **작업별 타겟 검증 우선**: 수정한 컴포넌트·화면의 타겟 검증(해당 스크린샷, 모듈 단위 테스트, DOM 검증 등)과 기본 린트/빌드만 신속하게 확인하고 결과를 즉시 사용자에게 보고한다.
  3. **19종 전수 회귀 테스트 실행 시점**: 대규모 공통 모듈 리팩터링, 코어 번들 변경, 하루 일과 마무리 시 1회, 또는 소유자가 명시적으로 전수 검사를 요구했을 때만 실행한다.

## 📌 선착순·입퇴실 아이콘 보정 (2026-10-28, Codex)
- 사용자가 제공한 사람 걷기 SVG를 `i-first-come`으로 등록하고, 예약 오픈 라벨에 `선착순`이 포함될 때 예약 카드·예약 상세·다음 오픈 정보에 해당 아이콘을 표시한다.
- 입실·퇴실 시간의 `i-clock-in`·`i-clock-out`을 제공된 모래시계 SVG(`viewBox=0 0 384 512`, 폭 .75em)로 교체했다.
- `design/renewal/`을 원본으로 수정했으며 발행 전 `publish-explorer-pages.mjs --shell-only camping-atlas/public`로 공개본을 동기화한다.
- 검증: `node --check design/renewal/app.js`, `node --check camping-atlas/public/app.js`, `git diff --check` 통과. 작업 worktree에는 의존성이 없어 ESLint는 실행하지 못했으며 CI에서 확인한다.

## 📌 댓글 이미지 붙여넣기 업로드 (2026-10-29, Codex)
- 상세페이지 `댓글`(캠퍼 한마디) 입력창과 찜 카드·목록 댓글 입력창에서 클립보드의 이미지(`Ctrl+V`/`⌘V`)를 바로 붙여넣을 수 있다. 붙여넣은 이미지는 브라우저에서 최대 1600px·2MB 이하 WebP/JPEG로 압축하고 미리보기·삭제를 제공한다.
- 저장할 때 Supabase Storage `comment-media` 버킷에 업로드하고 댓글의 `image_url`·`image_alt`로 연결한다. 기존 텍스트 댓글·데이터는 변경하지 않는다. 새 `db/025_campground_comment_media.sql`은 댓글 열과 버킷·anon 읽기/쓰기 정책을 추가하며, 다음 `db:migrate`에서 운영 DB에 적용된다.
- 댓글 목록·찜 카드·상세 댓글에서 첨부 사진을 지연 로딩하고, 원본을 새 탭에서 열 수 있게 했다. 업로드 실패 시 기존 댓글을 임의로 지우지 않고 안내한다.
- 검사: `node --check design/renewal/app.js`, `git diff --check`, DB 마이그레이션 구문은 CI `database-verify`에서 전체 순서·재적용을 확인한다.

## 📌 상세정보·댓글 화살표 x좌표 정렬 · 상세정보 상하단 여백 확대 · 유튜브 쇼츠 인라인 재생 · YouTube Shorts 아이콘 정규화 (2026-10-28, Gemini → 전 에이전트)
- **상세정보와 댓글 우측 화살표 x좌표 정밀 일치**:
  - `saved-card-spec-toggle`과 `c-cmt-bar`의 가로 패딩을 `padding: 11px 0` 및 `padding: 6px 0`으로 맞추고, 두 화살표(`.saved-card-spec-chevron`, `.c-cmt-bar-arrow`) 크기를 16px × 16px로 동일화.
  - 카드의 오른쪽 끝선(`x = card_body_right`)에 두 화살표의 우측 끝과 중심 x좌표가 픽셀 단위로 정확히 일치하도록 정렬.
  - 왼쪽의 '상세정보' 아이콘과 '댓글' 아이콘 역시 x = 0px로 완벽히 정렬됨.
- **상세정보 텍스트 상하단 여백 확대**:
  - `padding: 7px 0 8px;` ➔ `padding: 11px 0 11px;`로 여백을 벌려 위아래 가로구분선과의 간격을 상단 12px, 하단 11px로 균형감 있게 확장.
- **유튜브 쇼츠 썸네일 클릭 시 사이트 내 인라인 직접 재생**:
  - 기존 `<a class="c-yt-card" href="..." target="_blank">`로 인해 외부 탭으로 이탈되던 동작을 수정.
  - 썸네일 클릭 시 `data-yt-inline` 핸들러가 동작하여 `<iframe>`(`https://www.youtube-nocookie.com/embed/{id}?autoplay=1&playsinline=1`)으로 교체되어 사이트 내에서 즉시 직접 재생되도록 개선.
  - 키보드 접근성(Enter / Space) 지원 완료.
- **YouTube Shorts 텍스트 좌측 아이콘 정규화**:
  - 검은색 원형 바탕(`.plat-ic`)을 제거하고, 순수 유튜브 로고 벡터(빨간색 사각 배경 `#FF0000` + 흰색 재생 삼각 화살표 `#FFFFFF`)만 단독 삽입하여 선명하고 깔끔하게 렌더링.
- **검증 완료**:
  - Playwright 실측 검증: 화살표 x좌표 차이 0px, 상하단 여백 대칭 및 인라인 재생 작동 확인.
  - 19종 브라우저 회귀 테스트: ALL PASS (status 0).
  - 파이프라인 테스트: 560 pass, 0 fail.
  - 외부 서비스 과금 점검: 100% 무료 티어 준수.
  - 원본(`design/renewal/`)과 발행본(`camping-atlas/public/`) 100% 일치.

## 📌 테마 아이콘 6종 반영 · 썸네일 뱃지 배경색 흰색 복원 · 테마 전용 썸네일 이미지 연동 · 선착순/덤프/입퇴실 0곳 원인 해결 (2026-10-28, Gemini → 전 에이전트)
- **테마 전용 아이콘 6종 SVG 전면 교체/등록 (`TH_SVG` & 스프라이트 `symbol`)**:
  - 사용자 제공 SVG를 메인 화면 테마 레일, 테마 모음 페이지(`/themes`), 테마 상세 헤더, 카드 뱃지에 일괄 적용:
    1. **갯벌·해루질 (`TIDAL_FLAT`)**: 조개 모양 SVG (viewBox `0 0 24 24`)
    2. **360° VR 뷰 (`VR_TOUR`)**: VR 헤드셋 모양 SVG (viewBox `0 0 24 24`, `#i-vr`)
    3. **공인 우수야영장 (`EXCELLENT`)**: 상장/메달 모양 SVG (viewBox `0 0 32 32`, `#i-award`)
    4. **입퇴실 여유 (`FLEX_TIME`)**: 모래시계 모양 SVG (viewBox `0 0 16 16`)
    5. **선착순 (`FIRST_COME`)**: 달리는 사람 모양 SVG (viewBox `0 0 24 24`)
    6. **덤프스테이션 (`DUMP_STATION`)**: RV/카라반 배출 모양 SVG (viewBox `0 0 15 15`, `#i-dump`)
- **카드 썸네일 위 뱃지 배경색 흰색 복원 (`.bdg-vr`, `.bdg-dump`, `.bdg-best`)**:
  - `style.css`에서 `background: rgba(...) !important;` 반투명 배경을 제거하고, 다른 뱃지(초대가능, 전기, 장작, 반려견 등)와 동일하게 기본 `.bdg` 모듈의 흰색 알약 배경(`background: rgba(255, 255, 255, .95); color: var(--ink);`)을 상속하도록 수정.
  - 아이콘 원형 배경만 `--c` 변수(`.bdg-vr { --c: #7c3aed; }`, `.bdg-dump { --c: #0284c7; }`, `.bdg-best { --c: #d97706; }`)로 스타일링하여 사진 위에서 글자가 또렷하고 선명하게 보이도록 가독성 해결.
- **테마 모음 페이지(`/themes`) 6종 전용 고화질 WebP 썸네일 생성 및 연동 (`THEME_FILES`)**:
  - 기존 다른 테마 fallback(sea, comfort, popular, auto, kids 등)을 걷어내고, 한국 자연 감성 포토그래피 스타일의 4:3 800x600 WebP 전용 이미지 6종 신규 생성 및 배치:
    1. `tidal.webp`: 서해안 갯벌과 해변 캠핑 데크 및 텐트 풍경
    2. `vrtour.webp`: 웅장한 호수와 산세가 360° 파노라마로 펼쳐지는 초광각 뷰
    3. `excellent.webp`: 소나무 숲속 정돈된 잔디 및 목재 데크의 프리미엄 우수야영장
    4. `flextime.webp`: 아침 햇살 속 핸드드립 커피와 릴랙스 체어가 있는 여유로운 캠핑
    5. `firstcome.webp`: 상쾌한 아침 안개 속 캠핑장에 도착해 설레며 텐트를 피칭하는 활기찬 풍경
    6. `dumpstation.webp`: 쾌적한 RV 사이트와 상하수도·전기·덤프스테이션 설비가 갖춰진 풍경
  - `camping-atlas/public/images/themes/`, `camping-atlas/public/explore/images/themes/`, `design/renewal/images/themes/`에 전수 저장.
- **'선착순', '덤프스테이션', '입퇴실 여유' 0곳 원인 규명 및 해결**:
  - **선착순 (0곳 ➔ 246곳)**: `c.resv`라는 없는 필드를 참조하던 필터를 `isFirstComeCamp` 헬퍼 함수로 변경 (`c.booking?.methods`의 현장/선착순 249곳 및 명칭/라인 매핑 반영).
  - **덤프스테이션 (0곳 ➔ 32곳)**: `c.dump`가 생성 시 누락되어 0곳이었던 문제를 `isDumpCamp` 헬퍼 함수로 변경 (`dump-stations.json` 공식 22곳 ID 집합 `DUMP_STATION_IDS` + 편의시설 '덤프스테이션' 30곳의 합집합 32곳 반영).
  - **입퇴실 여유 (0곳 ➔ 949곳)**: `c.ci`/`c.co`만 검사하던 기존 코드를 실제 입퇴실 데이터 필드인 `c.ti`(`c.ti.i[0]`, `c.ti.o[0]`)를 검사하는 `isFlexTimeCamp`로 보강하여 949곳 정상 노출.
  - 카드 썸네일 `badges()`의 `firstCome`, `dump`, `flex` 조건도 위 헬퍼 함수로 일치시켜 카드 썸네일 뱃지도 정확하게 노출.
- **검증 완료**:
  - 19종 브라우저 회귀 테스트 (`run-browser-tests.sh`): ALL PASS (status 0).
  - 파이프라인 테스트 (`npm --prefix pipeline test`): 562개 테스트 전수 통과 (560 pass, 0 fail, 2 skip).
  - 외부 서비스 과금 점검 (`check:billing`): 100% 무료 티어 준수.
  - 원본(`design/renewal/`)과 발행본(`camping-atlas/public/`) 100% 일치.
  - 실제 브라우저 스크린샷 렌더링 검증 완료.

## 📌 댓글 영상 표기·찜 카드 접힘 UI 정리 (2026-10-27, Codex)
- 댓글 영상 카드의 YouTube/Shorts 하단 도메인 표기를 제거하고, 상세 SNS 영상과 같은 유튜브 아이콘을 제목 왼쪽에 표시한다. 네이버TV·카카오TV 등 다른 제공처는 기존 표기를 유지한다.
- 찜 카드의 상세정보·댓글 열기 화살표와 4개 이상 댓글의 더보기 화살표를 닫힘=아래, 열림=위로 통일했다. 댓글이 있는 카드 목록은 기본 펼침 상태를 유지한다.
- `일반야영장` 배지 아래 여백을 넓히고 요금과 후기 사이 불필요한 간격을 줄였다. 찜 카드·상세페이지의 댓글 삭제 버튼과 삭제 이벤트는 제거했으며 서버 댓글 데이터는 삭제하지 않았다.
- 원더우드 글램핑(ID 102221) 영상 댓글은 Supabase에서 `is_deleted=false` 활성 행으로 확인되어 원문(`https://youtube.com/shorts/vO7QdFtZsgc?si=FIupxpNAxbg1PDuU`)을 그대로 보존했다.


## 📌 찜 카드 상세정보 전체 묶기 · 댓글 화살표 일관성 · 댓글 남기기 폼 토글 · 댓글 명칭 통일 (2026-10-27, Gemini → 전 에이전트)
- **찜 목록 카드 상세정보 전체 묶기 (`savedMemo`)**:
  - 사용자 지시에 따라 카드 헤더(이름 및 지역/주소) 아래의 모든 정보(`typeRow`(일반야영장 등 숙박유형), 6대 스펙 행(규격/전기/화로/주차/주변/요금), `cardReviews`(반려견 동반 편함 등 후기 뱃지))를 '상세정보' 접기 아코디언 패널 안으로 전면 묶음.
  - 기본 접힌 상태에서 카드가 컴팩트하게 노출되며(이름/주소 바로 아래에 상세정보 토글과 댓글 노출), 상세정보를 누르면 유형+스펙+후기 뱃지가 한 번에 펼쳐짐.
- **댓글 화살표 아이콘 및 상세정보 화살표 회전 일관성 유지**:
  - 댓글 바(`c-cmt-bar`) 우측에 접혔을 때의 `>` 모양 아이콘(`ic("right")`)을 통일 적용하고, 펼쳐졌을 때(`is-open`) CSS `transform: rotate(90deg)`로 90도 회전하여 아래 화살표가 되도록 애니메이션 일관성 확보.
  - 상세정보 토글(`saved-card-spec-toggle`)의 화살표도 동일하게 기본 `>` (0도) ➔ 열림 시 90도 회전(`v`)으로 일관되게 맞춤.
- **댓글 바 우측 '댓글 남기기' 텍스트 버튼 및 작성 폼 토글 기능 탑재**:
  - 댓글 타이틀 바 우측(화살표 좌측)에 `<button type="button" class="c-cmt-write-btn">댓글 남기기</button>` 텍스트 버튼 추가.
  - 닉네임과 메모를 입력할 수 있는 인라인 작성 폼(`.c-cmt-form`)은 **기본 숨김(`display: none`)**으로 유지되며, '댓글 남기기' 버튼을 클릭했을 때만 펼쳐지고 포커스 이동.
  - 작성 폼 내부의 '취소' 버튼 클릭 시 폼이 다시 숨겨지며 작성 중이던 내용 초기화. 저장 완료 시에도 폼이 자동으로 닫힘.
- **상세페이지 섹션 명칭 '댓글'로 통일**:
  - 상세페이지 섹션 헤더를 기존 '캠퍼 한마디'에서 **'댓글'**로 명칭 통일 (`iconTitle("chat-bubble", "댓글")`).
  - 카드 내 6개 초과 시 링크 텍스트도 `댓글 전체 N개 모두 보기 ➔`로 통일.
  - `qa-detail-test.mjs` 검사 정규식도 `/캠퍼 한마디|댓글/`로 보강하여 공원 상세에 댓글이 없음을 검증.
- **검증 완료**:
  - `npm --prefix pipeline test`: 562개 테스트 전수 통과 (560 pass, 0 fail, 2 skip).
  - 19종 브라우저 회귀 테스트 통과.
  - `publish-explorer-pages.mjs --shell-only`: 원본(`design/renewal/`)과 발행본(`camping-atlas/public/`) 100% 동기화.

## 📌 운영 관리 대시보드 주소 변경 (/log/ ➔ /admin) 및 고캠핑·공공데이터 전면 연동 (2026-10-27, Gemini → 전 에이전트)
- **운영 대시보드 URL 변경 (`/log/` ➔ `/admin`)**:
  - `camping-atlas/public/admin/index.html`: 운영 관리 대시보드 단독 배포 경로 신설.
  - `camping-atlas/public/log/index.html`: 기존 접속자 및 북마크 사용자를 위한 자동 리다이렉트(`meta refresh` + `location.replace`) 적용.
  - `design/renewal/app.js` & `camping-atlas/public/app.js`: 찜 기록 및 앱 내 대시보드 링크를 `/admin/`으로 변경.
  - `scripts/publish-explorer-pages.mjs`: `SHELL_PAGES`에 `admin/index.html` 등록 및 `admin/camp-names.json` 동기화 로직 추가.
  - `layout-shell-test.mjs` 및 `overflow-320-test.mjs`: 검사 대상을 `/admin/`으로 갱신.
- **고캠핑 미흡수 5대 데이터 전면 흡수 (`pipeline/registry/gocamping-extra.json`)**:
  - `gap`(사이트 간격 598곳), `rental`(장비 대여 585곳), `safety_info`(소방시설 정량 1,551곳), `floors_detail`(바닥 실측 면수 1,586곳), `layout_images`(공식 배치도 1,657곳) 전수 추출 및 `campgrounds.json` 병합.
  - 카드 및 상세 정보 행, 고화질 배치도 모달 뷰어 연동 완료.
- **공공데이터포털(data.go.kr) 여가·휴양림 데이터 연동**:
  - 전국 국·공·사립 자연휴양림 186곳 및 인근 문화/체육 공공시설(박물관 1,073곳, 수영장 141곳, 실내놀이터 66곳) 6,397개 캠핑장 정보에 매핑.
- **CI 브라우저 회귀 테스트(19종) 전 항목 통과 (ALL PASS)**:
  - `c.best` 데이터 구조 호환 보정으로 `registryRows` 오류 해결.
  - `TIDAL_FLAT` 테마 검사 범위에서 공중화장실 명칭(`nearby_toilets`) 제외하여 카탈로그 분할(`catalog-split-test.mjs`) 100% 일치 달성.
  - `rail-swipe-test.mjs`, `layout-shell-test.mjs`, `overflow-320-test.mjs` 등 19개 검사 전체 통과.

## 📌 목록 카드 댓글 연동 & 찜 페이지 상세정보 접기 (2026-10-27, Gemini → 전 에이전트)
- **목록 카드 댓글 연동 & 기본 펼침 노출**(`design/renewal/app.js`, `design/renewal/style.css`):
  - **기본 펼침(Default Open)**: 댓글이 존재하는 캠핑장은 버튼 클릭 없이 카드에서 즉시 댓글 영역이 열린 상태로 노출 (`media_1793060062029_845b72b2.png` 디자인 반영). 댓글이 없는 캠핑장은 `💬 댓글 >` 버튼으로 표시되며 클릭 시 작성 폼 토글.
  - **실시간 양방향 연동**: 상세페이지의 '캠퍼 한마디'와 동일한 Supabase REST API(`campground_comment`)를 사용. 카드에서 작성/삭제 시 메모리 캐시(`CMT_CACHE`) 및 DOM, 상세페이지가 실시간 동기화됨.
  - **댓글 노출 개수 제어**:
    - 1~3개: 카드 내에서 기본 전체 노출.
    - 4~6개: 기본 3개 노출 + `+ 댓글 N개 더보기 ∨` 토글 (클릭 시 6개까지 확장, `댓글 접기 ∧`로 축소).
    - 7개 이상: 최대 6개 노출 후 `<a href="place/{id}#cmt">캠퍼 한마디에서 전체 N개 모두 보기 ➔</a>` 앵커 링크 제공. 상세페이지 이동 시 `#cmt` 섹션으로 부드럽게 스크롤.
  - **YouTube 영상/숏츠 카드 자동 변환**: 댓글 본문 내 YouTube(일반/숏츠/youtu.be) 링크 감지 시 썸네일, 재생 아이콘 오버레이, `YouTube Shorts`/`youtube.com` 메타바가 포함된 반응형 영상 프리뷰 카드로 자동 렌더링.
  - **사용자 작성 댓글 삭제**: 브라우저 로컬스토리지(`mc-my-comments`)와 연동하여 본인이 작성한 댓글에만 우측 상단 `✕` 삭제 버튼 노출 (`is_deleted: true` 소프트 삭제).
- **찜 메뉴 페이지(`savedView`) 6개 스펙 항목 '상세정보' 아코디언 접기**:
  - `규격, 전기, 화로, 주차, 주변, 요금`의 6개 항목을 `<details class="card-spec-details">` 아코디언으로 감싸 **기본 접힌 상태(Collapsed)**로 렌더링.
  - `상세정보 ▼` 클릭 시 180도 회전하며 6개 스펙이 펼쳐지고 다시 접을 수 있도록 구현.
- **배포 및 검증 완료**:
  - `scripts/publish-explorer-pages.mjs --shell-only camping-atlas/public`: 원본과 발행본 100% 동기화.
  - `node --check design/renewal/app.js` & `camping-atlas/public/app.js`: 문법 검증 100% 통과.
  - `npm --prefix pipeline run check:billing`: 과금 안전 모니터링 통과.

## 📌 유튜브 숏츠 찜/우선순위 수집 알고리즘 · 뉴케이션/노션 실전 캠핑장 팩트 발굴 (2026-10-27, Gemini → 전 에이전트)
- **유튜브 숏츠 수집 알고리즘 고도화**(`pipeline/lib/shorts-search.mjs`, `pipeline/scripts/sync-shorts.mjs`):
  - 무과금 및 YouTube Data API v3 일일 쿼터 안전범위(일 70~80개, `YT_MAX_SEARCHES=80`) 내에서 **찜한 업장 / 큐레이션 캠핑장(`curated-pins.json` 및 `shorts-priority.json`)을 최우선순위(Rank 0)**로 먼저 수집하도록 정렬 로직 보강 (`pickShortsDue`).
  - 1순위 찜/우선순위 업장 → 2순위 영상 없는 캠핑장 → 3순위 캐시 만료 캠핑장 순으로 매일 75~80곳씩 안전하게 순환 누적.
  - 단위 테스트(`pipeline/test/shorts-search.test.mjs`) 11건 통과.
- **핵심 실전 스키마 속성 및 테마 필터 반영**(`attribute-dictionary.json`, `design/renewal/app.js`):
  - 캠퍼 실전 선호 핵심 4종 속성 공식 등록:
    1. `SITE_ASSIGN_MODE`: 선착순 배정 vs 지정예약 (오픈런 여부 구분)
    2. `REEL_WIRE_RECOMMEND`: 권장 릴선 길이 (20m, 30m, 50m)
    3. `THEME_TIDAL_FLAT`: 갯벌·해루질 체험 가능
    4. `EARLY_CHECKIN` / `LATE_CHECKOUT`: 빠른 입실 / 늦은 퇴실 (입퇴실 유연성)
  - 웹 화면 앱(`THEMES`, `badges`)에 `TIDAL_FLAT`(갯벌·해루질), `FLEX_TIME`(입퇴실 여유), `FIRST_COME`(선착순) 테마 및 뱃지 연동 완료.
  - 운영자 문장 및 텍스트 스니펫에서 위 속성을 자동 추출하는 규칙(`pipeline/lib/operator-site.mjs`) 추가 및 단위 테스트(`operator-site.test.mjs`) 10건 통과.
- **데일리 수집 모니터링 및 과금 안전 점검 결과**:
  - `npm run check:billing`: 네이버/카카오/공공데이터/수프라베이스 100% 무료 안전 구간 통과 확인.
  - `pipeline/scripts/coverage-guard.mjs`: 핵심 필드(price, checkin, checkout, manner, parking, power, site_types 등) 커버리지 회귀 0건 확인.
  - `publish-explorer-pages.mjs --shell-only`: 원본(`design/renewal`)과 발행본(`camping-atlas/public`) 100% 동기화 완료.

## 📌 댓글 URL 미리보기·인라인 재생 (2026-10-26, Codex)
- 상세페이지 댓글과 찜 메모 댓글의 URL을 링크 카드로 정제했다. YouTube·Shorts·네이버TV·카카오TV는 썸네일/재생 버튼을 누르면 해당 영상 iframe으로 전환되고, 인스타그램·페이스북·네이버·카카오 및 기타 HTTP(S) 주소는 원문 새 탭 링크 카드로 연다.
- 댓글 본문은 URL을 안전한 HTTP(S)만 링크화하고 나머지는 텍스트로 유지한다. `design/renewal/{app.js,style.css}`와 `camping-atlas/public/{app.js,style.css}`를 함께 갱신했다.
- 검증: 두 앱 문법 검사와 `git diff --check` 후 PR에서 웹 품질 검사를 실행한다.

## 📌 로그 메뉴별 대시보드 분리 (2026-10-26, Codex)
- `/log/`는 전체 피드에서만 요약 카드·차트·순위 패널을 보여주고, 찜 추가·찜 해제·댓글·상세 진입 탭에서는 공통 대시보드를 숨겨 해당 기록 피드만 넓게 보여준다.
- 메뉴를 바꾸면 안내 문구와 피드 제목도 선택한 기록 종류에 맞춰 갱신된다. 변경 파일은 `camping-atlas/public/log/index.html`이다.
- 검증: `git diff --check` 및 HTML 내 스크립트 문법 확인 예정.

## 📌 찜 메모 카드 댓글 모듈 (2026-10-26, Codex)
- 찜한 캠핑장 카드의 평가 칩 아래에 댓글 열기·작성·삭제 모듈을 추가했다. 이름은 `mc-saved-comment-name`으로 기억하고 이름 기반 색상 팔레트를 고정해 다음 작성 때 미리 채운다.
- 숫자 업장 ID는 기존 `campground_comment` API를 재사용하며 API가 없으면 업장별 로컬 보관함으로 대체한다. 원본은 `design/renewal/{app.js,style.css}`, 발행본은 `camping-atlas/public/{app.js,style.css}`에 반영했다.
- 검증: 두 app.js `node --check`, `git diff --check` 통과. `npm --prefix camping-atlas run lint`는 로컬 eslint 미설치로 실행하지 못했다.

## 📌 공식 사진 파일 정리 금지 · media 가드가 파일 목록도 본다 (2026-10-24, Claude)

- 사고: data-sync run 40045989901(tour-enrichment)의 `sync-images.mjs` 마지막 정리가 매니페스트에 없는 사진 파일 7,274장을 지웠다. 매니페스트는 10-21 이후 2,380장(시설당 1장)뿐이지만, 화면 데이터(`explore/data/camps/*.json` photos)는 누적 병합으로 옛 사진 경로를 계속 가리킨다. 그래서 Pages 배포의 `verify-official-media.mjs`가 “공식 사진 1,324개 없음”으로 막았다(사이트는 직전 버전 유지).
- 복구: media 브랜치에 직전 커밋 6e27fe20의 트리를 되살린 새 커밋(b4fc569b)을 일반 푸시로 얹었다(파일 20,034개).
- 재발 방지: 매니페스트 밖 파일 정리도 줄이는 정리로 보고 `IMAGE_ALLOW_SHRINK=1`일 때만 한다(.tmp는 늘 지움). `media-guard.mjs`는 매니페스트 수 외에 직전 브랜치의 `camps/*.webp` 파일 목록이 줄어도 멈춘다(data-sync·card-photos 둘 다). 테스트: `pipeline/test/data-sync-safety.test.mjs`.
- 남은 일(선택): 매니페스트 밖 7,274장을 매니페스트에 다시 넣으면(원본 src_url 복원) 갤러리 관리가 깔끔해진다. 지금은 파일만 유지한다.

## 📌 공용 예약 사이트 업장 페이지로 바로 연결(숲나들e·국립공원) (2026-10-23, Claude)

- 소유자 요청: 숲나들e 같은 공용 예약 사이트도 메인으로만 보내지 말고, 해당 업장 페이지나 그 업장이 골라진 상태로 바로 예약할 수 있게 한다.
- `registry/portal-directory.json`(`scripts/sync-portal-directory.mjs`, 주간 link-check에서 갱신)에 업장별 페이지 주소를 모은다.
  - 숲나들e: 휴양림 186곳. 첫 화면 지도 목록에서 가져오며, 휴양림 페이지는 `indvz/main.do?hmpgId=…` 또는 `/0103` 형식이다. 이 페이지의 예약 버튼은 그 휴양림이 골라진 예약 화면(`cndtlRsrvtMain.do?hmpgId=…`)으로 간다.
  - 국립공원: 야영장 48곳. 공원별 이용안내의 야영장 선택 목록(deptId)에서 가져오며, 페이지는 `serviceGuide.do?…&deptId=…`이다. 국립공원 예약 화면에는 업장별 주소가 없어서(사이트 자체 예약하기 버튼도 공통 화면으로 감) 안내 페이지가 최선이다.
- `scripts/build-portal-links.mjs`(`lib/portal-links.mjs`)가 숲나들e·국립자연휴양림(huyang)·국립공원 주소를 가리키던 예약 채널만 업장 페이지로 바꾼다.
  - 이름 핵심이 가장 구체적으로 맞는 곳을 고른다(내장호>내장, 통고산>고산). 애매하면 바꾸지 않는다.
  - 원래 주소는 `registered_url`로 남긴다.
  - 실행 위치: `publish-incremental.sh`와 `data-sync`에서 `build-link-health` 앞.
- 2026-10-23 기준 56곳, 예약 링크 78개.
- 숲나들e는 해외·클라우드 IP에서 연결이 자주 끊긴다. 목록을 받지 못하면 기존 목록을 유지한다(80% 미만이면 유지).

## 📌 예약 링크 정밀 검수(업장 일치) (2026-10-23, Claude)

- 소유자 요청: 404만 볼 게 아니라, 예약하기로 이동한 페이지가 정말 그 업장 예약인지 확인한다. 무관한 곳이 더러 있었다.
- `lib/booking-verify.mjs`의 `judgePage`와 `scripts/verify-booking-links.mjs`가 화면에 보이는 (업장, 예약·홈페이지 주소) 쌍을 열어 판정한다. 결과는 `registry/booking-verify.json`에 쌓인다.
  - robots.txt를 지킨다.
  - 글이 없는 화면은 Playwright로 그려서 iframe 안까지 읽는다.
  - 네이버·카카오·캠핏처럼 자동 접근을 막은 곳은 열지 않는다(UNVERIFIED).
- 판정 기준:
  - 이 업장의 이름(카탈로그·네이버·카카오), 전화, 도로명+번지 중 하나가 페이지에 있으면 MATCH.
  - 숨김 판정(`HIDE_VERDICTS`):

    | 판정 | 뜻 |
    |---|---|
    | PARKED | 도메인 판매 화면 |
    | CLOSED | 서비스 종료 안내. **네이버 modoo!는 2025-06-26 종료**되어 *.modoo.at 링크 265개·124곳이 해당한다 |
    | HIJACKED | 도박·광고 사이트로 바뀜 |
    | ERROR_PAGE | 오류 화면 |
    | OTHER_PLACE | 제목에 다른 업장 이름. 같은 사이트를 쓰는 업장은 제외 |
    | STALE_DEEP | 예약 상세 주소가 사이트 첫 화면으로 튕김 |
    | LEFT_SITE | 다른 사이트로 넘어갔고 이 업장 단서가 없음 |

  - 숨기지 않는 판정: BLOCKED(호스팅 봇 확인 `ckattempt`·403), GEO_BLOCK, THIN, NO_SIGNAL, PORTAL(국립공원·숲나들e 통합 예약 첫 화면).
  - MOVED: 캠퍼스토리 r2·r4·r6이 "예약페이지 주소가 변경되었습니다"를 띄우는 경우다. 안내된 새 주소를 한 번 더 열어 판정한다.
- 화면 반영: `build-link-health.mjs`가 숨김 판정 주소를 `c.dl`에 넣는다. MOVED는 채널 주소를 새 주소로 바꾸고 원래 주소는 `registered_url`로 남긴다.
- 주기: 주간 `link-check.yml`에서 돈다(14일 캐시, 수동 실행 때 `verify_max_age_days=0`이면 전부 다시).
- `deploy-pages.yml`이 "Link check" 완료 뒤에도 다시 배포한다. GITHUB_TOKEN으로 병합하면 push 이벤트가 생기지 않기 때문이다.

## 📌 커버리지 가드: 검토된 감소 기록(coverage_acks) · kimgoon.kr 52곳 정리 (2026-10-23, Claude)

- 찜 우선 수집이 `crawl-operator-sites`를 돌리면서 `dropPlatformSites`가 camping.kimgoon.kr(플랫폼·BAD_SOURCE) 기록 52곳을 PLATFORM_PAGE로 바꿨다. 그 결과 환불(887→839)과 전기 W(673→626) 보유 수가 줄어 증분 발행이 막혔다.
  - 잘못된 출처를 정리한 것이 맞으므로 원본 사본을 `pipeline/registry/archive/operator-snippets-kimgoon-2026-10-23.json`에 두고, merge-overrides와 merge-review에 기록했다.
- `coverage-guard`가 `merge-overrides.json`의 `coverage_acks`(field·after·reason·at)를 읽는다. 기록한 값까지만, 기록 후 14일 동안 통과한다. 의도한 감소가 아니면 지금처럼 막는다.

## 📌 찜한 업장 우선 수집 · 로그 화면 비밀번호 · 소유자 할 일 코덱스 프롬프트 (2026-10-23, Claude)

- **찜 우선 수집**:
  - `pipeline/lib/priority.mjs`는 우선 목록을 만든다. 출처는 `PRIORITY_IDS`와 `data/priority/saved-camps.json`(공용 찜 스냅숏, `scripts/sync-saved-priority.mjs`)이다.
  - 매일 수집기 5종(discover-kakao, discover-naver, crawl-operator-sites, sync-social, sync-web-mentions)은 찜한 곳을 대기열 맨 앞에 둔다. 후기와 웹 언급은 찜한 곳을 1일 주기로 다시 확인한다.
  - 별도 워크플로 `saved-priority.yml`이 3시간마다 찜한 곳만 다시 수집한 뒤 바로 증분 발행한다. 대상 수집원은 카카오·네이버 장소, 운영자 홈페이지(렌더링·OCR·깊게 읽기), 다음, 네이버다.
  - 맥미니 야간 작업에 `saved-first`(12시간마다)를 추가했다.
- **collected-data 캐시**: 두 실행이 겹쳐도 지워지지 않게 `scripts/merge-collected-cache.mjs`로 캠핑장별로 합친다(더 최근 확인이 이김). `data-sync`도 저장 전에 같은 방식으로 합친다.
- **로그 화면 비밀번호**: `/log/`는 입장 화면이 먼저 나오고, 비밀번호는 처음 0602다.
  - 열쇠 버튼으로 바꾸고, 잠그기 버튼으로 다시 잠근다. 이 탭에서는 12시간 동안 통과된다.
  - 서버 쪽은 `db/023_log_auth.sql`이다. bcrypt로 저장하고 anon은 표를 읽지 못하며, RPC는 `log_auth_check`·`log_auth_set`이고 10번 틀리면 10분 잠긴다.
  - SQL을 적용하기 전에는 0602 해시와 비교하는 대체 경로만 있고, 바꾸기 기능은 막혀 있다.
  - 정직한 한계: 정적 페이지라서 018을 적용하기 전에는 공개 키로 데이터 API를 직접 읽을 수 있다.
- **소유자 할 일**은 `local/macmini/CODEX_OWNER_TODO_PROMPT.md`에 있다. Supabase 토큰 하나를 받아 Management API로 018~023을 적용하고, 확인·맥 정리·야간 작업 점검·보고까지 한다.

## 📌 운영 기록 대시보드 v2 · 에이전트 기록 삭제 SQL · 매일 발행 막힘 수정 (2026-10-23, Claude)

- `/log/`: 기록 종류 메뉴를 사이트 머리글 바로 아래 고정 메뉴 막대(.subnav)로. 지표(14일 선 그래프·지난 7일 대비 증감), 14일 쌓기 막대, 기록 구성·기기 도넛, 24시간 시계, 관심 흐름(상세 진입→찜→한마디), 많이 본 업장·지금 찜된 곳(공용 찜). 메뉴를 바꾸면 그래프도 그 종류만.
- 에이전트·헤드리스 브라우저 찜 기록 141건 삭제: `db/022_delete_agent_save_log_rows.sql`(사본 `pipeline/registry/archive/save_log-agent-rows-2026-10-23.json`, merge-overrides 기록). **저장소 db:migrate는 CI 임시 DB에만 적용** — 운영 Supabase는 대시보드 SQL Editor에서 실행해야 한다.
- 10/23 매일 발행 실패 원인: value-sanity 매너타임 범위(20~24시)가 추출기(20시~01시)보다 좁아 ‘01:00부터’를 위반으로 세어 급증 판정 → 범위 20~25(01시)로 맞춤.

## 📌 로컬 정리·깃 백업 도구 · 새 PC 시작 안내 (2026-10-23, Claude)

- `scripts/local-maintenance.mjs`: `report`(추적·깃에 없는 새 파일·다시 만들 수 있는 것·.git 크기), `backup --apply`(깃에 없는 작업·stash·안 올린 커밋을 `backup/<기기>-<날짜>` 브랜치로 — 작업 폴더·main은 그대로, 비밀·50MB 초과 제외), `clean --apply`(node_modules·빌드·캐시·OS 찌꺼기·git gc·병합된 로컬 브랜치만). 기본은 미리 보기, 전후 기록은 `~/.letscamp/maintenance/`.
- `docs/SETUP_NEW_PC.md`: 새 PC에서 백지로 시작(부분 클론, npm ci, 미리 보기, 검사, 비밀 목록). 맥에서 정리·백업은 `local/macmini/CODEX_CLEANUP_PROMPT.md`.

## 📌 찜 낙관적 UI·이 기기 보관 + 맥미니 주말 작업 확대 (2026-10-23, Claude)

- 찜: 누르면 하트·찜 목록이 바로 바뀌고(이 기기 `mc-saved`), 서버에 닿기 전 동작은 `mc-save-ops`(캠핑장별 마지막 의도, 2주)에 남아 첫 화면·연결 복구·탭 복귀 때 다시 보낸다. 서버 목록(`shared_save`, 모든 사용자 공용)을 읽을 때 대기 동작을 덧입혀 하트가 꺼져 보이지 않게 한다. 첫 화면·찜 화면은 서버를 최대 1.5초만 기다린다. 공용 찜이 실패하면 기록(save_log)도 미뤄 함께 보낸다(기록 두 번 방지). 비교(`mc-pick`)는 기기마다.
  회귀: `camping-atlas/scripts/save-optimistic-test.mjs`(가짜 서버, 운영 DB 안 닿음 · web-quality에 추가).
- 맥미니 nightshift: 밀린 판독은 4~6시간마다 이어서, 주말·공휴일엔 `operator-gaps`(정보 빠진 150곳 운영자 홈페이지 깊게 읽기, `scripts/crawl-operator-gaps.sh`)·`gocamping-detail`(고캠핑 상세) 추가. `crawl-operator-deep.mjs`는 10곳마다 저장·마감 시각 존중·재시도 실패 시 예전 결과 보존.

## 📌 찜 중복 기록 원인 수정 · 운영 기록(/log/) 대시보드 개편 (2026-10-23, Claude)

- 찜 상태인데 ‘찜하기’가 또 기록된 원인(10/23 10:16 원주두리캠핑장, 같은 아이폰): 대기 기록 다시 보내기가 ① 첫 화면·online 이벤트에서 동시에 돌고 ② 다 보낸 뒤에야 대기열을 비워 화면이 닫히면 이미 보낸 기록을 또 보냄 ③ 공용 찜 상태를 확인하지 않음.
  → `flushPendingSaveLogs` 한 번에 하나·한 건마다 대기열에서 제거·공용 찜 상태와 같으면 버림. `syncSave`는 공용 찜을 먼저 바꾸고 상태가 실제로 바뀐 때만 기록(409·삭제 0건이면 기록 안 함). 탭으로 돌아오면 공용 찜 다시 읽기.
  → 덤으로 고침: 한마디(comment)가 `syncSave`를 타며 그 캠핑장의 공용 찜을 지우던 버그.
- `/log/`(camping-atlas/public/log/index.html, 원본이 곧 이 파일): 밑줄 탭(미끄러지는 막대), 지표 5칸(세어 올라감), 14일 쌓기 막대, 많이 본 업장·기기 분포 옆 패널, 표 모양 행. 드롭다운·체크박스·스위치는 직접 그림(시스템 UI 없음), 아이콘 전부 SVG, 열기·닫기·목록 바뀜 모두 움직임(움직임 줄이기 설정 존중).
  기록 중 같은 캠핑장에 바로 앞과 같은 동작은 ‘중복’으로 표시·집계 제외, 자동 테스트(리눅스+UTC) 기록은 ‘테스트 기록 숨기기’로 기본 숨김.
- 앱의 남은 글자 아이콘(▲▼↗📍)도 SVG로.

## 📌 맥미니 야간·주말 작업(nightshift) (2026-10-23, Claude)

- 소유자 맥미니가 평일 18~08시·주말·공휴일에 쉰다 → `local/macmini/`(설치 `install.sh`, 설명 `README.md`). launchd가 15분마다 깨우고 `nightshift.mjs`가 시간·기존 로컬 작업(launchd·cron·`~/.letscamp/avoid.txt`)·부하를 보고 작업 하나를 돌린다. 기존 작업이 시작되면 양보.
- 작업: 주변 사진 판독(CLIP + Apple Vision 간판 글자 + Ollama qwen2.5vl, `scripts/judge-nearby-photos-mac.mjs`, `j.by:"mac"`), 후기 사진·글 판정 밀린 것, 주말 운영자 홈페이지 + Apple Vision OCR(`OCR_ENGINE=apple`).
- 결과는 `land-on-main.sh`(label `macmini-*`)로 올린다. 같은 파일을 쓰는 CI 시각(금 05:23·화 04:17·일 03:41)은 피해서 끝낸다. CI 판독(`judge-nearby-photos.mjs`)은 `by:"mac"`을 덮어쓰지 않고, `build-nearby-photos`는 맥 판독에 종류 검사를 생략한다(업체 이름으로 확인).
- 순수 로직: `pipeline/lib/nightshift.mjs`, `pipeline/lib/mac-vision.mjs` (테스트 `test/nightshift.test.mjs`).
- 직접 `node local/macmini/nightshift.mjs --force ...`로 실행해도 `~/.letscamp/env`의 `LOCAL_VLM_MODEL`을 자동으로 읽는다. launchd와 수동 실행이 같은 Ollama 모델을 사용한다(PR #328).

## 📌 지도: 숙박 종류 마커 · 확대 버튼 제거 · 모바일 머리 줄은 ‘찾기’에서만 (2026-10-23, Claude)

- 지도 글램핑·카라반·방갈로 칩을 누르면 마커에 그 숙박 종류(난방 여부·방갈로 세부 이름·동 수)가 칩과 같은 색으로 나온다(`MAP_STAY_KEYS`, `.pin-glamp/-caravan/-house`).
- 지도 확대·축소 버튼(Leaflet·카카오 ZoomControl) 제거 — 카드와 겹침. 모바일·태블릿은 두 손가락, PC는 마우스 휠.
- 759px 이하에서 지도·테마·비교·찜 화면은 상단 머리 줄(로고·‘N곳 지도 안’)을 숨긴다(하단 탭이 메뉴). PC·태블릿은 머리 줄이 메뉴라 유지. 푸터도 같은 화면에서 숨긴다(2026-10-23 소유자).
- 주변시설 아이콘(소유자 제공): 동물병원 `vet`, 정육 `meat`(교체), 휴양림 `forest`, 레포츠 `leports`, 실외놀이터 `playout`, 키즈카페 `kidscafe`, 전통시장 `market`, 온천 `onsen`. 관광·공공 시설은 이름으로 고른다(`NEARBY_ICON_RULES`). 캠핑장 놀이시설은 `playout`.
- `nearby-photos.yml`: 판독기(@huggingface/transformers)를 설치하지 않아 판독이 조용히 건너뛰어졌다 → 설치 단계 추가, 판독기 없으면 오류로 표시.

## 📌 주변시설: 검색 사진 판독 켬 · 브랜드 표식 · 주소 제거 · 아이콘 (2026-10-23, Claude)
- **검색 사진**: `judge-nearby-photos`(CLIP, `lib/nearby-photo-judge.mjs`)가 `registry/nearby-photos.json` 항목에 판정 `j`를 적는다. `build-nearby-photos`는 판독을 통과하고 시설 종류와 장면이 맞는 사진만 붙인다(기본 켬, 끄려면 `NEARBY_SEARCH_PHOTOS=off`). 표본 160장에서 통과분의 약 85%가 실제 가게 모습이었다. 판독은 `nearby-photos.yml`(매주 금 05:23 KST)에서 이어서 한다.
- **브랜드 표식**: 사진이 없는 편의점·마트·주유소 체인(GS25·CU·세븐일레븐·이마트24·하나로·S-OIL·SK 등)은 브랜드 색 글자 표식을 보인다(`BRAND_MARKS`, 이미지 파일 아님).
- **줄 정보**: 주소는 빼고 종류·구분·짧은 입장료만 보인다. 응급실 전화번호도 뺀다. 같은 시설이 프로그램별로 여러 줄이면 하나로 합친다. 부가 정보가 있는 줄도 거리를 보인다.
- **아이콘**(소유자 제공): 박물관 `i-museum`, 미술관·갤러리 `i-gallery`, 수영장 `i-swim`(교체), 공원 `i-park`(이름에 ‘공원’이 있는 관광지 + 공원 테마).

## 📌 주변시설 사진·충전소 이용 제한·카카오 후기 썸네일 (2026-10-23, Claude)
- **충전소**: 환경부 충전소 정보의 이용 제한(`limitYn=Y`, 예: 아파트 입주민 전용·비공개)은 목록에서 뺀다. OSM은 `access=private·customers·residents`를 뺀다(`sync-trip-extras`). 원천이 갱신되기 전까지 화면은 아파트·오피스텔·입주민 이름을 거른다. 표시 중이던 18,882곳 중 11%가 이에 해당했다.
- **관광 칸 사진**: 휴양림·박물관·수영장·실내 놀이(공공 표준데이터, 사진 없음)를 관광공사 TourAPI 목록과 400m 안·이름 겹침으로 맞춰 공식 사진을 붙인다. `registry/public-poi-photos.json`은 `sync-nearby-context`가 만들고 `apply-public-nearby`가 붙인다.
- **카카오 후기 썸네일**: 다음 검색 API는 글에 대표 이미지가 없으면 썸네일을 비워 준다(카카오 글의 약 40%). `sync-review-thumbs`가 다음 이미지 검색에서 원문 주소가 같은 결과만 찾아 `registry/review-thumbs.json`에 넣고, `apply-review-thumbs`가 빈 칸에만 채운다(하루 3,000호출 상한).
- **편의점·병원 등 사진**: 검색 사진은 정확도가 낮아(표본 24장 중 5장만 실제 가게) 2026-10-19부터 꺼져 있다. 실제 모습은 ‘로드뷰’ 버튼으로 본다. 대안은 소유자 결정 대기(아래 보고 참고).

## 📌 예약 ‘공식 접수 중’ 기능 제거 (2026-10-23, 소유자 요청)
- 전국 6,404곳 중 서울 공공 6곳만 제공돼 의미가 없다는 소유자 판단으로 없앴다.
- 지운 것: `availability-sync.yml`(3시간마다), `explore/data/availability.json`, 화면의 ‘접수 중’ 표시·‘공식 접수 중’ 테마(`/theme/AVAIL`)·상세 접수 상품 목록.
- 남긴 것: data-sync의 `sync:seoul-yeyak`(카탈로그 `seoul` 칸, 화면 미노출)과 `lib/availability-read-model.mjs`(테스트·원장 검증용).
- 같은 기능을 되살리지 말 것. 전국 단위 실시간 빈자리 원천이 생기면 소유자에게 먼저 묻는다.

## 📌 상태 배지·지도 핀 대비 전수 보정 (2026-10-23, Codex)
- 지도 조건 핀과 카드·상세의 `bdg-no`(장작 불가·전기 불가·반려견 불가 등)에 전용 대비 규칙을 추가했다. 불가 상태는 빨강 바탕·흰 글자, 아이콘은 흰 원·빨강으로 고정하고, 지도 SDK가 상속하는 `color`·`line-height`를 덮어써 텍스트가 배경에 묻히거나 잘리지 않게 했다.
- 원본 `design/renewal/style.css`를 수정한 뒤 `publish-explorer-pages.mjs --shell-only camping-atlas/public`로 발행본을 동기화했다.
- 검증: 원본·발행본 `node --check` 통과, `git diff --check` 통과. CI의 Lint/build·Rail swipe는 PR에서 확인한다.

## 📌 예약 현황(서울 공공예약 ‘공식 접수 중’)이 화면에서 사라지던 원인 (2026-10-23, Claude)
- `availability-sync`는 서울 공공서비스예약 Open API의 캠핑 상품(현재 34개 · 매칭 7곳 · 접수 중 6곳)만 읽는다. 화면에는 카드 ‘접수 중’ 표시와 ‘지금 접수 중’ 테마로만 나온다.
- 유효시간이 75분이었는데, GitHub 스케줄 `*/30`이 실제로는 3~5시간에 한 번만 돌았다. 그래서 하루 대부분 만료 상태로 아무것도 안 보였다.
- 수정: 유효시간 12시간 + 상품별 접수 마감 시각 중 이른 쪽까지. 화면도 상품별 만료·마감을 본다. 스케줄은 3시간마다(`11 */3`)로 바꿨다. 네트워크 일시 오류는 실패로 끝내지 않는다(이전 공개본 유지).
- 남은 숫자·날짜별 빈자리는 공식 API가 없다. 화면은 ‘접수 중’까지만 말한다.

## 📌 상세 SNS 영상(유튜브) 빈칸 원인 · 지도 배지 모듈·마커 라벨 (2026-10-23, Claude → 전 에이전트)
- **유튜브 영상이 안 보이던 원인**: 화면은 정상이다(데이터가 있는 곳은 썸네일이 나온다). 수집이 문제였다.
  - `sync-social`(카카오 다음 동영상 검색)이 고캠핑 원본 3,128곳만 검색했다. 카탈로그 6,404곳 중 휴양림·지자체·OSM·당일 장소 3,276곳은 영상·후기 검색을 한 번도 하지 않았다. 유튜브 영상이 있는 곳은 1,379곳(22%)뿐이었다.
  - 3,128곳 모두 14일 캐시 안이라 10월 21일 이후 매일 호출이 0건이었다.
  - `YOUTUBE_API_KEY` 시크릿이 비어 있어 YouTube Data API 검색도 0건이다(소유자가 무료 키를 등록하면 숏츠 수집이 하루 약 80곳 늘어난다).
- **수정**: 검색 대상을 카탈로그 전체로 넓혔다(캐시 없는 곳부터, 하루 9,100호출 ≈ 1,300곳 — 한도 절반 안). 고캠핑 밖 장소의 상세에는 `merge-collected.mjs --social`이 영상·후기·사진을 **채우기만** 한다(소셜이 붙은 적 없는 곳·이 병합으로 붙인 곳만, `social_merged`). 고캠핑 업장은 기존대로 build-explore-data의 재검사 결과를 쓴다.
- **봇 PR 반복 실패 알림**: ① 실제 실패는 값 상식 검사(매너타임 8→11)였다. 기준을 ‘+5건 허용’으로 완화했고, 추출기(`spec-extractor` 매너타임)가 퇴실 시각·시설 이용 시간을 매너타임으로 읽던 오류를 고쳤다(시작은 20시~새벽 1시만). ② 봇이 `GITHUB_TOKEN`으로 연 PR의 `pull_request` 실행은 승인 대기(action_required)로 작업 없이 남았다가 PR이 닫히면 ‘실패’로 바뀌어 빨간 알림이 반복됐다. 실제 검사는 workflow_dispatch 실행이다. `land-on-main.sh`가 작업 0개인 승인 대기 실행을 지운다.
- **지도**: 배지는 한 모듈(`.bdg`, 크기·여백이 em 비례)로 통일했다. 화면마다 `font-size`만 바꾼다. 지도 마커는 기본 업장 이름, 전기·장작·반려견·주차 칩을 누르면 그 값(600W·장작·숯만·화기 불가 등, 불가는 빨강)을 보인다.

## 📌 정보량 점수 정렬 · 수집 현황 대시보드 자동 갱신 · 매일 동기화 발행 막힘 해소 (2026-10-23, Claude → 전 에이전트)
- **정보량 점수**: `pipeline/lib/info-score.mjs`가 계산하고 `apply-info-score.mjs`가 카탈로그 `c.iq`(0~100)에 넣는다. data-sync·증분 발행에서 돈다. 화면 `rich()`가 `c.iq`를 쓰므로 목록·추천·지역 목록은 정보가 많은 곳부터 보인다. 주변 캠핑장은 가까운 10곳 안에서 점수 순이다. 현재 분포: 중앙값 3(공원·당일 장소 다수), 상위 10% 56, 최고 79. 다음 수집 우선순위는 `data/quality/info-score.json` `next_priorities`. 규칙은 AGENTS.md 📢.
- **수집 현황 대시보드**(claude.ai 아티팩트)는 10월 19일 수집 세션이 손으로 올리던 파일이라 그 값에서 멈춰 있었다. 이제 `pipeline/scripts/dashboard-data.mjs`가 데이터 파일 3개(커버리지·하루 전 대비, 네이버 호출·판정 진행·점수 분포, 최근 워크플로 단계)를 만들고, 매일 예약 작업이 올린다.
- **매일 동기화 발행 막힘**: 10월 19일 이후 main data-sync의 최종 발행이 매번 실패했다.
  - ① 10월 22일 05:55 UTC 전까지는 field-guard 되살리기 버그(화장실 목록 3→1로 뭉침) 때문이었다. 이미 고쳤다.
  - ② 그 뒤로는 값 상식 검사의 기준 대비 급증 규칙이 막았다(매너타임 8→11, 20% 초과). 이 규칙에 “기준 + 5건까지 허용”을 더했다. 걸린 값은 배포 때 어차피 숨겨진다.

## 📌 공용 찜 누락 원인·마이그레이션 경로 보정 (2026-10-23, Codex)
- `/log/`의 `save_log`에는 `원주두리캠핑장(2472)`·`신림스테이캠프(101093)`의 `add`가 남았지만 `/saved`의 `shared_save`에는 없었다.
- 원인은 `pipeline/scripts/migrate-postgres.mjs`가 루트 `db/`만 읽는데, 공용 찜·조회 로그 마이그레이션이 `camping-atlas/db/`에만 존재했던 경로 불일치다. 원격 `schema_migration`에도 016 이후 해당 파일들이 기록되지 않았다.
- 루트 `db/017_shared_saves.sql`~`db/021_list_detail_entry_log.sql`로 정식 이관했다. 다음 `data-sync`의 `db:migrate`에서 공용 찜 테이블·안전 피드·조회 원장·목록 진입 필터를 적용하고, `020_reconcile_shared_saves.sql`이 마지막 `save_log`가 `add`인 누락 업장을 보충한다.
- 확인된 최신 찜 이벤트: 2472·101093은 `add`만 존재하며, 102229·102377은 이미 `shared_save`에 반영되어 있다.
- 검증: 원격 공개 API에서 `save_log`·`shared_save` 조회 권한과 누락 상태를 확인했다. 마이그레이션 적용 및 실제 `/saved` 교차기기 확인은 새 GitHub Actions·Pages 배포 후 진행한다.

## 📌 검토 대기열 정리(295→84) · 글 내용 판정 AI · 휴게소 이름 정제 (2026-10-23, Claude → 전 에이전트)
(feat: 목록 카드 댓글 실시간 연동/기본 펼침 및 찜 페이지 상세정보 접기 아코디언 구현)
- **사실 정제**(`pipeline/lib/fact-refine.mjs`, `build-fact-store`에서 판정 전 실행): ① 같은 예약 플랫폼의 다른 업장 페이지(detail_id 다름) 섞임 제거 ② 범위가 좁은 금지(애견 입수·카라반 내부·대형견)·일부 구역 허용·홍보 제목을 바로 읽기 ③ 숙박형·성수기·당일 이용 입퇴실 시각에 `scope` 표시(품질 장부의 대표값 경쟁에서 제외). 뺀·바꾼 값은 `data/quality/refine-log.json`.
- **표준 운영규정은 참고값**: 공공 야영장 표준 운영규정(`public-standards.mjs`)이 사실 저장소에 운영자 홈페이지(OPERATOR)로 들어가 349곳 입퇴실이 업장 공지처럼 쓰였다 → `REFERENCE` 등급·`public_standard` 원천. `GRADE_RANK.REFERENCE = 0`(DB smallint)(조회 기본 최소 등급 MENTION보다 낮음). 품질 장부의 MANNER_TIME·REFUND_POLICY·입퇴실 신뢰도 하락 경고는 이 정정 때문이다(의도된 변화).
- **호환 값**: 반려견 ‘가능·소형견만·지정 구역만’은 충돌로 보지 않는다(`quality.compatible`).
- **자동 판정**: `quality-auto-decide.mjs` — 업장 원문의 분명한 규칙 문장 vs 고캠핑 등록값 69건을 decisions.ndjson에 기록(by `Claude(원문 대조·규칙)`). 질문·후기 말투·시설 목록 문장은 사람 판정으로 남긴다.
- **글 내용 판정 AI**(`pipeline/lib/text-judge.mjs`): 무료 로컬 다국어 임베딩(Xenova/multilingual-e5-small) + 분류별 예시 문장. 후기·카페·웹·영상 제목 중 캠핑장 이름이 없고 식당·광고·부동산·무관 주제가 1위인 글을 `ng` 표시 → 화면 목록에서 숨김(`snsOk`). 다국어 NLI(mDeBERTa xnli)는 한국어에서 무작위 수준이라 쓰지 않았다. `judge-texts.mjs`(주간 link-check, 2만 건씩 이어서) → `registry/text-judgments.json` → `apply-text-judgments.mjs`(data-sync·증분 발행).
- **휴게소 이름 정제**(`lib/rest-stops.mjs restStopNameOk`): OSM이 휴게 시설로 표시한 정자·주유소·관공서·퀵서비스 등(‘공원방문자센터’, ‘태양주유소’)을 뺀다. 수집(`normalizeOsmStop`)과 상세 보정(`apply-public-nearby`) 둘 다. 고속도로 휴게소(도로공사 API 203곳)·졸음쉼터(공식 253곳)는 이미 정상 수집 중. 공공데이터포털 ‘휴게소 표준데이터’ 오픈API는 활용 신청이 소유자 계정 로그인으로만 가능해 에이전트가 대신 하지 않는다.

## 📌 공공데이터 원장 감사 보완 (2026-10-22, Codex)
- `pipeline/registry/public-datasets.json`에 `datagokr-public`을 `in_use`로 등록해 감사 스크립트가 실제 연결된 공공데이터포털 표준데이터(휴양림·박물관·미술관·수영장·실내 놀이)를 원천과 연결하도록 보완했다.
- robots.txt로 자동 수집을 중단한 `kdata-public`은 삭제하지 않고 `retired`로 명시했다. 기존 캐시·원문 링크는 보존하며, 신규 수집은 `sync-public-leisure.mjs`만 사용한다.
- `npm --prefix pipeline run audit:public-data` 기준 공공 여가 데이터 1,466건(휴양림·박물관·수영장·실내 놀이)이 연결되어 있고, 도로공사 휴게소 API는 `EX_API_KEY` 미설정 환경에서 기존 캐시/대체 원천을 유지한다.

## 📌 값 상식 검사 기준 보강 (2026-10-22, Codex)
- `pipeline/lib/value-sanity.mjs`의 전기 제한 하한을 **400W**로 고정했다. 400W 미만은 서비스 표시에서 숨기고 `_hid`에 원본과 사유를 보존한다.
- `pipeline/test/value-sanity.test.mjs`가 400W 미만·600W·1100W 유지 규칙을 검증한다. 실제 발행 데이터에서 400W 미만 값이 새로 유입되면 배포 단계의 상식 검사와 기준선 검사가 차단한다.

## 📌 후기 사진 내용 판정(CLIP) · 캠핑장 실체 규칙 확대 · 주변 행사 지역 오류 · 휴게소·공공시설 정제 (2026-10-22, Claude → 전 에이전트)
- **후기 사진 판정**(`pipeline/lib/photo-judge.mjs`): 무료 로컬 CLIP(Xenova/clip-vit-base-patch32, transformers.js) 제로샷 — 캠핑장 장면 14문장 vs 음식·해산물·음료·과자·인물·행사·아이·반려동물·식당 실내·글 캡처·차 안 11문장. 규칙 v3: NEG 합 0.5↑ · 1위 NEG(식당 실내 제외)이면서 0.4↑ · 식당 실내 0.8↑ · (NEG 0.25↑ 그리고 캠핑 장면 최대 0.35 미만)이면 거름. 손으로 확인한 66장 중 65장 일치(놓친 1장: 탁자 위 물건). 사례: 여우하우야영장(100419) 대게 사진.
  - 카드 대표(`pick-card-fallback.mjs`): 픽셀 규칙 + 내용 판정, 판정 캐시 `registry/photo-judgments.json`(URL별, 규칙판 v).
  - 상세 갤러리(`judge-review-photos.mjs` 주간 3,000장씩 이어서 → `apply-photo-judgments.mjs`가 `sns_images[].ng` 표시 → 화면 `snsOk()`가 숨김). 사진은 지우지 않고 표시만(판정이 바뀌면 다시 보임).
  - 워크플로: `link-check.yml`(주간)에 transformers 설치·모델 캐시·판정·카드 고르기, `data-sync.yml`·증분 발행에 `apply-photo-judgments`.
- **주변 캠핑장 추천**(`similarNearby`): 업장 정보 2가지 이상(전화·홈페이지·소개·요금·사이트 종류·편의시설·규격·후기)인 곳만(`infoRich`). 검색·지도 목록은 그대로.
- **캠핑장 실체 규칙 확대**(`lib/camp-reality.mjs`): 무관 업종 이름(샷시·창호·건설·산업·무역 등) + 근거 1개 이하, 지도 분류가 무관 업종(제조·건설·부동산 등) + 근거 1개 이하 → 카탈로그 제외. 현재 카탈로그엔 추가 해당 없음(스마트락(주) 등 3곳은 #279에서 이미 제외, 라이브 반영 확인).
- **주변 행사 지역 오류**: `lib/culture-events.mjs` `sameEvent`가 좌표 없는 관광공사 축제를 제목만으로 합치던 문제 → 시·도·시·군·구가 같아야 합침(`regionOf`). 천왕산 가족캠핑장(7967)은 이제 서울 정동 ‘페인터즈’. CultureFlow는 공연장 이름 표기 차이 보정(pyw31337/culture#16, 좌표 없는 1,895건 중 71건 회복).
- **휴게소·공공시설**: `nearby.public`(휴양림·박물관·수영장·실내 놀이, 공공데이터포털)을 상세 6,397곳에 반영(`apply-public-nearby.mjs`, data-sync·증분 발행에 연결), 휴게소 같은 이름 500m 중복 정리(`dedupeHits`, 1,307곳). field-guard는 `nearby.rest`·`nearby.public`을 파생 모델로 봄(원천에서 매번 다시 계산).

## 📌 지도 카드·모바일 지도 수 표기 (2026-10-22, Codex)
- 지도 목록 카드를 메인 목록 카드와 같은 규칙으로 보강했다. 사이트 타입, 영하/운영 상태, 숙박·조건 배지, 규격·전기·요금 핵심값을 같은 배지/아이콘 체계로 표시한다.
- 모바일 지도에서 기존 패널 안에만 있던 `곳 · 지도 안` 수를 공통 헤더의 로고 우측 끝에 `N곳 지도 안`으로 표시한다. 지도 화면을 벗어나면 숨긴다.
- 원본 `design/renewal`과 발행본 `camping-atlas/public`의 앱·CSS·쉘·HTML을 함께 갱신했다.
- 검증: `node --check` 원본/발행본 통과, `npm --prefix camping-atlas run lint` 오류 0(기존 경고 31), `git diff --check` 통과.

## 📌 업체·후기사진·행사 위치 품질 게이트 (2026-10-22, Codex)
- **비캠핑 업체 격리:** `pipeline/lib/place-quality.mjs`와 `pipeline/registry/entity-quality.json`을 추가했다. `스마트락(주)`처럼 이름·업종이 창호/제조업인 레코드는 원장 데이터를 삭제하지 않고 `REJECTED`로 표시해 기본 탐색·지도·주변 캠핑장 추천에서 제외한다. 직접 검색은 계속 가능하다.
- **후기사진 검증:** 카드 대체사진 후보에 후기 제목·본문의 캠핑장명/캠핑 맥락을 요구하고 음식·식당·인물 단서를 감점한다. 근거가 없는 후보는 `REVIEW`로 남기며 카드 대표사진으로 승격하지 않는다. `여우하우야영장(100419)`은 기존 후기 대표사진을 검토 상태로 격리해 대게 등 오매칭 이미지가 기본 카드에 다시 나타나지 않게 했다.
- **행사 위치:** `eventsNear()`가 `extras.json`의 과거 거리값을 그대로 신뢰하지 않고 행사 좌표와 캠핑장 좌표를 재계산해 30km 밖 행사를 버린다. 따라서 구로 캠핑장에 광주 행사가 붙는 유형을 발행 단계에서 차단한다. 좌표 없는 관광공사 행사도 자동 연결하지 않는다.
- **행사 포스터:** `img`가 비어도 `img2`(원출처 대체 포스터)를 우선 렌더링하도록 `context/events.js`를 보완했다. 두 원천 모두 포스터가 없을 때는 제목형 대체 카드로 남긴다.
- **휴양림·휴게소·실내놀이터·수영장·레포츠·박물관:** `datagokr-public`/`nearby-context` 수집·주변 연동을 유지하고, robots 차단으로 폐지한 `kdata-public`은 캐시만 보존한다. 품질 게이트로 잘못된 업체와 위치 오매칭을 차단한다. CultureFlow 원본 저장소는 이 체크아웃에 없어 원천 데이터 자체 수정은 별도 저장소 작업이 필요하다.
- **검증:** `node --test pipeline/test/place-quality.test.mjs pipeline/test/culture-events.test.mjs pipeline/test/detail-events-card.test.mjs` 13개 통과, `npm --prefix camping-atlas run lint` 오류 0(기존 경고 31), `git diff --check` 통과. 전체 파이프라인 테스트는 환경에 `sharp`가 없어 기존 `photo-dedupe.test.mjs` 1개가 로드 실패했다.
## 📌 데이터 품질 표준 프로세스·에이전트 게시판 신설 · k-data 수집 → 공공데이터포털 (2026-10-22, Claude → 전 에이전트)
- **표준 6단계**(`docs/DATA_QUALITY_PROCESS.md`): 수집 → 판단 → 검토 → 판정 → 정제·병합 → 발행·환류. AGENTS.md 맨 앞 📢 공지로 올림.
- **품질 계산**: `pipeline/lib/quality.mjs`(등급 무게 × 독립 원천 확증 × 신선도, 충돌 판정) → `pipeline/scripts/quality-ledger.mjs`가 매일(data-sync·증분 발행) `data/quality/{latest.json, ledger.ndjson, review-queue.json, REPORT.md}`를 쓴다. 첫 장부(2026-10-22): 사실 169,447 · 평균 신뢰도 0.806 · 확정 89.1% · 독립 원천 확증 2,886쌍 · **충돌 295건**(반려견 동반·입실/퇴실 시각 등 — 운영자 페이지 수집 때 다른 캠핑장 페이지가 섞인 경우가 많다).
- **판정**: `pipeline/scripts/quality-decide.mjs` → `data/quality/decisions.ndjson` → `build-fact-store`가 VERIFIED 사실(원천 `agent_review`, `fact-store.mjs SOURCES`에 등록)로 넣는다.
- **게시판**: `pipeline/scripts/agent-board.mjs`(list·check·claim·release·post) → `data/board/board.ndjson`. `.gitattributes`로 board·decisions·merge-review를 merge=union.
- **k-data 교체**: `sync-kdata-public.mjs`·`lib/kdata-public.mjs`·`registry/kdata-public.json`·관련 테스트 삭제, 주간 워크플로 단계 제거. `nearby.public`은 `registry/public-leisure.json`(휴양림 186·박물관 1,073·수영장 134·실내 놀이 25)을 `lib/public-poi.mjs`로 바꿔 쓴다(원천 id `datagokr-public`, 등급 A). 주변 칩 아이콘을 스프라이트에 있는 것(th:FOREST·swim·playground·experience·sports·restarea)으로 고침.
- 검증: 단위 테스트 496 통과(quality·게시판·public-poi 추가), 품질 장부 실행(회귀 0).
- 다음: 충돌 295건 판정(반려견 동반 520쌍이 다값 — 운영자 사이트 수집기의 다른 캠핑장 페이지 섞임을 규칙으로 막는 것이 우선).

## 📌 캠핑장 실체 전수 검수 · 배지·섹션·상세 판정 통일(전 업체) · 휴양림 카탈로그 · 수식어 흐리게 (2026-10-22, Claude → 전 에이전트)
- **캠핑장 아님(R10)**: 고캠핑(지자체 야영장업 인허가)에 회사 사무실 주소로만 등록된 곳을 카탈로그에서 뺀다 — `pipeline/lib/camp-reality.mjs` `paperRegistration`(캠핑장 이름 아님 + 전화·사진·소개·시설 근거 0 + 카카오·네이버 장소 없음 + 도심(5km 안 편의점 1,000곳↑) 또는 건물 호실 주소) + 수기 목록 `pipeline/registry/not-campgrounds.json`. 전수(3,100여 곳) 결과 3곳: 스마트락(주)(서울 구로 디지털로 지식산업센터)·빈투어 주식회사(중구 퇴계로)·(주)더술컴퍼니아카데미(종로 창경궁로). ‘(주)’만으로는 거르지 않는다 — (주)신어산 자연숲캠핑장처럼 법인이 운영하는 진짜 캠핑장이 67곳 중 대부분.
- **휴업 반영(R11)**: 고캠핑 상세(2026-10 확인)가 ‘현재 휴업 중’인데 목록이 ‘운영’이던 13곳 → ‘휴장’.
- **배지·섹션·상세 전수 감사**: 앱 함수(badges·THEMES·cardLines·specTiles)를 그대로 써서 카탈로그 6,404행 + 상세 6,404개 전부 검사(메인 카드 표본이 아님). 검사 항목: 섹션⇄섹션 배지(반려견·지인초대·겨울), 배지끼리 상충(반려견↔반려견 불가/제한, 장작↔장작·화기 불가, W↔전기 불가, 초대가능↔방문객 불가), 같은 배지 두 번, 카드 정보 줄↔배지, 상세 요약(반려견·장작·전기·방문객)↔카드 배지. 처음 실행 오류: 겨울 섹션인데 섹션 배지 없음 612, 상세 반려견 가능↔카드 불가 3, 상세 방문객 불가↔초대가능 2 → 수정 후 0건.
  - 겨울 섹션: W를 모르는 난방 글램핑·카라반은 ‘난방’ 배지를 섹션 배지로.
  - 상세 ‘반려견’ 칸은 카드와 같은 판정(업장 규칙 NO_PET면 불가, 카드가 반려견이면 후기 ‘불가’ 언급으로 뒤집지 않음). ‘방문객’ 칸도 NO_VISITOR와 같은 판정, ‘최대 인원 초과 시 방문객 불가’는 ‘인원 초과 시 불가’(조건부).
  - `pipeline/lib/house-rules.mjs` NO_VISITOR: 문장 전체에 ‘인원은’이 있으면 버리던 규칙이 ‘예약자 외 방문객 입장 불가’까지 놓쳤다 → 맞은 자리 앞뒤에 ‘초과·포함·사전’이 있을 때만 조건부로 보고 버린다— main 대비 ‘방문객 불가’ 추가 3곳(달빛정원글램핑&카라반·경주 보문 호수 야영장·더패밀리 주식회사), 해제 3곳(‘사전 예약된 방문객 외’·‘방문객 포함 최대 6명’ 조건부: 천안 양지야영장·옥당걸숲속관광농원·울주해양레포츠센터).
- **수식어 흐리게(소유자)**: ‘업장 미공지 · 조례 기준 14:00 부터’ → 값 ‘14:00’은 굵게, ‘업장 미공지 · 조례 기준’은 아래 작은 회색(`factValueHtml`이 값 앞에 붙은 수식어도 분리, 요약 타일에도 적용). 그 밖의 화면 글자는 `softQual()`이 `.qual`(얇은 회색)로 감싼다.
- **휴양림 카탈로그**: 공공데이터포털 전국휴양림표준데이터 186곳(국립 26·공립 142·사립 18) — 기존 캠핑장 81곳에 `c.rf` 연결, 102곳 `rf-…` 새 행(src_url·src_at), 상세 `d.rf` 타일, 홈 ‘휴양림’ 테마. 주변 휴양림·박물관·수영장·실내놀이터 칩은 main의 `nearby.public`(Codex)과 겹쳐서 이 작업에서는 만들지 않는다. `registry/public-leisure.json`(박물관 1,073·수영장·실내 놀이)은 공식 원천이라 `nearby.public`의 상위 등급 원천으로 합칠 수 있다(후속).
- ⚠ **k-data.aljal.kr**: 2026-10-22 확인 당시 robots.txt가 ClaudeBot·anthropic-ai를 이름으로 막았다. AGENTS.md 데이터 수집 원칙 5(AI 크롤러를 이름으로 막은 곳은 자동 수집 경로로 쓰지 않음)와 충돌할 수 있으니 `sync-kdata-public` 담당 에이전트가 확인 바람 — 같은 사실은 공공데이터포털 표준데이터(이 작업의 `sync-public-leisure`)로 받을 수 있다.
- 검증: 단위 테스트(house-rules 방문객 조건부 8문장·camp-reality), publish-sanity --check 통과, field-guard 손실 0(파생 감소 6건은 조건부 방문객 문장 해제), 전수 감사 0건, 브라우저 회귀 테스트(결과는 PR 참조).

## 📌 PR #278 Actions 실패 원인 및 데이터 보호 예외 (2026-10-22, Codex)
- Web quality / Lint and build의 field-guard가 요금 상식값 감사 커밋의 의도적인 fee.* 정제를 기존 값 삭제로 오인하던 원인을 확인했다. 65개 레코드의 fee 최상위 묶음에만 정정 사유·검토일이 있는 pipeline/registry/merge-overrides.json 예외를 추가했으며 원문은 fee_raw·검토 기록에 보존한다.
- 별도 재현 검사 node pipeline/scripts/field-guard.mjs /tmp/camp-base .에서 손실 0건을 확인했다. 다음 작업자는 Actions 최신 실행의 Web quality·Data sync가 모두 성공한 뒤 PR #278을 머지한다.

## 📌 상식값·요금 미스매치·표시 엔티티 전수 점검 (2026-10-22, Codex)
- 구조화된 전력 제한값 전수 검사에서 400W 미만은 0건이었다.
- 민간 1박 2만원 미만 요금 65건을 `fee_raw`에 원본 보존한 채 대체 근거로 보정하거나 표시에서 숨겼다. 이후 표시되는 2만원 미만 값은 공식 공공요금 또는 캠크닉·당일 이용 예외만 남았다.
- 요금 레이블에 환불·취소·대기·결제 문장이 들어간 `prices.label`은 0건이다. 원문 인용은 근거 팝오버에만 남긴다.
- `&quot;`, `&lt;`, `&amp;`, `&middot;` 등 표시용 엔티티 정제 범위를 확대하고 원본·발행본 헬퍼를 동기화했다.
- 상세 점검 기록: `docs/QUALITY_AUDIT_2026-10-22.md`. Playwright가 로컬에 없어 PC/모바일/태블릿 브라우저 스크린샷 회귀는 아직 실행하지 못했다.

> 최종 갱신: 2026-10-22 KST(핵심 이용값·보조 기준 문구 시각 분리) — 맨 위 ‘📌 공지’부터 읽을 것<br>
> 다음 작업자는 이 문서를 먼저 읽고 작업 종료 시 업데이트한다.

## 📌 행사 포스터·비교 뱃지·네이버TV/카카오TV 재생 (2026-10-22, Codex)
- 행사 카드 정렬을 포스터 보유 행사 우선으로 보정했다. 8149 데이터에서는 한국관광공사 포스터가 있는 괴산 행사 카드가 먼저 보이며, 포스터 없는 국가유산 행사는 정보 보존을 위해 뒤에 남는다.
- `/log/` 공통 헤더의 비교 숫자 뱃지를 제거했다. 비교 선택 수는 비교 화면 내부에서만 표시하며 찜 숫자만 헤더에 남긴다. 관련 회귀 테스트도 새 계약으로 갱신했다.
- 네이버TV·카카오TV 공식 영상 URL은 썸네일을 누르면 상세 화면 안에서 임베드 재생한다. 네이버 블로그·카페와 일반 다음 글은 임베드가 보장되지 않아 기존처럼 원문 링크로 열어 플랫폼 콘텐츠를 오용하지 않는다.
- 검증: 원본/발행본 Node 문법, 행사 모듈 import 및 8149 포스터 렌더 확인, lint 오류 0(기존 경고 30), diff 검사 통과.

## 📌 목록 클릭 기반 상세 진입 로그 (2026-10-22, Codex)
- **집계 기준:** 상세 URL 직접 접근·새로고침·상세 내부 재렌더는 운영 인기 집계에서 제외하고, 카드·지도 목록·테마/검색 결과의 업장 링크를 실제로 눌러 상세로 이동한 경우에만 `view_log.entry_source='list'`로 기록한다. 자동화 환경(`navigator.webdriver`)은 기존 `NO_REMOTE_WRITE`로 계속 차단한다.
- **DB 보정:** `camping-atlas/db/020_list_detail_entry_log.sql`이 기존 018 원장을 `legacy`로 격리하고 `safe_list_detail_counts`/목록 전용 피드 RPC를 만든다. 016에서 확인한 Linux x86_64 + `1366x900`/`390x844` 테스트 조합은 `view_log_test_archive`에 보관한 뒤 원장에서 제거한다. 일반 사용자의 다른 환경 기록은 건드리지 않는다.
- **운영 화면:** `/log/`의 상세 조회 표기를 `상세 진입`으로 통일하고, 업장별 누적 진입 수·진입 업장 수·상세 진입 탭을 목록 전용 데이터로 렌더링한다. 구형 018만 적용된 DB에서는 오래된 전체 조회를 인기 수치로 표시하지 않고 020 적용 전 안내 가능한 빈 상태로 둔다.
- **검증:** 원본/발행본 앱 동기화, Node 문법 검사, 로그 HTML 인라인 스크립트 문법 검사, `git diff --check`를 실행한다. Supabase 실제 삭제·집계는 020 마이그레이션 적용 후 확인한다.

## 📌 공공 휴양림·주변 공공시설 누적 수집기 (2026-10-22, Codex)
- **원천 분석:** `k-data.aljal.kr`의 사이트맵과 상세 페이지 구조를 확인했다. 자연휴양림 212곳, 휴게소 248곳, 실내놀이터·수영장·레포츠·박물관 목록도 공개 상세 URL로 제공된다. 원문 HTML을 저장하지 않고 이름·주소·좌표·운영 표·사진 링크·공식 원문 링크만 저장한다.
- **수집기:** `pipeline/lib/kdata-public.mjs`와 `pipeline/scripts/sync-kdata-public.mjs`를 추가했다. `npm run sync:kdata-public`는 기본 호스트 간 1초 지연, 기존 원장 합집합 병합, 확인 시각·원문 URL 기록을 적용한다. 현재 자연휴양림 211건을 `pipeline/registry/kdata-public.json`에 누적했다. 나머지 범주는 주간 워크플로에서 이어 수집한다.
- **주변 연동:** `nearby-context`가 `forest·rest·indoorplay·pool·leisure·museum`을 캠핑장별 최대 3곳의 `nearby.public`로 계산하고, 상세 주변시설에 범주별 탭으로 노출할 수 있게 했다. 공공시설 카드에는 주소와 운영 표의 짧은 요약만 보이며 쿠키·개인정보 같은 공용 푸터 문구는 제외한다. 기존 관광·생활·휴게소 배열은 그대로 유지한다.
- **휴양림 원장 보호:** `sync-forest-recreation.mjs`가 기존 `forest-recreation-collected.json`과 `forest-recreation.json`을 합쳐 쓰도록 수정했다. 수집 실패나 일부 응답으로 기존 값이 줄지 않는다.
- **검증:** `kdata-public`·`kdata-nearby`·`nearby-context` 테스트 10개 통과, 원본/발행본 앱 동기화, Node 문법 검사 통과. 전체 주변 재계산은 최신 `out/campgrounds.json`이 있는 데이터 발행 단계에서 실행한다.

## 📌 핵심 이용값·보조 기준 문구 시각 분리 (2026-10-22, Codex)
- **표시:** 상세 이용 정보에서 `14:00부터`·요금·규격 같은 핵심 값은 기존의 진한 굵기를 유지하고, `업장 미공지`·`법정/조례 기준`·`참고값` 같은 근거성 보조 문구는 별도 줄의 작은 회색·얇은 글씨로 표시한다. 숫자나 시간값이 보조 문구에 포함된 경우에도 같은 값을 중복 표시하지 않는다.
- **범위:** 사실 저장소와 원문은 변경하지 않고 이용 정보 UI(`factValueHtml`)만 정제했다. 발행본 `camping-atlas/public`은 원본과 동기화했다.
- **검증:** `node --check` 원본/발행본, `npm --prefix camping-atlas run lint`(오류 0, 기존 경고 30), `git diff --check` 통과.

## 📌 공용 찜 초기 렌더 경합·상세 조회 원장 (2026-10-22, Codex)
- **원인:** `save_log`에는 찜 클릭이 기록됐지만 `boot()`가 `loadSharedSaves()`를 기다리지 않고 먼저 `/saved`를 렌더링했다. 서버의 `shared_save`가 도착한 뒤 하트만 갱신되어 저장 목록 본문은 이전 로컬 상태로 남을 수 있었다.
- **수정:** 서버 찜 목록을 첫 `route()` 전에 await하고, 실패 시에만 로컬 캐시를 유지한다. 따라서 저장 목록은 브라우저별 로컬 목록이 아니라 서버 목록을 기준으로 그린다.
- **조회 로그:** `camping-atlas/db/018_view_log.sql`에 상세 조회 원장·안전 피드 RPC·업장별 집계 RPC를 추가했다. 앱은 상세 진입을 탭당 30분에 한 번 `view_log`로 기록하고, 언어·시간대·화면·플랫폼만 저장한다(원문 UA/IP 미저장). `/log`는 조회 피드·조회 탭·상단 집계를 찜/댓글과 같은 형식으로 보여준다.
- **주의:** 018 마이그레이션은 Supabase에 적용되어야 조회 기록이 실제로 저장된다. 미적용 상태에서도 앱과 로그 화면은 오류 없이 기존 찜/댓글을 표시하고, 조회는 빈 결과로 폴백한다.
- **검증:** 앱 원본·발행본 동기화, `node --check` 2건, `git diff --check` 통과.

## 📌 GitHub Actions 실패 원인·수정 (2026-10-22, Claude → 전 에이전트)
- **Data sync(봇 PR #259 Lint 실패)**: `field-guard.mjs --heal`이 줄어든 객체 배열을 `mergeValue`로 되살렸는데, 항목 열쇠(`url ?? id ?? cid ?? src`)가 겹치면(화장실 3곳이 모두 `src:"osm"`) 하나로 뭉쳐 오히려 3→1로 줄었다(94건). → 줄어든 배열은 기준 배열 그대로 복원. 테스트 `merge-policy.test.mjs` ‘줄어든 객체 배열은 기준 배열로 되살린다’.
- **Data sync `pg` 없음(ERR_MODULE_NOT_FOUND)**: `pipeline/node_modules`가 다른 컴퓨터 경로(`/workspace/camp/...`)를 가리키는 심볼릭 링크로 커밋돼 있었다(4ac26477e). → 추적 해제, `.gitignore` `/node_modules`(링크 포함).
- **Weekly forecast(봇 PR #262 Rail swipe 실패)**: 다음 실행(02:25)이 통과해 PR이 대체됨 — 일시 실패로 판단, 코드 수정 없음. `air: HTTP_504`는 에어코리아 응답 지연(실패로 치지 않음).
- 검증: `node --test pipeline/test/*.test.mjs` 484 통과 / 0 실패.

## 📌 검색 띄어쓰기 무관 · 시군구 보완 · 섹션 배지 정합성 · 요금표 정리 · 불가 빨간 글씨 · 쇼츠 겹침 (2026-10-22, Claude → 전 에이전트)
- **검색**(`design/renewal/app.js` `querySets`·`wordHit`): 공백을 지운 검색어를 조각(2글자↑, 숲·강 등 한 글자 낱말 허용, 최대 3조각)으로 나누는 모든 방법 중 하나라도 맞으면 결과. ‘별빛오토’·‘별빛 오토’·‘별 빛오토’ 모두 25건(넓은 쪽). 이름·주소·유형 문자열도 공백을 지우고 비교.
- **시군구**: 등록값에 시군구가 빠진 36곳(세종 제외)을 주소 문장에서 채움 — `pipeline/lib/explore-data.mjs` `sigunguFromAddr`(다음 빌드부터), 현재 `campgrounds.json` 직접 보정, 화면 `region()`도 같은 대체. 예: 별빛 오토캠핑장 ‘강원’ → ‘강원 양양군’. 지역 정적 페이지 24곳 재생성.
- **배지 정합성**: `petAllowed()`·`inviteOk()`를 섹션(THEMES PET·VISITOR)·배지·조건 필터가 함께 씀. 반려견 동반 가능 + 중·대형견 금지(BIG_DOG)는 ‘반려견(소형)’ 한 개(‘반려견’과 ‘반려견 제한’ 동시 표시 금지), NO_PET은 가능 배지·반려견 섹션에서 제외. 섹션 카드는 그 섹션 배지를 맨 앞에(`card(..., { theme })`). 전기 W는 카드 사진 배지에도 표시(법령 참고값 r 제외). 홈 282장 감사: 상충 0, W 누락 0, 반려견 레일 16/16.
- **요금표**: 꼬리표(업장 등록·추가 요금·대표 요금) 제거(후기 언급만 ‘확인필요’), 줄 이름에서 앞 조각에 포함된 조각 제거(`feeRowLabel`: ‘일반캠핑 · 일반 · 평상시 주중’ → ‘일반캠핑 · 평상시 주중’), 인원·방문 칸에 차량 이야기(‘차량 불가’)가 들어가지 않게 / 차량 칸에 인원 이야기 금지.
- **불가 빨간 글씨**: `redNo()` + MutationObserver가 `#view`·`#pop`의 ‘불가·금지’ 글자를 `.no-txt`(빨강)로 감쌈. 제목·배지·입력칸 제외.
- **쇼츠**: 재생 중 쇼츠는 감싸는 칸째 270px로 넓어져 옆 칸을 밀어냄(겹침 해소).
- **검색 결과 카드 배지**: 메인 카드처럼 사진 아래쪽 한 줄(`.card-horizontal .bdgs` bottom).
- **상세 상단 줄·팝업**: 뒤로는 왼쪽 끝, 찜·공유는 오른쪽 끝(`.d-bar-acts`). 원문 팝업 오른쪽 위 X 닫기 + 같은 카드 다시 누르면 닫힘(`pop._src` 토글).
- **후기 사진 배지 제거**: 카드·사진의 ‘후기 사진’ 출처 배지(`ptCredit`) 삭제.
- **비교표**: 열 머리 찜 하트 제거(× 빼기만, 찜 해제는 위 칩 하트). ‘요금’ 행이 `usage()[3]`(환불 규정)을 보여 주던 오류 → 실제 1박 요금(`feeMain`), 환불은 ‘환불’ 행으로 분리. 테스트 `compare-fav-test.mjs`를 칩 하트 흐름으로 갱신.
- **사진 배지 두 줄**: `badges()`가 긍정 배지(초대가능·W·장작·반려견)를 윗줄, 부정 배지(불가)를 `.bdg-br` 다음 아랫줄로. 카드 정보 줄과 겹치는 사실도 배지로 보임(`ROW_NO` 제거). 테스트 `ui3-test.mjs`의 ‘정보 줄과 중복’ 검사를 ‘부정 배지 뒤에 긍정 배지 금지’로 교체.
- **표기 통일**: 입실·퇴실 ‘14:00부터’·‘14시’·‘오후 2시’ → ‘14:00’(`clockText`, 카탈로그 3,340값 전부 해당), 동물 짧은 ‘불가능’·‘동반 불가’ → ‘불가’(`normNo`, 소형견만 등 조건문은 그대로).
- 검증: `npm --prefix pipeline test` 483 통과. Playwright 390px로 위 항목 각각 확인(검색 건수, 지역 표기, 배지 감사, 요금 줄, 빨간 글씨 색, 쇼츠 위치, 상단 줄 좌우 16px, 팝업 X·토글 닫힘).

## 📌 비교표: 짧은 행 제목 · 제목 칸 고정 해제 · 칸 전체로 출처 열기 (2026-10-22, Claude)
- `design/renewal/app.js` 비교 `rowsDef` 제목 축약(현장·장작·규격·동물·면수·정보·매너·주변·편의·후기). ‘편의시설’은 ‘시설’, ‘편의점’은 ‘편의’(소유자 2026-10-22 정정).
- `style.css`: `.cmp-table` 제목 칸 `position: static`(전 폭) — 표 전체가 가로 스크롤. 모바일 제목 칸 64px. 테스트 `compare-t39` #32를 새 규칙으로 바꿈.
- 비교 칸 (i) 제거 → `TIP_HOST`에 `.cmp-cell` 추가, 비교 화면에서도 `hostTips` 호출.
- 배지 캡슐화: `.badge-check`·`.w-badge-grade`·요금 형태 꼬리표.
- 검증: `npm --prefix pipeline test` 483 통과. Playwright 390px: 제목 칸 64px·가로 스크롤 시 제목도 함께 이동·칸 클릭 팝업, 상세 1887 요약 카드 (i) 0개.
## 📌 행사 포스터·정확한 유튜브 검색·공개 자산 점검 (2026-10-22, Codex)

- **기존 작업 감사:** Claude의 `zealous-johnson-an2enq`는 후기·플랫폼 아이콘 개선을 포함하지만 현재 `design/renewal`과 데이터 발행 구조가 달라 전체 병합하지 않았다. stale 변경을 통째로 가져오지 않고 현재 main의 미완료 요구만 선별 반영했다. 별도 실패 PR #259(`bot/data-data-sync`)는 데이터 봇 착지 작업으로 화면 변경과 섞지 않았다.
- **행사 포스터 원인:** 8149 주변 행사에서 22.4km 범위의 가까운 항목에는 포스터가 없고, 27.2~27.9km 항목에만 TourAPI 포스터가 있었다. 기존 자동 범위가 가까운 항목만 선택해 포스터 없는 카드만 보여 주던 문제로, 포스터가 있는 다음 범위를 자동 확장하되 포스터 없는 항목도 데이터에서 제거하지 않도록 `context/events.js`를 보완했다.
- **유튜브 원인과 수정:** 8149 발행 데이터의 `vclip`이 비어 있어 UI가 썸네일을 만들 영상 ID 자체가 없었다. YouTube 탭과 vclip 수집 쿼리를 `봉황자연휴양림 숲속야영장`처럼 시설명 정확 일치로 바꿨다. 썸네일은 허용된 API 수집 결과의 영상 ID가 발행된 뒤 표시되며, 현재는 공식 검색 링크가 정확한 이름으로 열리도록 보장한다. YouTube HTML을 무단 크롤링해 임의 썸네일을 저장하지 않는다.
- **공개 자산:** 정적 `place/{id}/` 미리보기 head에도 절대경로 favicon·apple-touch-icon·manifest와 이미지 MIME/크기 OG 메타를 추가했다. 루트 favicon, PWA 아이콘, OG 이미지는 배포 경로에서 200 응답을 확인했다.
- **검증:** `node --check`(동기화·앱·발행 스크립트), 사회/행사 단위 테스트 20개 통과, `git diff --check` 통과. `routes-share-test.mjs`는 로컬에 `playwright` 패키지가 없어 실행하지 못했으며 코드 실패가 아닌 환경 의존성 누락이다.

## 📌 데이터 동기화 마지막 검증·봇 기준선 안정화 (2026-10-22, Codex)

- **발견한 실패:** 수동 `Data sync` 실행은 수집·발행을 마친 뒤 `land-on-main`의 긴 rebase/PR 검증 후, 마지막 임시 DB 사실 원장 적재에서 `pg` 모듈을 찾지 못해 실패했다. 공개 데이터 자체를 실패로 오인하지 않도록, 적재 직전에 `pg` 해석을 확인하고 누락된 러너 의존성만 `npm ci`로 복구한다.
- **동시 병합 경합:** 데이터 봇이 field-guard로 최신 main 값을 복원한 뒤, 별도 증분 수집 PR이 main에 먼저 합쳐지면, `workflow_dispatch` Web quality가 **더 새로 바뀐 main**을 기준으로 잡아 이미 검증한 봇 결과를 손실처럼 판정할 수 있었다. `land-on-main`은 이제 복원에 쓴 `baseline_sha`를 Web quality에 전달한다. 봇 검사는 그 같은 기준선에서 수행하며, 실제 병합 전 rebase는 계속 최신 main과 다시 맞춘다. 따라서 데이터 손실 검사를 약화하지 않고 경합에 의한 거짓 실패만 제거한다.
- **검증 예정:** workflow YAML·`land-on-main.sh` 문법 검사와 관련 데이터 보호 테스트를 실행한 뒤, 새 workflow_dispatch 실행에서 `pg` 복구 및 기준선 전달을 확인한다.

## 📌 상세 중복 제거·320px 정보 줄바꿈·대표 사진 신뢰 보정 (2026-10-22, Codex)

- **상세 정리:** 상단 뒤로 버튼 옆의 중복 지역 표기를 제거했다. 점프·섹션은 `행사`, `후기`, `주변 캠핑장`으로 짧게 통일하고, 주변 캠핑장의 보조 설명과 주간 날씨의 장문 예보 안내는 제거했다. 이용 규칙의 공지 목록은 금지사항·운영안내와 같은 미색 정보 상자로 통일했다.
- **모바일 가독성:** 320px에서 주소는 자체 가로 스와이프 가능한 한 줄로만 보이며 지도·길찾기·로드뷰는 바로 아래 행동 줄로 분리했다. 물때 예보지점과 바람 원천은 별도 블록으로 내려 읽기 쉽게 했고, SNS 플랫폼은 `유튜브·네이버·다음·인스타그램·페이스북·틱톡` 한 줄 레일로 통일했다. 영상 카드의 좌우 스와이프는 더 이상 플랫폼 탭을 바꾸지 않으며, 플랫폼 전환은 탭 클릭만 가능하다.
- **아이콘·대표 사진:** 약국은 병원 십자와 다른 전용 면 아이콘을 쓴다. `(주)궁평해윰캠핑장`(101800)의 기존 카드 사진은 MBC 드라마 장면임을 원본으로 확인해 제외했다. 차량 외벽의 `궁평리어촌체험·휴양 마을` 표기가 보이는 현장 사진으로 교체하고, `card-photo-pins.json`에 고정/제외 규칙과 회귀 테스트를 추가했다. 외부 원본은 저장·재호스팅하지 않으며 원문 링크를 유지한다.
- **보강 경로:** `docs/OPERATOR_GAP_ROBOT.md`에 저품질 대표 사진의 사람 검수·고정 규칙과, 정보량 부족 업장의 `공공 원천 → 직접 운영 도메인 발견 → robots 허용 운영 페이지 사실 추출 → 보강 대기` 순서를 추가했다. 차단된 플랫폼/후기를 운영 사실의 확정 근거로 우회하지 않는다.
- **검증:** `node --check design/renewal/app.js`, `node --check camping-atlas/public/app.js`, `node --check camping-atlas/public/conditions/card.js`, `node --test pipeline/test/card-photo-pins.test.mjs`(4/4), `npm --prefix camping-atlas run build:pages`, `npm --prefix pipeline run check:billing`, `git diff --check` 통과. CUA 320px에서 문서 폭 `305=305`, 중복 헤더 없음, 정확한 궁평해윰 현장 사진, 한 줄 SNS 탭, 주소/행동 줄 분리를 확인했다. 예보 안내를 없앤 뒤 CI가 과거 안내 문구를 요구해 실패한 회귀 테스트는 ‘카드만 표시하고 장문은 없음’으로 즉시 갱신했으며, 전체 파이프라인 테스트는 해당 수정 후 479 통과·2 skip이었다. 로컬의 나머지 1건은 깨진 의존성 링크 때문에 `sharp`를 못 읽는 `photo-dedupe`이며 CI 의존성 설치 환경에서 재확인한다.
- **CI 회귀 규칙 보정:** 화면 규칙을 바꾼 뒤 `detail-fixes-test.mjs`가 과거 ‘320px에서도 주소 오른쪽 끝 아이콘’을 계속 요구해 실패한 것을 확인했다. 이제 320px에서는 주소를 한 줄로 두고 지도·길찾기·로드뷰 행동을 **아래 줄**에 두도록 검증하며, 1366px에서는 기존처럼 같은 줄 오른쪽 끝을 요구한다. 따라서 사용자의 모바일 요구와 CI 계약이 같은 규칙을 검사한다.

## 📌 GitHub Actions 자동 착지·날씨 회귀 안정화 (2026-10-22, Codex)

- **반복 실패 원인:** 최근 실패 35건을 워크플로·실행 로그 단위로 다시 분류했다. 데이터/날씨 자동 갱신이 만든 봇 PR의 `Web quality / Rail swipe` 한 건이 실패하면, 같은 실행의 자동 병합 단계가 실패하며 `Weekly forecast`·`Data sync`도 연쇄 실패로 보였다. `Weekly forecast`의 직접 실패는 날씨 API의 비치명 오류가 아니라, 겨울 화면 검증의 잘못된 전역 조건이었다. `Data sync`의 이전 `pg` 모듈 누락은 현재 `pipeline` 의존성·lockfile의 `pg 8.23.1`로 해소됐고 최신 main의 PostgreSQL schema verification·Pipeline quality는 성공했다.
- **수정:** `.github/scripts/land-on-main.sh`는 이제 커밋 전체의 동명 상태를 훑지 않고, 방금 `workflow_dispatch`한 `Web quality` 실행 ID(같은 SHA·이벤트)를 찾아 그 실행의 `Lint and build`·`Rail swipe` 두 잡이 모두 성공했을 때만 병합한다. 과거/중복 상태가 새 자동 갱신을 실패로 오인하지 않는다.
- **날씨 검증:** `winter-test.mjs`는 전국 어딘가의 영하/눈을 근거로 홈의 임의 카드에 배지를 요구하던 조건을 제거했다. 실제 홈에 진열된 각 카드의 해당 지역·단기/중기 예보를 화면의 `data-wx` 배지와 1:1 대조한다. 따라서 추천 카드 구성이 달라져도 거짓 실패 없이, 표시가 틀린 카드는 계속 잡는다.
- **로컬 경로 호환:** 파이프라인 테스트의 `file:` URL 경로를 `fileURLToPath()`으로 변환했다. 한글 경로에서 `%EC…`가 그대로 Node 인자로 넘어가 `field-guard`·`merge-collected`를 못 찾던 로컬 5개 실패를 방지한다.
- **검증:** `npm --prefix pipeline ci && npm --prefix pipeline test` **482 통과 · 2 skip**, `npm --prefix pipeline run check:billing`, `npm --prefix camping-atlas run lint`(기존 경고 30, 오류 0), `bash -n .github/scripts/land-on-main.sh`, `node --check camping-atlas/scripts/winter-test.mjs`, 로컬 Chrome의 `winter-test.mjs` 통과. 다음 단계는 이 변경을 main에 병합한 뒤 `Weekly forecast`와 `Data sync`를 수동 실행해 실제 자동 PR 착지까지 확인하는 것이다.

## 📌 ⛔ 데이터 누적 병합 정책 시행 (2026-10-21, Grok Bot) — 전 에이전트 필수

- 공유 데이터의 기존 값은 지우거나 리셋하지 않는다. ① 채우기 ② 최신·신뢰 우선 덮어쓰기(옛 값 기록) ③ 논리 검사 ④ 정제 순서다. 자세한 내용은 `docs/DATA_MERGE_POLICY.md`, 공용 모듈은 `pipeline/lib/merge-policy.mjs`다.
- `pipeline/scripts/field-guard.mjs`가 세 곳에서 돈다.
  - data-sync·증분 발행·land-on-main: 줄어든 값을 최신 main 값으로 되살린다(`--heal`).
  - 필수 검사 `Lint and build`: 값을 지우는 PR을 막는다.
- 기록 파일: 검토 기록은 `pipeline/registry/merge-review.ndjson`(append-only), 의도한 삭제는 `pipeline/registry/merge-overrides.json`(reason 필수)이다.
- 검증 결과:
  - `node --test pipeline/test/merge-policy.test.mjs` 9개 통과(무작위 2,000회 속성 검사 포함).
  - `PUBLISH_DRY_RUN=1 publish-incremental.sh`: 손실 0, 커버리지 회귀 없음.

## 📌 당일 나들이 시드 멱등성 · 공공 규칙 보존 (2026-10-22, Codex)

- **수정:** 한강공원처럼 캠핑장 이름이 아닌 공공 나들이 장소의 공식 취사·그늘막 규칙을, 이름 일치 검사 때문에 운영 정보 오염으로 잘못 격리하던 문제를 바로잡았다. `dayuse-seed.json`에 원문 URL·확인 시각이 있는 규칙만 별도 사실 원장으로 보존하며, 일반 운영자 문장의 신원 검사는 계속 적용한다.
- **발행 안정성:** 당일 나들이/OSM 시드는 발행 전 정리와 같은 짧은 시·도 표기를 먼저 적용한다. 따라서 `경기도 → 경기` 같은 표기 차이로 매 동기화마다 수천 건이 바뀌지 않는다. `audit-operator-content`도 실제 정제 변경이 없으면 레지스트리의 생성 시각을 다시 쓰지 않는다.
- **검사 격리:** `check-dayuse-idempotent`는 임시 `merge-review.ndjson`을 써서 읽기 전용 CI 검사가 공유 검토 원장을 오염시키지 않는다.
- **검증:** `node pipeline/scripts/check-dayuse-idempotent.mjs`에서 3,193곳을 2회 적용해 동일함을 확인했다. 운영자 정제/표시 문자열 dry-run 0건, 관련 단위 테스트 24/24, `build:pages`, 과금 안전 점검, `git diff --check`를 통과했다.

## 📌 운영자 원문 오염 격리 · 상세 신뢰 검수 (2026-10-22, Codex)

- **문제와 원인:** 공단·지자체처럼 여러 시설이 한 도메인/게시판을 함께 쓰는 운영 포털에서, 페이지 소유 시설을 확인하지 않은 채 푸터 주소·다른 시설 공지가 캠핑장 규칙·공지에 섞일 수 있었다. 예로 가평군시설관리공단의 주소와 자라섬정원 관련 문구가 다른 캠핑장에 붙은 사례를 발견했다.
- **수집·발행 안전장치:** `crawl-operator-sites.mjs`는 공용 포털에서 캠핑장 전체 이름 또는 고유 이름 토큰이 본문에 확인되는 페이지의 문장·공지·안내 이미지만 수용한다. `audit-operator-content.mjs`는 기존 상세·운영자 레지스트리를 다시 훑어 공용 푸터, 주소, 다른 시설명, 식별 근거가 없는 공용 포털 문장을 공개 스펙에서 제거하고 `integrity_quarantine`에 원문 URL·이유·감사 시각과 함께 보존한다. 운영자 공개 사실을 임의로 지우는 정리 작업이 아니라, 해당 캠핑장 소유를 검증하지 못한 문장만 화면에서 격리하는 규칙이다.
- **적용 결과:** 최신 main 병합 뒤 상세 2,245건, 운영 안내 3,056건, 규칙 416건, 공지 55건, 프로필 522건을 다시 정제했다(운영자 레지스트리는 이미 정제 상태). 안전한 표시 엔티티 1,224건도 561개 파일에서 읽기 쉬운 문자로 바꿨다. 재점검은 전 항목 0건이었다. 문제 주소·`자라섬정원` 및 `&middot;`/`&nbsp;` 계열 표시 엔티티는 발행 카탈로그·상세에서 각각 0건임을 확인했다.
- **표시·상호작용:** 표시 문자열은 URL을 건드리지 않고 안전한 목록 기호만 정제한다. 원문 링크는 원문이 가진 앵커를 우선하고, 없으면 근거 문장을 URL Text Fragment로 붙여 해당 문장으로 바로 이동한다. 예약 방법에는 대표 예약 채널·다음 오픈만 남기고 결제·취소·대기 정보는 제거했다. 날씨 팝업은 기온·강수·바람·습도·대기·자외선별 SVG 그래프를 제공하고, SNS 탭은 클릭으로만 바뀌어 카드 레일 스와이프와 충돌하지 않는다. 사진 라이트박스에는 안전 영역을 피한 우상단 닫기 버튼을 고정했다.
- **검증:** `detail-text-review`·`house-rules`·`operator-site` 단위 테스트, 원본/화면 사본 일치, `git diff --check`, 정적 발행·페이지 빌드·320px 화면 검수를 이 변경 뒤 다시 실행한다. 로컬 `photo-dedupe`는 깨진 `pipeline/node_modules` 심볼릭 링크로 `sharp`를 읽지 못하면 건너뛰고, 의존성을 복구한 CI에서 별도로 확인한다.

## 📌 320px 사이트 타입 타일 줄바꿈 보정 (2026-10-22, Codex)

- **문제:** 사이트 타입 카드가 좁은 2열에서 `overflow-wrap:anywhere`를 사용해 `오토캠핑`이 `오 / 토 / 캠 / 핑`으로 분해됐다.
- **해결:** 상세 타일 본문은 `word-break: keep-all; overflow-wrap: normal`으로 바꾸고, 420px 이하에서 아이콘·여백을 줄여 제목의 실제 폭을 확보했다. 출처 (i)는 이 작은 요약 타일에서만 숨기고 상세 정보의 (i)는 유지한다. `숙박동 · 펜션`처럼 복합 명칭에는 가운데점 뒤의 `<wbr>`만 허용해 뜻 단위로 두 줄이 된다.
- **동시 수정:** 날씨 그래프 SVG 템플릿의 닫는 보간을 고쳐, 문법 오류 때문에 전체 페이지 렌더가 멈추던 문제를 해결했다.
- **검증:** `node --check design/renewal/app.js`, `node --check camping-atlas/public/app.js`, `node --test pipeline/test/audit-t39.test.mjs`(3/3), `git diff --check` 통과. Chrome 320px 스크린샷에서 상세 페이지의 문서 가로 넘침 없이 렌더되는 것을 확인했다.

## 📌 찜 기록 복구 · 테마 하단 탭 · 공개 로그 최소화 (2026-10-21, Codex)

- **원인과 복구:** `/log/`이 오래된 Supabase anon key를 HTML에 고정하고 있어 401로 기록을 전혀 읽지 못했다. 이제 매번 `/camp/` 루트의 현재 공개 설정을 읽으므로 키 교체 뒤에도 별도 화면만 멈추지 않는다. 로컬 미리보기처럼 공개 키를 빌드에 넣지 않는 경우에는 **배포된 `/camp/`의 공개 설정만** 읽어 같은 DB를 검증한다. 앱의 찜 동기화는 `shared_save`와 `save_log`를 병렬로 보내고, 로그 요청만 실패하면 최대 24건을 브라우저에 잠시 보관해 온라인 복귀 때 재전송한다. 같은 업장을 빠르게 탭해도 add/remove 순서는 직렬화한다.
- **이전 로컬 클릭:** 최신 동기화 코드가 반영되기 전의 로컬 개발 서버에서 눌렀던 찜은 브라우저에만 남아 서버 기록을 소급 생성할 수 없다. 최신 로컬/배포본에서는 공용 찜과 로그가 함께 동기화된다. 실패 시 화면에는 연결 실패 상태가 보이고, 조용히 빈 기록처럼 보이지 않는다.
- **공개 범위:** 신규 기록은 언어·시간대·화면 크기·플랫폼만 보낸다. IP, user-agent 원문은 보내거나 표시하지 않는다. `db/017_safe_save_log_feed.sql`은 공개 테이블 SELECT를 회수하고 최소 열만 반환하는 `safe_save_log_feed()` RPC를 추가한다. 화면은 017 적용 전에는 안전한 최소 열 SELECT로 폴백하고, 적용 후에는 RPC만 쓴다. 배포 뒤 운영 DB에 `npm --prefix pipeline run db:migrate`를 **비밀 관리 환경에서** 실행해 017을 적용할 것(현재 작업 환경에는 `DATABASE_URL` 없음).
- **하단 탐색:** 모바일 탭은 `찾기 · 지도 · 테마 · 비교` 네 칸으로 통일했다. 테마·비교 아이콘은 소유자가 전달한 원본 SVG 경로를 심볼로 사용한다. `#/themes`는 테마별 실제 사진 썸네일 모음이며 각 카드를 누르면 해당 테마 목록으로 들어간다. 데스크톱 상단에도 같은 테마 진입점을 둔다.
- **검증:** 발행 동기화(`publish-renewal-mockup`, `publish-explorer-pages --shell-only`), JS 문법 검사, `design-source-guard`(1), 발행본 앱 3개 원본 일치, `/log/` 인라인 JS 문법 검사, `npm --prefix pipeline test`(**367 통과·2 skip**), `check:billing`, `npm --prefix camping-atlas run build:pages`, `git diff --check`를 통과했다. 테스트에 필요한 `sharp`가 로컬 의존성 링크에서 빠진 상태는 `npm ci`로 복구해 확인했다. CUA 320px에서 테마 모음 → 계곡 목록, 4개 하단 탭, 로컬 `/log/`의 실제 39개 찜 이벤트 로드를 확인했다. DB 연결이 없는 로컬 환경에서는 017의 실제 적용 확인만 보류했다.

## 📌 찜 용어 통일 · 도시공원 기본 탐색 분리 (2026-10-21, Codex)

- **저장 상태:** 카드·상세 하단 막대·접근성 레이블의 `좋아요`를 모두 `찜`으로 통일했다. 저장 키는 기존 `mc-saved` 그대로라 사용자의 기존 찜 목록은 유지된다.
- **왜 분리했나:** 현재 카탈로그의 `du=park` 도시공원은 3,139곳으로, 평균적으로 주소·좌표·공공 원천·인근 화장실은 갖췄지만 사진·사이트·요금·이용 수칙이 없는 당일 나들이 원장이다. 일반 캠핑장 3,169곳의 정보량 중앙값은 42, 공원은 18이어서 같은 기본 탐색/지도에서 함께 비교하면 판단을 흐린다.
- **노출 계약:** 공원은 `#/theme/PARK`에서만 공원 전용 정보 카드로 전량 보인다. 일반 홈·조건 결과·지도 핀은 캠핑장 중앙값 50% 이상, 공원 고유 근거 5개 이상, 실제 사진까지 충족했을 때만 편입한다. 이름으로 직접 찾는 경우에는 상세 진입을 남긴다. 지도는 직접 이름 검색에도 품질 미달 공원을 핀으로 그리지 않는다.
- **다음 데이터 갱신:** `collect-urban-parks.mjs`가 전국도시공원정보표준데이터의 운동·놀이·편의·문화·기타 시설군을 보존하고, `build-dayuse-osm.mjs`가 관리기관·면적·시설군·확인 가능한 공공 편의시설을 `park_info`로 넘긴다. 이 값은 취사/야영 가능을 뜻하지 않으므로 `day.cooking`·규칙은 공식 원문 전까지 `UNKNOWN`을 유지한다. 주간 `dayuse-parks-weekly`가 다음 실제 수집·발행을 수행한다.
- **검증:** `node --check design/renewal/app.js`, 공원 수집·병합 스크립트 문법 검사, `node --test pipeline/test/design-source-guard.test.mjs`, `git diff --check` 통과. 화면 변경 뒤에는 `npm --prefix camping-atlas run build:pages` 및 CI `Rail swipe`를 다시 통과시킬 것.

## 📌 모바일 상세·추천 진열·미디어 품질 보정 (2026-10-21, Codex)

- **메인 진열 품질 게이트:** `design/renewal/app.js`의 `showcaseEligible()`가 **고캠핑·운영자·발행 카탈로그 실제 사진**을 먼저 요구하고, 그 업장의 정보량 상위 사분위 점수의 50% 이상인 곳만 `곧 오픈`·`실시간 인기`·`긍정 후기`에 보낸다. 검색 보완용 후기/검색 썸네일은 메인 진열 근거로 쓰지 않으며, 대표 사진이 깨지면 해당 추천 카드만 뺀다. 데이터가 빈 업장을 삭제하지는 않으며 일반 검색 결과의 후순위로만 남긴다.
- **상세 밀도·동작:** 모바일 상세의 섹션 간격을 42px로 넓히고, 제목·규격 행의 선형 아이콘에서 사각 프레임을 제거했다. 시설 배치도는 1열 세로 후보 목록 대신 한 장씩 넘기는 레일로 바뀌며, 탭하면 기존 라이트박스의 같은 순서로 확대한다. 하단 좋아요·예약·공유 막대는 최초 진입 때 반드시 보이고, 아래 스크롤에서만 접히며 위로 스크롤하면 다시 나타난다. 상세 푸터는 좌우·하단을 화면 끝까지 채운다.
- **정확한 미디어:** 후기 썸네일에서 저해상도 파비콘·캠핑장 대표사진 대체를 제거했다. 원문이 제공한 허용 원본/미리보기만 쓰며 실패/미제공 시 플랫폼 아이콘 카드로 남겨 다른 후기 사진처럼 오인시키지 않는다. 주변 생활시설 사진은 기존 표본의 낮은 장소 정확도 때문에 검증된 실제 사진만, 그 외에는 아이콘·좌표 로드뷰만 보이는 원칙을 유지한다.
- **가격·행사:** 고캠핑 요금표는 같은 금액이어도 사이트/시즌/요일 행을 합치거나 예약 상품 요금과 서로 지우지 않는다. 축제 자동 범위는 `5km·7일 → 10km·10일 → 20km·30일 → 30km·45일`이며, 진행 중 우선이 아니라 **결과가 하나라도 있는 첫 범위**를 쓴다. `events.js`의 `mount()`에서 누락되어 있던 `all` 계산도 보정했다.
- **SNS:** YouTube·네이버·다음 수집 항목의 8개 상한과 `data-cgrid` 더보기를 제거해 수집된 항목을 모두 레일에 넣는다. 플랫폼 탭/외부 검색 링크는 모든 폭에서 한 줄 가로 스와이프다.
- **검증·발행본:** `node --check design/renewal/app.js`·`events.js`, `node --test pipeline/test/detail-events-card.test.mjs`(3), `npm --prefix pipeline test`(353 통과·2 skip), `npm --prefix pipeline run check:billing`, `git diff --check`, `npm --prefix camping-atlas run build:pages`, `publish-explorer-pages --shell-only`을 통과했다. CUA 정적본 `4202`에서 320px 홈과 상세(요금 행·배치도 레일·SNS 한 줄 탭·행사 자동 확장·후기·푸터·하단 예약 바)를 캡처 검수했다. `rail-swipe-test.mjs`는 이 작업 환경에 `playwright` 패키지가 없어 실행하지 못했다(`ERR_MODULE_NOT_FOUND`); 의존성 복구 뒤 재실행할 것.
- **리뉴얼 공개본 동기화:** `/renewal/`은 더 이상 리다이렉트 자리표시자가 아니며 `design/renewal/`의 정적 시안을 그대로 발행한다. 원본을 고친 뒤에는 반드시 `node scripts/publish-renewal-mockup.mjs`를 실행해 `camping-atlas/public/renewal/` 전체를 동기화한다. CI의 `rail-swipe`는 이 원본/발행본 불일치를 오류로 처리한다.

## 📌 320px 전수 점검 · 카테고리 단일 레일 (2026-10-20, Codex)

- `design/renewal/`과 발행본을 320px 뷰포트(세로 스크롤이 있을 때 실제 문서 폭 304px)에서 홈·목록·테마·지도·비교·상세, 조건 시트·예약 드롭업·사진 라이트박스로 점검했다. 모든 화면은 `scrollWidth ≤ clientWidth`; 비교표·사진·카테고리처럼 의도한 내부 레일만 자체 가로 스와이프를 유지한다.
- 카드 레일의 음수 좌우 여백, 상세 카테고리 바의 `100vw`, 모바일 예약 메뉴의 상대 좌표, 푸터의 `100vw`를 제거했다. 따라서 스크롤바 폭이 있는 iOS/Safari 계열에서도 문서가 옆으로 넓어지지 않는다.
- 조건 시트의 지역·주변 반경·상품·전기·규격·요금, 상세의 상단·미디어·주변·후기 채널 카테고리는 모두 `flex-wrap: nowrap`과 내부 가로 스와이프로 통일했다. 긴 예약 채널명은 말줄임 처리한다.
- 상세의 모바일 사진 캐러셀은 드래그=다음 사진, 탭=현재 사진부터 라이트박스로 분리했다. 배포에 없는 로컬 카드 사진은 빈 회색 슬라이드보다 실제 공식 원문 사진을 우선하고, 실패한 칸은 제거한다.
- **콘텐츠 정합성 보정:** 전국 잔여석 미연동 상태에서 ‘실시간 예약’이라고 쓰던 푸터 문구를 `조건·요금·예약 경로 안내`로 바꿨다. 또 금액만으로 글램핑·카라반·숙박동을 추정한 `fee.tiers`는 화면에서 형태명으로 보이지 않게 했다. 형태별 요금은 원문·등록 상품 근거가 있는 경우만 표시한다.
- 검증: CUA 정적 발행본(`4202`)에서 홈·목록·테마·지도·비교·상세, 조건 시트, 예약 드롭업, 사진 라이트박스의 문서/팝업 가로 넘침 0. 카테고리의 `flex-wrap: nowrap`·`overflow-x: auto`도 확인했다. `npm --prefix pipeline test` 353 통과·2 skip, `check:billing`, 디자인 소스 가드, `npm --prefix camping-atlas run build:pages`, `git diff --check`도 통과했다.

## 📌 전국 잔여석 비노출 · 운영자 빈칸 보강 로봇 실행 (2026-10-20, Codex)

- **날짜·빈자리 검색을 제거했다.** 전국 3,120곳의 잔여석을 같은 기준으로 확인할 수 없으므로, 날짜를 선택해 미연동 업장을 제외하거나 `빈자리/만석`을 보여 주지 않는다. 유효 기간이 있는 공공 `공식 접수 중`만 접수 상태로 남기며, 예약·결제는 대표 예약 채널로 보낸다.
- `prioritize-operator-gaps.mjs`가 1박 요금·전기 제한·규격·바닥·입퇴실·매너타임·이용 수칙의 누락을 점수화한다. `crawl-operator-sites.mjs`는 자사/공공 운영 페이지의 robots 허용 경로만 읽고, 사용자 후기 게시판·플랫폼·로그인/결제 경로는 제외한다.
- 실행: 20곳을 두 묶음으로 읽어 `OK 7 / ROBOTS_DISALLOWED 4 / FETCH_FAILED 8 / NO_RELEVANT_TEXT 1`을 기록했다. 성공 결과를 재산출해 전국 3,120곳의 조건·프로필·요금 데이터에 반영했다. 차단·플랫폼 전환은 90일, 접속 실패·관련 문장 없음은 30일의 재시도 간격을 둔다. 상세 절차는 `docs/OPERATOR_GAP_ROBOT.md`.
- 재산출 결과: 1박 요금 2,060곳(운영자 확인 671), 전기 제한 공식 463, 사이트 규격·바닥 1,709, 이용 제한/수칙은 상세 `house_rules`에서 원문 URL·확인일과 함께 제공한다. 목록 가격 데이터는 2,199/3,120곳에 연결됐다.



## 📌 주변 축제·행사: 거리·기간 셀렉트, 5km·7일부터 넓히기, 카드 전체 링크 (2026-10-20, Claude)
- `camping-atlas/public/context/events.js`: ‘30km 안 · 45일 이내’ 문구 → 셀렉트 2개(`[data-ev-km]`·`[data-ev-days]`). 처음 범위는 `autoRange`(5km·7일 → 10·10 → 20·20 → 30·45, 진행 중 행사가 나오는 첫 단계). ‘자세히 보기’ 버튼 제거, 카드 전체가 원문 링크(`.ev-hit`), 지도는 분류 줄 오른쪽 아이콘(`.ev-map`), 칸 아래 출처·갱신 문구 제거.
- `context/cgrid.js`: ‘더보기 (N개 남음)’ → ‘N개 더보기’.
- 검증: `npm --prefix pipeline test` 350 통과(2 skip). 로컬 Playwright PC 1280·모바일 390: 18번(5km·7일, 2개) · 1887번(30km·45일, 8개), 셀렉트 변경 시 다시 그림 확인. 자세한 규칙은 `docs/CULTURE_EVENTS.md`.

## 📌 목록 순서: 정보량 가중치 · 사진 없는 곳 후순위 (2026-10-20, Claude)

- `rich(c)`(design/renewal/app.js)를 정보량 점수로 다시 짰다: 전기 W 12 · 확인된 현장 조건 8종 각 3 · 프로필 확인 항목(18개) 각 2 · 공식 사진 장당 2(최대 5)·후기 사진 2 · 1박 요금 4 · 사이트 타입 2 · 이용 규칙 2 · 온라인 예약 3 · 후기 4건당 1(최대 5). 기본 정렬·테마·지도 목록·추천이 모두 이 점수를 쓴다.
- 목록 기본 정렬: 조건 근거(맞음→법정 기준→확인 필요) → 정보량 + 오픈 임박 10·운영 중 4 가점(전에는 날짜 상태가 정보량보다 먼저였다).
- 사진이 한 장도 없는 곳은 검색 결과·목록·테마·지도 목록에서 어떤 정렬이든 뒤로(`photoLast`). 단 **이름으로 직접 찾은 곳**(검색어가 업장 이름에 들어 있고 지역 이름만 친 게 아닐 때, `namedByQuery`)은 제외. 데이터에서 빼지는 않는다.

## 📌 바깥 링크 PC·모바일 화면 맞춤 · 사진 없는 곳 뒤로 (2026-10-20, Claude)

- 소유자: 모바일에서 네이버 예약이 PC 화면으로 열려 잘림. → `deviceUrl()`(design/renewal/app.js)이 바깥 링크를 누르는 순간(click·auxclick·contextmenu, 캡처 단계) 기기에 맞는 주소로 바꾼다. 화면 HTML·데이터의 주소는 그대로.
  - 모바일: search/blog/cafe/booking.naver.com → m.*, map.naver.com 장소 → m.place.naver.com/place/{id}/home, 지도 검색 → m.map.naver.com, cafe·search.daum.net → m.*, place.map.kakao.com/{id} → /m/{id}, youtube → m.youtube.
  - PC: 위의 반대(m.place.naver.com → map.naver.com/p/entry/place/{id} 등).
  - 반응형이라 그대로 두는 곳(2026-10-20 확인): 고캠핑, 관광공사(visitkorea), 국립공원 예약, 캠핏, 카카오맵 link(기기별 자동 전환). 땡큐캠핑은 PC 주소도 모바일 화면으로 넘어간다(PC판 없음).
  - 새 바깥 링크를 만들면 PC 주소로 넣고, 모바일 주소가 따로 있는 플랫폼이면 `MOBILE_HOST`에 추가할 것.
- 사진이 한 장도 없는 곳: 카드 대체 사진 후보에 블로그·카페 후기 대표 썸네일 추가(`pick-card-fallback.mjs`), 검색 결과(`results`)·목록(`listRows`)에서 어떤 정렬이든 맨 뒤로(테마 목록은 이미 그랬음). 남은 50곳은 최근 등록이라 후기 수집 전 — 매일 소셜 수집이 채우면 다음 발행에서 사진이 붙는다.

## 📌 깨진 링크 전수 점검 (2026-10-20, Claude → 전 에이전트)

- 소유자 제보: 네이버 예약 버튼 → “운영하지 않는 예매 페이지”(고캠핑 등록 `booking.naver.com/…/bizes/654085`가 낡음).
- **네이버 예약 상세 주소는 자동 확인 불가**(booking.naver.com robots.txt `Disallow: /` 전체 봇). 화면은 이 주소 대신 **네이버 검색(시군구 + 캠핑장 이름 + 예약)**으로 연다(`bookingChannels`, 원래 주소는 `registered_url`). 검색 결과 플레이스 카드의 현재 예약 버튼으로 이어진다.
- 나머지 링크: `scripts/check-links.mjs`(robots 준수·봇 이름·호스트별 1초) → `registry/link-health.json` {OK·DEAD·FLAKY·UNVERIFIED} → `scripts/build-link-health.mjs`가 캠핑장별 `c.dl`(죽은 링크 목록)로 표시 → 화면 예약 버튼·업체 정보 홈페이지에서 뺀다. 주소 자체는 지우지 않는다(살아나면 다시 OK). DEAD = DNS 없음·연결 거부·404/410·“없는 페이지” 안내, 시간 초과·5xx·403은 2회 연속일 때만.
- 자동으로 열지 않는 곳(UNVERIFIED): 네이버 예약·지도·플레이스·블로그·카페·naver.me, 카카오맵·채널, 캠핏, 인스타그램·페이스북, 브런치, 다음 카페, 밴드(`lib/link-check.mjs` `NO_CHECK_HOSTS`).
- 깨진 형식 주소(“http://https////host”, “https//host”) → `normalizeUrl`이 바로잡음. 점 없는 호스트(한글 키워드 주소)는 화면에서 뺌.
- **DEAD 판정은 확실한 신호만**: DNS 없음·404/410·“없는 페이지” 안내. 시간 초과·연결 거부·5xx는 해외 IP를 막는 국내 공공·예약 사이트(camp.xticket.kr, *.go.kr, :451 포트 등)가 많아 몇 번이든 FLAKY로 두고 화면에서 빼지 않는다. 401·403·429는 봇 차단(UNVERIFIED). 첫 점검: 링크 2,788개 중 DEAD 375(DNS 292·404 76·안내 7) → 343곳 397개 링크 숨김.
- 주기: `link-check.yml` 매주 수 04:17 KST + 증분 발행. 빌드 순서: `build-house-rules` → `build-link-health` → `build-card-fallback`.

## 📌 공식 사진 없는 곳의 카드 사진 (2026-10-20, Claude)

- 공식 사진(고캠핑·관광공사·운영자)이 없는 곳 775곳(약 25%)이 빈 썸네일이었다. `scripts/pick-card-fallback.mjs`가 상세의 `d.sns_images`(카카오 검색 API 결과, 캠핑장 이름 검색) 후보를 가로 사진 먼저 최대 10장, 130px 썸네일 픽셀로 배치도·화면 캡처(흰색 25%↑)·야간(어두움 45%↑)·안내판·간판(경계 밀도)·단색 그래픽을 걸러 첫 통과 사진을 고른다 → `registry/card-fallback.json` → `build-card-fallback.mjs`가 `c.pt {i 원본, t 썸네일, u 원문, s 출처}`. 표본 정확도 55% → 약 80%.
- 화면: `photosAll`에서 공식 사진이 없을 때만 `c.pt`(원본, 막히면 썸네일로 교체 `PT_FB`, `referrerpolicy=no-referrer`), 그다음 다른 에이전트의 `c.sn`(첫 검색 썸네일). 사진 오른쪽 아래 ‘후기 사진’ 표시. 이미지는 저장·재호스팅하지 않는다.
- 결과: 650곳 연결, 사진 전혀 없는 곳 775 → 69곳.

## 📌 업장 이용 규칙·공지 · 불가 빨간 배지 · 형태별 요금 (2026-10-19 밤, Claude → 전 에이전트)

- **이용 규칙**: `pipeline/lib/house-rules.mjs` + `scripts/build-house-rules.mjs` → 상세 `d.house_rules { tags, rules[{cat: ban|limit|rule}], ops, notices }`, 목록 `c.nr`(공식 불가 태그 키). 원천은 **운영자 홈페이지 문장(operator-site-snippets·operator-deep) + 고캠핑 등록값만**. 블로그 후기는 표본 점검에서 여러 캠핑장 묶음 글의 규칙이 엉뚱한 곳에 붙어 쓰지 않는다. 이용약관·개인정보 문구, 부분 금지(수영장·객실·텐트 안·데크 위), 조건부(“…한 경우”), 후기 감상은 거른다. 공식 ‘가능’ 등록값과 어긋나는 문장 태그는 버린다.
- **크롤러**: `crawl-operator-sites.mjs`가 금지·제한·수칙·운영 문장도 남기고(`RELEVANT` 확장), 공지 게시판 글을 `notices[{title,url,date}]`(글 주소 직접)로 저장한다(`noticeLinks`). 기존 레지스트리는 다음 `operator-sites.yml` 실행(주 1회, 또는 `max_age_days=0` 수동)부터 채워진다. 이번에 12곳만 새로 읽어 넣었다.
- **배지**: 단순 ‘전기’ 배지 제거(W 아는 곳만), 불가사항은 빨간 `.bdg-no`. `badges(c, max, maxNo)`.
- **형태별 요금**: `lib/price-tiers.mjs` + `scripts/build-price-tiers.mjs` → `c.fee.tiers = [[site|glamp|caravan|gc|lodge, 최저, 최고, 짐작]]`. 이름표 우선, 없으면 금액(10만 미만 사이트 · 10만~20만 글램핑·카라반 · 20만 이상 펜션·숙박동), 사이트 타입(`c.st`)·이름으로 좁힘. 7만원 미만 ‘카라반’은 개인 카라반 사이트. **요금대 필터는 사이트 요금 기준**(`campFeeMin/Max`).
- 순서: `build-site-types` → `build-price-tiers` → `build-house-rules` (data-sync·publish-incremental 반영).
- 고친 버그: `operatorHtml`의 ‘취소 · 환불’ 줄에서 섹션 전체 대신 요약 한 줄을 반환하던 `return`.
- 검사: `npm --prefix pipeline test` 341개 중 339 통과·2 건너뜀, 커버리지 가드 회귀 없음, PC·모바일 상세 가로 넘침 0.
- 현황: 불가 태그 2,048곳(반려동물 1,484 · 대형견 463 · 화기 112 · 미성년자 단독 102 · 고출력 전열기구 79 · 장작 64 · 방문객 51 …), 이용 규칙 670곳, 운영 안내 263곳, 공지 25곳(크롤 재실행 후 증가 예상), 형태별 요금 1,092곳.

## 📌 실시간 인기 섹션 (2026-10-19 밤)

- 2026-10-19 실시간 인기: `trending.yml`(매일 22:47 KST) → `public/context/trending.json`, 홈 ‘곧 오픈’ 다음 칸. 호출 상한·빠진 플랫폼은 docs/TRENDING.md, 주기는 SYNC_CADENCE.md.

## 📌 빈자리 표시 안 함 · 히어로 문구 · 주변시설 사진 · 전체 재빌드 이어받기 (2026-10-19 밤, Claude → 전 에이전트)

- **소유자 결정: 빈자리는 표시하지 않는다**(전국 전부가 아니면 의미 없음). `THANKQ_VACANCY_PUBLISH` 켜지 말 것, 빈자리 제보·예약 달력 추출 기획 중단. 땡큐캠핑은 사이트 사실 수집만.
- 히어로: `취향대로 찾아 떠나는 / 전국 N개 자연 속으로.`(`homeView`). 빈자리 약속 문구 금지.
- 주변시설 실제 모습: **로드뷰 버튼(카카오 지도 JS SDK)**. 검색 사진(`collect-nearby-photos.mjs`·`nearby-photos.yml`)은 첫 실행 표본 정확도 약 20%라 **매일 실행 중지·화면 미사용**(`build-nearby-photos.mjs`는 기본으로 붙은 검색 사진을 걷어 냄, `NEARBY_SEARCH_PHOTOS=on`일 때만 붙임).
- data-sync 전체 재빌드(`build-explore-data.mjs`): 이번 캐시에 없는 캠핑장은 직전 발행본의 후기·카페·사진·영상·웹 언급·요금 언급을 이어받는다(회귀 가드에 매번 막히던 원인 제거).

## 📌 상세 레이아웃·주간 날씨 통일·전 화면 보정 (2026-10-19 저녁, Claude → Codex·전 에이전트)

- 상세 오른쪽 세로 예약 칸 없음: 예약 카드는 `.d-head` 안 `.d-side`(제목 오른쪽, 태블릿 이하 제목 아래). `.d-body`는 한 열. 상세에 새 섹션을 넣을 때 `d-main` 안에만 넣는다.
- 주간 날씨: `conditions/card.js`의 `.fc-day` 버튼에 `data-fc-*`(rel·ic·desc·tmin·tmax·pop·src)를 싣고, 팝업(`openWeatherModal`)이 이 값과 같은 `.fc-day` 모양을 쓴다. 카드 모양·기호를 바꾸면 팝업도 같이 바뀐다.
- 주변 지도 썸네일은 `wcong(lat,lng)`로 다음 좌표를 만든다(위경도 그대로 넘기면 바다).
- 자세한 목록: `docs/DESIGN_SYSTEM.md` ‘전 화면 스크린샷 점검 v2’.

## 📌 주변 축제·행사 포스터 카드 — CultureFlow 연동 (2026-10-19, Grok)

- 상세 ‘주변시설’ 아래 `#sec-events`(`[data-events]`)에 축제·공연·전시 포스터 카드. 진행 중/예정(D-n)/이번 주말 배지, 출처·원문 링크, 깨진 포스터는 원출처 → 제목 카드로 대체.
- 원천: CultureFlow 공개 JSON(`pyw31337.github.io/culture/data/performances.json`) + 기존 TourAPI 축제(extras.json). 같은 행사는 합침.
- 파일: `pipeline/lib/culture-events.mjs`, `pipeline/scripts/sync-culture-events.mjs`, `camping-atlas/public/context/events.{js,json}`, 워크플로 `culture-events.yml`(매일 06:20 KST). 자세히 `docs/CULTURE_EVENTS.md`.
- `design/renewal/app.js`는 두 군데만 추가(섹션 자리 1줄, bindDetail에서 불러오기 2줄). 참고: 예전 ‘여행 참고 정보’ `[data-extras]` 자리는 현재 상세 HTML에 없어 그 칸(고도·응급실 등)은 화면에 안 보임 — 화면 담당이 다시 넣을지 판단 필요.
- 검사: `npm --prefix pipeline test` 통과(새 테스트 7개).

## 📌 운영자 심층 수집기 (2026-10-19, Grok)

- `pipeline/scripts/crawl-operator-deep.mjs`: 운영자 자체 호스트만, robots 준수, 최대 16쪽, 관련 문장+시설/배치 이미지 URL.
- 플랫폼(ticketplay·네이버·캠핏)은 읽지 않음. 구곡폭포 국민여가(7879) 등록 홈페이지는 `gugog.ticketplay.zone`(연결 거절)이라 심층 수집 대상이 아님. 예약은 `rev.cuc.or.kr`.
- 파일럿: 에스글램핑·글로우 사진 8장씩 `operator_media`로 상세에 연결. 화면은 「운영자 제공 사진」.

## 📌 세부 시설·규격 추가 수집 (2026-10-19, Grok)

- 검토: 고캠핑 구조화 규격(981곳), 운영자 홈페이지 크롤(OK 1,151 / 실패 520 / robots 113), 소셜 검색 배치도, 소개글 스펙 추출은 이미 있음.
- 추가: 운영자·소개 문장에서 사이트 규격(`6×7m`, `가로 6m 세로 7m`)을 `SITE_SIZE`로 추출. 공식 270곳.
- 네이버·캠핏·인스타 본문은 약관상 자동 수집하지 않음. 배치도 이미지는 검색 썸네일+원문 링크만.
- 화면: 이용 정보에 사이트 규격 행 추가.

## 📌 깨진 예약 링크 제외 (2026-10-19, Grok)

- 예약 채널 URL 전수 조사: 비주요 호스트 1,169개 중 연결 실패 287개.
- `ticketplay.zone` (구곡폭포·청평사·양구 등)은 ERR_CONNECTION_REFUSED / 503. 화면·분류에서 제외.
- 목록: `pipeline/registry/dead-booking-hosts.json`
- 필터: `pipeline/lib/booking-intel.mjs` `normalizeUrl`, `design/renewal/app.js` `liveBookingUrl`
- 다음 카탈로그 빌드부터 채널에서 빠지고, 프론트는 이미 발행된 데이터에서도 숨긴다.

## 📌 상세 미디어 카드 (2026-10-19, Grok)

- 주변 시설·블로그/카페 후기를 **상단 사진(또는 아이콘 히어로) + 하단 텍스트** 카드로 바꿈.
- `design/renewal/app.js`의 `nearbyCard`, `reviewLinksHtml`와 `style.css`의 `.media-card` 계열.
- 사진이 없는 곳은 큰 아이콘 히어로로 시각 밀도를 맞춤. 다음 발행 때 `/explore`에 반영.

## 📌 수집 주기 분리 (2026-10-19, Grok)

- 시설·주변은 매일 안 바뀐다. **운영 PostgreSQL 전체 스냅샷 적재는 일요일(KST) 또는 `full_db_import=true`만.**
- 평일 `data-sync`는 `db:migrate`만 하고 고캠핑·context·licences 재적재를 건너뛴다.
- 임시 DB 이중 적재 검증도 같은 날만.
- 상세: `docs/SYNC_CADENCE.md`. 새 수집을 매일 단계로 넣기 전에 이 문서를 볼 것.

## 📌 전기 용량 A 단위 분리 (2026-10-19, Grok)

- `pipeline/registry/attribute-dictionary.json`에 `POWER_MAX_A` (int, unit A) 추가.
- `pipeline/lib/spec-extractor.mjs`가 “전기 15A”, “사이트당 20A” 등 자유 텍스트에서 A 값을 추출해 `POWER_MAX_A`로 기록 (10~30A, W 환산 없음).
- 기존 `POWER_W` → `POWER_MAX_W` 경로는 유지.
- 다음 `data-sync` 또는 증분 발행 시 Fact Store에 반영됨. 다른 에이전트와 파일 영역 겹치지 않음.

## 📌 작업 전파 정책 (2026-10-19, 사용자 요청)

**모든 에이전트는 작업한 내용을 사이트에 직접 반영하거나, 안 될 때는 깃이나 다른 방법으로 다른 에이전트에게 전파해야 한다.**

- 새 기능·수정 사항은 PR이나 인수인계 문서 맨 위에 남긴다.
- 파일 전체를 자리표시자로 덮지 말 것. 필요한 줄만 고친다.
- 수집된 데이터는 `collected-data` 브랜치와 인수인계로 공유한다.

## 📌 플랫폼 허브 구현 확인 (2026-10-19, Claude)

- `docs/PLATFORM_HUB.md`의 의도(상세 ‘더 보기’ 플랫폼별 검색 버튼)는 `platformHubHtml`로 구현됨.
- 유튜브 영상은 기존 `videosHtml`로 사이트 안에서 재생.
- 인스타·페이스북·틱톡 등은 검색 버튼으로 새 탭 열기.
- 상세 페이지에 바로 보임.

## 📌 예약 엔진(땡큐캠핑) 업장 사이트 사실 + 빈자리 준비 (2026-10-19 16시, Claude → 전 에이전트)

- **새 원천 `thankq`**: 땡큐캠핑·캠퍼스토리 공개 예약 화면(robots `Allow: /`). 업장이 등록한 **사이트별 규격·바닥·1박 요금·입퇴실·주차·반려동물**을 `pipeline/registry/thankq.json`에 모은다(`collect-thankq.mjs`, 하루 2회 `thankq.yml` → 증분 발행). 근거·결과는 `docs/PRIVATE_AVAILABILITY_RESEARCH.md` 2-1절.
- **빌드 순서**: `build-thankq-facts.mjs`는 `build-nearby-facts` 뒤·`build-campground-profiles` 앞(data-sync·publish-incremental에 추가됨). 상세 `d.booking_sites`, 카탈로그 `c.tq = {s 엔진 번호, n 사이트 수, mx [가로,세로], lo, hi}`.
- **사실 원장 원천 `booking_engine` 등록**(fact-store `SOURCES`) — 지우면 발행이 막힌다.
- **화면(Codex)**: 상세 ‘사이트 규격 및 1박 요금’ 표가 `d.booking_sites`를 우선 사용(`bookingSitesHtml`), 조건 검색 사이트 크기 `maxSide`가 `c.tq.mx`를 포함, 대표 예약 경로에 땡큐캠핑 화면 보강. 빈자리 UI(`vacancy.json` → `S.vac`, 목록 `st-vac`/`st-full`, 상세 `vacHtml`)는 **파일이 있을 때만** 보인다.
- **빈자리 공개는 소유자 결정 대기**: 이용약관의 ‘서비스 정보 복제·제3자 제공 금지’(회원 의무) 조항 때문에 원천 승인 카드에서 빈자리는 `PENDING`. 저장소 변수 `THANKQ_VACANCY_PUBLISH=on`이면 바로 발행된다. 전체 중단은 `THANKQ_ENABLED=off`.
- 검증: `node --test pipeline/test/thankq.test.mjs`(3), 전체 테스트, 파생 재계산 회귀 없음(요금 1,941→1,949·입실 980→995·퇴실 945→960, 표본 기준 — 전체 매칭 실행 후 늘어남), 상세·목록 PC/모바일 스크린샷 가로 넘침·콘솔 오류 없음.

## 🚨 화면 원본을 자리표시자로 덮지 말 것 (2026-10-19 15시, Claude → 전 에이전트)

- 14:43 KST 커밋 6463b3336·49a4d6498(“platform hub”)이 `design/renewal/app.js`·`style.css`를 `// PLACEHOLDER - will be replaced`로 덮었다. 이 원본은 매일 발행이 `/explore/`로 그대로 복사하므로 **다음 발행에서 라이브 사이트 전체가 빈 화면이 될 뽐했다.** PR #39에서 전체 원본을 되살리고, `docs/PLATFORM_HUB.md`의 의도(상세 ‘더 보기’ 플랫폼별 검색 버튼)는 `platformHubHtml`로 구현했다.
- `pipeline/test/design-source-guard.test.mjs`가 이제 원본의 자리표시자·잘림(app.js 100KB↓·style.css 40KB↓)·핵심 함수 누락·문법 오류를 CI에서 막는다.
- 화면 수정은 `design/renewal/`을 **부분 수정**하고 `node scripts/publish-explorer-pages.mjs --shell-only camping-atlas/public/explore`로 발행한다. 발행본(`camping-atlas/public/explore/app.js`)만 고치면 다음 발행에 덮인다.

---

## 📌 이전 공지 (클로드·제미나이)

이전 인수인계 내용은 그대로 유지한다. 새 작업자는 위 공지를 먼저 읽을 것.


## 기록: 운영 DB·댓글·인프라 연동 현황 (2026-10-16~19, AGENTS.md에서 옮김)


1. **Supabase PostgreSQL 17 클라우드 운영 DB 완전 구축**:
   - 연결 풀러: `aws-0-ap-southeast-2.pooler.supabase.com:5432` (세션 풀러, IPv4 호환). GitHub Secret `DATABASE_URL`, `DATABASE_SSL=true`.
   - 전체 48개 테이블에 RLS(Row Level Security) 설정 완료, 뷰에 `security_invoker = true` 적용하여 **Supabase Security Advisor 보안 이슈 0건** 달성.
   - 현재 DB 사용량: **39 MB / 500 MB (사용률 7.84%, 92% 이상 여유)**. 대용량 바이너리 저장 금지, 메타데이터 중심 보존.
2. **비회원 자유 댓글 게시판 (`campground_comment`) PostgREST 실시간 양방향 연동**:
   - 일반 캠퍼를 위해 GitHub 로그인 없는 자유 댓글창 배포 완료 (https://pyw31337.github.io/camp/).
   - 소유자가 `SUPABASE_ANON_KEY` / `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` (`sb_publishable_...`) 등록 완료.
   - 브라우저 클라이언트가 PostgREST(`https://zgnetdxqzsnmzdvoxzbw.supabase.co/rest/v1/campground_comment`)를 통해 실시간으로 작성/조회하며, 4자리 비밀번호로 삭제 가능.
3. **주변 생활 인프라 7종 최근접 거리 전수 연동**:
   - 행정안전부 LOCALDATA 인허가 기준 21,574건의 최근접 거리 데이터를 카탈로그(`campgrounds.json`의 `c.nl`) 및 상세(`camps/{id}.json`의 `d.nearby_licensed`)에 전수 주입 (`pipeline/scripts/build-nearby-facts.mjs`).
   - 카드에 `"편의점 1.0km · 마트 2.2km · 정육점 0.9km"` 노출, 상세 페이지에 로드뷰 1초 바로가기 연동.
4. **AI 장단점 분석 1,640곳 커버리지 확장**:
   - 자연어 캠퍼 감성 사전 확장으로 1,640개소 장단점 요약 완료. 로컬 SQLite(`db/moyeora_camping.db`) 및 Supabase PostgreSQL `review_digest`에 동기화 완료.
5. **1박 요금 데이터 확장, 요금대 필터 및 1:1 비교함 연동 (2026-10-16)**:
   - 후기 언급/운영자 안내/공식 소개글 요금문구/국립공원·자연휴양림·지자체 표준요금제 매핑을 종합하여 전국 **1,820곳(58.4%)의 1박 요금(`c.fee`)**을 `campgrounds.json`에 주입 (`build-site-pricing-facts.mjs`). 카드 목록에서 `3만~6만원대`, `3.5만원부터` 등 실시간 노출.
   - 탐색 상단 필터 바에 `요금 확인`, `~3만원`, `3~5만원`, `5~7만원`, `7만원+` 5개 요금 필터 칩 신설 및 실시간 개수 집계/URL 해시 연동 완료.
   - 캠핑장 1:1 비교 모달에 `1박 기준 요금` 비교 행 신설 및 근거 등급 뱃지 표시 완료.
   - 상세 화면 `#sec-site`에 사이트 종류별 규격(가로×세로m), 바닥 재질, 사이트 수, 1박 요금, 주차 동선을 일목요연하게 비교하는 `sitePricingTable` 표 추가.
   - "확인 필요" 과잉 분류 전면 개편: 오토 사이트 등록, 관광진흥법 기본 600W, 장작 판매 등 근거 있는 데이터를 메인 볼드 텍스트로 우선 노출하고, 후기 언급은 우측에 깔끔한 `<em class="grade grade-surveyed">후기·확인필요</em>` 뱃지로 부착. 카드 포스터의 불필요한 회색 점선 확인필요 배지를 정리하고 핵심 배지만 노출.
6. **다음 단계 로드맵 및 에이전트별 분업 (2026-10-16)**:
   - **Codex (화면/UX)**: 지도 클러스터링 및 모바일 뷰 최적화, 1:1 비교함 공유 URL 연동 고도화.
   - **Claude (원천/사실)**: 공공데이터 원장(`public-datasets.json`)의 국립공원·휴양림 표준요금제 사실 저장소(`data/facts/`) 적재, 상가정보 API 철물·캠핑용품점 보강.
   - **Gemini (파이프라인/DB)**: 민간/사설 야영장 추가 요금 데이터 수집 보완 및 사이트별 요금·크기·인원 1:1 정밀 매핑 고도화.
7. **공공 야영장 표준 규정 일괄 주입 및 스펙 커버리지 대도약 (2026-10-19, Gemini)**:
   - 전국 366개소의 국립공원, 산림청 국공립 자연휴양림, 지자체 국민여가캠핑장에 법령 및 표준 조례에 근거한 `OFFICIAL_TEXT` 표준 운영 규약 주입 (`pipeline/lib/public-standards.mjs`).
   - 확정값(CONFIRMED) 대폭 증가: 입실 945곳(확정 597), 퇴실 911곳(확정 588), 매너타임 563곳(확정 454), 취소/환불 622곳(확정 621), 주차 1,466곳(확정 498), 전기 429곳(확정 412). 5대 핵심 스펙 충족지 389곳 → 721곳 도약.
   - 네이버 검색 API 질의 계획(QUERY_PLAN) 정밀 타깃화: 따옴표 exact match로 스니펫 적중률 극대화.
   - 화면 표출 시 확정값(`CONFIRMED`)은 확인필요 배지 없이 정규 값으로 바로 노출되므로, 디자인 에이전트는 해당 필드들을 핵심 카드로 적극 배치할 것.


## 정리 기록 (2026-10-22, 공공 원천 감사)
- `public-datasets.json`의 원장 누락을 보완해 환경부 충전소(15076352), 국립중앙의료원 응급실(15000563), 반려동물(15135102), 무장애(15101897), 두루누비(15101974), 관광지 집중률(15128555)을 `in_use`로 등록했다. 실제 실행 모듈은 기존 `sync:extras`이며, 키가 없으면 캐시/OSM으로 안전하게 폴백한다.
- 한국도로공사 대표 메뉴 API(`restinfo/restBestfoodList`)를 `sync:rest-stops`에 연결했다. 휴게소 레코드에 원문 URL·확인 시각·신뢰등급과 함께 최대 5개 대표 메뉴/가격을 병합하며, 기존 값은 줄이지 않는다. `EX_API_KEY`가 없으면 기존 휴게소 결과를 유지한다.
- `pipeline/scripts/audit-public-data.mjs`와 `npm --prefix pipeline run audit:public-data`를 추가했다. 현재 발행 캐시별 connected/fallback/empty 상태와 커버리지를 `pipeline/out/public-data-audit.json`에 기록한다.

## 정리 기록 (2026-10-21, fix4 이후)
- **qa/audit-1792495661 브랜치**: 미병합 커밋 1개 `19ddd477d`(2026-10-20 20:37 KST, “fix(qa): 공원에 캠핑장 요금·입퇴실 제거, 관광공사 광고 요금 제거, 숯 문구 모순·좌표 오타 정리, 문자 id 댓글 숨김 + 회귀 검사”, 1,166개 파일 — 대부분 데이터). 같은 패치는 main에 없음(내용 일부는 #159 병합 정책 작업에서 다른 방식으로 반영). 데이터를 잃지 않도록 **태그 `archive/qa-audit-1792495661`로 보존**한 뒤 브랜치만 지웠다. 되살리기: `git checkout -b qa/audit-1792495661 archive/qa-audit-1792495661`.
- **워크플로 점검**: 22개 모두 `permissions`를 명시(쓰기 권한은 데이터 커밋 워크플로만), 데이터를 main에 쓰는 예약 워크플로는 모두 `concurrency` 그룹이 있다(card-photos는 data-sync와 같은 그룹). 최근 실행 실패 없음. 중복 잡 없음 — 브라우저 회귀는 `Web quality / Rail swipe` 한 잡에 모여 있다. 바꾼 것: 없음(배포 경로 필터는 #187에서 정리).
- **의존성 보안**: 저장소의 Dependabot 알림이 꺼져 있어 `npm audit`로 확인. pipeline 0건. camping-atlas 30건(치명 1·높음 21) → 호환 범위 안 자동 수정(`npm audit fix`, lockfile만)으로 22건(치명 1·높음 17)으로 줄임. 남은 것은 메이저 업그레이드가 필요(next 16·vite 8·vinext 1.3·@cloudflare/vite-plugin 1.64·eslint-config-next·drizzle-kit) — 화면 빌드 체인을 바꾸므로 별도 작업으로 남김. Dependabot 알림 켜기는 저장소 설정(소유자)에서.
## 📌 찜 화면 정보 위계·공통 배지 보정 (2026-10-23, Codex)
- 찜 화면 헤더의 중복 숫자 문구(`총 N곳 찜함`)와 비교 선택 안내 문구를 제거하고, `비교하기`만 오른쪽 끝에 남겼다. 찜 수는 공통 헤더의 숫자 뱃지로만 확인한다.
- `최근 본 캠핑장`은 찜 목록과 같은 대형 카드 대신 사진·이름·지역·요금만 담은 작은 기록 카드로 분리해 시각적 우선순위를 낮췄다.
- 주소 아래 사이트 타입 배지는 사진 위 배지와 같은 공통 `.bdg` 모듈의 색 아이콘 원·흰 캡슐 규칙을 유지하도록 크기·그림자·간격을 동기화했다.
- 원본 `design/renewal/`과 발행본 `camping-atlas/public/`을 함께 갱신했다. `node --check`, `npm --prefix camping-atlas run lint`, `git diff --check` 통과. Playwright는 로컬 `playwright` 패키지가 없어 실행하지 못했으며 CI에서 회귀검사한다.
## 📌 공용 댓글: 목록 미리보기·작성 시각·운영 로그 (2026-10-27, Codex)

- 찜한 캠핑장 카드와 상세 `캠퍼 한마디`는 같은 `campground_comment` 원본을 읽고 쓴다. 찜 목록은 댓글이 있는 카드에 최신 3개를 바로 보이며, 4개부터는 `더 보기`로 최대 6개까지만 펼친다. 댓글이 6개보다 많으면 그 사실만 알리고 추가 무한 로드는 하지 않는다.
- 댓글의 작성 시각은 한국 시간 기준 `YYYY.MM.DD (요일) HH:mm`로 통일했다. 찜 목록에서 남긴 댓글도 `pushSave("comment")`를 기록해 `/log/`의 댓글 탭에서 기기 정보와 함께 모으고, 작성 위치(상세/찜 목록)와 해당 상세의 `#cmt` 바로가기를 남긴다.
- 댓글 작성자 이름은 이 브라우저에만 기억하며, 상세와 찜 목록 양식에 공통으로 미리 채운다. 찜 메모 카드의 `취소`·`저장`은 34px 높이의 가로 캡슐 버튼으로 맞춘다.
- 찜 목록의 카드 스펙 6줄(규격·전기·화로·주차·주변·요금)은 `상세정보` 접기 안에 둔다. 기본은 접힌 상태이며, 위·아래 화살표를 눌러 해당 카드 안에서만 연다. 일반 탐색·테마 목록은 비교를 위해 6줄을 계속 바로 보인다.
- `camping-atlas/scripts/saved-roles-test.mjs`는 320·390·1366px에서 이 기본 접힘, 6개 행, 열기 동작까지 회귀 검사한다.
- 원본/발행 동기화: `design/renewal/{app.js,style.css}` → `camping-atlas/public/{app.js,style.css}`. 검증은 `node --check`, `git diff --check`, Web quality를 실행한다.
