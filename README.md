# 수집 데이터 공유 (모든 에이전트 공통)

> 2026-10-19 소유자 지시: “수집된 데이터는 다른 에이전트들이 즉각 알 수 있게 공유하고, 바로 사이트에 반영될 수 있게.”

## 어디에 있나

| 무엇 | 위치 | 갱신 시점 |
|---|---|---|
| 화면에 쓰는 데이터(카탈로그·상세) | `main`: `camping-atlas/public/explore/data/` (`campgrounds.json`, `camps/{id}.json`, `meta.json`) | 수집 단계가 끝날 때마다 **증분 발행** 커밋 `chore(data): publish … now (incremental)` |
| 항목별 커버리지(2,500곳 목표) | `main`: `meta.json`의 `coverage` | 위와 같음 |
| 원자 사실 원장(캠핑장·속성·값·등급·원천·근거) | `main`: `data/facts/*.ndjson` (`docs/FACT_STORE.md`) | 위와 같음 |
| 예약 엔진(땡큐캠핑) 업장 등록 사이트 사실 | `main`: `pipeline/registry/thankq.json` (`matches`·`sites`) | 하루 2회(`thankq.yml`) 직후 증분 발행 |
| 주변시설 실제 사진(검색 썸네일·원문 링크) | `main`: `pipeline/registry/nearby-photos.json` (`places{이름|좌표}`) | 매일 05:37 KST(`nearby-photos.yml`) 직후 증분 발행 |
| 운영자 홈페이지 문장(OCR 포함) | `main`: `pipeline/registry/operator-site-snippets.json` | 운영자 홈페이지 읽기 직후 |
| **누적 수집 캐시(원본)** — 카카오 다음 후기·카페·사진, 네이버 블로그·카페·웹문서·지식iN 요약과 허용 본문 문장 | **`collected-data` 브랜치**(단일 커밋, 강제 갱신): `cache/social-search.json.gz`, `cache/web-mentions.json.gz`, `out/campground-social.json.gz`, `out/campground-web.json.gz`, `MANIFEST.json` | 매일 데이터 동기화에서 수집 직후(뒤 단계가 실패해도 저장) |

다른 에이전트가 원본을 읽는 법:

```bash
git fetch origin collected-data
git show origin/collected-data:MANIFEST.json
git show origin/collected-data:out/campground-web.json.gz | gunzip > /tmp/campground-web.json
```

## 어떻게 바로 반영되나 (`pipeline/scripts/publish-incremental.sh`)

1. **최신 `main`** 을 따로 꺼낸다(실행 시작 시점의 오래된 코드·데이터가 아님).
2. 새로 모은 글을 상세에 **덧붙인다**(`scripts/merge-collected.mjs`, 지우지 않음·멱등).
3. 최신 `main`의 규칙으로 파생 정보(전수조사·운영자 사실·스펙·장단점·주변·프로필·요금·사이트 타입·커버리지·사실 원장)를 다시 계산한다.
4. **커버리지 회귀 검사**(`scripts/coverage-guard.mjs`): 어느 항목이라도 max(20곳, 2%) 넘게 줄면 커밋하지 않는다.
5. 커밋·푸시 → GitHub Pages가 곧바로 다시 배포된다.

데이터 동기화의 마지막 전체 빌드도 같은 회귀 검사를 거친다(2026-10-19: 일부만 복원된 캐시로 후기 2,686→1,272곳으로 줄어들 뻔한 사고).

## 배포용 나눈 파일 (2026-10-21)
- 원본은 `camping-atlas/public/explore/data/campgrounds.json`(압축 JSON 한 줄, `JSON.stringify` 그대로 — 들여쓰기 저장 금지). 배포 때 `scripts/split-catalog.mjs`가 목록용 `campgrounds.lite.json`과 상세용 `catx/` 샤드를 만든다(커밋하지 않음).
- 고캠핑 등 자동 원천에 없는 1박 캠핑장은 `campgrounds.json`에 직접 넣지 말고 `pipeline/registry/manual-camps.json`에 원문 `src.url`·`checked_at`과 함께 넣는다(`apply-dayuse-seed.mjs`가 붙임). 원천 URL이 없으면 사실 원장(`build-fact-store.mjs`) 검증이 실패해 동기화가 막힌다(2026-10-21 평택캠핑성 14건).

## 다른 에이전트에게

- 로컬에서 추출 규칙을 바꿔 데이터를 다시 만들 때도 커밋 전에 `node pipeline/scripts/report-coverage.mjs`로 줄어든 항목이 없는지 확인한다.
- 새 원천을 모으면 같은 방식(최신 main 위에 덧붙이기 → 파생 재계산 → 회귀 검사 → 커밋)을 쓴다. 원본 캐시는 `collected-data`에 둔다.
- 사실의 원천 종류를 새로 만들면 `pipeline/lib/fact-store.mjs`의 `SOURCES`에 등록한다. 등록되지 않은 원천은 사실 검증에서 실패해 그날 발행 전체가 막힌다(2026-10-19 `blog_mention`).
