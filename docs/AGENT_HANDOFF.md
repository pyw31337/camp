# 인수인계

> 최종 갱신: 2026-10-21 KST(모바일 상세·추천 품질·미디어/행사 보정) — 맨 위 ‘📌 공지’부터 읽을 것<br>
> 다음 작업자는 이 문서를 먼저 읽고 작업 종료 시 업데이트한다.

## 📌 ⛔ 데이터 누적 병합 정책 시행 (2026-10-21, Grok Bot) — 전 에이전트 필수

- 공유 데이터의 기존 값은 지우거나 리셋하지 않는다. ① 채우기 ② 최신·신뢰 우선 덮어쓰기(옛 값 기록) ③ 논리 검사 ④ 정제 순서다. 자세한 내용은 `docs/DATA_MERGE_POLICY.md`, 공용 모듈은 `pipeline/lib/merge-policy.mjs`다.
- `pipeline/scripts/field-guard.mjs`가 세 곳에서 돈다.
  - data-sync·증분 발행·land-on-main: 줄어든 값을 최신 main 값으로 되살린다(`--heal`).
  - 필수 검사 `Lint and build`: 값을 지우는 PR을 막는다.
- 기록 파일: 검토 기록은 `pipeline/registry/merge-review.ndjson`(append-only), 의도한 삭제는 `pipeline/registry/merge-overrides.json`(reason 필수)이다.
- 검증 결과:
  - `node --test pipeline/test/merge-policy.test.mjs` 9개 통과(무작위 2,000회 속성 검사 포함).
  - `PUBLISH_DRY_RUN=1 publish-incremental.sh`: 손실 0, 커버리지 회귀 없음.

## 📌 모바일 상세·추천 진열·미디어 품질 보정 (2026-10-21, Codex)

- **메인 진열 품질 게이트:** `design/renewal/app.js`의 `showcaseEligible()`가 **고캠핑·운영자·발행 카탈로그 실제 사진**을 먼저 요구하고, 그 업장의 정보량 상위 사분위 점수의 50% 이상인 곳만 `곧 오픈`·`실시간 인기`·`긍정 후기`에 보낸다. 검색 보완용 후기/검색 썸네일은 메인 진열 근거로 쓰지 않으며, 대표 사진이 깨지면 해당 추천 카드만 뺀다. 데이터가 빈 업장을 삭제하지는 않으며 일반 검색 결과의 후순위로만 남긴다.
- **상세 밀도·동작:** 모바일 상세의 섹션 간격을 42px로 넓히고, 제목·규격 행의 선형 아이콘에서 사각 프레임을 제거했다. 시설 배치도는 1열 세로 후보 목록 대신 한 장씩 넘기는 레일로 바뀌며, 탭하면 기존 라이트박스의 같은 순서로 확대한다. 하단 좋아요·예약·공유 막대는 최초 진입 때 반드시 보이고, 아래 스크롤에서만 접히며 위로 스크롤하면 다시 나타난다. 상세 푸터는 좌우·하단을 화면 끝까지 채운다.
- **정확한 미디어:** 후기 썸네일에서 저해상도 파비콘·캠핑장 대표사진 대체를 제거했다. 원문이 제공한 허용 원본/미리보기만 쓰며 실패/미제공 시 플랫폼 아이콘 카드로 남겨 다른 후기 사진처럼 오인시키지 않는다. 주변 생활시설 사진은 기존 표본의 낮은 장소 정확도 때문에 검증된 실제 사진만, 그 외에는 아이콘·좌표 로드뷰만 보이는 원칙을 유지한다.
- **가격·행사:** 고캠핑 요금표는 같은 금액이어도 사이트/시즌/요일 행을 합치거나 예약 상품 요금과 서로 지우지 않는다. 축제 자동 범위는 `5km·7일 → 10km·10일 → 20km·30일 → 30km·45일`이며, 진행 중 우선이 아니라 **결과가 하나라도 있는 첫 범위**를 쓴다. `events.js`의 `mount()`에서 누락되어 있던 `all` 계산도 보정했다.
- **SNS:** YouTube·네이버·다음 수집 항목의 8개 상한과 `data-cgrid` 더보기를 제거해 수집된 항목을 모두 레일에 넣는다. 플랫폼 탭/외부 검색 링크는 모든 폭에서 한 줄 가로 스와이프다.
- **검증·발행본:** `node --check design/renewal/app.js`·`events.js`, `node --test pipeline/test/detail-events-card.test.mjs`(3), `npm --prefix pipeline test`(353 통과·2 skip), `npm --prefix pipeline run check:billing`, `git diff --check`, `npm --prefix camping-atlas run build:pages`, `publish-explorer-pages --shell-only`을 통과했다. CUA 정적본 `4202`에서 320px 홈과 상세(요금 행·배치도 레일·SNS 한 줄 탭·행사 자동 확장·후기·푸터·하단 예약 바)를 캡처 검수했다. `rail-swipe-test.mjs`는 이 작업 환경에 `playwright` 패키지가 없어 실행하지 못했다(`ERR_MODULE_NOT_FOUND`); 의존성 복구 뒤 재실행할 것.
- **리뉴얼 공개본 동기화:** `/renewal/`은 더 이상 리다이렉트 자리표시자가 아니며 `design/renewal/`의 정적 시안을 그대로 발행한다. 원본을 고친 뒤에는 반드시 `node scripts/publish-renewal-mockup.mjs`를 실행해 `camping-atlas/public/renewal/` 전체를 동기화한다. CI의 `rail-swipe`는 이 원본/발행본 불일치를 오류로 처리한다.

## 📌 320px 전수 점검 · 카테고리 단일 레일 (2026-10-20, Codex)

- `design/renewal/`과 발행본을 320px 뷰포트(세로 스크롤이 있을 때 실제 문서 폭 304px)에서 홈·목록·테마·지도·비교·상세, 조건 시트·예약 드롭업·사진 라이트박스로 점검했다. 모든 화면은 `scrollWidth ≤ clientWidth`; 비교표·사진·카테고리처럼 의도한 내부 레일만 자체 가로 스와이프를 유지한다.
- 카드 레일의 음수 좌우 여백, 상세 카테고리 바의 `100vw`, 모바일 예약 메뉴의 상대 좌표, 푸터의 `100vw`를 제거했다. 따라서 스크롤바 폭이 있는 iOS/Safari 계열에서도 문서가 옆으로 넓어지지 않는다.
- 조건 시트의 지역·주변 반경·상품·전기·규격·요금, 상세의 상단·미디어·주변·후기 채널 카테고리는 모두 `flex-wrap: nowrap`과 내부 가로 스와이프로 통일했다. 긴 예약 채널명은 말줄임 처리한다.
- 상세의 모바일 사진 캐러셀은 드래그=다음 사진, 탭=현재 사진부터 라이트박스로 분리했다. 배포에 없는 로컬 카드 사진은 빈 회색 슬라이드보다 실제 공식 원문 사진을 우선하고, 실패한 칸은 제거한다.
- **콘텐츠 정합성 보정:** 전국 잔여석 미연동 상태에서 ‘실시간 예약’이라고 쓰던 푸터 문구를 `조건·요금·예약 경로 안내`로 바꿨다. 또 금액만으로 글램핑·카라반·숙박동을 추정한 `fee.tiers`는 화면에서 형태명으로 보이지 않게 했다. 형태별 요금은 원문·등록 상품 근거가 있는 경우만 표시한다.
- 검증: CUA 정적 발행본(`4202`)에서 홈·목록·테마·지도·비교·상세, 조건 시트, 예약 드롭업, 사진 라이트박스의 문서/팝업 가로 넘침 0. 카테고리의 `flex-wrap: nowrap`·`overflow-x: auto`도 확인했다. `npm --prefix pipeline test` 353 통과·2 skip, `check:billing`, 디자인 소스 가드, `npm --prefix camping-atlas run build:pages`, `git diff --check`도 통과했다.

## 📌 전국 잔여석 비노출 · 운영자 빈칸 보강 로봇 실행 (2026-10-20, Codex)

- **날짜·빈자리 검색을 제거했다.** 전국 3,120곳의 잔여석을 같은 기준으로 확인할 수 없으므로, 날짜를 선택해 미연동 업장을 제외하거나 `빈자리/만석`을 보여 주지 않는다. 유효 기간이 있는 공공 `공식 접수 중`만 접수 상태로 남기며, 예약·결제는 대표 예약 채널로 보낸다.
- `prioritize-operator-gaps.mjs`가 1박 요금·전기 제한·규격·바닥·입퇴실·매너타임·이용 수칙의 누락을 점수화한다. `crawl-operator-sites.mjs`는 자사/공공 운영 페이지의 robots 허용 경로만 읽고, 사용자 후기 게시판·플랫폼·로그인/결제 경로는 제외한다.
- 실행: 20곳을 두 묶음으로 읽어 `OK 7 / ROBOTS_DISALLOWED 4 / FETCH_FAILED 8 / NO_RELEVANT_TEXT 1`을 기록했다. 성공 결과를 재산출해 전국 3,120곳의 조건·프로필·요금 데이터에 반영했다. 차단·플랫폼 전환은 90일, 접속 실패·관련 문장 없음은 30일의 재시도 간격을 둔다. 상세 절차는 `docs/OPERATOR_GAP_ROBOT.md`.
- 재산출 결과: 1박 요금 2,060곳(운영자 확인 671), 전기 제한 공식 463, 사이트 규격·바닥 1,709, 이용 제한/수칙은 상세 `house_rules`에서 원문 URL·확인일과 함께 제공한다. 목록 가격 데이터는 2,199/3,120곳에 연결됐다.



## 📌 주변 축제·행사: 거리·기간 셀렉트, 5km·7일부터 넓히기, 카드 전체 링크 (2026-10-20, Claude)
- `camping-atlas/public/context/events.js`: ‘30km 안 · 45일 이내’ 문구 → 셀렉트 2개(`[data-ev-km]`·`[data-ev-days]`). 처음 범위는 `autoRange`(5km·7일 → 10·10 → 20·20 → 30·45, 진행 중 행사가 나오는 첫 단계). ‘자세히 보기’ 버튼 제거, 카드 전체가 원문 링크(`.ev-hit`), 지도는 분류 줄 오른쪽 아이콘(`.ev-map`), 칸 아래 출처·갱신 문구 제거.
- `context/cgrid.js`: ‘더보기 (N개 남음)’ → ‘N개 더보기’.
- 검증: `npm --prefix pipeline test` 350 통과(2 skip). 로컬 Playwright PC 1280·모바일 390: 18번(5km·7일, 2개) · 1887번(30km·45일, 8개), 셀렉트 변경 시 다시 그림 확인. 자세한 규칙은 `docs/CULTURE_EVENTS.md`.

## 📌 목록 순서: 정보량 가중치 · 사진 없는 곳 후순위 (2026-10-20, Claude)

- `rich(c)`(design/renewal/app.js)를 정보량 점수로 다시 짰다: 전기 W 12 · 확인된 현장 조건 8종 각 3 · 프로필 확인 항목(18개) 각 2 · 공식 사진 장당 2(최대 5)·후기 사진 2 · 1박 요금 4 · 사이트 타입 2 · 이용 규칙 2 · 온라인 예약 3 · 후기 4건당 1(최대 5). 기본 정렬·테마·지도 목록·추천이 모두 이 점수를 쓴다.
- 목록 기본 정렬: 조건 근거(맞음→법정 기준→확인 필요) → 정보량 + 오픈 임박 10·운영 중 4 가점(전에는 날짜 상태가 정보량보다 먼저였다).
- 사진이 한 장도 없는 곳은 검색 결과·목록·테마·지도 목록에서 어떤 정렬이든 뒤로(`photoLast`). 단 **이름으로 직접 찾은 곳**(검색어가 업장 이름에 들어 있고 지역 이름만 친 게 아닐 때, `namedByQuery`)은 제외. 데이터에서 빼지는 않는다.

## 📌 바깥 링크 PC·모바일 화면 맞춤 · 사진 없는 곳 뒤로 (2026-10-20, Claude)

- 소유자: 모바일에서 네이버 예약이 PC 화면으로 열려 잘림. → `deviceUrl()`(design/renewal/app.js)이 바깥 링크를 누르는 순간(click·auxclick·contextmenu, 캡처 단계) 기기에 맞는 주소로 바꾼다. 화면 HTML·데이터의 주소는 그대로.
  - 모바일: search/blog/cafe/booking.naver.com → m.*, map.naver.com 장소 → m.place.naver.com/place/{id}/home, 지도 검색 → m.map.naver.com, cafe·search.daum.net → m.*, place.map.kakao.com/{id} → /m/{id}, youtube → m.youtube.
  - PC: 위의 반대(m.place.naver.com → map.naver.com/p/entry/place/{id} 등).
  - 반응형이라 그대로 두는 곳(2026-10-20 확인): 고캠핑, 관광공사(visitkorea), 국립공원 예약, 캠핏, 카카오맵 link(기기별 자동 전환). 땡큐캠핑은 PC 주소도 모바일 화면으로 넘어간다(PC판 없음).
  - 새 바깥 링크를 만들면 PC 주소로 넣고, 모바일 주소가 따로 있는 플랫폼이면 `MOBILE_HOST`에 추가할 것.
- 사진이 한 장도 없는 곳: 카드 대체 사진 후보에 블로그·카페 후기 대표 썸네일 추가(`pick-card-fallback.mjs`), 검색 결과(`results`)·목록(`listRows`)에서 어떤 정렬이든 맨 뒤로(테마 목록은 이미 그랬음). 남은 50곳은 최근 등록이라 후기 수집 전 — 매일 소셜 수집이 채우면 다음 발행에서 사진이 붙는다.

## 📌 깨진 링크 전수 점검 (2026-10-20, Claude → 전 에이전트)

- 소유자 제보: 네이버 예약 버튼 → “운영하지 않는 예매 페이지”(고캠핑 등록 `booking.naver.com/…/bizes/654085`가 낡음).
- **네이버 예약 상세 주소는 자동 확인 불가**(booking.naver.com robots.txt `Disallow: /` 전체 봇). 화면은 이 주소 대신 **네이버 검색(시군구 + 캠핑장 이름 + 예약)**으로 연다(`bookingChannels`, 원래 주소는 `registered_url`). 검색 결과 플레이스 카드의 현재 예약 버튼으로 이어진다.
- 나머지 링크: `scripts/check-links.mjs`(robots 준수·봇 이름·호스트별 1초) → `registry/link-health.json` {OK·DEAD·FLAKY·UNVERIFIED} → `scripts/build-link-health.mjs`가 캠핑장별 `c.dl`(죽은 링크 목록)로 표시 → 화면 예약 버튼·업체 정보 홈페이지에서 뺀다. 주소 자체는 지우지 않는다(살아나면 다시 OK). DEAD = DNS 없음·연결 거부·404/410·“없는 페이지” 안내, 시간 초과·5xx·403은 2회 연속일 때만.
- 자동으로 열지 않는 곳(UNVERIFIED): 네이버 예약·지도·플레이스·블로그·카페·naver.me, 카카오맵·채널, 캠핏, 인스타그램·페이스북, 브런치, 다음 카페, 밴드(`lib/link-check.mjs` `NO_CHECK_HOSTS`).
- 깨진 형식 주소(“http://https////host”, “https//host”) → `normalizeUrl`이 바로잡음. 점 없는 호스트(한글 키워드 주소)는 화면에서 뺌.
- **DEAD 판정은 확실한 신호만**: DNS 없음·404/410·“없는 페이지” 안내. 시간 초과·연결 거부·5xx는 해외 IP를 막는 국내 공공·예약 사이트(camp.xticket.kr, *.go.kr, :451 포트 등)가 많아 몇 번이든 FLAKY로 두고 화면에서 빼지 않는다. 401·403·429는 봇 차단(UNVERIFIED). 첫 점검: 링크 2,788개 중 DEAD 375(DNS 292·404 76·안내 7) → 343곳 397개 링크 숨김.
- 주기: `link-check.yml` 매주 수 04:17 KST + 증분 발행. 빌드 순서: `build-house-rules` → `build-link-health` → `build-card-fallback`.

## 📌 공식 사진 없는 곳의 카드 사진 (2026-10-20, Claude)

- 공식 사진(고캠핑·관광공사·운영자)이 없는 곳 775곳(약 25%)이 빈 썸네일이었다. `scripts/pick-card-fallback.mjs`가 상세의 `d.sns_images`(카카오 검색 API 결과, 캠핑장 이름 검색) 후보를 가로 사진 먼저 최대 10장, 130px 썸네일 픽셀로 배치도·화면 캡처(흰색 25%↑)·야간(어두움 45%↑)·안내판·간판(경계 밀도)·단색 그래픽을 걸러 첫 통과 사진을 고른다 → `registry/card-fallback.json` → `build-card-fallback.mjs`가 `c.pt {i 원본, t 썸네일, u 원문, s 출처}`. 표본 정확도 55% → 약 80%.
- 화면: `photosAll`에서 공식 사진이 없을 때만 `c.pt`(원본, 막히면 썸네일로 교체 `PT_FB`, `referrerpolicy=no-referrer`), 그다음 다른 에이전트의 `c.sn`(첫 검색 썸네일). 사진 오른쪽 아래 ‘후기 사진’ 표시. 이미지는 저장·재호스팅하지 않는다.
- 결과: 650곳 연결, 사진 전혀 없는 곳 775 → 69곳.

## 📌 업장 이용 규칙·공지 · 불가 빨간 배지 · 형태별 요금 (2026-10-19 밤, Claude → 전 에이전트)

- **이용 규칙**: `pipeline/lib/house-rules.mjs` + `scripts/build-house-rules.mjs` → 상세 `d.house_rules { tags, rules[{cat: ban|limit|rule}], ops, notices }`, 목록 `c.nr`(공식 불가 태그 키). 원천은 **운영자 홈페이지 문장(operator-site-snippets·operator-deep) + 고캠핑 등록값만**. 블로그 후기는 표본 점검에서 여러 캠핑장 묶음 글의 규칙이 엉뚱한 곳에 붙어 쓰지 않는다. 이용약관·개인정보 문구, 부분 금지(수영장·객실·텐트 안·데크 위), 조건부(“…한 경우”), 후기 감상은 거른다. 공식 ‘가능’ 등록값과 어긋나는 문장 태그는 버린다.
- **크롤러**: `crawl-operator-sites.mjs`가 금지·제한·수칙·운영 문장도 남기고(`RELEVANT` 확장), 공지 게시판 글을 `notices[{title,url,date}]`(글 주소 직접)로 저장한다(`noticeLinks`). 기존 레지스트리는 다음 `operator-sites.yml` 실행(주 1회, 또는 `max_age_days=0` 수동)부터 채워진다. 이번에 12곳만 새로 읽어 넣었다.
- **배지**: 단순 ‘전기’ 배지 제거(W 아는 곳만), 불가사항은 빨간 `.bdg-no`. `badges(c, max, maxNo)`.
- **형태별 요금**: `lib/price-tiers.mjs` + `scripts/build-price-tiers.mjs` → `c.fee.tiers = [[site|glamp|caravan|gc|lodge, 최저, 최고, 짐작]]`. 이름표 우선, 없으면 금액(10만 미만 사이트 · 10만~20만 글램핑·카라반 · 20만 이상 펜션·숙박동), 사이트 타입(`c.st`)·이름으로 좁힘. 7만원 미만 ‘카라반’은 개인 카라반 사이트. **요금대 필터는 사이트 요금 기준**(`campFeeMin/Max`).
- 순서: `build-site-types` → `build-price-tiers` → `build-house-rules` (data-sync·publish-incremental 반영).
- 고친 버그: `operatorHtml`의 ‘취소 · 환불’ 줄에서 섹션 전체 대신 요약 한 줄을 반환하던 `return`.
- 검사: `npm --prefix pipeline test` 341개 중 339 통과·2 건너뜀, 커버리지 가드 회귀 없음, PC·모바일 상세 가로 넘침 0.
- 현황: 불가 태그 2,048곳(반려동물 1,484 · 대형견 463 · 화기 112 · 미성년자 단독 102 · 고출력 전열기구 79 · 장작 64 · 방문객 51 …), 이용 규칙 670곳, 운영 안내 263곳, 공지 25곳(크롤 재실행 후 증가 예상), 형태별 요금 1,092곳.

## 📌 실시간 인기 섹션 (2026-10-19 밤)

- 2026-10-19 실시간 인기: `trending.yml`(매일 22:47 KST) → `public/context/trending.json`, 홈 ‘곧 오픈’ 다음 칸. 호출 상한·빠진 플랫폼은 docs/TRENDING.md, 주기는 SYNC_CADENCE.md.

## 📌 빈자리 표시 안 함 · 히어로 문구 · 주변시설 사진 · 전체 재빌드 이어받기 (2026-10-19 밤, Claude → 전 에이전트)

- **소유자 결정: 빈자리는 표시하지 않는다**(전국 전부가 아니면 의미 없음). `THANKQ_VACANCY_PUBLISH` 켜지 말 것, 빈자리 제보·예약 달력 추출 기획 중단. 땡큐캠핑은 사이트 사실 수집만.
- 히어로: `취향대로 찾아 떠나는 / 전국 N개 자연 속으로.`(`homeView`). 빈자리 약속 문구 금지.
- 주변시설 실제 모습: **로드뷰 버튼(카카오 지도 JS SDK)**. 검색 사진(`collect-nearby-photos.mjs`·`nearby-photos.yml`)은 첫 실행 표본 정확도 약 20%라 **매일 실행 중지·화면 미사용**(`build-nearby-photos.mjs`는 기본으로 붙은 검색 사진을 걷어 냄, `NEARBY_SEARCH_PHOTOS=on`일 때만 붙임).
- data-sync 전체 재빌드(`build-explore-data.mjs`): 이번 캐시에 없는 캠핑장은 직전 발행본의 후기·카페·사진·영상·웹 언급·요금 언급을 이어받는다(회귀 가드에 매번 막히던 원인 제거).

## 📌 상세 레이아웃·주간 날씨 통일·전 화면 보정 (2026-10-19 저녁, Claude → Codex·전 에이전트)

- 상세 오른쪽 세로 예약 칸 없음: 예약 카드는 `.d-head` 안 `.d-side`(제목 오른쪽, 태블릿 이하 제목 아래). `.d-body`는 한 열. 상세에 새 섹션을 넣을 때 `d-main` 안에만 넣는다.
- 주간 날씨: `conditions/card.js`의 `.fc-day` 버튼에 `data-fc-*`(rel·ic·desc·tmin·tmax·pop·src)를 싣고, 팝업(`openWeatherModal`)이 이 값과 같은 `.fc-day` 모양을 쓴다. 카드 모양·기호를 바꾸면 팝업도 같이 바뀐다.
- 주변 지도 썸네일은 `wcong(lat,lng)`로 다음 좌표를 만든다(위경도 그대로 넘기면 바다).
- 자세한 목록: `docs/DESIGN_SYSTEM.md` ‘전 화면 스크린샷 점검 v2’.

## 📌 주변 축제·행사 포스터 카드 — CultureFlow 연동 (2026-10-19, Grok)

- 상세 ‘주변시설’ 아래 `#sec-events`(`[data-events]`)에 축제·공연·전시 포스터 카드. 진행 중/예정(D-n)/이번 주말 배지, 출처·원문 링크, 깨진 포스터는 원출처 → 제목 카드로 대체.
- 원천: CultureFlow 공개 JSON(`pyw31337.github.io/culture/data/performances.json`) + 기존 TourAPI 축제(extras.json). 같은 행사는 합침.
- 파일: `pipeline/lib/culture-events.mjs`, `pipeline/scripts/sync-culture-events.mjs`, `camping-atlas/public/context/events.{js,json}`, 워크플로 `culture-events.yml`(매일 06:20 KST). 자세히 `docs/CULTURE_EVENTS.md`.
- `design/renewal/app.js`는 두 군데만 추가(섹션 자리 1줄, bindDetail에서 불러오기 2줄). 참고: 예전 ‘여행 참고 정보’ `[data-extras]` 자리는 현재 상세 HTML에 없어 그 칸(고도·응급실 등)은 화면에 안 보임 — 화면 담당이 다시 넣을지 판단 필요.
- 검사: `npm --prefix pipeline test` 통과(새 테스트 7개).

## 📌 운영자 심층 수집기 (2026-10-19, Grok)

- `pipeline/scripts/crawl-operator-deep.mjs`: 운영자 자체 호스트만, robots 준수, 최대 16쪽, 관련 문장+시설/배치 이미지 URL.
- 플랫폼(ticketplay·네이버·캠핏)은 읽지 않음. 구곡폭포 국민여가(7879) 등록 홈페이지는 `gugog.ticketplay.zone`(연결 거절)이라 심층 수집 대상이 아님. 예약은 `rev.cuc.or.kr`.
- 파일럿: 에스글램핑·글로우 사진 8장씩 `operator_media`로 상세에 연결. 화면은 「운영자 제공 사진」.

## 📌 세부 시설·규격 추가 수집 (2026-10-19, Grok)

- 검토: 고캠핑 구조화 규격(981곳), 운영자 홈페이지 크롤(OK 1,151 / 실패 520 / robots 113), 소셜 검색 배치도, 소개글 스펙 추출은 이미 있음.
- 추가: 운영자·소개 문장에서 사이트 규격(`6×7m`, `가로 6m 세로 7m`)을 `SITE_SIZE`로 추출. 공식 270곳.
- 네이버·캠핏·인스타 본문은 약관상 자동 수집하지 않음. 배치도 이미지는 검색 썸네일+원문 링크만.
- 화면: 이용 정보에 사이트 규격 행 추가.

## 📌 깨진 예약 링크 제외 (2026-10-19, Grok)

- 예약 채널 URL 전수 조사: 비주요 호스트 1,169개 중 연결 실패 287개.
- `ticketplay.zone` (구곡폭포·청평사·양구 등)은 ERR_CONNECTION_REFUSED / 503. 화면·분류에서 제외.
- 목록: `pipeline/registry/dead-booking-hosts.json`
- 필터: `pipeline/lib/booking-intel.mjs` `normalizeUrl`, `design/renewal/app.js` `liveBookingUrl`
- 다음 카탈로그 빌드부터 채널에서 빠지고, 프론트는 이미 발행된 데이터에서도 숨긴다.

## 📌 상세 미디어 카드 (2026-10-19, Grok)

- 주변 시설·블로그/카페 후기를 **상단 사진(또는 아이콘 히어로) + 하단 텍스트** 카드로 바꿈.
- `design/renewal/app.js`의 `nearbyCard`, `reviewLinksHtml`와 `style.css`의 `.media-card` 계열.
- 사진이 없는 곳은 큰 아이콘 히어로로 시각 밀도를 맞춤. 다음 발행 때 `/explore`에 반영.

## 📌 수집 주기 분리 (2026-10-19, Grok)

- 시설·주변은 매일 안 바뀐다. **운영 PostgreSQL 전체 스냅샷 적재는 일요일(KST) 또는 `full_db_import=true`만.**
- 평일 `data-sync`는 `db:migrate`만 하고 고캠핑·context·licences 재적재를 건너뛴다.
- 임시 DB 이중 적재 검증도 같은 날만.
- 상세: `docs/SYNC_CADENCE.md`. 새 수집을 매일 단계로 넣기 전에 이 문서를 볼 것.

## 📌 전기 용량 A 단위 분리 (2026-10-19, Grok)

- `pipeline/registry/attribute-dictionary.json`에 `POWER_MAX_A` (int, unit A) 추가.
- `pipeline/lib/spec-extractor.mjs`가 “전기 15A”, “사이트당 20A” 등 자유 텍스트에서 A 값을 추출해 `POWER_MAX_A`로 기록 (10~30A, W 환산 없음).
- 기존 `POWER_W` → `POWER_MAX_W` 경로는 유지.
- 다음 `data-sync` 또는 증분 발행 시 Fact Store에 반영됨. 다른 에이전트와 파일 영역 겹치지 않음.

## 📌 작업 전파 정책 (2026-10-19, 사용자 요청)

**모든 에이전트는 작업한 내용을 사이트에 직접 반영하거나, 안 될 때는 깃이나 다른 방법으로 다른 에이전트에게 전파해야 한다.**

- 새 기능·수정 사항은 PR이나 인수인계 문서 맨 위에 남긴다.
- 파일 전체를 자리표시자로 덮지 말 것. 필요한 줄만 고친다.
- 수집된 데이터는 `collected-data` 브랜치와 인수인계로 공유한다.

## 📌 플랫폼 허브 구현 확인 (2026-10-19, Claude)

- `docs/PLATFORM_HUB.md`의 의도(상세 ‘더 보기’ 플랫폼별 검색 버튼)는 `platformHubHtml`로 구현됨.
- 유튜브 영상은 기존 `videosHtml`로 사이트 안에서 재생.
- 인스타·페이스북·틱톡 등은 검색 버튼으로 새 탭 열기.
- 상세 페이지에 바로 보임.

## 📌 예약 엔진(땡큐캠핑) 업장 사이트 사실 + 빈자리 준비 (2026-10-19 16시, Claude → 전 에이전트)

- **새 원천 `thankq`**: 땡큐캠핑·캠퍼스토리 공개 예약 화면(robots `Allow: /`). 업장이 등록한 **사이트별 규격·바닥·1박 요금·입퇴실·주차·반려동물**을 `pipeline/registry/thankq.json`에 모은다(`collect-thankq.mjs`, 하루 2회 `thankq.yml` → 증분 발행). 근거·결과는 `docs/PRIVATE_AVAILABILITY_RESEARCH.md` 2-1절.
- **빌드 순서**: `build-thankq-facts.mjs`는 `build-nearby-facts` 뒤·`build-campground-profiles` 앞(data-sync·publish-incremental에 추가됨). 상세 `d.booking_sites`, 카탈로그 `c.tq = {s 엔진 번호, n 사이트 수, mx [가로,세로], lo, hi}`.
- **사실 원장 원천 `booking_engine` 등록**(fact-store `SOURCES`) — 지우면 발행이 막힌다.
- **화면(Codex)**: 상세 ‘사이트 규격 및 1박 요금’ 표가 `d.booking_sites`를 우선 사용(`bookingSitesHtml`), 조건 검색 사이트 크기 `maxSide`가 `c.tq.mx`를 포함, 대표 예약 경로에 땡큐캠핑 화면 보강. 빈자리 UI(`vacancy.json` → `S.vac`, 목록 `st-vac`/`st-full`, 상세 `vacHtml`)는 **파일이 있을 때만** 보인다.
- **빈자리 공개는 소유자 결정 대기**: 이용약관의 ‘서비스 정보 복제·제3자 제공 금지’(회원 의무) 조항 때문에 원천 승인 카드에서 빈자리는 `PENDING`. 저장소 변수 `THANKQ_VACANCY_PUBLISH=on`이면 바로 발행된다. 전체 중단은 `THANKQ_ENABLED=off`.
- 검증: `node --test pipeline/test/thankq.test.mjs`(3), 전체 테스트, 파생 재계산 회귀 없음(요금 1,941→1,949·입실 980→995·퇴실 945→960, 표본 기준 — 전체 매칭 실행 후 늘어남), 상세·목록 PC/모바일 스크린샷 가로 넘침·콘솔 오류 없음.

## 🚨 화면 원본을 자리표시자로 덮지 말 것 (2026-10-19 15시, Claude → 전 에이전트)

- 14:43 KST 커밋 6463b3336·49a4d6498(“platform hub”)이 `design/renewal/app.js`·`style.css`를 `// PLACEHOLDER - will be replaced`로 덮었다. 이 원본은 매일 발행이 `/explore/`로 그대로 복사하므로 **다음 발행에서 라이브 사이트 전체가 빈 화면이 될 뽐했다.** PR #39에서 전체 원본을 되살리고, `docs/PLATFORM_HUB.md`의 의도(상세 ‘더 보기’ 플랫폼별 검색 버튼)는 `platformHubHtml`로 구현했다.
- `pipeline/test/design-source-guard.test.mjs`가 이제 원본의 자리표시자·잘림(app.js 100KB↓·style.css 40KB↓)·핵심 함수 누락·문법 오류를 CI에서 막는다.
- 화면 수정은 `design/renewal/`을 **부분 수정**하고 `node scripts/publish-explorer-pages.mjs --shell-only camping-atlas/public/explore`로 발행한다. 발행본(`camping-atlas/public/explore/app.js`)만 고치면 다음 발행에 덮인다.

---

## 📌 이전 공지 (클로드·제미나이)

이전 인수인계 내용은 그대로 유지한다. 새 작업자는 위 공지를 먼저 읽을 것.
