# 캠핑장 사실 저장소(Fact Store) — 에이전트용 안내 (2026-10-16)

> 목적: 캠핑장 정보를 **한 덩어리 문서가 아니라 잘게 나눈 사실 1행씩**으로 쌓아, 여러 에이전트가 같은 원장을 읽고·조합하고·검증한다.<br>
> 화면용 요약(프로필·한 줄 요약·태그, `CAMPGROUND_PROFILE.md`)은 이 원장에서 만들어지는 **읽기 모델**이고, 판단 근거는 언제나 이 원장이다.

## 1. 한 줄 요약

```
사실 1행 = (캠핑장 cid, 속성 attr, 값 value, 등급 grade, 원천 src, 원천 URL, 확인 시각 at, 근거 문장 quote)
```

같은 속성에 원천이 여럿이면 **모두 남긴다**(충돌 포함). 고르는 일은 조회 쪽(`fact-query.mjs`)이 등급 순으로 한다.

## 2. 파일 배치

| 위치 | 내용 | 커밋 |
| --- | --- | --- |
| `pipeline/registry/attribute-dictionary.json` | **속성 사전(원본)** — 코드·묶음·타입·단위·필터 방식·취향 질문·enum | 예(사람이 고친다) |
| `data/facts/campgrounds.ndjson` | 캠핑장 기준표 1곳 1행(cid·이름·시도·시군구·좌표·고캠핑 링크 gc_url·gc_at·카카오 장소 id) | 예(생성물) |
| `data/facts/{group}.ndjson` | 묶음별 사실 1건 1행 (아래 19개 묶음) | 예(생성물) |
| `data/facts/attributes.json` | 사전 사본 + 속성별 커버리지(곳 수·등급별 건수) | 예(생성물) |
| `data/facts/manifest.json` | 생성 시각·행 수·원천/등급별 건수 | 예(생성물) |
| `pipeline/out/facts.sqlite` | 같은 내용의 SQLite(`npm run facts:sqlite`) | 아니오 |
| PostgreSQL `fact_attribute`·`campground_fact`·`campground_fact_best` | `db/010`, `npm run db:import-facts` | — |

묶음(group): `stay` 숙박 형태·규모 · `power` 전기 · `fire` 불·화기 · `vehicle` 주차·차량 · `pet` 반려동물 · `price` 요금 · `fee` 추가 요금 · `time` 이용 시간 · `policy` 규칙·환불 · `sanitary` 위생시설 · `site` 사이트 · `amenity` 편의시설 · `env` 입지 · `theme` 계절·여행 테마 · `season` 운영 기간 · `booking` 예약 · `operator` 운영 주체·연락처 · `review` 후기 언급 · `rental` 대여.

필요한 묶음만 읽으면 된다(예: 불멍 조건만 보는 에이전트는 `fire.ndjson` 1.4MB만).

### 행 모양

```json
{"cid":"102006","attr":"FIRE_RULE","value":"FIREWOOD_OK","grade":"OPERATOR","src":"operator_homepage",
 "url":"http://www.whitecamp.co.kr/guide.html","at":"2026-10-16T00:58:02Z","quote":"관리사무실에서 … 장작 구매 가능"}
```

선택 열: `text`(사람이 읽는 값) · `n`(후기 언급 건수) · `period`(운영 기간) · `label`(평일/성수기 등) · `num`(대여 가격) · `count`(사이트 수).
`src=gocamping` 행에 `url`·`at`이 없으면 기준표의 `gc_url`·`gc_at`이다(용량 절반 절약). `loadFactStore()`가 채워 준다.

## 3. 등급과 원천

| 등급 | 뜻 | 원천 코드 |
| --- | --- | --- |
| `VERIFIED` (4) | 사람이 공식 원문과 대조 | `pilot_verified` |
| `OPERATOR` (3) | 운영자가 스스로 공개한 문장에서 자동 추출 | `operator_homepage`, `operator_discovered`(카카오 검색으로 찾은 홈페이지) |
| `CONFIRMED` (2) | 공공 등록값·공식 소개·지도 장소 | `gocamping`, `gocamping_intro`, `kakao_local` |
| `MENTION` (1) | 후기·검색 언급(건수 n) | `review_search`, `kakao_web`(홈페이지 후보) |

- `MENTION`이 아닌 행은 원천 URL이 반드시 있다(`validateFacts`, Postgres CHECK). AGENTS.md 3번.
- 확정 판단·요약·필터의 기본(strict)은 `CONFIRMED` 이상만 쓴다. `MENTION`은 lenient 모드에서만 근거가 되며 화면은 ‘확인필요’로 표시한다.

## 4. 조합 조회

### 터미널

```bash
node pipeline/scripts/query-facts.mjs --presets                      # 취향 묶음 목록
node pipeline/scripts/query-facts.mjs --attrs fire                   # 속성 사전(묶음별)
node pipeline/scripts/query-facts.mjs --preset firewood,pet --must "ENV_VALLEY eq true" --want "REVIEW_PRO_QUIET min 1" --lenient
```

조건 문법: `ATTR op 값` — `eq`·`not`·`in a,b`·`min`·`max`·`has`. `--must`는 어긋나면 제외, `--want`는 가산점. `--known`은 필수 조건이 확인필요인 곳도 제외.

### 코드

```js
import { loadFactStore, matchCampgrounds, PRESETS, parseCondition } from "./pipeline/lib/fact-query.mjs";
const store = loadFactStore("data/facts");
const rows = matchCampgrounds(store, [...PRESETS.winter_power.conditions, parseCondition("PET_POLICY in ALLOWED,SMALL_ONLY", { must: true })]);
// rows[i] = { cid, name, score, matched[{attr,label,value,grade,evidence{src,url,at,quote}}], unknown[…], failed[…] }
```

규칙
- 결정값 = 허용 등급 중 **가장 높은 등급**의 값들. 같은 등급에서 값이 갈리면 `conflict` → 갈린 값 모두가 조건을 만족하면 맞음, 아니면 ‘확인필요(원천끼리 값이 다름)’.
- 아래 등급의 반대 값은 `disagrees_below`로 함께 돌려준다(예: 고캠핑 ‘불가’ vs 운영자 ‘가능’).
- 후기 주제(`REVIEW_*`)는 요약한 후기가 있는데 언급이 없으면 0건으로 본다(lenient).

### SQL (SQLite·Postgres 공통 열)

```sql
-- 장작 불멍 + 반려견 + 계곡, 가장 높은 등급 값 기준
SELECT c.name FROM campground c
WHERE EXISTS (SELECT 1 FROM fact_best f WHERE f.cid=c.cid AND f.attr='FIRE_RULE' AND f.value_text='FIREWOOD_OK')
  AND EXISTS (SELECT 1 FROM fact_best f WHERE f.cid=c.cid AND f.attr='PET_POLICY' AND f.value_text IN ('ALLOWED','SMALL_ONLY','ZONE_ONLY'))
  AND EXISTS (SELECT 1 FROM fact_best f WHERE f.cid=c.cid AND f.attr='ENV_VALLEY' AND f.value_num=1);
-- Postgres는 테이블명이 campground_fact / campground_fact_best, 열은 external_campground_id·source_code·source_url
```

## 5. 쓰기 소유권(충돌 방지)

| 무엇 | 누가 고친다 | 어디서 |
| --- | --- | --- |
| 속성 추가·이름·enum | 데이터 담당 에이전트 | `attribute-dictionary.json` + `fact-store.mjs` 매핑 + 테스트 |
| 새 원천 추가 | 원천 담당 | 원천 수집기 → `registry/*.json` → `factsOf()`에 원천 코드(`SOURCES`) 추가 |
| 사람 검수값 | 파일럿 검수 | `registry/pilot-condition-facts.json`(→ VERIFIED) |
| `data/facts/*` | **아무도 손으로 고치지 않는다** | `build-fact-store.mjs`가 매번 통째로 다시 쓴다 |

- 사전에 없는 속성·URL 없는 확정값은 빌드가 실패한다(`validateFacts`).
- 속성 코드를 바꾸면(이름 변경·삭제) 사전 `version`을 올리고 이 문서와 `PROJECT_PLAN.md`에 적는다. 추가는 하위 호환이다.

## 6. 갱신 주기

`data-sync`(매일): … → `build-campground-profiles` → `build-fact-store` → `data/facts` 커밋 → 임시 Postgres에 두 번 적재해 제약 검증.
`operator-sites`(매주): 카카오 발굴(`discover-kakao.mjs`) → 운영자 홈페이지 수집. 결과는 다음 data-sync에 반영된다.

## 7. 현재 규모 (2026-10-16 첫 생성)

사실 96,917건 · 3,116곳 · 속성 130개 · VERIFIED 280 · OPERATOR 1,500 · CONFIRMED 83,757 · MENTION 11,380 (main 병합 후 재생성). 카카오 발굴은 첫 워크플로 실행 뒤 채워진다.
