# 인수인계

> 최종 갱신: 2026-10-13 KST<br>
> 다음 작업자는 이 문서를 먼저 읽고 작업 종료 시 업데이트한다.

## 현재 상태

- 저장소: GitHub 공개 저장소 `pyw31337/camp`
- 배포: 외부 공개 기본 주소는 [GitHub Pages](https://pyw31337.github.io/camp/)이며, 루트 `main` 푸시로 자동 갱신된다.
- 기준 설계: 전국 등록 야영장은 한국관광공사 고캠핑 API를 기준 모수로 삼고, 실제 재고·가격은 공식 예약 채널에서 별도 확인한다.
- 데이터 모델: PostgreSQL 16+용 초기 스키마가 `db/001_initial_schema.sql`에 있다. 시설·구역·상품·재고·요금·예약 정책·원천 증빙·미디어 권리를 분리한다.
- 웹: `camping-atlas/`는 정적 내보내기가 가능한 Vinext 앱이다. GitHub Pages를 외부 공개 기준으로 유지하며, Sites 프로젝트는 이 작업에서 배포 경로로 사용하지 않는다.
- GitHub Pages: `main`의 `camping-atlas/` 변경을 정적 내보내기해 [`https://pyw31337.github.io/camp/`](https://pyw31337.github.io/camp/)에 자동 배포한다. 정적 산출물의 접두 경로는 `scripts/prepare-pages.mjs`가 GitHub Pages의 `/camp` 마운트 경로에 맞춘다.

## 최근 변경

| 항목 | 내용 | 검증 |
| --- | --- | --- |
| 기획 | 통합검색·예약, 미디어·지도·여행 연동 설계 작성 | 원천 링크와 정책 구분을 문서 검토 |
| DB | 25개 테이블과 예약·원천·미디어 관련 enum/인덱스 초안 작성 | SQL 형식 확인; 로컬에 PostgreSQL 실행 파일이 없어 실제 적용은 미실행 |
| 협업 | `AGENTS.md`, 프로젝트 계획, 인수인계, GitHub 비공개 원격 저장소 생성 | `gh auth status`, 원격 저장소 생성 성공 |
| 협업 검수 | GitHub PR 템플릿과 웹 품질 검사 워크플로 추가 | PR 및 `main` 푸시에서 웹 변경 시 설치·린트·빌드 실행. 최신 실행 [`38237199381`](https://github.com/pyw31337/camp/actions/runs/38237199381) 통과 |
| 웹 | 브랜드를 ‘모여라 캠핑’으로 변경하고 공개 Sites 버전 2를 배포. 오토캠핑·카라반·글램핑 콘셉트 이미지와 여행 검색형 UI를 추가 | `npm run lint`, `npm run build`, 320px/1440px 브라우저 검수 및 공개 URL 확인 완료 |
| 디자인 | 여행 플랫폼 검색 구조와 반응형 원칙을 조사해 초록 계열 토큰·이미지·320px 규칙을 문서화 | `docs/DESIGN_SYSTEM.md`의 원문 링크와 구현 결과 대조 |
| GitHub Pages 파일럿 | 날짜·인원·형태 검색, 브라우저 저장목록, 상품 상세·공식 예약/사진/공지 링크를 구현. 자라섬캠핑장 4개 실제 상품을 가평군시설관리공단 원문으로 등록 | 로컬 `npm run lint`, `npm run build`, `npm run build:pages` 성공. 공개 배포 [Pages 실행 38331404373](https://github.com/pyw31337/camp/actions/runs/38331404373), [웹 품질 실행 38331404533](https://github.com/pyw31337/camp/actions/runs/38331404533) 통과. 공개 URL에서 검색 1건, 저장, 상세 전환, 320px 가로 넘침 없음, 콘솔 오류 없음 확인 |
| Claude 작업 연계 | `claude/upbeat-keller-x75pct`의 전국 데이터 파이프라인을 검토하고 호환되는 12개 커밋을 반영했다. GoCamping 동기화·예약 규칙 레지스트리·캘린더/ICS·무료 후보·공중화장실·휴게소·졸음쉼터 수집/연결이 포함된다. | `pipeline`에서 `npm test` 50개 통과, `npm run validate`, `npm run calendar -- 60 2026-10-13`, `npm run ics -- 60 2026-10-13` 성공. 캘린더 23건(확인 필요 14건) 생성. API 키·원천 접근 허가 전에는 운영 데이터로 표시 금지. |
| 프리미엄 탐색 UI | Dribbble 여행·캠핑 참고 화면의 사진 중심 계층과 예약 UI를 바탕으로 검색·상세·최근 현장 경로 화면을 다시 구성했다. 실제 사진은 자라섬캠핑장 운영기관 시설 원문 4건만 외부 표시한다. | `npm run lint`, `npm run build`, `npm run build:pages`, GitHub Pages 경로 자산 검증 성공. 브라우저에서 오류 0건, “사이트 A” 검색 1건·상세 전환, 320px 문서 가로 넘침 없음 확인. [Pages 실행 38333884947](https://github.com/pyw31337/camp/actions/runs/38333884947) 통과 및 공개 URL의 새 헤드라인 로드 확인. |
| UI 재설계 | 클로드 아티팩트 v2를 검토해 히어로 안의 탭형 검색, 예약 오픈 우선 카드, 단순화한 실제 상품 카드, 예약처 규칙, 모바일 하단 탐색으로 전체 정보 구조를 재구성했다. 클로드 시안의 콘셉트 이미지·예시 캠핑장은 가져오지 않았다. | 로컬 `npm run lint`, `npm run build`, `npm run build:pages` 성공. 브라우저에서 “사이트 A” 검색 1건, 상세 열기, 콘솔 오류 0건, 320px 문서 폭 305px/스크롤 폭 305px 확인. [Pages 실행 38335351773](https://github.com/pyw31337/camp/actions/runs/38335351773) 통과, 공개 주소에서 히어로·예약 오픈 카드 4건 로드 확인. |
| 클로드 시안 기준 UI·공개 데이터 발행 | 사용자 요청에 따라 클로드 아티팩트 v2의 큰 사진 히어로, 탭형 검색, 카테고리 필, 가로 예약 카드, 사진 카드와 모바일 하단 탐색을 기준 레이아웃으로 다시 구현했다. `pipeline/out/open-calendar.json`은 `camping-atlas/public/data/open-calendar.json`으로 발행해 화면이 로드하며, `catalog.json`은 고캠핑 공개 여부·수집 시각·상품 수를 표시한다. `db/003_seed_source_registry.sql`에는 고캠핑·숲나들e·국립공원·서울시·자라섬의 원천/예약처 레지스트리를 추가했다. | `pipeline`: `npm test` 52개, `npm run validate`, `npm run publish:web-catalog` 통과. `camping-atlas`: `npm run lint`, `npm run build`, `npm run build:pages` 통과. 320px에서 문서 폭/스크롤 폭 305px로 일치하고 콘솔 오류 0건이다. [Pages 실행 38343519616](https://github.com/pyw31337/camp/actions/runs/38343519616) 통과 후 공개 URL에서 히어로 1개, 예약 카드 23개, 오류 0건을 확인했다. 고캠핑 키/영구 보존 조건은 아직 없어 `catalog.json`의 고캠핑 상태는 `AWAITING_API_SYNC`; 이 값은 전국 등록 수처럼 표시하지 않는다. |
| 기준 데이터 실제 동기화 준비 | GitHub Actions 시크릿 `DATA_GO_KR_SERVICE_KEY`가 등록된 것을 확인했고, 실행 38344388514에서 키 검증과 `sync:gocamping`이 성공했다. 고캠핑 공개 보존 근거는 공공데이터포털의 이용허락범위 제한 없음 표기를 원문으로 확인해 `db/004_confirm_gocamping_catalog_license.sql`에 기록했다. 메인 수동 동기화가 PR의 장시간 부가 수집 대기열에 막히지 않도록 `data-sync.yml`의 동시성 그룹을 ref별로 분리했다. | GitHub Actions 실행 기록에서 키 검증·고캠핑 동기화 단계 성공 확인. `db/004`는 PostgreSQL 실행 환경이 없어 적용 전 SQL 검토만 완료했으며, 적용 뒤 `data_source.gocamping.allows_persistent_storage=true`가 되어야 한다. |

## 다음 작업

1. 메인 브랜치의 새 `data-sync.yml`로 고캠핑 동기화를 다시 실행하고, 발행된 `catalog.json`의 레코드 수·원천 시각·스키마를 검토한다. 키를 저장소에 커밋하지 않는다.
2. DB를 사용할 PostgreSQL 16+ 실행 환경과 `DATABASE_URL` 비밀값을 준비하고, `db/001_initial_schema.sql`부터 `db/004_confirm_gocamping_catalog_license.sql`까지 순서대로 적용한다. `db/004`의 롤백은 `allows_persistent_storage=false`로 되돌리고 공개 카탈로그에서 해당 원천을 제외하는 방식이다.
3. 실제 읽기 API가 생기면 파일럿의 자라섬 정적 레코드를 API 응답으로 교체하고, 상품·미디어·공지·예약 제공자 레지스트리를 전국으로 확대한다.
4. 공식 소셜 계정은 소유 확인·임베드 권한·게시시각·캠핑장 매칭이 모두 확인된 뒤에만 `social_connection`과 `social_item`에 등록한다. 해시태그 수집이나 이미지 저장으로 대체하지 않는다.
5. `claude/upbeat-keller-x75pct`에는 출처/권리 기록 없는 정적 이미지 자산과 GitHub Pages를 Cloudflare Pages로 바꾸는 동명 워크플로가 남아 있다. 원본의 권리 근거와 배포 전략을 별도로 검토하기 전에는 병합하지 않는다.
6. 현재 웹의 예약 오픈 카드는 `pipeline/out/open-calendar.json`의 2026-10-13 생성 결과 중 일부를 동일 원천 URL·확인일과 함께 정적으로 옮긴 상태다. 배포 시점의 파이프라인 실행/API 연결 전에는 일반화된 실시간 일정으로 표시하지 않는다.
7. `data-sync.yml`은 예약 캘린더와 공개 카탈로그를 만든 뒤 변경된 `camping-atlas/public/data/`를 `main`에 커밋하도록 확장했다. 고캠핑 전체 레코드는 공공데이터포털의 보존·재배포 조건을 검토한 뒤 repository variable `GOCAMPING_CATALOG_PUBLISH_APPROVED`를 `true`로 설정해야만 공개한다. 설정 전에는 일정만 갱신하고 기준 시설 카탈로그는 비어 있는 것이 정상이다.

## 주의 사항

- 화면 예시는 실제 캠핑장 가격·가용성으로 제시하면 안 된다. 공식 예약 연동 전에는 검증 흐름/예시임을 명시한다.
- 고캠핑 정적 시설 데이터와 판매 재고 데이터를 합쳐 추정하지 않는다.
- SNS·검색 플랫폼의 콘텐츠는 각 API/임베드·보존 조건을 지킨다. 무단 이미지 복제 또는 전체 해시태그 수집을 하지 않는다.
- GitHub Pages 파일럿의 사진은 가평군시설관리공단 공식 시설 안내의 외부 원문 URL을 표시한다. 대표 이미지를 저장·가공·다른 시설에 재사용하지 않는다.
- 일반 후기·소셜 사진은 카드 대표 이미지나 운영 사실의 근거로 사용하지 않는다. `source_url`, 게시 시각, 확인 시각, 매칭 근거, 임베드·표시 권한을 모두 확보한 뒤 최근 현장 섹션에 원문/임베드로만 표시한다.
- Sites 생성 응답의 자격증명은 파일이나 문서에 저장하지 않았다. `.openai/hosting.json`에는 프로젝트 ID만 있다.

## 작업 종료 체크

- [x] 관련 기획/스키마/인수인계가 함께 갱신되었는가
- [x] 테스트·린트·빌드 결과 또는 미실행 이유를 이 문서에 기록했는가
- [x] 원천·권한·개인정보 영향이 검토되었는가
- [x] 작은 단위로 커밋하고 원격에 푸시했는가 — 프리미엄 UI·문서 변경을 한 커밋으로 배포
