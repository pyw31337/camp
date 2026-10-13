# 모여라 캠핑

전국 공영·민간 캠핑장의 시설 사양, 판매 상품, 예약 방식, 예약 가능 상태, 날씨와 여행 정보를 출처·확인 시각과 함께 비교하는 서비스다.

## 현재 구성

- [`docs/캠핑장_통합검색_예약_서비스_기획_설계.md`](docs/캠핑장_통합검색_예약_서비스_기획_설계.md): 기준 원천, 예약 정책, 상품 분류, API와 운영 설계
- [`docs/캠핑장_미디어_지도_투어_연동_설계.md`](docs/캠핑장_미디어_지도_투어_연동_설계.md): 사진·소셜·날씨·지도·관광 연동의 권리와 갱신 원칙
- [`db/001_initial_schema.sql`](db/001_initial_schema.sql): PostgreSQL 16+ 초기 데이터 모델
- [`camping-atlas/`](camping-atlas): 공개 Sites 프로토타입
- [공개 프로토타입](https://moyeora-camping.magicsiren32.chatgpt.site): 모여라 캠핑 화면
- [GitHub Pages](https://pyw31337.github.io/camp/): `main` 푸시로 갱신되는 정적 파일럿
- [`docs/DESIGN_SYSTEM.md`](docs/DESIGN_SYSTEM.md): 여행 검색 UX, 색상, 이미지, 반응형 기준
- [`docs/RESEARCH_DATA_TO_UX.md`](docs/RESEARCH_DATA_TO_UX.md): 데이터 원천별로 보여 줄 수 있는 것과 핵심 베네핏
- [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md): GitHub Actions 중심 구조와 필요한 외부 서비스 제안
- [`docs/CORE_FEATURES_UX.md`](docs/CORE_FEATURES_UX.md): 핵심 기능 3개와 무학습 UX 원칙, 레퍼런스 분석
- [`docs/OWNER_TODO.md`](docs/OWNER_TODO.md): 서비스 소유자가 순서대로 할 일(키 발급·배포 설정)
- [`design/mockup-v2/`](design/mockup-v2): 디자인 시안 v2 (현재 기준, `design/`에서 `npm run build`) · [`design/mockup/`](design/mockup): v1
- [`pipeline/`](pipeline): 고캠핑 수집·정규화, 예약 규칙 레지스트리, 예약 오픈 캘린더 계산, 캘린더 구독(.ics) 피드

## 협업 시작하기

1. [프로젝트 계획](docs/PROJECT_PLAN.md)과 [인수인계](docs/AGENT_HANDOFF.md)를 읽는다.
2. 저장소의 [협업 규칙](AGENTS.md)을 따른다.
3. 변경 후 관련 문서와 검증 결과를 함께 갱신해 커밋한다.

## 로컬 프로토타입

```bash
cd camping-atlas
npm run install:ci
npm run dev
```

앱은 현재 데이터 연결 흐름과 화면을 검증하는 프로토타입이다. 화면에 실제 실시간 가격·재고를 표시하려면 각 공식 채널의 허가된 연동과 수집 주기, 신뢰도 판정을 먼저 구현해야 한다.

## GitHub Pages 배포

`main`에 `camping-atlas/` 변경을 푸시하면 GitHub Actions가 `npm run build:pages`를 실행하고 [GitHub Pages](https://pyw31337.github.io/camp/)에 배포한다. 이 빌드는 서버 기능 없이 동작하므로 검색·필터·저장 목록은 브라우저에서 처리하고, 예약 가능 여부는 운영자 공식 예약처로 연결해 확인한다.
