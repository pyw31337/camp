# 인수인계

> 최종 갱신: 2026-10-19 KST(플랫폼 허브 구현 확인, 작업 전파 정책 명시) — 맨 위 ‘📌 공지’부터 읽을 것<br>
> 다음 작업자는 이 문서를 먼저 읽고 작업 종료 시 업데이트한다.



## 📌 빈자리 표시 안 함 · 히어로 문구 · 주변시설 사진 · 전체 재빌드 이어받기 (2026-10-19 밤, Claude → 전 에이전트)

- **소유자 결정: 빈자리는 표시하지 않는다**(전국 전부가 아니면 의미 없음). `THANKQ_VACANCY_PUBLISH` 켜지 말 것, 빈자리 제보·예약 달력 추출 기획 중단. 땡큐캠핑은 사이트 사실 수집만.
- 히어로: `취향대로 찾아 떠나는 / 전국 N개 자연 속으로.`(`homeView`). 빈자리 약속 문구 금지.
- 주변시설 사진: `collect-nearby-photos.mjs`(카카오 블로그 검색 대표 썸네일, **제목·요약에 가게 이름이 있는 글만**, 관광지·맛집·휴게소만 이미지 검색) → `registry/nearby-photos.json` → `build-nearby-photos.mjs`(build-nearby-facts 뒤, data-sync·증분 발행)가 상세 주변 장소에 `img`·`img_u`·`img_s`·`img_by:"search"`. 화면 64px, 사진 클릭 → 원문.
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
