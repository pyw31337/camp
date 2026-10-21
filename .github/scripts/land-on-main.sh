#!/usr/bin/env bash
# 데이터 자동 커밋을 main에 '직접 push' 하지 않고 PR로 착지시킨다(main 룰셋: Lint and build·Rail swipe 필수).
# 사용: 커밋을 만든 뒤  bash "$GITHUB_WORKSPACE/.github/scripts/land-on-main.sh" <label>
#  - 같은 label은 브랜치 bot/data-<label> 하나와 열린 PR 하나로 모인다(하루 PR 수를 줄임).
#  - GITHUB_TOKEN으로 만든 PR은 워크플로를 깨우지 않으므로 web-quality.yml을 workflow_dispatch로 직접 돌리고,
#    두 검사가 그 커밋에서 성공하면 바로 병합(merge commit)한다. 실패·시간초과면 PR을 열어둔 채 실패로 끝낸다.
# 필요 권한: contents: write, pull-requests: write, actions: write
set -euo pipefail
LABEL="${1:?label}"
BR="bot/data-${LABEL}"
REPO="${GITHUB_REPOSITORY:?}"
export GH_TOKEN="${GH_TOKEN:-${GITHUB_TOKEN:-}}"
REF="${GITHUB_REF_NAME:-main}"
# main이 아닌 브랜치에서 수동 실행한 경우는 예전처럼 그 브랜치에 바로 올린다.
if [ "$REF" != "main" ]; then
  git pull -q --rebase -X theirs origin "$REF" && git push -q origin "HEAD:$REF"; exit 0
fi
# 커밋 안 된 '추적 파일' 변경은 잠시 치워 두었다가 끝나면 되돌린다(뒤 단계가 계속 쓰므로). 추적 안 된 파일은 건드리지 않는다.
if ! git diff --quiet || ! git diff --cached --quiet; then
  git stash push -q -m "land-leftovers" && trap 'git stash pop -q || echo "::warning::land-leftovers stash 복원 실패"' EXIT
fi
pushed=""
for i in 1 2 3 4 5; do
  git fetch -q origin main
  git fetch -q origin "+refs/heads/${BR}:refs/remotes/origin/${BR}" 2>/dev/null || true
  # 새 결과(이 실행의 커밋)를 최신 main 위로 옮긴다. 충돌은 새 결과 우선.
  git rebase -q -X theirs origin/main
  # 아직 병합 안 된 이전 봇 커밋이 있으면 합친다(겹치면 이번 결과 우선).
  if git rev-parse -q --verify "refs/remotes/origin/${BR}" >/dev/null && ! git merge-base --is-ancestor "origin/${BR}" origin/main; then
    git merge -q --no-edit -X ours "origin/${BR}" -m "merge previous ${BR}" || { git merge --abort || true; git push -q --force origin "HEAD:refs/heads/${BR}" && { pushed=1; break; }; }
  fi
  # 충돌을 '새 결과 우선'으로 풀면 그사이 main에 들어온 다른 에이전트의 값이 지워질 수 있다.
  # 최신 main에 있던 값이 줄어든 곳은 되살려 한 커밋 더 얹는다(docs/DATA_MERGE_POLICY.md).
  if [ -f pipeline/scripts/field-guard.mjs ]; then
    FGB="$(mktemp -d)"; git archive origin/main camping-atlas/public/explore/data pipeline/registry | tar -x -C "$FGB"
    node pipeline/scripts/field-guard.mjs "$FGB" . --heal || true
    rm -rf "$FGB"
    git add -u camping-atlas/public/explore/data pipeline/registry 2>/dev/null || true
    git add camping-atlas/public/explore/data/camps pipeline/registry/merge-review.ndjson 2>/dev/null || true
    git diff --cached --quiet || git commit -q -m "fix(data): 최신 main 값 보존(field-guard 복원)"
  fi
  if git push -q origin "HEAD:refs/heads/${BR}" 2>/dev/null || git push -q --force-with-lease="${BR}" origin "HEAD:refs/heads/${BR}"; then pushed=1; break; fi
  sleep $((i * 7))
done
[ -n "$pushed" ] || { echo "::error::${BR} push 실패"; exit 1; }
SHA="$(git rev-parse HEAD)"
PR="$(gh pr list -R "$REPO" --head "$BR" --base main --state open --json number -q '.[0].number')"
if [ -z "$PR" ]; then
  gh pr create -R "$REPO" --head "$BR" --base main --title "chore(data): ${LABEL} 자동 갱신" \
    --body "자동 데이터 갱신(${GITHUB_WORKFLOW:-}) — 필수 검사 통과 시 봇이 바로 병합합니다. run: ${GITHUB_SERVER_URL:-}/${REPO}/actions/runs/${GITHUB_RUN_ID:-}" >/dev/null
  PR="$(gh pr list -R "$REPO" --head "$BR" --base main --state open --json number -q '.[0].number')"
fi
echo "PR #${PR} ← ${BR} @ ${SHA:0:9}"
gh workflow run web-quality.yml -R "$REPO" --ref "$BR"
deadline=$(( $(date +%s) + ${LAND_TIMEOUT_SEC:-1800} ))
while :; do
  sleep 30
  st="$(gh api "repos/${REPO}/commits/${SHA}/check-runs?per_page=100" -q '[.check_runs[]|select(.name=="Lint and build" or .name=="Rail swipe")|{n:.name,s:.status,c:.conclusion}]')"
  ok=$(echo "$st" | jq '[.[]|select(.s=="completed" and .c=="success")|.n]|unique|length')
  bad=$(echo "$st" | jq '[.[]|select(.s=="completed" and .c!="success")]|length')
  if [ "$ok" = 2 ]; then break; fi
  if [ "$bad" != 0 ]; then echo "::error::필수 검사 실패 — PR #${PR}를 열어둡니다: $st"; exit 1; fi
  [ "$(date +%s)" -lt "$deadline" ] || { echo "::error::필수 검사 시간초과 — PR #${PR}"; exit 1; }
done
for i in 1 2 3 4; do
  if gh pr merge "$PR" -R "$REPO" --merge --match-head-commit "$SHA"; then echo "병합 완료: PR #${PR}"; exit 0; fi
  sleep $((i * 10))
done
echo "::error::PR #${PR} 병합 실패(충돌?)"; exit 1
