# 인수인계

> 최종 갱신: 2026-10-13 KST<br>
> 다음 작업자는 이 문서를 먼저 읽고 작업 종료 시 업데이트한다.

## 현재 상태

- 저장소: GitHub 공개 저장소 `pyw31337/camp`
- 배포: 외부 공개 기본 주소는 [GitHub Pages](https://pyw31337.github.io/camp/)이며, 루트 `main` 푸시로 자동 갱신된다.
- 기준 설계: 전국 등록 야영장은 한국관광공사 고캠핑 API를 기준 모수로 삼고, 실제 재고·가격은 공식 예약 채널에서 별도 확인한다.
- 데이터 모델: PostgreSQL 16+용 초기 스키마가 `db/001_initial_schema.sql`에 있다. 시설·구역·상품·재고·요금·예약 정책·원천 증빙·미디어 권리를 분리한다.
- 디자인: **시안 v2**가 기준이다. 원본 `design/mockup-v2/src.html` → `design/build.mjs`가 Lucide·Tabler 스프라이트와 Pretendard 서브셋을 인라인해 `index.html` 생성. 사용자 검토 대기. v1은 `design/mockup/`에 참고용으로 남김.
- 운영 전제: 무료 운영, 로그인 보류. 알림은 `.ics` 구독, 관심 목록은 브라우저 저장. 소유자 작업은 `docs/OWNER_TODO.md`.
- Cloudflare 미리보기: `deploy-cloudflare.yml`이 시안 + ics를 `site/`로 조립해 Cloudflare Pages 프로젝트 `moyeora`에 배포한다. PR → 미리보기 `https://preview.moyeora-6pd.pages.dev`, main → 정식 `https://moyeora-6pd.pages.dev`(병합 후 첫 배포부터). `moyeora.pages.dev`는 선점돼 Cloudflare가 `-6pd`를 붙였다. Secret이 없으면 조립만 하고 건너뛴다.
- 파이프라인: `pipeline/`에 고캠핑 수집·정규화, 예약 규칙 레지스트리, 예약 오픈 캘린더 계산기와 테스트가 있다. `data-sync.yml`이 매일 실행되며 키가 없으면 고캠핑 단계는 건너뛴다.
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
| v2.1 줄바꿈 | 소유자 피드백: 라벨이 폭 때문에 두 줄이 되는 것 금지, 캐러셀 카드는 한 화면에. 라벨·버튼·칩·제목 nowrap + 좁은 화면 짧은 문구(`.l`/`.s`), 카테고리 모바일 4열 그리드, 조건 바 2×2, 상세 탭 4등분, 오픈 카드 폭을 열 수(4/3/2/1+여백)로 계산하고 PC 좌우 버튼 추가, 화면 이동 시 시트 닫기 버그 수정 | `bash design/checks/run.sh`: 줄바꿈 검사기(텍스트 노드 줄 수) 16개 폭 × 4화면 + 시트 6종: 0건, 말줄임 잘림 0건. 문장 단락만 `data-wrap-ok`로 허용 |
| 공공데이터 | 키 확인 스크립트(`npm run check:keys`), HTTPS 연결 실패 시 HTTP 재시도, 망 차단은 경고로 처리 | Actions에서 고캠핑 3,118건·기상청·TourAPI 정상, 고캠핑 동기화 성공 |
| 무료 캠프 사이트 | `registry/free-sites.json`, `lib/free-sites.mjs`, `lib/free-discovery.mjs`, `scripts/discover-public-free.mjs`, 시안 홈 섹션·‘무료’ 필터 | `npm test` 28/28. 고캠핑 소개문 후보 11건은 전부 오탐 → 패턴 강화. 공공시설개방정보 API 경로는 CI 결과로 확인 필요 |
| 화장실 원천 재조정 | CI 확인: LOCALDATA ZIP은 업종 195종 묶음(화장실 없음, 자동차·일반야영장업 CSV는 있음). 표준데이터 API(`tn_pubr_public_toilet_api`)를 1순위로 추가, `fromStandardApi` | `npm test` 54/54. 실제 API 응답은 다음 CI에서 확인 |
| 도로공사·화장실 ZIP | `lib/ex-rest-areas.mjs`: data.ex.co.kr 휴게소 좌표(203)·편의시설(215)·주유 현재가(226)를 공식 A등급 SERVICE_AREA로 병합(OSM과 500m 중복 제거), 시안 ‘가는 길’에 휘발유·경유 가격 줄. `lib/zip.mjs`: LOCALDATA ZIP의 UTF-8 플래그 없는 한글 파일명을 직접 디코딩(이전 실행에서 `unzip -Z1`이 ‘ым╕эЩФ…’로 깨져 화장실 파일을 못 찾음) | `npm test` 53/53. 로컬에서 예제 키로 휴게소 203곳·주유 가격 연결 168곳·편의시설 연결 168곳 확인. 줄바꿈·말줄임 검사 0건. 화장실 ZIP은 컨테이너에서 302로 막혀 CI 결과로 확인 필요 |
| 배포 | Cloudflare Secret 등록 후 PR에서도 미리보기 배포하도록 `pull_request` 트리거·`DEPLOY_BRANCH` 추가 | 2026-10-13 실행 [`38328941095`](https://github.com/pyw31337/camp/actions/runs/38328941095) 성공, 16개 파일 업로드. 미리보기 주소 첫 화면·`/ics/all.ics` HTTP 200 확인(새 인증서 발급에 1~2분 걸림) |
| 휴게소·졸음쉼터 | `lib/rest-stops.mjs`(OSM·졸음쉼터 표준데이터 정규화, 시설별 유·무료 기본값, 공식 우선 병합), `lib/route-stops.mjs`(경로 400m 안 시설을 km 순으로, 120km마다 휴식 제안), `scripts/sync-rest-stops.mjs`, 시안 상세 ‘가는 길’ 탭 | `npm test` 44/44. 줄바꿈·말줄임 검사 0건. 방향(상·하행) 판정과 실제 경로 API는 다음 작업 |
| 공중화장실 연계 | (CI 실측: OSM 화장실 5,416곳 → 좌표 있는 캠핑장 3,109곳 중 2km 안 935곳, 300m 안 186곳. 행안부 파일은 시도별 `download-all?orgCode=` 경로로 수집하도록 수정) 전국 공중화장실(행안부, 52,255곳) 수집·정규화(EUC-KR·ZIP·HTML 링크 처리), 카카오 지오코딩+캐시, 캠핑장 반경 2km 거리순 5곳 연계, `db/002_public_toilets.sql`(비파괴, 롤백 SQL 포함), 시안 상세 ‘주변 화장실’ | `npm test` 35/35. CI: 파일 서버가 해외 IP에 403 → API 경로 탐색(`npm run probe`) 추가. 카카오 키 등록 전에는 지오코딩·연계 미실행(경고 표시) |
| 핵심 기능·UX | 핵심 기능 3개와 무학습 원칙, 레퍼런스 5개 분석을 `docs/CORE_FEATURES_UX.md`로 작성 | 레퍼런스는 헤드리스 브라우저로 원본 이미지를 확인(Dribbble는 일반 요청을 차단) |
| 디자인 시안 v2 | Pretendard·Lucide/Tabler·초록 4계열 팔레트로 홈(탭 검색)·찾기(지도 띠 D-day 핀)·상세(사이트 맵 툴팁·예약 카드)·캘린더(구독)·바텀시트(날짜 범위·인원 스테퍼·장비) 구현 | `npm run build` 아이콘 73개·폰트 98KB. Playwright 320/390/820/1440px·라이트/다크 4화면 가로 넘침 0·오류 0. `#detail` 앵커 스크롤, 빈 토스트 노출, 320px 조건 바 넘침을 수정 |
| 알림(무료) | `pipeline/lib/ics.mjs`, `npm run ics` → `out/ics/all.ics`, `provider-*.ics`(하루 전·10분 전 알림, 시각 미확정은 종일) | `npm test` 18/18 통과(RFC 5545 골격·CRLF·75옥텟 접기·UID 안정성) |
| 배포 | `scripts/assemble-site.mjs`, `.github/workflows/deploy-cloudflare.yml`(Cloudflare Pages, Secret 없으면 건너뜀) | 로컬 조립 성공(`site/`는 gitignore). 실제 배포는 Secret 등록 후 확인 필요 |
| 조사 | 데이터 원천별 제공 가능 정보와 핵심 베네핏 4가지를 `docs/RESEARCH_DATA_TO_UX.md`로 정리. 행안부 야영장업 인허가 API(숨은 캠핑장 발견), 서울 공공서비스예약 API(접수기간), 국립공원 전면 추첨제 전환을 새로 반영 | 원문 링크 확인. 국립공원 추첨 대상 수(44/47)·숲나들e 주말 추첨 일자는 공식 원문 재확인 필요로 표시 |
| 아키텍처 | GitHub Actions 중심 + Cloudflare(Workers/Pages/R2)·Supabase 제안을 `docs/ARCHITECTURE.md`로 작성 | 결정 대기 항목을 PROJECT_PLAN에 반영 |
| 디자인 시안 v1 | 홈·검색·상세·오픈 캘린더 4화면 인터랙티브 시안(`design/mockup/`), 토큰을 DESIGN_SYSTEM에 기록 | Playwright로 320/390/1280px·라이트/다크 4화면 가로 넘침 0, 콘솔 오류 0. 검색 카드 이미지 넘침·지도 라벨 겹침 1회 수정 |
| 파이프라인 | `pipeline/` 신설: KST 계산, 예약 규칙 → 캘린더 이벤트(월간 오픈·추첨·재오픈·주간 오픈), 레지스트리 검증(출처 https·확인일·등급 필수, E 등급 금지), 고캠핑 전체 페이지 수집·정규화 | `npm test` 13/13 통과, `npm run validate` 통과, `npm run calendar -- 60 2026-10-12` 23건(확인 필요 14건). 고캠핑 실호출은 키 없음·이 환경에서 apis.data.go.kr 접속 불가로 미실행(모의 fetch 테스트로 대체) |
| CI | `pipeline-quality.yml`(PR 테스트·검증), `data-sync.yml`(매일 03:17 KST, 결과 아티팩트) 추가 | YAML 구문 확인. 실제 Actions 실행 결과는 PR에서 확인 |
| 디자인 | 여행 플랫폼 검색 구조와 반응형 원칙을 조사해 초록 계열 토큰·이미지·320px 규칙을 문서화 | `docs/DESIGN_SYSTEM.md`의 원문 링크와 구현 결과 대조 |
| GitHub Pages 파일럿 | 날짜·인원·형태 검색, 브라우저 저장목록, 상품 상세·공식 예약/사진/공지 링크를 구현. 자라섬캠핑장 4개 실제 상품을 가평군시설관리공단 원문으로 등록 | 로컬 `npm run lint`, `npm run build`, `npm run build:pages` 성공. 공개 배포 [Pages 실행 38331404373](https://github.com/pyw31337/camp/actions/runs/38331404373), [웹 품질 실행 38331404533](https://github.com/pyw31337/camp/actions/runs/38331404533) 통과. 공개 URL에서 검색 1건, 저장, 상세 전환, 320px 가로 넘침 없음, 콘솔 오류 없음 확인 |
| Claude 작업 연계 | `claude/upbeat-keller-x75pct`의 전국 데이터 파이프라인을 검토하고 호환되는 12개 커밋을 반영했다. GoCamping 동기화·예약 규칙 레지스트리·캘린더/ICS·무료 후보·공중화장실·휴게소·졸음쉼터 수집/연결이 포함된다. | `pipeline`에서 `npm test` 50개 통과, `npm run validate`, `npm run calendar -- 60 2026-10-13`, `npm run ics -- 60 2026-10-13` 성공. 캘린더 23건(확인 필요 14건) 생성. API 키·원천 접근 허가 전에는 운영 데이터로 표시 금지. |
| 프리미엄 탐색 UI | Dribbble 여행·캠핑 참고 화면의 사진 중심 계층과 예약 UI를 바탕으로 검색·상세·최근 현장 경로 화면을 다시 구성했다. 실제 사진은 자라섬캠핑장 운영기관 시설 원문 4건만 외부 표시한다. | `npm run lint`, `npm run build`, `npm run build:pages`, GitHub Pages 경로 자산 검증 성공. 브라우저에서 오류 0건, “사이트 A” 검색 1건·상세 전환, 320px 문서 가로 넘침 없음 확인. [Pages 실행 38333884947](https://github.com/pyw31337/camp/actions/runs/38333884947) 통과 및 공개 URL의 새 헤드라인 로드 확인. |
| UI 재설계 | 클로드 아티팩트 v2를 검토해 히어로 안의 탭형 검색, 예약 오픈 우선 카드, 단순화한 실제 상품 카드, 예약처 규칙, 모바일 하단 탐색으로 전체 정보 구조를 재구성했다. 클로드 시안의 콘셉트 이미지·예시 캠핑장은 가져오지 않았다. | 로컬 `npm run lint`, `npm run build`, `npm run build:pages` 성공. 브라우저에서 “사이트 A” 검색 1건, 상세 열기, 콘솔 오류 0건, 320px 문서 폭 305px/스크롤 폭 305px 확인. [Pages 실행 38335351773](https://github.com/pyw31337/camp/actions/runs/38335351773) 통과, 공개 주소에서 히어로·예약 오픈 카드 4건 로드 확인. |

## 다음 작업

1. 고캠핑 API 키를 비밀 관리 환경에 설정하고 `pipeline` 동기화를 실제 기준 데이터로 실행한다. 키를 저장소에 커밋하지 않는다.
2. DB를 사용할 실행 환경(PostgreSQL 또는 D1 등)을 선택하고 `db/001_initial_schema.sql`, `db/002_public_toilets.sql`의 호환성·이관/롤백 전략을 검토한다. 현재 SQL은 PostgreSQL 16 전제다.
3. 실제 읽기 API가 생기면 파일럿의 자라섬 정적 레코드를 API 응답으로 교체하고, 상품·미디어·공지·예약 제공자 레지스트리를 전국으로 확대한다.
4. 공식 소셜 계정은 소유 확인·임베드 권한·게시시각·캠핑장 매칭이 모두 확인된 뒤에만 `social_connection`과 `social_item`에 등록한다. 해시태그 수집이나 이미지 저장으로 대체하지 않는다.
5. (2026-10-13 병합 처리) `claude/upbeat-keller-x75pct`의 Cloudflare 워크플로는 `deploy-cloudflare.yml`로 이름을 바꿔 GitHub Pages(`deploy-pages.yml`)와 공존한다. 시안 이미지는 `camping-atlas/public/images/` 생성 이미지의 크롭 파생본이며 출처를 `design/ASSETS.md`에 기록했다. main에서 원본 PNG를 지운 판단과 맞는지(파생본 유지 vs 교체) 검토가 남아 있다.
6. 현재 웹의 예약 오픈 카드는 `pipeline/out/open-calendar.json`의 2026-10-13 생성 결과 중 일부를 동일 원천 URL·확인일과 함께 정적으로 옮긴 상태다. 배포 시점의 파이프라인 실행/API 연결 전에는 일반화된 실시간 일정으로 표시하지 않는다.

**시안·무료 운영 트랙**

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
- GitHub Pages 파일럿의 사진은 가평군시설관리공단 공식 시설 안내의 외부 원문 URL을 표시한다. 대표 이미지를 저장·가공·다른 시설에 재사용하지 않는다.
- 일반 후기·소셜 사진은 카드 대표 이미지나 운영 사실의 근거로 사용하지 않는다. `source_url`, 게시 시각, 확인 시각, 매칭 근거, 임베드·표시 권한을 모두 확보한 뒤 최근 현장 섹션에 원문/임베드로만 표시한다.
- Sites 생성 응답의 자격증명은 파일이나 문서에 저장하지 않았다. `.openai/hosting.json`에는 프로젝트 ID만 있다.

## 작업 종료 체크

- [x] 관련 기획/스키마/인수인계가 함께 갱신되었는가
- [x] 테스트·린트·빌드 결과 또는 미실행 이유를 이 문서에 기록했는가
- [x] 원천·권한·개인정보 영향이 검토되었는가
- [x] 작은 단위로 커밋하고 원격에 푸시했는가 — 프리미엄 UI·문서 변경을 한 커밋으로 배포
