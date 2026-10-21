# 데이터 누적 병합 정책 (DATA_MERGE_POLICY) — 모든 에이전트·수집 봇 필수

> 2026-10-21 소유자 지시: “새로 수집되는 정보로 인해 기존 데이터가 리셋되거나 삭제되어서는 절대 안 된다.
> 1순위 채우기, 2순위 더 최신 정보로 덮어쓰기, 3순위 논리 검토, 4순위 서비스 언어로 정제 — 시간이 갈수록 품질이 좋아지는 구조.”

Claude·Codex·Gemini 에이전트와 매일·주기 수집 워크플로가 **같은 공유 데이터**에 쓴다.
대상은 `camping-atlas/public/explore/data/campgrounds.json`, `camps/{id}.json`, `data/facts/*`, `pipeline/registry/*`(dayuse-seed·manual-camps·urban-parks·dayuse-osm 등), Supabase 적재본, `media` 브랜치다.
여기에 쓰는 모든 경로는 아래 규칙을 따른다.

## 1. 네 가지 우선순위 (`pipeline/lib/merge-policy.mjs`)

| 순위 | 규칙 | 코드 |
| --- | --- | --- |
| ① 채우기 | 빈 칸만 채운다. **빈 값·null·더 적은 항목으로 바꾸지 않는다.** 목록은 합집합(url·id 기준)이고, 새 목록에 없는 기존 항목도 남는다. 형식이 다르면(묶음→단일 값) 바꾸지 않는다. | `mergeValue`·`mergeRecord`·`mergeList`·`assignNonEmpty` |
| ② 최신·신뢰 덮어쓰기 | 값이 다를 때는 **더 믿을 만한 출처**이거나 **같은 등급에서 확인일이 더 최근**일 때만 바꾼다. 근거가 없으면 기존 값을 유지한다. 바뀐 옛 값은 `previous`로 검토 기록에 남는다. | `trustRank` |
| ③ 논리 검사 | 항목 이름표에 맞는지 본다. 좌표 범위와 좌표↔시도(예: 경남 야영장의 제주 좌표), 요금 범위와 최저가≤최고가, 전화·URL 형식, 미래 확인일을 검사한다. 교차 모순(1박 4만원 미만인데 ‘가격 부담’, 겨울 운영과 동계 휴장이 함께 붙은 경우)도 잡는다. 실패하면 반영하지 않고 `reject` 처리한다(격리). | `validateField`·`crossCheck`, 후기 라벨은 기존 `label-sanity.mjs` |
| ④ 정제 | 서비스 표기로 맞춘다. 단위(와트→W), URL(`www.`→`http://`), 전화 공백을 정리한다. 시도 이름은 **짧은 표준 이름(서울·경기·강원·전남 등)으로 통일한다**(2026-10-21 프로젝트 책임자 결정, `geo-sanity.mjs` `sidoStd`, 발행 전 `publish-sanity` R6가 매 동기화 뒤 맞춘다). | `normalizeField` |

### 출처 신뢰 순서 (새 구조를 만들지 않고 기존 표기를 그대로 쓴다)

`VERIFIED`(사람 대조·소유자·운영자 제출) > `OPERATOR`(운영자 홈페이지·예약 엔진·공식 API) > `CONFIRMED`(고캠핑·공공데이터·카카오 로컬·인허가) > `MENTION`(OSM·후기·검색)

- 사실 저장소 등급과 원천 코드는 `docs/FACT_STORE.md` §3 그대로다.
- 레코드에 있는 `grade`·`src`·`field_conditions.source.tier`(A/B/C)·`checked_at`/`src_at`/`at`/`확인일`을 출처와 확인일로 읽는다.

## 2. 발행 전 필드 단위 손실 검사 (`pipeline/scripts/field-guard.mjs`)

기존 `coverage-guard`는 항목별 전체 곳 수만 본다. `field-guard`는 이를 **레코드·필드 단위**로 넓혀, 기준(최신 main) 대비 다음 경우를 찾는다.

- 레코드가 사라진 경우
- 비어 있지 않던 값이 비거나 사라진 경우
- 목록 항목 수가 준 경우

| 어디서 | 모드 | 동작 |
| --- | --- | --- |
| `data-sync.yml`(03:17), `publish-incremental.sh`(모든 증분 발행) | `--heal` | 줄어든 원천 값을 최신 main 값으로 **되살리고** 발행을 계속한다. 요금처럼 묶음이 통째로 약해지면 묶음 전체를 되돌려 값과 출처가 섞이지 않게 한다. |
| `land-on-main.sh`(모든 봇 커밋 착지) | `--heal` | 충돌을 ‘새 결과 우선’으로 풀면서 그사이 main에 들어온 다른 에이전트 값이 지워지면 되살리는 커밋을 하나 더 얹는다. |
| `Web quality / Lint and build`(필수 검사, 사람·봇 PR 모두) | 검사 | 이 PR이 기존 값을 지우거나 줄이면 **실패**한다. |

- 되살림·교체·정당한 삭제는 `pipeline/registry/merge-review.ndjson`(append-only 검토 기록)에 한 줄씩 남는다. 교체된 옛 값은 `previous`로 보관되어 되돌릴 수 있다.
- **경고만 하는 필드**:
  - 원천에서 매번 다시 계산하는 읽기 모델(`pf`·`rv`·`profile`·`nl`·`st`·`field_conditions` 등, 목록은 스크립트의 `DERIVED`)
  - 실시간 값(예보·인기·빈자리·확인 시각)
  - 이 필드들의 원천(후기·사실·상세)은 엄격 검사가 지킨다.
- 더 최신·더 믿을 만한 출처가 묶음을 통째로 바꾼 경우(예: `fee.grade`/`fee.checked_at`이 더 높음 또는 최근)는 손실이 아니라 **교체**로 본다.

### 의도한 삭제(폐업·중복 합치기·오류 정정)를 하려면

1. 사람·에이전트 PR: `pipeline/registry/merge-overrides.json`의 `overrides`에 `{ "file": "campgrounds.json", "id": "1234", "field": "fee", "reason": "제주 투어 광고 금액(185,000원) 오기재 정정", "by": "Claude", "at": "2026-10-21" }`을 적는다. `reason`이 없으면 통과하지 않는다. `field`를 생략하거나 `"*"`로 두면 레코드 전체가 대상이다.
2. 수집 스크립트: 지우기 직전에 `logReview({ action: "removed", file, id, field, reason })`를 호출한다(예: `apply-dayuse-seed.mjs`가 공식 공원으로 바뀐 OSM 중복을 뺄 때).
3. 값을 지우는 대신 **상태로 표시**하는 쪽을 먼저 고려한다(예: `status: "폐업"`, 미확인은 `UNKNOWN`).

## 3. 수집기를 새로 만들거나 고칠 때 (체크리스트)

- 결과 파일을 통째로 다시 쓰지 말고 기존 파일을 읽어 `mergeList`/`mergeRecord`로 합친다(예: `collect-urban-parks.mjs`).
- `{...old, ...rec}` 대신 `assignNonEmpty(old, rec)`를 쓴다(빈 값이 기존 값을 지우지 않게).
- 일부만 받은 응답·캐시 일부 복원·쿼터 초과 때는 쓰지 않는다(기존 파일 유지).
- 새 값에는 출처(`src`/`grade`)와 확인일(`checked_at`/`src_at`)을 붙인다. 없으면 ②에서 기존 값을 이기지 못한다.
- 봇 커밋은 직접 push하지 않고 `.github/scripts/land-on-main.sh`로 착지시킨다.
- 테스트: `node --test pipeline/test/merge-policy.test.mjs`. 무작위 2,000회 속성 검사로 “병합은 비어 있지 않던 값을 잃지 않는다”를 확인한다.

## 4. 이 정책을 만든 실제 사고

| 날짜 | 사고 | 지금 막는 장치 |
| --- | --- | --- |
| 10-13 | 데이터 봇 rebase `-X ours`로 새 데이터가 이전 실행 결과와 섞임 | land-on-main 복원 |
| 10-19 | 캐시 일부 복원 전체 재빌드로 후기 2,686→1,272곳 | coverage-guard와 field-guard 복원 |
| 10-21 | 사진 보충 설정이 요금 5,460→2,345곳으로 줄이고 공식 사진 7,274장 삭제 | media-guard(#119)와 field-guard 복원 |
| 10-20 | 증분 발행(Naver 언급)이 5곳의 `fee.tiers`를 지움(이번 감사에서 발견) | field-guard 복원 |
| 10-20 | 당일 시드가 동기화마다 덮어써짐(#148) | apply-dayuse-seed가 `assignNonEmpty`와 삭제 기록 사용 |

## 5. 시험 실행 (2026-10-21)

- `PUBLISH_DRY_RUN=1 bash pipeline/scripts/publish-incremental.sh`를 최신 main에서 실행했다. 결과는 필드 손실 0, 교체 1, 파생 감소 8(경고), 커버리지 회귀 없음이고 통과했다.
- 모의 사고: 요금 3,115곳을 지운 데이터로 `--heal`을 실행해 18,930개 값을 모두 되살렸다(4.7초). 재검사 결과 손실 0이었다.

## 6. 다중 소스 수집 (2026-10-21 추가)

후기·언급은 네이버 외에 아래 경로를 병행한다. 본문은 robots 허용 호스트만, 플랫폼 창작물(평점·랭킹)은 복제하지 않는다.

| 소스 | 경로 | 비고 |
|------|------|------|
| 네이버 블로그·카페·웹 | `sync-web-mentions.mjs` | 현재 사용 |
| 다음 웹 검색 | 카카오 Daum API | `pipeline/lib/multi-source.mjs` |
| 티스토리 | robots 허용 시 본문 | 호스트 간격 준수 |
| 고캠핑 소개 | `line` 필드 | 최소 `rv` 채움 |
| 업장 홈페이지 | `operator-site` | 운영자 사실 |

기존 값은 `merge-policy.mjs`로 보존한다. 빈 칸만 채우고, 더 믿을 만하거나 더 최근일 때만 덮어쓴다.
