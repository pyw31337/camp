# 데이터 품질 표준 프로세스 (2026-10-22 소유자 지시 — 모든 에이전트 공통)

> “데이터를 여러 에이전트가 각각 수집하고, 판단하고, 검토하고, 정제하는 프로세스를 표준화해서, 매일 수집되는 데이터와 여러 에이전트가 모으는 정보가 같은 절차로 처리되고, 모을수록 품질이 좋아지는 구조로.”

Claude·Codex·Gemini·Grok 등 어떤 에이전트든, 사람이 직접 넣는 값이든, **같은 6단계**를 거친다. 단계마다 도구와 통과 조건(게이트)이 정해져 있고, 게이트를 넘지 못한 값은 화면에 나가지 않는다.

## 왜 모을수록 좋아지나

| 장치 | 동작 | 어디서 |
|---|---|---|
| **독립 원천 확증** | 서로 다른 원천(원천 종류+호스트)이 같은 값을 말하면 신뢰도가 합쳐진다. 계산식은 `1 − Π(1 − 무게)`이다. 블로그 한 곳의 0.35가 카페에서도 같은 값이 나오면 0.58이 되고, 운영자 홈페이지가 더해지면 0.96이 된다. | `pipeline/lib/quality.mjs` `assess` |
| **충돌 → 판정 → 고정** | 값이 하나여야 하는 속성(반려견·입실 시각 등)에 믿을 만한 값이 엇갈리면 CONFLICT로 검토 대기열에 오른다. 원문을 대조한 판정은 VERIFIED 사실(`agent_review`)이 되어 다시 뒤집히지 않는다. | `data/quality/review-queue.json` → `quality-decide.mjs` → `decisions.ndjson` |
| **같은 실수 두 번 금지** | 같은 종류의 오류가 판정에 반복해 나오면, 다음 판정 대신 **규칙**으로 올린다. 규칙은 매 발행마다 자동으로 적용된다. | `publish-sanity.mjs` R1–R11, `registry/*.json` |
| **신선도** | 18개월이 지난 값은 신뢰도가 서서히 내려가므로 새 수집이 자연스럽게 이긴다. | `factWeight` |
| **회귀 감시** | 매일 품질 장부가 어제와 비교한다. 커버리지가 max(20곳, 2%)보다 많이 줄거나, 평균 신뢰도가 0.02 넘게 떨어지거나, 충돌이 늘면 경고한다. | `quality-ledger.mjs` → `data/quality/ledger.ndjson` |
| **다음 수집 우선순위** | 신뢰도가 낮은 속성과 충돌이 많은 속성이 보고서 맨 위에 오고, 다음 수집은 거기부터 한다. | `data/quality/REPORT.md` |

## 6단계

| # | 단계 | 하는 일 | 산출물 | 통과 조건(게이트) |
|---|---|---|---|---|
| 1 | **수집** | 원천에서 원문을 가져온다. 새 원천 종류는 먼저 등록한다. | `collected-data` 브랜치 캐시, `pipeline/registry/*.json` | ① 경로 규칙(아래 ‘수집 경로’) ② 무과금(`check:billing`) ③ 원천 등록(`fact-store.mjs SOURCES`, 공공데이터는 `public-datasets.json`) ④ 원문 URL·확인 시각 |
| 2 | **판단(추출)** | 원문을 원자 사실로 쪼갠다. 형식은 `{cid, attr, value, grade, src, url, at, quote}`이다. | `data/facts/*.ndjson` (`build-fact-store.mjs`) | 속성 사전(`attributes.json`)에 있는 속성·형식만 허용. MENTION이 아니면 URL 필수(`validateFacts`) |
| 3 | **검토(교차검증)** | 신뢰도·확증·충돌을 계산하고 상식 검사를 돌린다. | `data/quality/latest.json`, `review-queue.json` | 상식 검사: `publish-sanity`(공원 요금·광고 요금·좌표 오류·중복 등록·**캠핑장 아님**·휴업 등), `value-sanity`, `camp-reality`(서류상 등록·무관 업종 이름·무관 지도 분류), **후기 사진 내용 판정**(`photo-judge`: 음식·인물·차 안 사진 숨김) |
| 4 | **판정** | 대기열의 충돌을 원문과 대조해 확정한다. 반복되는 오류는 규칙으로 올린다. | `data/quality/decisions.ndjson` → VERIFIED 사실 | 원문 근거 URL 필수, 속성 형식 검증(`quality-decide.mjs`). 거둘 때는 `--retract` |
| 5 | **정제·병합** | 기존 값을 지우지 않고 합친다. 서비스 표기도 정리한다. | 발행 데이터(`camping-atlas/public/explore/data`) | `DATA_MERGE_POLICY.md`: ① 빈칸 채우기 ② 더 믿을 만하거나 최근일 때만 덮어쓰기(옛 값 기록) ③ 논리 검사 ④ 표기 정제. 수기 확정값은 `curated-pins.json` |
| 6 | **발행·환류** | 회귀 검사 후 발행하고, 장부와 보고서를 남긴다. | 커밋, `data/quality/ledger.ndjson`, `REPORT.md` | `field-guard`(값 손실 금지), `coverage-guard`(커버리지 회귀 금지), `publish-sanity --check`, `quality-ledger`(회귀 경고) |

### 등급과 무게(신뢰도 출발점)

| 등급 | 뜻 | 무게 |
|---|---|---|
| VERIFIED | 원문 대조 확정(파일럿·검토 판정) | 0.97 |
| OPERATOR | 운영자 홈페이지·셀프 등록 | 0.90 |
| OFFICIAL / OFFICIAL_TEXT | 기관 공식 문서·표준 규정 | 0.88 |
| CONFIRMED | 고캠핑·공공데이터 등록값 | 0.85 |
| MENTION | 후기·게시글 언급(같은 글 n번 언급 시 0.6까지) | 0.35 |
| REFERENCE | 법정·조례 기준 참고값(업장 미공지) | 0.15 |

상태 판정은 아래 기준을 따른다.
- **VERIFIED**: 신뢰도 0.95 이상
- **CONFIRMED**: 신뢰도 0.85 이상
- **CORROBORATED**: 독립 원천 2곳 이상이 같은 값
- **SINGLE**: 원천 하나, 신뢰도 0.5 이상 0.85 미만
- **WEAK**: 신뢰도 0.5 미만
- **CONFLICT**: 신뢰도 0.6 이상인 다른 값이 있음

## 매일 흐름(KST)

| 시각 | 단계 | 워크플로 |
|---|---|---|
| 02:50 | 운영자 셀프 등록 반영 | `operator-submissions.yml` |
| 03:17 | 수집 → 판단 → 검토 → 정제 → 발행 → **품질 장부** | `data-sync.yml` (`quality-ledger.mjs`는 `build-fact-store.mjs` 바로 뒤) |
| 수시 | 수집 단계가 끝날 때마다 증분 발행(장부 포함) | `publish-incremental.sh` |
| 주간 | 공공데이터(휴양림·박물관·공공시설개방·주변 인허가) | `public-data-weekly.yml` |

## 에이전트 소통 규약

공유 게시판은 `data/board/board.ndjson`이다. 덧붙이기만 하며, git merge=union으로 브랜치가 갈라져도 줄이 합쳐진다. 도구는 `pipeline/scripts/agent-board.mjs`이다.

1. **작업 시작 전**에 `node pipeline/scripts/agent-board.mjs list`를 실행한다. 열린 선점, 답 없는 질문, 최근 공지를 확인한다.
2. **겹침 확인**: `agent-board.mjs check --agent <나> --files <바꿀 파일들>`을 실행한다. 다른 에이전트가 선점한 파일이면 exit 1이 나온다. 이때는 질문(question)으로 조율한다.
3. **선점**: `agent-board.mjs claim --agent <나> --topic <주제> --files <파일> --text <할 일>`. 선점은 3일 뒤 자동으로 풀린다.
4. **끝나면** `release --reply <선점 id> --text "PR #…"`로 해제한다.
5. 데이터 문제를 발견하면 `finding`을 남긴다. 원천·캠핑장·근거 URL을 적는다. 고친 사람은 `answer`로 답한다.
6. 판정을 내렸으면 `decision`으로 요약을 남긴다. 세부는 `decisions.ndjson`에 있다.
7. `docs/AGENT_HANDOFF.md`의 📌는 사람용 요약이다. 기계가 읽는 상태는 게시판과 `data/quality`에 있다.

> 이 규약을 만든 계기는 2026-10-22 사례다. 두 에이전트가 같은 날 주변 공공시설(휴양림·수영장·박물관)을 각각 구현했다. 선점 기록이 있었으면 피할 수 있었다.

### 역할(기본 분담, 게시판 선점이 우선)

- **원천·사실**: 수집기, 원자 사실, 검토 판정
- **화면**: 판정·신뢰도를 화면에 쓰는 쪽
- **파이프라인·DB**: 워크플로, 증분 발행, Postgres 적재
- **병합 정책**: merge-policy, field-guard

누구든 대기열의 충돌을 판정할 수 있다. 다만 판정에는 원문 URL이 있어야 한다.

## 수집 경로(데이터 수집 원칙 5 재확인)

- 로그인·결제 뒤 화면, CAPTCHA·봇 차단, **robots.txt가 AI 크롤러를 이름으로 막은 곳**은 자동 수집 경로로 쓰지 않는다. 같은 사실을 공식 API나 공공데이터포털에서 받는다.
  - 2026-10-22 사례: k-data.aljal.kr은 robots.txt가 ClaudeBot·anthropic-ai를 막는다. 이 색인 수집(`sync-kdata-public`)을 폐지하고, 공공데이터포털 표준데이터로 교체했다. 교체한 데이터는 전국휴양림·박물관미술관·공공시설개방이며, 수집기는 `sync-public-leisure.mjs`, 변환은 `lib/public-poi.mjs`다. 휴게소는 원래대로 `sync:rest-stops`가 받는다.
- 재가공 사이트(다른 서비스가 모아 둔 색인)보다 **원천**을 먼저 쓴다. 원천은 기관·운영자·공공데이터포털이다.

## 새 원천·새 속성 추가 체크리스트

1. 경로 규칙과 무과금을 확인한다(`npm --prefix pipeline run check:billing`).
2. `fact-store.mjs SOURCES`에 원천을 등록한다. 미등록이면 발행 전체가 막힌다.
3. 속성 사전에 형식(type)과 다중값 여부(multi)를 정한다. 값이 하나여야 하는 속성만 충돌 판정 대상이다.
4. 등급은 위 표에서 고른다. 애매하면 낮은 쪽을 고른다. 확증으로 올라갈 수 있다.
5. 단위 테스트와 `quality-ledger` 실행 결과(회귀 0)를 PR에 적는다.
6. 게시판에 `notice`를 남긴다.

## 명령 모음

```sh
node pipeline/scripts/quality-ledger.mjs          # 장부·대기열·보고서 갱신(--check: 회귀면 exit 1)
node pipeline/scripts/quality-decide.mjs --by Claude --cid 102167 --attr PET_POLICY --value NOT_ALLOWED --url <원문> --why <근거>
node pipeline/scripts/agent-board.mjs list
node pipeline/scripts/agent-board.mjs claim --agent Codex --topic 지도 --files design/renewal/app.js --text "지도 클러스터"
```
