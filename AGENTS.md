# 협업 에이전트 작업 규칙

> ## ⛔ 필수: 데이터 누적 병합 정책 — 먼저 읽을 것 (2026-10-21 소유자 지시)
> 공유 데이터(`explore/data`·`data/facts`·`pipeline/registry`·Supabase·media)에 쓰는 **모든 에이전트·봇**은 [`docs/DATA_MERGE_POLICY.md`](docs/DATA_MERGE_POLICY.md)를 따른다.
> **기존 값을 지우거나 리셋하지 않는다.** 우선순위는 ① 빈 칸 채우기 ② 더 믿을 만하거나 더 최근 확인일 때만 덮어쓰기(옛 값은 기록) ③ 논리 검사(실패는 격리) ④ 서비스 표기로 정제다.
> 코드에서는 `pipeline/lib/merge-policy.mjs`(`mergeRecord`·`mergeList`·`assignNonEmpty`·`logReview`)를 쓴다.
> 필수 검사 `Lint and build`의 `field-guard`는 값을 지우거나 줄이는 PR을 막는다. 의도한 정정은 `pipeline/registry/merge-overrides.json`에 `reason`과 함께 적는다.

이 저장소는 전국 캠핑장 데이터·예약·여행 정보 서비스를 함께 만드는 공간이다. 코드, 조사 결과, 스키마를 바꿀 때는 다음 규칙을 따른다.

1. 작업 시작 전 `docs/PROJECT_PLAN.md`와 `docs/AGENT_HANDOFF.md`(맨 위 ‘📌 공지’ 먼저)를 읽고, 해당 작업이 목표·우선순위·결정 사항과 충돌하지 않는지 확인한다.
   웹 화면을 바꾸는 작업은 `docs/DESIGN_SYSTEM.md`도 읽는다.
2. 기능 또는 데이터 모델을 변경하면 같은 작업에서 관련 기획 문서와 인수인계 문서를 갱신한다. 구현만 하고 문서를 미루지 않는다.
3. 가격, 재고, 예약 가능 여부, 운영 규칙은 원천 URL·확인 시각·신뢰 등급 없이 확정값으로 저장하거나 표시하지 않는다.
4. 외부 플랫폼의 사진·영상·검색 결과는 각 서비스의 API·임베드·저장 조건을 지키고, 원본 이미지 저장소로 쓰지 않는다. 업장이 공개한 운영 사실(요금·규칙·시설)은 아래 ‘데이터 수집 원칙’에 따라 근거 문장·원문 URL·확인 시각과 함께 쓸 수 있다(후기 언급은 MENTION 등급).
5. 마이그레이션은 `db/`에 추가하고, 파괴적 변경에는 이관 전략과 롤백 방법을 문서화한다.
6. 변경 전후에 관련 검사(형식, 타입, 빌드, 핵심 흐름)를 실행하고 결과를 인수인계 문서에 남긴다. 실행할 수 없었던 검사는 이유를 적는다.
7. 한 작업 단위는 작은 커밋으로 남긴다. 다른 에이전트가 작업 중인 파일을 덮어쓰지 말고, 충돌 가능성은 인수인계 문서에 기록한다.

## 📢 데이터 품질 표준 프로세스 · 에이전트 게시판 (2026-10-22 소유자 지시 — 모든 에이전트 필수)

**“여러 에이전트가 수집·판단·검토·정제하는 과정을 표준화해, 모을수록 품질이 좋아지는 구조로.”** 상세는 `docs/DATA_QUALITY_PROCESS.md`.

1. **6단계 고정**: 수집 → 판단(원자 사실) → 검토(신뢰도·확증·충돌) → 판정 → 정제·병합 → 발행·환류. 단계마다 게이트(원천 등록·URL·`validateFacts`·`publish-sanity`·`field-guard`·`coverage-guard`·품질 장부)를 통과해야 화면에 나간다.
2. **신뢰도는 같은 잣대로**: `pipeline/lib/quality.mjs` — 등급 무게 × 독립 원천 확증 × 신선도. 매일 `data/quality/REPORT.md`(평균 신뢰도·확정 비율·확증·충돌·회귀)를 보고 다음 수집 우선순위를 정한다.
3. **충돌은 판정으로 끝낸다**: `data/quality/review-queue.json`의 엇갈린 값을 원문 대조 후 `pipeline/scripts/quality-decide.mjs`로 기록 → VERIFIED 사실이 되어 다시 뒤집히지 않는다. 같은 오류가 반복되면 판정 대신 `publish-sanity` 규칙·registry로 올린다.
4. **작업 전 게시판 확인·선점**: `node pipeline/scripts/agent-board.mjs list` → `check --files …` → `claim` → 끝나면 `release`. 데이터 문제는 `finding`, 질문은 `question`. 파일: `data/board/board.ndjson`(merge=union).
5. **수집 경로 재확인**: robots.txt가 AI 크롤러를 이름으로 막은 곳(예: k-data.aljal.kr)은 자동 수집 경로로 쓰지 않는다 — 2026-10-22 `sync-kdata-public` 폐지, 공공데이터포털 표준데이터(`sync-public-leisure.mjs` → `lib/public-poi.mjs`)로 교체.

## 📢 업장 정보량 점수로 목록 순서 정하기 (2026-10-23 소유자 지시 — 모든 에이전트 필수)

> “업체별 정보량을 점수로 환산해, 목록·배열에서 정보가 많은 업체가 맨 위에 먼저 보이게.”

- **점수는 하나만 쓴다.** `pipeline/lib/info-score.mjs`의 `scoreCamp`가 정한다. 매일 data-sync와 증분 발행에서 `apply-info-score.mjs`가 계산해 카탈로그 `c.iq`(0~100)에 넣는다. 자체 점수를 새로 만들지 않는다.
- **정렬은 `c.iq` 높은 순이 기본이다.** 화면에서는 `rich(c)`, 파이프라인에서는 `byInfoScore`를 쓴다. 목록·추천 레일·지역 목록·주변 캠핑장(가까운 10곳 안에서) 모두 해당한다. 거리순·요금순·이름순은 사용자가 고를 때만 쓴다.
- **세는 방식:** 방문 전 질문(요금·입퇴실·반려견·전기 W·주차·규격·바닥·환불·예약 등)에 가중치를 둔다. 속성마다 신뢰도(독립 원천 확증 반영)를 곱한다. 표준 조례 기본값(REFERENCE)과 숙박형·성수기 한정 값(scope)은 세지 않는다. 충돌은 절반만 센다. 사진과 후기에는 상한을 둔다.
- **점수 올리기:** 새 사실을 수집·판정하면 다음 발행에서 점수가 자동으로 오른다. 점수를 직접 쓰지 않는다. 어디가 비었는지는 `data/quality/info-score.json`의 `next_priorities`(점수 하위 절반에서 가장 많이 빈 속성)와 업장별 `scores[cid] = [점수, 빈 항목 3개]`에서 본다. 다음 수집은 거기부터 한다.
- 가중치를 바꾸면 `SCORE_VERSION`을 올린다. 게시판에 `notice`를 남긴다.

## 데이터 수집 원칙 (2026-10-16 소유자 지시 — 모든 에이전트 공통)

**서비스 성격**: 이 서비스는 **무료·공익 목적·개인 프로젝트·비상업·오픈소스**다. 우리가 모으고 보여 주는 것은 **업장(운영자)이 이용자에게 알리려고 스스로 공개한 정보**(요금·시설·규칙·연락처·운영 기간·예약 방법)이며, 플랫폼이 창작·가공한 데이터(자체 평점·랭킹·편집 사진·후기 본문)가 아니다. 이 정보는 원래 이용자에게 제공되어야 하는 공개 정보이므로, 수집은 **확장된 관점**으로 적극 진행한다.

1. **데이터는 업장의 것, 플랫폼은 통로**: 요금·시설·규칙·운영 기간·예약 방법은 업장이 이용자에게 당연히 알려야 하는 정보이고, 여러 플랫폼이 그 일부를 나눠 싣고 있을 뿐 플랫폼 고유 데이터가 아니다. 그러므로 **“이 사실은 어느 플랫폼에 있나”가 아니라 “이 사실을 업장이 어디에 공개했나”**로 수집 경로를 찾는다. 같은 사실은 보통 여러 곳(운영자 홈페이지·블로그·SNS 공지, 지자체·공공데이터, 공식 API, 예약 안내 페이지)에 있다.
2. **넓게 모은다**: 공공데이터(API·파일·표준·연계, `docs/PUBLIC_DATA_PLAN.md`), 공식 API(카카오 로컬·Daum 검색 등), 운영자 홈페이지·블로그·SNS 공지, 봇 접근을 허용하는 예약·안내 사이트의 캠핑장 공개 안내를 모두 원천으로 삼는다. 플랫폼에 실린 업장 사실(요금·규칙·시설)도 수집 대상이다.
3. **사실만 잘게**: 값과 짧은 근거 문장·원문 URL·확인 시각만 사실 저장소(`docs/FACT_STORE.md`)에 넣는다. 플랫폼이 직접 만든 것(자체 평점·랭킹·편집 사진·후기 본문)은 복제하지 않고 링크·임베드로 보인다.
4. **출처와 정정 경로**: 화면에 원천을 (i)로 남기고, 업장이 정정·삭제를 요청하면 바로 반영한다.
5. **경로 선택**: 사이트가 자동 접근을 기술적으로 막은 경로(로그인·결제 뒤 화면, CAPTCHA·봇 차단, robots.txt가 AI 크롤러를 이름으로 막은 곳 — 2026-10-16 기준 카카오맵 장소 페이지·네이버 지도·캠핏)는 자동 수집 경로로 쓰지 않는다. 데이터가 금지라서가 아니라 **그 통로만** 닫힌 것이므로, 같은 업장 사실을 다른 공개 경로(1번)·공식 API(카카오 로컬, 필요하면 네이버 검색 API)·운영자 직접 제공·이용자 제보·제휴 요청으로 채운다. 봇 이름을 밝히고 호스트별 간격(1초↑, 공공포털 검색은 10초↑)을 지킨다.

## 디자인 작업 시 수집 데이터 반영 및 가격 범위 필터 필수 적용 (2026-10-16 소유자 지시 — 모든 에이전트 공통)

1. **추가 수집 데이터 누락 금지**: 각 에이전트(Codex, Claude 등)는 신규 디자인(리뉴얼 시안 A·B·C, vision 등) 작업 시, 기 수집된 1박 요금 데이터(1,820곳), 사이트 종류별 규격·바닥·면수·요금 통합표(`sitePricingTable`), 주변 7종 생활 인프라, 비회원 커뮤니티 등의 데이터를 누락하거나 일반 텍스트/공란으로 축소하지 말고 화면 컴포넌트에 적극 반영한다.
2. **가격 범위 필터 필수 탑재**: 탐색 및 리뉴얼 필터 영역에 **1박 요금대 필터(`~3만원`, `3~5만원`, `5~7만원`, `7만원+`)**를 필수로 탑재하여 사용자가 예산에 맞게 캠핑장을 필터링할 수 있도록 기능을 항상 유지한다.

## 무과금·비용 안전 원칙 (2026-10-16 소유자 지시 — 모든 에이전트 공통)

**“슈파베이스 외 외부 서비스와 API 등에서 유료로 과금되지 않게 잘 모니터링할 것”**

1. **100% 무료 티어 준수**: Supabase(500MB DB 무료), NAVER API HUB(월 77.5만 건 무료), Kakao Developers(무료 쿼터), 공공데이터포털(무료), Giscus(무료)의 무료 구간만 사용한다. 유료 결제 수단(신용카드 등) 연동을 엄격히 금지한다.
2. **호출 전 무료 검증(Fail-Closed)**: 네이버 등 한시 무료 API는 `pipeline/lib/naver-guard.mjs`로 NCP 요금표 0원 검증 후 호출한다. 조금이라도 금액이 생기면 즉시 차단된다.
3. **하드 캡(Hard Cap) 유지**: 소셜 후기 수집 등은 일일 쿼터의 절반 이하(`SOCIAL_MAX_CALLS=9100`)로 제한한다.
4. **원클릭 점검**: `npm --prefix pipeline run check:billing` 명령으로 전체 외부 서비스 과금 안전 상태를 언제든 확인한다. 상세 규정은 `docs/EXTERNAL_SERVICES_BILLING_SAFETY.md`.

## 수집 데이터 즉시 공유·발행 (2026-10-19 소유자 지시 — 모든 에이전트 공통)

**“수집된 데이터는 다른 에이전트들이 즉각 알 수 있게 공유하고, 바로 사이트에 반영될 수 있게.”** 자세한 내용은 `docs/COLLECTED_DATA.md`.

1. **원본 공유**: 누적 수집 캐시(카카오 후기·네이버 블로그/카페/웹문서/지식iN·허용 본문)는 `collected-data` 브랜치(`cache/*.json.gz`, `out/*.json.gz`, `MANIFEST.json`)에 수집 직후 저장된다. `git fetch origin collected-data`로 읽는다.
2. **즉시 발행**: 수집 단계가 끝나면 `pipeline/scripts/publish-incremental.sh`가 최신 main 데이터 위에 새 글만 덧붙이고 파생 정보를 다시 계산해 바로 커밋한다(실행 끝까지 기다리지 않음).
3. **회귀 금지**: 데이터를 다시 만든 커밋은 `pipeline/scripts/coverage-guard.mjs`로 항목별 커버리지가 줄지 않았는지 확인한다(max(20곳, 2%) 넘게 줄면 발행하지 않음).
4. **원천 등록**: 사실 원천 종류를 새로 만들면 `pipeline/lib/fact-store.mjs` `SOURCES`에 등록한다(미등록이면 그날 발행 전체가 막힘).

## 문서 지도 (2026-10-21 정리 — 핵심 4종부터)

| 순서 | 문서 | 언제 읽나 |
|---|---|---|
| 1 | `AGENTS.md`(이 파일) | 모든 작업 — 공통 규칙·문서 지도·검사 |
| 2 | [`docs/DATA_MERGE_POLICY.md`](docs/DATA_MERGE_POLICY.md) | **데이터에 쓰는 모든 작업**(봇·수집·병합) — 지우지 않기·우선순위·field-guard |
| 3 | [`docs/COLLECTED_DATA.md`](docs/COLLECTED_DATA.md) | 수집 데이터가 어디 있고 어떻게 발행되나(collected-data 브랜치·증분 발행·커버리지 검사) |
| 4 | [`docs/DESIGN_SYSTEM.md`](docs/DESIGN_SYSTEM.md) | 화면을 바꾸는 모든 작업 — 토큰·공통 틀·주소·컴포넌트 규칙(맨 아래가 최신) |

그 밖에: `docs/AGENT_HANDOFF.md`(현재 상태·최근 검증·지난 기록), `docs/PROJECT_PLAN.md`(범위·결정), `docs/EXTERNAL_SERVICES_BILLING_SAFETY.md`(무과금, 필독), `docs/FACT_STORE.md`(사실 저장소), `docs/PUBLIC_DATA_PLAN.md`, `docs/KAKAO_DISCOVERY.md`, 설계 근거 2종(`docs/캠핑장_*.md`). 나머지 `docs/*`는 기능별 상세·기록이다.

## 화면 코드의 자리 (2026-10-21)

- 원본은 `design/renewal/` 하나(`app.js`·`style.css`·`shell.css`·`index.html`). 발행본 `camping-atlas/public/{app.js,style.css,shell.css,index.html}`은 `node scripts/publish-explorer-pages.mjs --shell-only camping-atlas/public`으로 만든다 — **발행본만 고치면 다음 배포에서 덮인다**(#181 사례).
- 헤더·푸터·하단 탭·폭·여백은 `shell.css`와 `index.html`의 `<!-- shell:* -->` 한 곳. `/log/`에도 발행 때 그대로 들어간다.
- 주소는 `#` 없는 경로(`/camp/map`, `/camp/place/{id}`). 공유 미리보기 `place/{id}/`는 배포 때 생성(커밋하지 않음).

## 검사 (2026-10-21)

- 필수 검사: `Web quality / Lint and build`, `Web quality / Rail swipe`(브라우저 회귀 전부가 이 잡 안에 있다).
- 브라우저 회귀 전부를 로컬에서 CI와 같은 목록으로: `bash camping-atlas/scripts/run-browser-tests.sh [URL]` — 목록의 원본은 `.github/workflows/web-quality.yml` 하나다(새 테스트는 워크플로에만 추가).
- 파이프라인: `npm --prefix pipeline test`.

## 홈 가로 레일 드래그/스와이프 가드 (필수)

홈의 가로 레일(실시간 인기, 곧 오픈, 긍정 후기, 테마로 고르기, 테마 줄)은 여러 에이전트가 반복해서 고치다 깨뜨린 영역이다.
`initCarousels`, `initDraggableRails`, `.rail`, `.car-track`, `touch-action`, `pointer*` 핸들러, `scroll-snap`을 건드리면:

1. 원본은 `design/renewal/app.js` 하나, 발행본은 `camping-atlas/public/app.js` 하나다(2026-10-21부터 explore/·renewal/ 복사본 없음). 둘을 똑같이 맞춘다.
2. `node camping-atlas/scripts/rail-swipe-test.mjs [URL]`을 로컬에서 통과시킨다(기본 URL은 `camping-atlas/public`을 띄운 `http://127.0.0.1:8765/`).
3. CI `Web quality / Rail swipe`가 초록이어야 병합한다. 1366 마우스 드래그, 390 터치 스와이프(카드 본문·썸네일), 세로 스와이프 통과, 탭 시 카드 열림, pageerror 0을 검사한다.

동작 원칙: 카드 본문이나 사진 한 장 위에서 가로로 끌면 레일이 넘어간다. 여러 장 사진 위에서 시작하면 썸네일만 넘어간다. 세로 스와이프는 절대 막지 않는다. 끌지 않은 클릭은 카드를 연다.

## 새 PC·로컬 정리
- 백지 PC에서 시작: `docs/SETUP_NEW_PC.md`. 로컬 정리·깃 백업: `node scripts/local-maintenance.mjs report|backup|clean` (기본 미리 보기, `--apply`로 실행).
