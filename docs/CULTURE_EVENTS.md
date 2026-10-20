# 주변 축제·행사 포스터 카드 (CultureFlow 연동)

캠핑장 상세 화면 ‘주변시설’ 아래에 **주변 축제·행사** 칸이 생깁니다. 포스터 카드로 축제·공연·전시를 보여 주고, 자료가 없으면 칸을 숨깁니다.

## 원천
| 원천 | 주소 | 무엇 | 비고 |
|---|---|---|---|
| CultureFlow(소유자의 문화 일정 서비스) | `https://pyw31337.github.io/culture/data/performances.json` (공개 JSON, CORS 허용) | 축제·국가유산 행사·공연(KOPIS·인터파크)·전시(문화포털 등) — 제목·기간·장소·좌표·포스터·소개·원문 링크 | 키 없음. CultureFlow 저장소는 건드리지 않음. 갱신 시각은 `build-info.json` `generatedAt` |
| CultureFlow 상세 화면 목록 | `https://pyw31337.github.io/culture/sitemap.xml` | `/p/{id}/` 상세가 실제로 있는 행사(약 400건) | 있으면 ‘CultureFlow에서 보기’, 없으면 원문 링크 |
| 한국관광공사 TourAPI 축제 | `camping-atlas/public/context/extras.json` `fest`·`camps[].fe` (Trip extras가 모은 것) | 30km 안 축제(캠핑장마다 3개) | 새 호출 없음 |

## 규칙 (`pipeline/lib/culture-events.mjs`)
- 직선 30km 안, 오늘~45일 사이에 걸치는 것. 캠핑장마다 최대 8개, 공연은 그중 최대 3개.
- 순서: 축제 → 국가유산 행사 → 전시·체험 → 공연, 같은 분류 안에서는 진행 중 → 시작일 → 거리.
- 뺀 것: 클래스·상품권·스포츠·영화·상시 관광지·캠핑장·템플스테이, 오픈런, 120일 넘는 상설 전시(축제 제외), 좌표 없는 것.
- 같은 행사 합치기: 제목 키(회차·연도·괄호·기호 제거)가 같거나 한쪽이 품고(4자↑), 기간이 겹치고, 좌표가 있으면 5km 안. CultureFlow 쪽을 남기고 빈 칸(포스터·소개 등)은 관광공사 값으로 채움.
- CultureFlow가 자동으로 만든 틀 소개문(“…에서 열리는 특별한 … 공연/행사입니다”)은 쓰지 않음.

## 이미지·저작권
- 포스터는 **저장하지 않고** 원래 주소를 그대로 보여 줍니다(AGENTS.md 4). CultureFlow Pages(webp 캐시)가 기본이고, 깨지면 원출처 이미지(`img2`, 예: KOPIS)로 한 번 더, 그래도 안 되면 제목 카드로 바꿉니다.
- 카드마다 캠핑장에서 직선거리(850m · 12.3km)를 붙이고, **카드 전체가 원문 링크**입니다(2026-10-20 소유자: ‘자세히 보기’ 버튼 제거). 지도는 분류 줄 오른쪽 끝의 지도 아이콘(주소·장소가 있을 때만, 카카오맵 검색). 칸 아래 출처·갱신 문구는 뺐습니다(2026-10-20 소유자) — 원천은 이 문서와 카드의 원문 링크로 남습니다.
- `loading="lazy"`, `referrerpolicy="no-referrer"`.
- 2026-10-19 확인: 사용 포스터 481개 중 480개 정상(1개는 문화포털이 HTML을 돌려줘 제목 카드로 대체).

## 흐름
- 워크플로 **Culture events**(매일 06:20 KST, Trip extras 끝난 뒤에도) → `pipeline/scripts/sync-culture-events.mjs` → `camping-atlas/public/context/events.json`(약 0.6MB) 커밋 → Deploy GitHub Pages가 다시 배포.
- 화면: `camping-atlas/public/context/events.js` (상세 `[data-events]`, `design/renewal/app.js`에서 불러옴). 모바일은 가로 스와이프, 데스크톱은 격자 6개 + ‘N개 더보기’.
- 거리·기간 고르기(2026-10-20 소유자): 제목 오른쪽 셀렉트 2개(거리 5·10·20·30km, 기간 7·10·20·30·45일). 처음엔 **5km·7일**에서 진행 중 행사를 찾고, 없으면 10km·10일 → 20km·20일 → 30km·45일로 넓힌다(`autoRange`). 어느 단계에도 진행 중이 없으면 행사가 하나라도 있는 가장 좁은 단계. 2026-10-20 분포: 5km·7일 190곳, 10km·10일 414곳, 20km·20일 1,369곳, 30km·45일 1,044곳. 진행 중/예정(D-n)/이번 주말 배지, 전체·진행 중·예정 탭.
- `events.json`: `ev[eN] = {t 제목, s/e 기간, k 분류, v 장소, a 주소, img, img2, d 소개, p 요금, u 원문, cf CultureFlow 상세, src 원출처, also 합쳐진 다른 원천}`, `camps[id] = [[eN, km], …]`.

## 한계
- CultureFlow 공개 자료는 CultureFlow 쪽 갱신(로컬 스케줄러·03:00 KST 폴백)에 달려 있습니다. 2026-10-19 기준 공개본은 2026-10-13 생성분이라, 그 뒤 새로 등록된 행사는 CultureFlow가 다시 배포돼야 들어옵니다. 끝난 행사는 화면에서 날짜로 바로 빠집니다.
- CultureFlow 상세 화면은 약 400건만 정적으로 내보내므로 나머지는 원문 링크로 갑니다.
- 거리는 직선거리입니다.
