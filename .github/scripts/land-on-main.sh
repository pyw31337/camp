#!/usr/bin/env bash
# 데이터 자동 커밋을 main에 '직접 push' 하지 않고 PR로 착지시킨다(main 룰셋: Lint and build·Rail swipe 필수).
# 사용: 커밋을 만든 뒤  bash "$GITHUB_WORKSPACE/.github/scripts/land-on-main.sh" <label>
#  - 같은 label은 브랜치 bot/data-<label> 하나와 열린 PR 하나로 모인다(하루 PR 수를 줄임).
#  - GITHUB_TOKEN으로 만든 PR은 워크플로를 깨우지 않으므로 web-quality.yml을 workflow_dispatch로 직접 돌리고,
#    **방금 요청한 실행**의 Lint and build·Rail swipe가 모두 성공하면 바로 병합(merge commit)한다.
#    커밋 상태 전체를 읽으면 과거/중복 실행의 실패 상태를 새 실행 실패로 오인할 수 있으므로 쓰지 않는다.
#    실패·시간초과면 PR을 열어둔 채 실패로 끝낸다.
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
baseline_sha=""
for i in 1 2 3 4 5; do
  git fetch -q origin main
  # field-guard 복원과 뒤따르는 workflow_dispatch 검증은 같은 main 스냅샷을 기준으로 한다.
  # 수집 중 다른 봇이 main을 전진시켜도 이미 검증한 값을 거짓 손실로 판단하지 않는다.
  baseline_sha="$(git rev-parse origin/main)"
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
# GITHUB_TOKEN으로 연 봇 PR의 pull_request 실행은 승인 대기(action_required)로 작업 없이 멈춰 있다가 PR이 닫히면 '실패'로 바뀌어
# 매번 빨간 알림을 보낸다(2026-10-23 소유자: “왜 반복적으로 에러가 나는거야?”). 실제 검사는 아래 workflow_dispatch 실행이다.
# 승인 대기 실행은 이미 ‘completed’라 취소가 안 되므로(409) 작업이 0개인 것만 지운다(빈 기록).
clear_pending_pr_runs() {
  gh api "repos/${REPO}/actions/runs?event=pull_request&branch=${BR}&status=action_required&per_page=100" -q '.workflow_runs[].id' 2>/dev/null \
    | while read -r id; do
        [ "$(gh api "repos/${REPO}/actions/runs/${id}/jobs" -q '.total_count' 2>/dev/null)" = "0" ] && gh api -X DELETE "repos/${REPO}/actions/runs/${id}" >/dev/null 2>&1 || true
      done
}
PR="$(gh pr list -R "$REPO" --head "$BR" --base main --state open --json number -q '.[0].number')"
if [ -z "$PR" ]; then
  gh pr create -R "$REPO" --head "$BR" --base main --title "chore(data): ${LABEL} 자동 갱신" \
    --body "자동 데이터 갱신(${GITHUB_WORKFLOW:-}) — 필수 검사 통과 시 봇이 바로 병합합니다. run: ${GITHUB_SERVER_URL:-}/${REPO}/actions/runs/${GITHUB_RUN_ID:-}" >/dev/null
  PR="$(gh pr list -R "$REPO" --head "$BR" --base main --state open --json number -q '.[0].number')"
fi
echo "PR #${PR} ← ${BR} @ ${SHA:0:9}"
gh workflow run web-quality.yml -R "$REPO" --ref "$BR" -f baseline_sha="$baseline_sha"
deadline=$(( $(date +%s) + ${LAND_TIMEOUT_SEC:-1800} ))
poll="${LAND_POLL_SEC:-15}"
run_id=""
while :; do
  # workflow_dispatch는 실행 ID를 돌려주지 않는다. 같은 SHA·이벤트인 가장 최근 실행만 잡는다.
  # PR 체크/상태 API는 과거에 남은 같은 이름의 결과까지 섞일 수 있으므로 여기서는 사용하지 않는다.
  if [ -z "$run_id" ]; then
    run_id="$(gh api "repos/${REPO}/actions/workflows/web-quality.yml/runs?event=workflow_dispatch&branch=${BR}&per_page=100" 2>/dev/null \
      | jq -r --arg sha "$SHA" '[.workflow_runs[] | select(.head_sha == $sha)] | sort_by(.created_at) | last | .id // empty')"
    if [ -n "$run_id" ]; then echo "Web quality 실행 #${run_id} 확인"; fi
  fi
  if [ -n "$run_id" ]; then
    run="$(gh api "repos/${REPO}/actions/runs/${run_id}")"
    status="$(echo "$run" | jq -r '.status')"
    conclusion="$(echo "$run" | jq -r '.conclusion // empty')"
    if [ "$status" = "completed" ]; then
      jobs="$(gh api "repos/${REPO}/actions/runs/${run_id}/jobs?per_page=100" -q '[.jobs[] | select(.name=="Lint and build" or .name=="Rail swipe") | {n:.name,s:.status,c:.conclusion}]')"
      ok=$(echo "$jobs" | jq '[.[] | select(.s=="completed" and .c=="success") | .n] | unique | length')
      if [ "$conclusion" = "success" ] && [ "$ok" = 2 ]; then break; fi
      clear_pending_pr_runs
      echo "::error::방금 요청한 Web quality 실행이 실패했습니다 — PR #${PR}를 열어둡니다 (run #${run_id}, workflow=${conclusion}): ${jobs}"
      exit 1
    fi
  fi
  [ "$(date +%s)" -lt "$deadline" ] || { clear_pending_pr_runs; echo "::error::필수 검사 시간초과 — PR #${PR}"; exit 1; }
  sleep "$poll"
done
clear_pending_pr_runs
for i in 1 2 3 4; do
  if gh pr merge "$PR" -R "$REPO" --merge --match-head-commit "$SHA"; then echo "병합 완료: PR #${PR}"; exit 0; fi
  sleep $((i * 10))
done
echo "::error::PR #${PR} 병합 실패(충돌?)"; exit 1
