# 데이터 수집 확장 계획 (2026-10-19 업데이트)

> 목적: 국내 ~3,100곳 캠핑장에 대해 **업체(운영자) 기본 정보 외** 다양한 사실(요금·규칙·시설 규격·예약 오픈·안전·주변·맥락)을 추가 수집.
> 원칙: AGENTS.md 데이터 수집 원칙 준수 (무료·공익·원천·등급·봇 차단 회피).
> 모든 값은 Fact Store(`data/facts/`) → `build-fact-store.mjs` → 탐색 데이터로 흐름. 화면은 원천·확인시각·등급과 함께 표시.

## 현재 기반 (이미 구현되거나 워크플로 연계)

- 고캠핑 API 기준 모수 + 시설·사이트·이미지
- LOCALDATA 인허가 주변 인프라 7종 최근접
- TourAPI 요금·상품·주변 관광/음식
- 네이버 검색 API 기반 웹 멘션 (로봇 허용 페이지 본문)
- 서울 공공예약 Open API
- 포토코리아 관광사진 (히어로·테마 표지용)
- 운영자 홈페이지 발굴 + 스니펫 추출

## 추가 수집 방안 (우선순위)

### 1. 공공데이터 심화 (P0~P1)
- **산림청 국립자연휴양림**: 예약 정책·우선/추첨 상품·가동률·시설 상세 API/파일 (`data.go.kr` 15134227 등).
  - 실행: `pipeline/scripts/sync-forest-recreation.mjs`
  - **수집 결과 (v2)**: `pipeline/registry/forest-recreation-collected.json`에 약 20곳 기본 정보 적재 (총 48곳 대상). 원천: forest.go.kr + foresttrip.go.kr + huyang.forest.go.kr.
  - 매칭: `npm run match:forest` → `forest-matches.json` 생성. 다른 에이전트는 이 결과로 Fact Store 입력 진행.
- **지자체 현황 파일 정규화**: 열 이름 사전을 만들어 면수·최대 수용·편의·안전 시설을 CONFIRMED 사실로.
  - 스텁: `pipeline/scripts/normalize-local-fees.mjs` (`npm run normalize:local-fees`)
  - 샘플 결과: `pipeline/registry/local-fee-facts-sample.json` (여주 금은모래·대신 등 공개 요금 기반).
- **공공 운영 캠핑장 요금·오픈·휴장**: 여주·화성·구미·청양 등 파일 → `PRICE_NIGHT`, 예약 오픈 규칙, `SEASONAL_CLOSURE`.
- **안전·위생 수치**: 고캠핑 GW·임업진흥원(95689)·지자체의 소화기·방화수 등 → `SAFETY_*` 속성.
- **인허가 상태 대조**: 자동차야영장업 파일 등으로 폐업/휴업 감지 → `OPERATING_STATUS` / `LICENSE_STATUS`.

### 2. 운영자 공개 채널 확장 (P1)
- 네이버 검색 API(허용 한도 내) 기반 공식 블로그·카페 공지·SNS 검색 강화.
- 추출 대상: 요금표, 입퇴실·매너타임, 반려동물·장작/숯 규칙, 사이트 규격·바닥·전력, 예약 방법.
- 기존 `sync-web-mentions.mjs` + `operator-site.mjs` 확장.

### 3. 예약 오픈 캘린더 확장 (P0)
- 서울 모델을 국립자연휴양림·국립공원·지자체 공식 페이지로 확장.
- 과거 통계 → 월별 붐빔 지수 (`BUSY_MONTH_INDEX`).

### 4. 맥락·주변 보강 (P1~P2)
- TourAPI 주변 관광지·축제 연결 강화.
- 기상청 관광지 날씨 지점 매핑 보강.

### 5. 운영자·이용자 기여 경로 (중장기)
- 운영자 직접 제출 폼 (증거 포함) → 검수 후 VERIFIED/OPERATOR.
- 이용자 제보는 MENTION 또는 대기 큐로만.

## 구현 및 공유 방법

- 새 수집기는 `pipeline/scripts/sync-*.mjs` 패턴을 따르고 `package.json` scripts에 등록.
- 결과는 `pipeline/registry/*.json` 또는 직접 Fact Store 입력으로.
- `data-sync.yml` 또는 새 워크플로우에 단계 추가.
- 수집 결과는 워크플로우가 커밋하며, `docs/AGENT_HANDOFF.md` 상단에 상태를 기록.
- 다른 에이전트는 `docs/FACT_STORE.md` + `data/facts/` + 이 문서 + `pipeline/registry/` 를 먼저 읽고 조회·화면 반영.

## 다음 단계 (즉시 완료 후 이어갈 것)

1. 나머지 휴양림 페이지 수집 후 전체 48곳 완성.
2. 실제 지자체 CSV 다운로드 후 normalize 스크립트 파싱 확장.
3. 매칭 결과를 Fact Store 적재 후 build-fact-store 실행.
4. 워크플로우에 match/normalize 단계 추가 (선택적).

이 문서는 모든 에이전트가 공유하는 기준입니다. 변경 시 인수인계와 함께 갱신.