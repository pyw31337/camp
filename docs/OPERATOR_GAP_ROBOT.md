# 운영자 정보 빈칸 보강 로봇

`prioritize-operator-gaps.mjs`는 수집기가 아니다. 공개 카탈로그와 상세 파일을 읽어 다음 누락이 큰 업장을 우선순위로만 만든다.

- 1박 요금, 전기 제한, 사이트 규격·바닥
- 입실·퇴실, 매너타임
- 금지사항·이용 제한·분리수거·환불 등 이용 수칙

실제 읽기는 `crawl-operator-sites.mjs`가 한다. 운영자 자체 홈페이지·공공 운영 페이지의 robots 허용 경로만 읽고, 네이버·캠핏·카페·로그인·CAPTCHA 경로는 대상에서 제외한다. 이용자 후기·방문자 사진 게시판 본문은 사실 추출에 쓰지 않는다. 문장(최대 140자), 원문 URL, 확인 시각만 저장한다.

2026-10-22부터 공용 시설관리공단·지자체 포털은 URL만 같다고 같은 업장으로 판정하지 않는다. 수집 페이지의 제목/본문에 캠핑장 식별명이 있어야 하며, 정원·파크골프·다른 시설·공용 푸터·메뉴명은 사실로 저장하지 않는다. 배치가 끝나면 반드시 `audit-operator-content.mjs`를 실행해 기존 안내·규칙·공지와 그 문장에서 만든 프로필 태그까지 격리한다. 사람 대조 보정은 `curated-camp-facts.json`에 원천 URL·확인 시각을 함께 적어 자동 추출과 분리한다.

2026-10-20 실행 기록: 1차는 `OK 4 / ROBOTS_DISALLOWED 2 / FETCH_FAILED 4`, 2차는 `OK 3 / ROBOTS_DISALLOWED 2 / NO_RELEVANT_TEXT 1 / FETCH_FAILED 4`였다. 차단·오류·내용 없음 결과도 확인 시각과 함께 남기며, 다른 경로로 우회하지 않는다. 각 성공 배치 뒤에는 조건·스펙·프로필·사이트 요금 카탈로그를 다시 산출한다.

```bash
npm --prefix pipeline run check:billing
node pipeline/scripts/prioritize-operator-gaps.mjs --limit 10
batch_ids=$(node -e 'const x=require("./pipeline/out/operator-gap-priority.json");process.stdout.write(x.selected.map(v=>v.id).join(","))')
node pipeline/scripts/crawl-operator-sites.mjs --only "$batch_ids" --limit 10 --concurrency 3
node pipeline/scripts/survey-all-campgrounds.mjs
node pipeline/scripts/build-spec-sheet.mjs
node pipeline/scripts/build-campground-profiles.mjs
node pipeline/scripts/audit-operator-content.mjs --apply
```

실행 단위는 10~20곳이다. `ROBOTS_DISALLOWED`, 로그인·결제 벽, 연속 오류는 실패가 아니라 수집 제외 상태로 기록하며 우회하지 않는다. 우선순위기는 차단·플랫폼 전환 결과는 90일, 접속 실패·관련 문장 없음은 30일 동안 재시도 후보에서 뺀다. 발행 전에는 회귀 검사와 화면 검증을 수행한다.
