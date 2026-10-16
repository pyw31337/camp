# 카카오 공식 API 장소 맞춤·홈페이지 발굴 (2026-10-16)

> 홈페이지가 없는(또는 고캠핑 등록 홈페이지가 죽은) 2,503곳(등록 홈페이지 없음 2,000 + 읽기 실패·종료 503)의 운영자 사이트를 찾아 `crawl-operator-sites.mjs`가 읽게 한다.
> 코드: `pipeline/lib/kakao-discovery.mjs`, 실행: `pipeline/scripts/discover-kakao.mjs`, 결과: `pipeline/registry/kakao-places.json`.

## 무엇을 하나

1. **장소 맞춤**(로컬 키워드 검색 API, 캠핑장 좌표 반경 5km): 전화 일치 > 이름 유사도 + 거리 + 분류(캠핑·야영·숙박)로 1곳을 고른다. 저장: 장소 id·이름·분류·전화·주소·카카오맵 링크·맞춤 점수.
2. **홈페이지 후보**(Daum 웹 검색 API, “이름 시군구 예약”): 플랫폼·포털·언론·쇼핑 호스트를 빼고, 제목·요약에 이름 핵심이 있는 호스트를 점수화한다. **두 곳 이상의 캠핑장에 공통으로 나오는 호스트는 버린다**(지자체 통합 예약·모음 사이트).
3. 고른 홈페이지는 다음 `operator-sites` 실행에서 시작 주소가 된다(robots.txt 준수). 그 문장에서 나온 사실의 원천 코드는 `operator_discovered`.

## 실행

- GitHub Actions `Operator homepage facts`(매주 일요일, 수동 실행 가능)의 첫 단계. 키는 저장소 비밀값 `KAKAO_REST_API_KEY`(소유자가 등록 완료). 로컬·이 작업 컨테이너에는 키가 없다.
- 30일 지난 곳만 다시 묻는다. 호출 상한 기본 8,000(입력값 `kakao_max_calls`). 로컬·웹 검색은 소셜 검색(blog·cafe·image·vclip)과 한도 종류가 달라 겹치지 않는다.
- 한도 초과·인증 오류면 즉시 멈추고 그때까지 결과를 저장한다.

## 하지 않는 것(원천 쪽이 명시적으로 막은 것)

2026-10-16 확인: `place.map.kakao.com`·`map.naver.com`·`camfit.co.kr`의 robots.txt가 **ClaudeBot 등 AI 크롤러를 이름으로 지정해 전체 차단**한다. 소유자가 비상업·오픈소스 전제에서 수집 범위를 넓히라고 했지만, 이름으로 지정된 차단을 일반 UA로 우회하는 것은 하지 않는다. 대신 같은 회사의 **공식 API**(카카오 로컬·Daum 검색)를 쓴다. 카카오맵 장소 페이지의 후기·평점·사진은 읽지 않는다.

robots가 일반 봇을 허용하는 곳(운영자 홈페이지, 일부 소형 예약 사이트)은 기존 규칙(봇 이름 공개·호스트당 1초·문장만 인용)으로 넓혀 간다 — 다음 후보는 `PROJECT_PLAN.md` 결정 대기 참고.

## 네이버 검색 API(NAVER API HUB 지역 검색) — 2026-10-16 추가

- 코드: `pipeline/lib/naver-discovery.mjs`, 실행: `pipeline/scripts/discover-naver.mjs`, 결과: `pipeline/registry/naver-places.json`.
- 업장이 네이버에 **스스로 등록한** 홈페이지 링크·전화·분류·주소·좌표를 캠핑장마다 1곳 맞춘다(전화 일치 > 이름 + 거리 3km + 분류). 평점·리뷰·사진은 받지 않는다.
- 등록 링크가 운영자 호스트이면 크롤러 시작 주소로 **카카오 웹 검색 후보보다 먼저** 쓴다. 사실 저장소에는 `HOMEPAGE`·`PHONE`(CONFIRMED, 원천 `naver_local`)으로 들어가 카카오·고캠핑 값과 교차 확인된다.
- 비용: HUB는 **한시 무료**(검색 카테고리 통합 월 775,000건, 키당 50 RPS, 유료 전환 시 사전 공지 — [NCP 가이드](https://guide.ncloud-docs.com/docs/apihub-overview)). 전수 1회 약 3,100건. 유료 전환 공지가 나오면 `operator-sites` 입력값 `naver_max_calls`를 0으로.
- 키: 저장소 비밀값 `NAVER_API_HUB_CLIENT_ID`·`NAVER_API_HUB_CLIENT_SECRET`(소유자 등록 완료). 키 동작은 `api-key-check.yml`(push·수동)로 확인한다. 경로는 문서마다 표기가 달라 `/search/v1/local` → `/search/v1/local.json` → `/v1/search/local.json` 순으로 시도한다.
