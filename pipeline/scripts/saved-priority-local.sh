#!/usr/bin/env bash
# 맥미니 야간 작업용: 찜한 업장만 운영자 홈페이지를 렌더링·OCR로 다시 읽고 깊게 읽는다(CI saved-priority.yml의 로컬판, Apple Vision OCR).
# 사용(pipeline 디렉터리에서): bash scripts/saved-priority-local.sh
set -euo pipefail
IDS="$(node scripts/sync-saved-priority.mjs --print-ids | tail -1)"
[ -n "$IDS" ] || { echo "찜한 업장 없음"; exit 0; }
echo "찜한 업장: $IDS"
node scripts/crawl-operator-sites.mjs --only "$IDS" --concurrency 4 --render --retry-failed --ocr --max-age-days 0 || true
node scripts/crawl-operator-deep.mjs --only "$IDS" --limit 60 --max-pages 16 || true
