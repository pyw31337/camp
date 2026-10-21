#!/usr/bin/env bash
# 증분 발행: 방금 모은 결과를 "최신 main" 데이터 위에 덧붙이고, 파생 정보(스펙·프로필·요금·사이트 타입·커버리지·사실 저장소)를
# 최신 main의 코드로 다시 계산해 바로 커밋·푸시한다. 사이트(GitHub Pages)는 main 푸시로 곧바로 다시 배포된다.
# - 실행 시작 시점의 오래된 코드·일부만 복원된 캐시로 전체를 다시 만들지 않는다(다른 에이전트의 최신 데이터를 보존).
# - 커버리지가 줄면(coverage-guard) 커밋하지 않는다.
# 사용(pipeline 디렉터리에서): bash scripts/publish-incremental.sh "<라벨>" [--web out/campground-web.json]
set -euo pipefail
LABEL="${1:-collected data}"; shift || true
WEB=""
while [ $# -gt 0 ]; do case "$1" in --web) WEB="$(realpath "$2")"; shift 2;; *) shift;; esac; done
SRC="$(pwd)"
WT="${RUNNER_TEMP:-/tmp}/publish-main-$$"
git fetch -q origin main
git worktree add -q --detach "$WT" origin/main
trap 'git worktree remove --force "$WT" >/dev/null 2>&1 || true' EXIT
ln -s "$SRC/node_modules" "$WT/pipeline/node_modules"
cd "$WT"
DATA=camping-atlas/public/explore/data
# 필드 단위 비교 기준: 손대기 전 최신 main 데이터(docs/DATA_MERGE_POLICY.md)
BASEROOT="$(mktemp -d)"; git archive HEAD "$DATA" pipeline/registry | tar -x -C "$BASEROOT"
node pipeline/scripts/report-coverage.mjs >/dev/null
BASE="$(mktemp)"; cp "$DATA/meta.json" "$BASE"
git checkout -q -- "$DATA/meta.json"

[ -n "$WEB" ] && node "$SRC/scripts/merge-collected.mjs" --web "$WEB" --data "$DATA"
# 파생 정보는 최신 main의 규칙으로 다시 계산한다(최종 빌드 단계와 같은 순서).
node pipeline/scripts/survey-all-campgrounds.mjs >/dev/null
node pipeline/scripts/build-operator-facts.mjs
node pipeline/scripts/build-spec-sheet.mjs
node pipeline/scripts/build-review-digest.mjs
node pipeline/scripts/build-nearby-facts.mjs
node pipeline/scripts/build-nearby-photos.mjs
node pipeline/scripts/build-thankq-facts.mjs
node pipeline/scripts/build-campground-profiles.mjs
node pipeline/scripts/build-site-pricing-facts.mjs
node pipeline/scripts/build-site-types.mjs
node pipeline/scripts/build-price-tiers.mjs
node pipeline/scripts/build-house-rules.mjs
node pipeline/scripts/build-gocamping-detail.mjs
# 당일 장소 시드(원문 규칙·요약)는 프로필·이용규칙 생성 뒤에 붙인다 — data-sync와 같은 순서(빼면 시드 값이 지워졌다 되살아나기를 반복).
node pipeline/scripts/apply-dayuse-seed.mjs
# 발행 전 상식 정리(공원에 야영장 요금·입퇴실 금지, 플랫폼 광고 요금, 좌표, 시·도 표기, 중복 등록) — data-sync와 같은 자리.
node pipeline/scripts/publish-sanity.mjs
node pipeline/scripts/build-link-health.mjs
node pipeline/scripts/build-card-fallback.mjs
# 기존 값이 지워지거나 줄어든 곳은 최신 main 값으로 되살린다(채우기 우선 — 리셋 금지). 기록: pipeline/registry/merge-review.ndjson
node "$SRC/scripts/field-guard.mjs" "$BASEROOT" . --heal
node pipeline/scripts/report-coverage.mjs
node pipeline/scripts/build-fact-store.mjs
node "$SRC/scripts/coverage-guard.mjs" "$BASE" "$DATA/meta.json"

if [ -n "${PUBLISH_DRY_RUN:-}" ]; then { git status --short | head -5 || true; }; echo "(시험 실행: 커밋하지 않음)"; exit 0; fi
git config user.name "moyeora-camping-data-bot"
git config user.email "41898282+github-actions[bot]@users.noreply.github.com"
git add camping-atlas/public/explore data/facts; git add pipeline/registry/merge-review.ndjson 2>/dev/null || true
if git diff --cached --quiet; then echo "증분 발행: 변경 없음."; exit 0; fi
git commit -q -m "chore(data): publish ${LABEL} now (incremental)"
# main은 필수 검사 룰셋이 걸려 있어 직접 push하지 않고 PR로 착지시킨다(.github/scripts/land-on-main.sh).
SLUG="$(printf '%s' "${LABEL}" | tr 'A-Z' 'a-z' | tr -cs 'a-z0-9' '-' | sed 's/^-*//;s/-*$//')"
bash "${GITHUB_WORKSPACE:-$(git rev-parse --show-toplevel)}/.github/scripts/land-on-main.sh" "incr-${SLUG:-misc}" && { echo "증분 발행 완료: ${LABEL}"; exit 0; }
echo "::error::증분 발행 착지 실패(${LABEL})"; exit 1
