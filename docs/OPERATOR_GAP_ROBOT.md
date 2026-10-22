# 운영자 정보 빈칸 보강 로봇

`prioritize-operator-gaps.mjs`는 수집기가 아니다. 공개 카탈로그와 상세 파일을 읽어 다음 누락이 큰 업장을 우선순위로만 만든다.

- 1박 요금, 전기 제한, 사이트 규격·바닥
- 입실·퇴실, 매너타임
- 금지사항·이용 제한·분리수거·환불 등 이용 수칙

실제 읽기는 `crawl-operator-sites.mjs`가 한다. 운영자 자체 홈페이지·공공 운영 페이지의 robots 허용 경로만 읽고, 네이버·캠핏·카페·로그인·CAPTCHA 경로는 대상에서 제외한다. 이용자 후기·방문자 사진 게시판 본문은 사실 추출에 쓰지 않는다. 문장(최대 140자), 원문 URL, 확인 시각만 저장한다.

## 대표 사진·프로필 품질 검수

공식 사진이 없는 업장은 검색 API가 연결한 외부 원문 사진을 **카드 대표 후보**로만 쓴다. 후보가 업장과 무관하거나(드라마·상품·다른 업장), 안내판/배치도/저해상도 파비콘이면 즉시 `pipeline/registry/card-photo-pins.json`에 `reject`로 기록한다. 사람이 실제 업장명·간판·고유 시설을 시각 검수해 연관을 확인한 후보만 `pin`으로 고정한다. 원본 이미지는 저장하거나 재호스팅하지 않고, 원문 URL·출처·확인일을 함께 남긴다.

사진만으로는 프로필 빈칸을 채우지 않는다. 정보량이 낮은 업장은 다음 순서로 보강한다.

1. 고캠핑·관광공사·지자체 등 공공 원천의 연락처, 시설, 상품, 공식 사진을 먼저 다시 대조한다.
2. 카카오 로컬·허용된 공개 검색 결과로 **직접 운영 도메인**만 찾고, 운영자 소유가 확인된 도메인만 로봇 후보로 등록한다.
3. `crawl-operator-sites.mjs`가 robots 허용인 직접 운영/공공 페이지에서만 사실 단위(값·근거 문장·원문 URL·확인 시각)를 추출한다.
4. 직접 원천이 없거나 차단되면 추정으로 채우지 않고 ‘보강 대기’로 남긴다. 검색·후기 페이지는 원문 연결만 제공하며 운영 사실의 확정 근거로 승격하지 않는다.

`card-photo-pins` 변경은 `node --test pipeline/test/card-photo-pins.test.mjs`와 `node pipeline/scripts/build-card-fallback.mjs` 뒤에 `node scripts/split-catalog.mjs`까지 실행해 전체·경량·상세 카탈로그가 같은 대표 사진을 보게 한다.

2026-10-20 실행 기록: 1차는 `OK 4 / ROBOTS_DISALLOWED 2 / FETCH_FAILED 4`, 2차는 `OK 3 / ROBOTS_DISALLOWED 2 / NO_RELEVANT_TEXT 1 / FETCH_FAILED 4`였다. 차단·오류·내용 없음 결과도 확인 시각과 함께 남기며, 다른 경로로 우회하지 않는다. 각 성공 배치 뒤에는 조건·스펙·프로필·사이트 요금 카탈로그를 다시 산출한다.

```bash
npm --prefix pipeline run check:billing
node pipeline/scripts/prioritize-operator-gaps.mjs --limit 10
batch_ids=$(node -e 'const x=require("./pipeline/out/operator-gap-priority.json");process.stdout.write(x.selected.map(v=>v.id).join(","))')
node pipeline/scripts/crawl-operator-sites.mjs --only "$batch_ids" --limit 10 --concurrency 3
node pipeline/scripts/survey-all-campgrounds.mjs
node pipeline/scripts/build-spec-sheet.mjs
node pipeline/scripts/build-campground-profiles.mjs
```

실행 단위는 10~20곳이다. `ROBOTS_DISALLOWED`, 로그인·결제 벽, 연속 오류는 실패가 아니라 수집 제외 상태로 기록하며 우회하지 않는다. 우선순위기는 차단·플랫폼 전환 결과는 90일, 접속 실패·관련 문장 없음은 30일 동안 재시도 후보에서 뺀다. 발행 전에는 회귀 검사와 화면 검증을 수행한다.
