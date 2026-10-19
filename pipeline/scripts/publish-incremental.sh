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
node pipeline/scripts/report-coverage.mjs
node pipeline/scripts/build-fact-store.mjs
node "$SRC/scripts/coverage-guard.mjs" "$BASE" "$DATA/meta.json"

if [ -n "${PUBLISH_DRY_RUN:-}" ]; then git status --short | head -5; echo "(시험 실행: 커밋하지 않음)"; exit 0; fi
git config user.name "moyeora-camping-data-bot"
git config user.email "41898282+github-actions[bot]@users.noreply.github.com"
git add camping-atlas/public/explore data/facts
if git diff --cached --quiet; then echo "증분 발행: 변경 없음."; exit 0; fi
git commit -q -m "chore(data): publish ${LABEL} now (incremental)"
# 다른 에이전트가 그 사이 main을 바꿨으면 그 위로 다시 올린다. 생성물 충돌은 방금 만든 결과를 쓴다.
for i in 1 2 3 4; do
  if git pull -q --rebase -X theirs origin main && git push -q origin HEAD:main; then echo "증분 발행 완료: ${LABEL}"; exit 0; fi
  sleep $((i * 5))
done
echo "::error::증분 발행 푸시 실패(${LABEL})"; exit 1
