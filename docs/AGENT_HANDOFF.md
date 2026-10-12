# 인수인계

> 최종 갱신: 2026-10-12 KST (시안 v1·파이프라인 작업 반영)<br>
> 다음 작업자는 이 문서를 먼저 읽고 작업 종료 시 업데이트한다.

## 현재 상태

- 저장소: GitHub 비공개 저장소 `pyw31337/camp`
- 배포: 공개 Sites 버전이 `https://moyeora-camping.magicsiren32.chatgpt.site`에 배포되어 있다.
- 기준 설계: 전국 등록 야영장은 한국관광공사 고캠핑 API를 기준 모수로 삼고, 실제 재고·가격은 공식 예약 채널에서 별도 확인한다.
- 데이터 모델: PostgreSQL 16+용 초기 스키마가 `db/001_initial_schema.sql`에 있다. 시설·구역·상품·재고·요금·예약 정책·원천 증빙·미디어 권리를 분리한다.
- 디자인: **시안 v2**가 기준이다. 원본 `design/mockup-v2/src.html` → `design/build.mjs`가 Lucide·Tabler 스프라이트와 Pretendard 서브셋을 인라인해 `index.html` 생성. 사용자 검토 대기. v1은 `design/mockup/`에 참고용으로 남김.
- 운영 전제: 무료 운영, 로그인 보류. 알림은 `.ics` 구독, 관심 목록은 브라우저 저장. 소유자 작업은 `docs/OWNER_TODO.md`.
- 배포: `deploy-pages.yml`이 시안 + ics를 `site/`로 조립해 Cloudflare Pages에 배포한다. Secret이 없으면 조립만 하고 건너뛴다.
- 파이프라인: `pipeline/`에 고캠핑 수집·정규화, 예약 규칙 레지스트리, 예약 오픈 캘린더 계산기와 테스트가 있다. `data-sync.yml`이 매일 실행되며 키가 없으면 고캠핑 단계는 건너뛴다.
- 웹: `camping-atlas/`는 공개 Sites 프로젝트 `appgprj_6acc7a065b548191bc002202bbc24d3b`에 연결되어 있으며, 현재 공개 주소는 `https://moyeora-camping.magicsiren32.chatgpt.site`다.

## 최근 변경

| 항목 | 내용 | 검증 |
| --- | --- | --- |
| 기획 | 통합검색·예약, 미디어·지도·여행 연동 설계 작성 | 원천 링크와 정책 구분을 문서 검토 |
| DB | 25개 테이블과 예약·원천·미디어 관련 enum/인덱스 초안 작성 | SQL 형식 확인; 로컬에 PostgreSQL 실행 파일이 없어 실제 적용은 미실행 |
| 협업 | `AGENTS.md`, 프로젝트 계획, 인수인계, GitHub 비공개 원격 저장소 생성 | `gh auth status`, 원격 저장소 생성 성공 |
| 협업 검수 | GitHub PR 템플릿과 웹 품질 검사 워크플로 추가 | PR 및 `main` 푸시에서 웹 변경 시 설치·린트·빌드 실행. 최신 실행 [`38237199381`](https://github.com/pyw31337/camp/actions/runs/38237199381) 통과 |
| 웹 | 브랜드를 ‘모여라 캠핑’으로 변경하고 공개 Sites 버전 2를 배포. 오토캠핑·카라반·글램핑 콘셉트 이미지와 여행 검색형 UI를 추가 | `npm run lint`, `npm run build`, 320px/1440px 브라우저 검수 및 공개 URL 확인 완료 |
| 핵심 기능·UX | 핵심 기능 3개와 무학습 원칙, 레퍼런스 5개 분석을 `docs/CORE_FEATURES_UX.md`로 작성 | 레퍼런스는 헤드리스 브라우저로 원본 이미지를 확인(Dribbble는 일반 요청을 차단) |
| 디자인 시안 v2 | Pretendard·Lucide/Tabler·초록 4계열 팔레트로 홈(탭 검색)·찾기(지도 띠 D-day 핀)·상세(사이트 맵 툴팁·예약 카드)·캘린더(구독)·바텀시트(날짜 범위·인원 스테퍼·장비) 구현 | `npm run build` 아이콘 73개·폰트 98KB. Playwright 320/390/820/1440px·라이트/다크 4화면 가로 넘침 0·오류 0. `#detail` 앵커 스크롤, 빈 토스트 노출, 320px 조건 바 넘침을 수정 |
| 알림(무료) | `pipeline/lib/ics.mjs`, `npm run ics` → `out/ics/all.ics`, `provider-*.ics`(하루 전·10분 전 알림, 시각 미확정은 종일) | `npm test` 18/18 통과(RFC 5545 골격·CRLF·75옥텟 접기·UID 안정성) |
| 배포 | `scripts/assemble-site.mjs`, `.github/workflows/deploy-pages.yml`(Cloudflare Pages, Secret 없으면 건너뜀) | 로컬 조립 성공(`site/`는 gitignore). 실제 배포는 Secret 등록 후 확인 필요 |
| 조사 | 데이터 원천별 제공 가능 정보와 핵심 베네핏 4가지를 `docs/RESEARCH_DATA_TO_UX.md`로 정리. 행안부 야영장업 인허가 API(숨은 캠핑장 발견), 서울 공공서비스예약 API(접수기간), 국립공원 전면 추첨제 전환을 새로 반영 | 원문 링크 확인. 국립공원 추첨 대상 수(44/47)·숲나들e 주말 추첨 일자는 공식 원문 재확인 필요로 표시 |
| 아키텍처 | GitHub Actions 중심 + Cloudflare(Workers/Pages/R2)·Supabase 제안을 `docs/ARCHITECTURE.md`로 작성 | 결정 대기 항목을 PROJECT_PLAN에 반영 |
| 디자인 시안 v1 | 홈·검색·상세·오픈 캘린더 4화면 인터랙티브 시안(`design/mockup/`), 토큰을 DESIGN_SYSTEM에 기록 | Playwright로 320/390/1280px·라이트/다크 4화면 가로 넘침 0, 콘솔 오류 0. 검색 카드 이미지 넘침·지도 라벨 겹침 1회 수정 |
| 파이프라인 | `pipeline/` 신설: KST 계산, 예약 규칙 → 캘린더 이벤트(월간 오픈·추첨·재오픈·주간 오픈), 레지스트리 검증(출처 https·확인일·등급 필수, E 등급 금지), 고캠핑 전체 페이지 수집·정규화 | `npm test` 13/13 통과, `npm run validate` 통과, `npm run calendar -- 60 2026-10-12` 23건(확인 필요 14건). 고캠핑 실호출은 키 없음·이 환경에서 apis.data.go.kr 접속 불가로 미실행(모의 fetch 테스트로 대체) |
| CI | `pipeline-quality.yml`(PR 테스트·검증), `data-sync.yml`(매일 03:17 KST, 결과 아티팩트) 추가 | YAML 구문 확인. 실제 Actions 실행 결과는 PR에서 확인 |
| 디자인 | 여행 플랫폼 검색 구조와 반응형 원칙을 조사해 초록 계열 토큰·이미지·320px 규칙을 문서화 | `docs/DESIGN_SYSTEM.md`의 원문 링크와 구현 결과 대조 |

## 다음 작업

0. **사용자 시안 v2 검토 반영 → `camping-atlas/` 이식.** 아이콘은 `lucide-react`·`@tabler/icons-react`, 폰트는 `pretendard` 패키지로 옮긴다. 이식 시 시안의 예시 캠핑장 데이터 대신 `pipeline/out/open-calendar.json`과 고캠핑 정규화 결과를 사용한다. 시안의 이벤트 생성 JS는 레지스트리 계산기와 같은 규칙을 단순화한 것이므로 이식 후 삭제한다.
0-1. data.go.kr 키를 Secret에 넣은 뒤 `data-sync` 수동 실행 → 실제 응답 필드명과 `lib/gocamping.mjs` 매핑 대조, 다른 점은 테스트 표본과 함께 수정.
0-2. 레지스트리의 C 등급 규칙(국립공원 추첨, 숲나들e 주말 추첨·재오픈)을 공식 공지 원문으로 확인해 시각·일자 확정 후 B/A로 승격.

1. 기획 문서의 고캠핑 API 신청 절차에 따라 개발 키를 안전한 비밀 관리 환경에 넣고, 샘플 적재기를 만든다. 키를 저장소에 커밋하지 않는다.
2. DB를 사용할 실행 환경(PostgreSQL 또는 D1 등)을 선택하고, 스키마 호환성·마이그레이션 전략을 검토한다. 현재 SQL은 PostgreSQL 16 전제다.
3. 실제 읽기 API가 생기면 프로토타입의 예시 카드와 고정 수집 시각을 API 응답으로 교체하고, 데이터 없음/오류 상태를 구현한다.
4. 배포본을 편집할 때는 `camping-atlas/` 안의 별도 Sites Git 원격도 갱신·패키징·공개 배포해야 한다. 루트 GitHub 저장소 푸시만으로 배포가 갱신되지는 않는다.
5. 실제 캠핑장 이미지로 바꾸기 전에는 원본 URL, 권리 범위, 수집 시각, 표시 동의를 `media_asset`에 기록한다. 현재 `public/images/concept-*.png`는 디자인 검증용 생성 이미지다.

## 주의 사항

- `design/mockup/index.html`은 Artifact 게시 형식이라 `<!doctype>`·`<head>` 없이 시작한다. 로컬에서 열어도 동작하지만, 앱 이식의 기준 자료로 쓰고 직접 배포하지 않는다.
- 시안의 캠핑장 이름·요금·날씨 값은 모두 예시다. 실제 데이터처럼 다른 문서나 화면에 옮기지 않는다.

- 화면 예시는 실제 캠핑장 가격·가용성으로 제시하면 안 된다. 공식 예약 연동 전에는 검증 흐름/예시임을 명시한다.
- 고캠핑 정적 시설 데이터와 판매 재고 데이터를 합쳐 추정하지 않는다.
- SNS·검색 플랫폼의 콘텐츠는 각 API/임베드·보존 조건을 지킨다. 무단 이미지 복제 또는 전체 해시태그 수집을 하지 않는다.
- Sites 생성 응답의 자격증명은 파일이나 문서에 저장하지 않았다. `.openai/hosting.json`에는 프로젝트 ID만 있다.

## 작업 종료 체크

- [x] 관련 기획/스키마/인수인계가 함께 갱신되었는가
- [x] 테스트·린트·빌드 결과 또는 미실행 이유를 이 문서에 기록했는가
- [x] 원천·권한·개인정보 영향이 검토되었는가
- [x] 작은 단위로 커밋하고 원격에 푸시했는가
