#!/usr/bin/env bash
# 브라우저 회귀 테스트 전부를 CI(Web quality / Rail swipe 잡)와 같은 목록·같은 순서로 돌린다.
# 목록의 원본은 .github/workflows/web-quality.yml 하나 — 여기에 따로 적지 않는다.
# 사용: bash camping-atlas/scripts/run-browser-tests.sh [URL]   (먼저 camping-atlas/public을 띄우고, publish --shell-only·split-catalog를 돌려 둔다)
set -u
cd "$(dirname "$0")/../.."
URL="${1:-http://127.0.0.1:8765/}"
fail=0
for t in $(grep -o 'camping-atlas/scripts/[a-z0-9-]*\.mjs' .github/workflows/web-quality.yml | awk '!seen[$0]++'); do
  if out=$(node "$t" "$URL" 2>&1); then echo "OK   $t"; else echo "FAIL $t"; echo "$out" | tail -8; fail=1; fi
done
exit $fail
