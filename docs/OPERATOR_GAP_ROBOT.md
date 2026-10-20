# 운영자 정보 빈칸 보강 로봇

`prioritize-operator-gaps.mjs`는 수집기가 아니다. 공개 카탈로그와 상세 파일을 읽어 다음 누락이 큰 업장을 우선순위로만 만든다.

- 1박 요금, 전기 제한, 사이트 규격·바닥
- 입실·퇴실, 매너타임
- 금지사항·이용 제한·분리수거·환불 등 이용 수칙

실제 읽기는 `crawl-operator-sites.mjs`가 한다. 운영자 자체 홈페이지·공공 운영 페이지의 robots 허용 경로만 읽고, 네이버·캠핏·카페·로그인·CAPTCHA 경로는 대상에서 제외한다. 문장(최대 140자), 원문 URL, 확인 시각만 저장한다.

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

실행 단위는 10~20곳이다. `ROBOTS_DISALLOWED`, 로그인·결제 벽, 연속 오류는 실패가 아니라 수집 제외 상태로 기록하며 우회하지 않는다. 발행 전에는 회귀 검사와 화면 검증을 수행한다.
