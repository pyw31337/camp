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
- **주소 통일(2026-10-13, 소유자 요청)**: 서비스 주소는 https://pyw31337.github.io/camp/ 하나다. Cloudflare Pages(`*.moyeora-6pd.pages.dev`)와 `deploy-cloudflare.yml`·`scripts/assemble-site.mjs`는 폐기했다. 전국 캠핑장 탐색 화면은 `/camp/explore/`에 둔다: main의 `data-sync.yml` 마지막 단계가 `scripts/publish-explorer-pages.mjs`로 `camping-atlas/public/explore/`(화면 + `data/campgrounds.json`·`meta.json`)를 만들어 커밋하고, `deploy-pages.yml`은 `workflow_run`(Data sync 완료, main)으로도 실행된다(GITHUB_TOKEN 커밋은 push 워크플로를 깨우지 않기 때문). 홈 상단 ‘전국 캠핑장 찾기’와 하단 ‘찾기’가 `explore/`로 연결된다. 카카오 JS SDK 도메인에 `https://pyw31337.github.io` 등록 필요(소유자).
- 파이프라인: `pipeline/`에 고캠핑 수집·정규화, 예약 규칙 레지스트리, 예약 오픈 캘린더 계산기와 테스트가 있다. `data-sync.yml`이 매일 실행되며 키가 없으면 고캠핑 단계는 건너뛴다.
- 웹: `camping-atlas/`는 정적 내보내기가 가능한 Vinext 앱이다. GitHub Pages를 외부 공개 기준으로 유지하며, Sites 프로젝트는 이 작업에서 배포 경로로 사용하지 않는다.
- GitHub Pages: `main`의 `camping-atlas/` 변경을 정적 내보내기해 [`https://pyw31337.github.io/camp/`](https://pyw31337.github.io/camp/)에 자동 배포한다. 정적 산출물의 접두 경로는 `scripts/prepare-pages.mjs`가 GitHub Pages의 `/camp` 마운트 경로에 맞춘다.

## Codex 확인 요청 (2026-10-13 오후, Claude)

0. 소유자 지시(2026-10-13): Claude는 PR 검사가 통과하면 직접 병합해 자동 배포한다. `app/home.tsx`의 검색 제출·분류 버튼을 탐색 화면(`explore/`)으로 연결했다(시범 상품 목록은 그대로 둠).

1. `deploy-pages.yml`에 `media` 브랜치(공식 사진 webp)를 `dist/client/media`로 펼치는 단계를 더했다. 브랜치가 없으면 건너뛴다.
2. 갈등 정리 필요: 아래 가평 파일럿 규칙 “대표 이미지를 저장·가공하지 않는다”와 소유자 요청(공식 사진 자체 저장)이 충돌한다. 고캠핑 OpenAPI 이용허락 ‘제한 없음’·공공누리 확인 결과는 `docs/IMAGE_PIPELINE.md`. 비례 축소·webp 변환·메타 제거만 하고 출처 “사진: 한국관광공사 고캠핑”을 표시한다. 중단하려면 저장소 변수 `GOCAMPING_IMAGES_PUBLISH=false`.
3. 홈(`camping-atlas`) 화면도 글자가 작다는 소유자 피드백이 있다(최소 11px, rem). 탐색 화면은 rem 토큰으로 바꿨으니 홈도 같은 기준으로 맞춰 달라.

## Codex 협의 요청 (2026-10-13, Claude) — 정렬 완료

두 작업이 같은 날 각각 `db/005~007`을 만들어, **main(Codex) 스키마를 기준으로 정렬**했다. 상세: [`docs/DB_BUILD_PLAN.md`](./DB_BUILD_PLAN.md).

1. Claude 쪽 중복 마이그레이션·적재기(005~009, postgres-enrichment, verify-db-load, db-verify.yml)는 제거했다.
2. **`lib/postgres-context.mjs` 최소 수정(두 줄)**: 실데이터의 중복 키(같은 쉼터 두 번 등록, 같은 화장실 해시)가 한 INSERT에 들어가면 운영 첫 적재가 `ON CONFLICT DO UPDATE command cannot affect row a second time`으로 실패한다(로컬 재현, 회귀 테스트 `test/postgres-context-duplicates.test.mjs`). 키별 마지막 행만 남긴다. 같은 이유로 `replaceNearbyToiletLinks`도 캠핑장별 중복 화장실을 한 번만 넣고 순위를 다시 매긴다(CI 실데이터 단계가 발견). 확인 부탁.
3. `db/008_campground_licence_source.sql`(인허가 원천 등록, 새 테이블 없음)과 `db:import-licences`(Codex `campground_candidate`에 적재)를 더했다. 다음 Codex 마이그레이션은 009부터.
4. `data-sync.yml`: 인허가 수집 단계, 운영 단계에 `db:import-licences`, 마지막에 **그날 실제 파일을 임시 PostgreSQL에 두 번 적재**하는 단계를 더했다(고정 표본 검증이 못 잡는 실데이터 문제 대비).
5. **화면 분담(소유자 결정으로 갱신)**: 모든 화면이 GitHub Pages 한 주소로 간다. 실데이터 탐색 화면(`design/explore`)은 `/camp/explore/`, 홈·예약 오픈 일정은 `camping-atlas`. Codex 확인 요청: (a) `deploy-pages.yml`에 `workflow_run` 트리거 추가, (b) `app/home.tsx` 상단 ‘캠핑장 찾기’·하단 ‘찾기’ 링크를 `#search` → `explore/`로 바꿈(문구 ‘전국 캠핑장 찾기’), (c) `camping-atlas/public/explore/`는 data-sync 봇이 매일 덮어쓰는 생성물이니 손으로 고치지 말 것(원본은 `design/explore/`).
6. **카카오 일일 한도 공유 주의**: main과 PR 브랜치의 Data sync가 서로 다른 캐시 키로 같은 화장실 주소를 각각 변환해 카카오 로컬 일일 한도를 함께 소진했다(06:17 실행에서 2,000건 전부 오류). 오류가 “주소 없음”으로 30일 캐시되던 문제는 `lib/geocode.mjs`에서 고쳤다(오류는 캐시하지 않고 20번 연속 오류면 중단). 지오코딩은 main 실행에서만 하고 PR은 캐시만 쓰자는 제안(예: PR에서 `GEOCODE_MAX_CALLS=0`).
7. 병합 조건 응답: Cloudflare 배포는 폐기(위 주소 통일), 시안 이미지 출처는 `design/ASSETS.md`.

## 최근 변경

| 항목 | 내용 | 검증 |
| --- | --- | --- |
| 사진·후기·영상·상품 대폭 보강, 홈 사진 중심 | 소유자 요청(데이터가 많아야 함). **후기·사진·영상**: `lib/social-search.mjs`·`sync:social` 카카오(다음) 검색 blog·cafe·image·vclip(같은 REST 키, 하루 4,000회·14일 캐시, 이름·지역 관련도 필터, 분양·매매 제외, 유튜브 id·쇼츠 판별) → 링크·썸네일 주소만 저장(이미지 재호스팅 없음, ‘Daum 검색 제공’ 표시, 약관 메모 `docs/SOCIAL_SEARCH.md`). **상품·가격·상품 사진**: `lib/tour-products.mjs`·`sync:tour-products` TourAPI 숙박(32)·야영장(28) 대량 목록 매칭 → detailInfo2(객실/사이트명·크기·기준/최대 인원·비수기/성수기 주중/주말 최소 요금·편의·객실 사진)·detailImage2(공식 사진), ‘공식 등록 기준가’로만 표시. TourAPI 한도 분배: 요금 안내 250 · 주변 150 · 상품 550. **공식 사진**: imageList 하루 900회, 캠핑장당 6장 자체 저장, 미저장분은 고캠핑 원본 주소로 표시. **화면**: 상세 맨 앞 ‘사진·후기’(공식 사진 그리드, 영상·쇼츠 가로 레일·유튜브 임베드, 방문자 사진 그리드, 블로그·카페 후기), ‘상품·요금’에 상품 카드(사진 넘기기·요금표), 목록 카드에 ‘후기 N·영상 N’. **홈**(`home.tsx`): 검색창은 캠핑장 찾기만, 테마별 사진 캐러셀 12종(`explore/data/featured.json`, 매일 갱신), 예약 오픈은 아래 섹션에 오픈 빠른 순 캐러셀 | `npm test` 155 통과. 홈 390·1280px 넘침 0·사진 레일 6개(표본 featured)·검색 탭 제거 확인. 탐색 상세(표본 후기·영상·상품) 320~1280px × 글자 2종 넘침 0. 실제 카카오 검색·TourAPI 상품 수집은 다음 main Data sync에서 확인 |
| 홈 검색 → 전국 결과 페이지, 상세 = 한 페이지 | 소유자 피드백(홈 검색이 시범 상품 1~2건만 보여 줌): 홈 `runSearch`가 `explore/#q=검색어`(장비 카라반→`t=trailer`, 차박→`k=AUTO_PITCH`)로, 분류 버튼(오토캠핑·글램핑 등)이 `explore/#k=형태`로 이동. ‘공식 정보로 확인한 상품’ 머리에 ‘전국 캠핑장 전체 보기’. 탐색: 검색어를 띄어쓰기로 나눠 이름·지역(약칭)·주소·한 줄 소개·테마·사이트 형태·시설·입지·운영 주체·예약 방법을 모두 검색, 제목 ‘‘계곡’ 검색 결과 1,099곳’, 목록 40곳씩 끝에 닿으면 자동 추가, 주소 해시(q·k·t·a·g) 변경 반영. 상세는 모든 화면에서 전체 페이지(가운데 880px, ‘← 목록’, 브라우저 뒤로 가기로 목록 복귀) | 실데이터(공개 사이트 데이터)로: 계곡 1,099 · 가평 202 · 강원 글램핑 85 · 반려견 바다 185 · 글램핑 797곳, 스크롤 시 40→80곳, 상세 열기·뒤로 가기 확인, 오류 0. `camping-atlas` lint 오류 0·`build:pages` 성공 |
| 정정(2026-10-13) | 전국공중화장실표준데이터는 OpenAPI가 없고 CSV만 제공(LOCALDATA 파일과 동일), 2025-02부터 WGS84 좌표 제외(data.go.kr 15012892 확인). 소유자에게 활용신청을 잘못 요청했던 것을 철회. 화장실 좌표 = 카카오 지오코딩 캐시 + OSM | data.go.kr 데이터셋 페이지 확인 |
| 실서비스 공개·OSM 추출본 | PR #2 병합 후 main Data sync로 https://pyw31337.github.io/camp/explore/ 공개(3,109곳, 자체 webp 사진 1,495곳, 주변 관광·맛집 3,109곳, 서울 공공예약 51건, 테마 23종). 공용 Overpass가 504로 마트·편의점·주유·화장실(OSM)이 거의 비어, **Geofabrik 한국 OSM 파일을 주 1회 받아 osmium으로 필요한 태그만 추출**(`scripts/osm-extract.mjs`, 캐시 `osm-extract-v1-주차`) → `OSM_EXTRACT`가 있으면 화장실·휴게소(`overpassCached`의 `select`)와 주변 정보가 네트워크 질의 없이 추출본 사용 | 실서비스 화면 검사(320~1280px × 글자 2종 × 목록·테마·상세) 넘침 0, 카카오 지도·공식 사진·공유 페이지 HTTP 200. `npm test` 통과. Geofabrik는 이 컨테이너에서 막혀 실제 추출은 다음 Data sync에서 확인 |
| 캠핑장별 예약 안내 | `registry/booking-platforms.json`(예약 채널 17종: 숲나들e·국립공원·서울 공공예약·네이버 예약·땡큐캠핑·캠핏·캠핑톡 등, 절차·결제 기한·취소 규정 위치·대기·팁·공식 안내 링크, 사실마다 출처·확인일·등급, 숲나들e 국립/공립/사립·국립공원 추첨 규칙 템플릿 8개) + `lib/booking-intel.mjs`(채널 판별, 운영자·TourAPI 예약 안내 문구에서 오픈 규칙 추출, 다음 오픈 일시 계산, 경고). 상세 예약 칸: 다가오는 예약 오픈(한국 시간), 이 캠핑장의 오픈 규칙(출처·등급), 예약처 오픈 방식(시설 유형별, 접기), 예약 순서, 결제·취소·대기, 팁, 공식 안내. 목록 카드: 확정 오픈 일정이 있으면 ‘10.15(목) 09:00 오픈’ 배지. 기본 정보에 TourAPI 이용 시간·쉬는 날·주차·운영 기간 | `npm test` 134 통과. 개발용 데이터로 숲나들e 캠핑장 상세 320~1280px·글자 크기 2종 넘침 0. **충돌**: `booking-rules.json`의 `knps-campground-lottery`(매월 1~5일, 언론 C등급)와 국립공원 공식 페이지(짝수 달 1일 추첨) 불일치 → 공식 기준으로 레지스트리 정정 필요 |
| 상세 허브·테마·글자 체계·주변·사진 | **글자**: 탐색 화면 글자 크기를 rem 토큰(`--fs-*`, 최소 12px)으로, 굵기·크기 대비 강화, 헤더 ‘가’ 버튼으로 작게/보통/크게/아주 크게(html font-size, 이 기기 저장). **테마**: `lib/themes.mjs`(고캠핑 원천 필드만으로 23개 테마 판정, 레코드 `th`, meta.themes) → 둘러보기 허브(자연·계절·함께·방식·편의 묶음), 권역 → 시군구 2단계, 테마 머리·공유(#t=&a=&g=). **상세**: 목차(기본정보·예약·사이트·요금·시설·주변·사진·후기·댓글), 하단 고정 예약 버튼, 기본 정보 표(주소 복사·전화·홈페이지·운영), 테마 태그, 주변 탭(화장실·마트·편의점·주유·병원·휴게소·관광·맛집·철물), 외부 플랫폼 후기·영상 링크(카카오맵·네이버 지도 별점·리뷰, 블로그, 유튜브, 인스타그램), giscus 댓글(설정 변수 있을 때). 캠핑장별 상세 파일 `explore/data/camps/{id}.json`, 공유용 정적 페이지 `explore/c/{id}/`(오픈그래프·트위터 카드). **수집**: `sync:nearby`(`lib/nearby-context.mjs`: TourAPI 유형별 대량 페이지 7일 캐시, OSM Overpass 타일 14일 캐시, 휴게소·쉼터), `sync:images`(`lib/images.mjs`: 고캠핑 대표·imageList 공식 사진 → sharp webp 480/1280px, 한 커밋짜리 `media` 브랜치, deploy-pages가 `/camp/media/`로 함께 배포, 상세는 `../media/` 사용; 근거·주의는 `docs/IMAGE_PIPELINE.md`). Data sync: 캐시 키 v4, PR은 지오코딩·imageList 0회 | `npm test` 134 통과(DB 포함). 개발용 데이터로 320/375/768/1280px × 글자 보통·아주 크게 × 목록·테마·상세: 화면 밖 넘침·라벨 줄바꿈 0건(`audit` 스크립트). 실제 Overpass·TourAPI·이미지 수집은 이 컨테이너에서 네트워크가 막혀 PR Data sync에서 확인 |
| 탐색 화면 보강 + 서울 공공예약 | `lib/seoul-yeyak.mjs`·`sync:seoul-yeyak`(서울 열린데이터광장 공공서비스예약 종합 `tvYeyakCOllect`, 실패 시 시설대관·체육시설; 캠핑 상품만, 접수 상태·접수 기간·원문 링크·확인 시각) → 2km·이름 유사도로 고캠핑에 연결(`seoul` 필드). 고캠핑 소개(`intro`·`nearby_facilities`·`programs`·`gocamping_url`) 정규화, 목록엔 한 줄 소개만·긴 소개는 `explore/data/texts.json`(상세 열 때 로드). 화면: 관심(이 기기 저장)·관심 필터·공유(링크 복사)·‘지도에 보이는 곳만’·운영자 소개·서울 접수 상태 배지·고캠핑 원문 링크 | `npm test` 76 통과. 개발용 데이터로 320/390/1280px 가로 넘침 0(상세 패널 포함), 관심 저장·필터·소개 로드 확인. 서울 키(`SEOUL_OPEN_API_KEY`)는 이 컨테이너에서 8088 포트가 막혀 PR의 Data sync 로그로 확인 |
| 주소 통일 | 소유자 요청으로 GitHub Pages 단일 주소. Cloudflare 워크플로·`assemble-site.mjs` 삭제, `scripts/publish-explorer-pages.mjs` 추가(탐색 화면을 `camping-atlas/public/explore/`로 발행), `data-sync.yml` 마지막 단계가 main에서 커밋·푸시, `deploy-pages.yml`에 `workflow_run`, 홈 링크 `explore/` | `npm test` 72 통과, `camping-atlas` lint 통과·`build:pages` 성공(홈에 `explore/` 링크 2개). 로컬 개발용 데이터로 `dist/client/explore/{index.html,data/}` 생성 확인 후 삭제. tsc 오류 3건(`home.tsx:108`, `vite.config.ts:11`)은 변경 전부터 있던 것. 실제 공개는 PR 병합 후 main Data sync 실행 시 |
| 기획 | 통합검색·예약, 미디어·지도·여행 연동 설계 작성 | 원천 링크와 정책 구분을 문서 검토 |
| DB | 25개 테이블과 예약·원천·미디어 관련 enum/인덱스 초안 작성 | SQL 형식 확인; 로컬에 PostgreSQL 실행 파일이 없어 실제 적용은 미실행 |
| 협업 | `AGENTS.md`, 프로젝트 계획, 인수인계, GitHub 비공개 원격 저장소 생성 | `gh auth status`, 원격 저장소 생성 성공 |
| 협업 검수 | GitHub PR 템플릿과 웹 품질 검사 워크플로 추가 | PR 및 `main` 푸시에서 웹 변경 시 설치·린트·빌드 실행. 최신 실행 [`38237199381`](https://github.com/pyw31337/camp/actions/runs/38237199381) 통과 |
| 웹 | 브랜드를 ‘모여라 캠핑’으로 변경하고 공개 Sites 버전 2를 배포. 오토캠핑·카라반·글램핑 콘셉트 이미지와 여행 검색형 UI를 추가 | `npm run lint`, `npm run build`, 320px/1440px 브라우저 검수 및 공개 URL 확인 완료 |
| v2.1 줄바꿈 | 소유자 피드백: 라벨이 폭 때문에 두 줄이 되는 것 금지, 캐러셀 카드는 한 화면에. 라벨·버튼·칩·제목 nowrap + 좁은 화면 짧은 문구(`.l`/`.s`), 카테고리 모바일 4열 그리드, 조건 바 2×2, 상세 탭 4등분, 오픈 카드 폭을 열 수(4/3/2/1+여백)로 계산하고 PC 좌우 버튼 추가, 화면 이동 시 시트 닫기 버그 수정 | `bash design/checks/run.sh`: 줄바꿈 검사기(텍스트 노드 줄 수) 16개 폭 × 4화면 + 시트 6종: 0건, 말줄임 잘림 0건. 문장 단락만 `data-wrap-ok`로 허용 |
| 공공데이터 | 키 확인 스크립트(`npm run check:keys`), HTTPS 연결 실패 시 HTTP 재시도, 망 차단은 경고로 처리 | Actions에서 고캠핑 3,118건·기상청·TourAPI 정상, 고캠핑 동기화 성공 |
| 무료 캠프 사이트 | `registry/free-sites.json`, `lib/free-sites.mjs`, `lib/free-discovery.mjs`, `scripts/discover-public-free.mjs`, 시안 홈 섹션·‘무료’ 필터 | `npm test` 28/28. 고캠핑 소개문 후보 11건은 전부 오탐 → 패턴 강화. 공공시설개방정보 API 경로는 CI 결과로 확인 필요 |
| 야영장업 인허가 연계(main 스키마 기준) | `lib/localdata.mjs`(업종 전용 다운로드), `lib/localdata-campgrounds.mjs`(정규화·EPSG:5174·업종 고유 열 보존·고캠핑 1:1 매칭·플래그), `scripts/sync-localdata-campgrounds.mjs`, `lib/postgres-licences.mjs`·`db:import-licences`(campground_candidate, 사람 검토 보존), `db/008` | 로컬 PostgreSQL 16에서 001~008 적용, `npm test` 66(실제 DB 통합 2 포함) 통과. 실제 업종 slug는 CI 로그로 확인 필요 |
| 전국 캠핑장 탐색 화면(Cloudflare) | `design/explore`(시안 토큰 재사용, Pretendard CDN, Lucide·Tabler): 검색·지역·형태·실시간 예약·반려견·요금 안내·공중화장실 500m·장비 크기 필터, 이름·가까운 순·요금 정렬, 카카오 지도(클러스터)·목록 전환, 상세(사진·길찾기·전화·사이트 구성/크기/바닥·시설·공식 안내 요금+출처·예약처 규칙/다음 오픈·주변 화장실), **예약하러 가기 = 공식 예약처 링크**. `lib/explore-data.mjs`·`scripts/build-explore-data.mjs`(빈 값 제거, gzip 155KB), `lib/tour-fees.mjs`·`scripts/sync-tour-fees.mjs`(TourAPI 야영장 소개정보 요금 문구, 하루 800건 캐시). `assemble-site`: `/` 탐색, `/mockup/` 시안. `data-sync.yml` 끝에서 그날 데이터로 Cloudflare 배포, `deploy-cloudflare.yml`은 화면만 바뀌면 마지막 공개 데이터를 재사용 | `npm test` 67 통과(DB 통합 테스트는 DB 있을 때). 개발용 데이터(카탈로그 이름·지역 + 임의 좌표, 미커밋)로 1280/390/320px 가로 넘침 0, 검색·필터·상세·예약 버튼 동작 확인. 실데이터·지도는 CI 배포 후 확인 |
| DB 정렬 | Claude 005~009 대신 Codex 005~007 채택. `db/003` 형 변환은 양쪽이 같은 수정을 해 main 버전으로 통일. `postgres-context.mjs` 중복 키 수정 | 중복 키 버그 로컬 재현 후 수정·회귀 테스트 통과 |
| 화장실 수집 성공 | CI [`38347850010`](https://github.com/pyw31337/camp/actions/runs/38347850010): `GET /file/download/public_restroom_info/info` → 행안부 공중화장실 53,584행(정규화 53,584곳). 카카오 지오코딩 30,000건 호출(성공 28,798, 없음 1,202), 남은 14,525건은 다음 실행에서 캐시 이어서. 좌표 35,421곳 + OSM 4,376곳 추가(중복 1,041). 캠핑장 3,109곳 중 2km 안 화장실 1,958곳, 300m 안 551곳 | 키 점검: EX ✓, 카카오 REST ✓, 카카오 JS(Secret) ✓ |
| 화장실 전용 다운로드·키 확인 | CI 진단으로 LOCALDATA 화장실 페이지의 주 버튼 `data-download-urls="/file/download/public_restroom_info/info"`를 찾음(사이드바 `download-all`은 업종 195종 묶음). 쿠키·CSRF로 GET→POST 호출하도록 변경. Overpass 실패 시 직전 응답 캐시(`.cache/osm-*.json`, Actions 캐시 키 geocode-v3). `check:keys`에 EX·카카오 확인 추가 | `npm test` 55/55. CI: `EX_API_KEY` ✓(휴게소 203), 카카오 REST ✓(주소→좌표), `KAKAO_JS_KEY`는 Variable이 비어 Secret도 읽게 함 |
| 화장실 원천 재조정 | CI 확인: LOCALDATA ZIP은 업종 195종 묶음(화장실 없음, 자동차·일반야영장업 CSV는 있음). 표준데이터 API(`tn_pubr_public_toilet_api`)를 1순위로 추가, `fromStandardApi` | `npm test` 54/54. CI [`38343983269`](https://github.com/pyw31337/camp/actions/runs/38343983269): 표준데이터 경로 존재·키 미등록(활용신청 대기), 도로공사 휴게소 203·주유가 168 연결, 졸음쉼터 253, OSM 화장실 5,417곳으로 캠핑장 935곳 연계 |
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
| 클로드 시안 기준 UI·공개 데이터 발행 | 사용자 요청에 따라 클로드 아티팩트 v2의 큰 사진 히어로, 탭형 검색, 카테고리 필, 가로 예약 카드, 사진 카드와 모바일 하단 탐색을 기준 레이아웃으로 다시 구현했다. `pipeline/out/open-calendar.json`은 `camping-atlas/public/data/open-calendar.json`으로 발행해 화면이 로드하며, `catalog.json`은 고캠핑 공개 여부·수집 시각·상품 수를 표시한다. `db/003_seed_source_registry.sql`에는 고캠핑·숲나들e·국립공원·서울시·자라섬의 원천/예약처 레지스트리를 추가했다. | `pipeline`: `npm test` 52개, `npm run validate`, `npm run publish:web-catalog` 통과. `camping-atlas`: `npm run lint`, `npm run build`, `npm run build:pages` 통과. 320px에서 문서 폭/스크롤 폭 305px로 일치하고 콘솔 오류 0건이다. [Pages 실행 38343519616](https://github.com/pyw31337/camp/actions/runs/38343519616) 통과 후 공개 URL에서 히어로 1개, 예약 카드 23개, 오류 0건을 확인했다. 고캠핑 키/영구 보존 조건은 아직 없어 `catalog.json`의 고캠핑 상태는 `AWAITING_API_SYNC`; 이 값은 전국 등록 수처럼 표시하지 않는다. |
| 기준 데이터 실제 동기화 준비 | GitHub Actions 시크릿 `DATA_GO_KR_SERVICE_KEY`가 등록된 것을 확인했고, 실행 38344388514에서 키 검증과 `sync:gocamping`이 성공했다. 고캠핑 공개 보존 근거는 공공데이터포털의 이용허락범위 제한 없음 표기를 원문으로 확인해 `db/004_confirm_gocamping_catalog_license.sql`에 기록했다. 메인 수동 동기화가 PR의 장시간 부가 수집 대기열에 막히지 않도록 `data-sync.yml`의 동시성 그룹을 ref별로 분리했다. | GitHub Actions 실행 기록에서 키 검증·고캠핑 동기화 단계 성공 확인. `db/004`는 PostgreSQL 실행 환경이 없어 적용 전 SQL 검토만 완료했으며, 적용 뒤 `data_source.gocamping.allows_persistent_storage=true`가 되어야 한다. |
| PostgreSQL 적재기 | `pipeline`에 `db:migrate`와 `db:import-gocamping`을 추가했다. 외부 식별자(`gocamping:contentId`)를 기준으로 시설·별칭·상품 유형/면수·규격 그룹·고캠핑 제공 예약 링크·원천 스냅샷을 멱등 적재한다. 고캠핑의 예약 URL은 운영자 공식 채널로 확정하지 않아 `UNKNOWN` 연결로 보관한다. 가격·정원·실시간 재고·규격의 상품 연결은 원천이 제공하지 않으므로 생성하지 않는다. Actions는 `DATABASE_URL` 비밀값이 있을 때만 고캠핑 동기화 후 마이그레이션/적재를 실행한다. | `pipeline`에서 `npm ci`, `npm test` 54개, `npm run validate` 통과. 로컬에 PostgreSQL 서버와 `DATABASE_URL`이 없어 실제 SQL 적용은 실행하지 못했고, 연결 문자열 없이 마이그레이션 명령이 즉시 중단되는 것을 확인했다. |
| 데이터 기반 확장·Claude 협의 반영 | 클로드 검토 의견(사실 수명·수집 실행 이력, 제공자 공통 규칙과 시설별 정책 분리, 실시간 재고의 엄격한 자격)을 반영해 `db/005`~`db/007`, `db:import-context`, 임시 PostgreSQL 검증 워크플로를 추가했다. 행안부 전용 화장실 다운로드/API, 한국도로공사 휴게소·주유 가격 API, OSM 캐시 보조도 안전하게 선별 적용했다. `DATA_FOUNDATION_PLAN.md`에 초기 전량 적재·일/주/분기 갱신·롤백 기준을 기록했다. | `pipeline`에서 `npm test` 56개, `npm run validate`, `node scripts/build-open-calendar.mjs 120 2026-10-13`, 모든 새/변경 JS 문법 검사, `git diff --check` 통과. 첫 PostgreSQL 16 CI가 기존 `db/003`의 enum 미캐스팅을 찾아냈고, 실제 운영 DB가 없음을 재확인한 뒤 신선 설치가 가능한 명시 캐스트로 보정했다. 보정 뒤 PostgreSQL 16 CI는 전체 마이그레이션·중복 적재·재적용까지 통과했다. 수동 동기화에서 실제 적재와 무관한 API 후보 탐침과 OSM 보조 요청이 긴 시간 대기하는 것을 확인했다. 정기 실행은 고캠핑 필수 키만 빠르게 점검하고 미문서 API 탐침은 수동 진단으로 분리했으며, OSM은 서버당 15초/1회로 제한해 실패 시 공식 데이터만 즉시 발행하도록 보정했다. |
| 공개 카탈로그 안전장치 | 취소된 동기화가 GoCamping 원천 파일 없이 공개 카탈로그를 생성해 3,118개 시설을 빈 목록으로 덮어쓴 것을 확인했다. 해당 데이터 커밋은 되돌리고, 새 발행기는 직전 `PUBLISHED` GoCamping 카탈로그가 있을 때 새 원천이 누락되면 기존 시설·원천 시각을 유지한다. 권리 철회에 따른 의도적 비공개는 repository variable `ALLOW_GOCAMPING_CATALOG_WITHDRAWAL=true`일 때만 가능하다. | 단위 테스트로 원천 누락 시 보존과 명시적 철회를 각각 검증한다. |
| 공중화장실 지오코딩 배치 | 행안부 전량 원천은 좌표가 비어 있는 행이 많아 카카오 지오코딩 3만 건을 한 번에 수행하면 Actions가 장시간 실행될 수 있다. 정기·기본 수동 실행은 캐시를 재사용해 2,000건으로 제한하고, 초기 전량 보강에만 `workflow_dispatch`의 `geocode_max_calls=30000`을 명시한다. | 수집기는 원천 파일 전체를 매번 저장하고, 좌표가 없는 행만 캐시 기준으로 다음 배치에 이어서 보강한다. |

## 다음 작업

1. 메인 브랜치의 새 `data-sync.yml`로 고캠핑 동기화를 다시 실행하고, 발행된 `catalog.json`의 레코드 수·원천 시각·스키마를 검토한다. 새 원천이 비어도 직전 공개 카탈로그는 유지되어야 하며, 권리 철회가 아닌 한 `ALLOW_GOCAMPING_CATALOG_WITHDRAWAL`를 설정하지 않는다. 키를 저장소에 커밋하지 않는다.
2. DB를 사용할 PostgreSQL 16+ 실행 환경과 `DATABASE_URL` 비밀값, `DATABASE_SSL` 정책을 준비해 다음 데이터 동기화에서 `db/001`부터 `db/007`까지 적용하고 고캠핑·화장실·이동 시설·무료 후보·예약 규칙을 적재한다. 배포 전 새 `PostgreSQL schema verification` 실행이 통과하는지 확인한다. `db/004`의 롤백은 `allows_persistent_storage=false`로 되돌리고 공개 카탈로그에서 해당 원천을 제외하는 방식이다.
3. 실제 읽기 API가 생기면 파일럿의 자라섬 정적 레코드를 API 응답으로 교체하고, 상품·미디어·공지·예약 제공자 레지스트리를 전국으로 확대한다.
4. 공식 소셜 계정은 소유 확인·임베드 권한·게시시각·캠핑장 매칭이 모두 확인된 뒤에만 `social_connection`과 `social_item`에 등록한다. 해시태그 수집이나 이미지 저장으로 대체하지 않는다.
5. (2026-10-13 병합 처리) `claude/upbeat-keller-x75pct`의 Cloudflare 워크플로는 `deploy-cloudflare.yml`로 이름을 바꿔 GitHub Pages(`deploy-pages.yml`)와 공존한다. 시안 이미지는 `camping-atlas/public/images/` 생성 이미지의 크롭 파생본이며 출처를 `design/ASSETS.md`에 기록했다. main에서 원본 PNG를 지운 판단과 맞는지(파생본 유지 vs 교체) 검토가 남아 있다.
6. 현재 웹의 예약 오픈 카드는 `pipeline/out/open-calendar.json`의 2026-10-13 생성 결과 중 일부를 동일 원천 URL·확인일과 함께 정적으로 옮긴 상태다. 배포 시점의 파이프라인 실행/API 연결 전에는 일반화된 실시간 일정으로 표시하지 않는다.
7. `data-sync.yml`은 예약 캘린더와 공개 카탈로그를 만든 뒤 변경된 `camping-atlas/public/data/`를 `main`에 커밋하도록 확장했다. 고캠핑 전체 레코드는 공공데이터포털의 보존·재배포 조건을 검토한 뒤 repository variable `GOCAMPING_CATALOG_PUBLISH_APPROVED`를 `true`로 설정해야만 공개한다. 설정 전에는 일정만 갱신하고 기준 시설 카탈로그는 비어 있는 것이 정상이다.
8. `claude/upbeat-keller-x75pct`의 전체 PR은 오래된 워크플로/배포 변경을 덮어써서 병합하지 않는다. 이번 작업에는 화장실 전용 다운로드와 도로 시설 원천만 선택 반영했으며, 충돌 가능 경로는 `.github/workflows/data-sync.yml`, `docs/AGENT_HANDOFF.md`, `pipeline/scripts/sync-*.mjs`다.

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
