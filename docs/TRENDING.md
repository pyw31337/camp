# 실시간 인기 (홈 ‘곧 오픈’ 다음 칸)

최근 7일 동안 올라온 블로그·카페·뉴스·동영상 글에서 캠핑장 언급을 세어 순위를 매깁니다. 매일 22:47 KST에 갱신합니다(`.github/workflows/trending.yml`).

- 결과: `camping-atlas/public/context/trending.json`. 형식은 `{date, since, top:[{rank,id,name,region,score,today,week,by:{naver,daum,youtube,…},prev,trend,samples[]}], excluded[]}`이고, 화면은 상위 20곳을 보입니다.
- 맞춘 글(최근 8일, 같은 주소는 한 번): `pipeline/registry/trending-posts.json`. 호출 수 기록: `pipeline/registry/trending-usage.json`.
- 코드:
  - `pipeline/lib/trending.mjs`: 맞추기·순위
  - `pipeline/lib/trending-sources.mjs`: 수집원
  - `pipeline/scripts/sync-trending.mjs`: 실행
  - 테스트: `pipeline/test/trending.test.mjs`

## 수집 (공식 무료 API만)

검색어는 44개입니다. ‘캠핑장·캠핑·오토캠핑·글램핑·카라반·차박·캠핑장 후기·캠핑 후기·노지캠핑·캠핑장 추천’ 10개와, 17개 시도마다 ‘○○ 캠핑장’·‘○○ 글램핑’ 34개입니다. 모두 최신순으로 받고, 기간(7일)보다 오래된 글이 절반을 넘는 쪽이 나오면 다음 쪽은 부르지 않습니다.

| 수집원 | API | 실행당 상한 | 무료 한도 |
|---|---|---|---|
| Daum 블로그·카페 | `dapi.kakao.com/v2/search/{blog,cafe}` sort=recency, 50건×최대 30쪽(검색어당) | blog 3,000 · cafe 3,000 | 종류별 일 20,000~30,000 |
| Daum 동영상 (YouTube·TikTok·카카오TV 영상 포함) | `/v2/search/vclip` sort=recency, 30건×최대 15쪽 | 800 | 종류별 일 20,000~30,000 |
| 네이버 블로그·카페·뉴스 | API HUB `/search/v1/{blog,cafearticle,news}` sort=date, 100건×최대 10쪽 | 1,500 | 일 25,000 · 월 775,000. 월 상한 250,000은 Data sync 웹 언급과 함께 씁니다 |

- 4개씩 동시에 부릅니다. 시간 상한은 카카오 12분, 전체 22분입니다(작업 제한 40분). 상한을 넘으면 그때까지 모은 글로 순위를 냅니다.
- 다른 수집과 함께 써도 넉넉하게 남습니다. Data sync(03:17 KST)의 Daum 소셜은 9,100, 주변 사진(05:37)은 4,000, 네이버 웹 언급은 실행당 8,000입니다. 종류별 일 한도의 절반을 넘지 않습니다.
- 카카오·네이버 일 한도는 자정에 새로 찹니다. 22:47에 돌면 다음 날 03:17 Data sync의 하루치를 쓰지 않습니다.
- 네이버는 웹 언급과 같은 안전장치를 씁니다: 요금표 0원 확인, 402·결제 응답이면 즉시 중단, `NAVER_API_ENABLED=false`.
- 네이버 카페 결과에는 날짜가 없습니다. 최신순 결과에서 처음 본 날을 글 날짜로 씁니다.

## 맞추기 (오탐 줄이기)

1. 이름 핵심어(`social-search.mjs` distinctiveTokens)가 글 제목·요약에 있어야 합니다.
2. 아래 경우에는 시군구 같은 **지역 단서**가 함께 있어야 합니다.
   - 핵심어가 여러 캠핑장에 같을 때(예: 하늘캠핑장)
   - 핵심어가 3자 이하일 때
   - 핵심어가 일반어 조각(숲·하늘·글램핑장·스테이 …)으로만 되어 있을 때(이름 전체도 있어야 합니다)
3. 같은 핵심어·같은 지역 캠핑장이 둘이면, 이름 전체로 하나를 고를 수 있을 때만 셉니다.
4. 긴 이름이 짧은 이름을 덮습니다(솔바람숲 > 솔바람).
5. #54의 규칙으로 걸러 냅니다(`isRelevant`, `aboutCamp`).
   - 캠핑 맥락 없는 글
   - 제목이 다른 캠핑장을 가리키는 글
   - 광고
   - 정보 모음 사이트(`AGGREGATOR_HOST`)
6. 한 글이 5곳 이상을 늘어놓으면 모음 글이라 세지 않습니다. 2~4곳이면 나눠 셉니다(1/n).

## 순위

- 점수: 글마다 최근 가중치 `0.5^(나이/2일)`(오늘 1, 2일 전 0.5)에 1/n을 곱한 값의 합입니다.
- 순위에 드는 조건: 7일에 2건 이상, 또는 오늘 1건 이상.
- 화살표: 전날 결과의 순위와 비교합니다.

## 빠진 플랫폼과 필요한 것

| 플랫폼 | 이유 | 소유자가 마련할 것 |
|---|---|---|
| YouTube Data API | 저장소에 키가 없습니다. Daum 동영상 검색에 잡힌 YouTube 영상은 셉니다 | Google Cloud 프로젝트 + YouTube Data API v3 키(`YOUTUBE_API_KEY` 시크릿). `search.list`는 1회 100단위, 일 10,000단위 무료라 하루 약 90회입니다(검색어 30개 × 3쪽, publishedAfter·order=date) |
| Instagram | 공개 게시물을 검색하는 무료 공식 API가 없습니다 | Meta 개발자 앱 + Instagram 비즈니스(크리에이터) 계정 + ‘Instagram Public Content Access’ 앱 심사. Hashtag Search(계정당 7일에 해시태그 30개)만 됩니다 |
| Facebook | 공개 게시물 검색 API가 없습니다(Graph 검색 종료). Meta Content Library는 연구용입니다 | 서비스용 경로가 없습니다 |
| TikTok | Research API는 비영리 연구자용입니다. oEmbed는 검색이 안 됩니다. Daum 동영상 검색에 잡힌 TikTok 영상은 셉니다 | 상업용 공식 검색 API가 없습니다 |

로그인 세션이나 약관에 어긋나는 스크래핑은 쓰지 않습니다. 새 수집원은 `trending-sources.mjs`에 `{key,label,via,needs,enabled,collect(queries, since)}` 모양으로 하나를 더하면 됩니다.
