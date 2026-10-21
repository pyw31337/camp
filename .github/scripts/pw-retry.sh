#!/usr/bin/env bash
# 브라우저 회귀 테스트를 한 번 더 시도한다. CI 러너가 느려 첫 페이지 로딩이 시간 초과되는 일시 실패만 흡수하고,
# 진짜 회귀는 두 번 다 실패하므로 그대로 막힌다. 서버(8765)가 응답할 때까지 먼저 기다린다.
# 사용: bash .github/scripts/pw-retry.sh <test.mjs> <URL>
set -uo pipefail
URL="${2:-http://127.0.0.1:8765/}"
for i in $(seq 1 30); do curl -sf -o /dev/null "$URL" && break; sleep 1; done
for a in 1 2; do
  node "$@" && exit 0
  echo "::warning::$(basename "$1") ${a}회차 실패 — $([ $a = 1 ] && echo '한 번 더 시도합니다' || echo '두 번 모두 실패')"
  sleep 5
done
exit 1
