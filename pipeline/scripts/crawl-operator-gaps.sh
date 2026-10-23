#!/usr/bin/env bash
# 정보가 빠진 캠핑장(요금·이용 제한·수칙 등) 우선순위를 뽑아(prioritize-operator-gaps) 그 운영자 홈페이지만 깊게 읽는다(crawl-operator-deep).
# 맥미니 주말 작업(local/macmini/nightshift.mjs)에서 돈다. 운영자 자체 호스트·robots.txt·1초 간격은 수집기가 지킨다.
set -euo pipefail
cd "$(dirname "$0")/.."
OUT="$(mktemp)"
node scripts/prioritize-operator-gaps.mjs --limit "${GAPS_LIMIT:-150}" --out "$OUT"
IDS="$(node -e 'console.log(JSON.parse(require("fs").readFileSync(process.argv[1], "utf8")).selected.map((x) => x.id).join(","))' "$OUT")"
rm -f "$OUT"
[ -n "$IDS" ] || { echo "보강할 곳 없음"; exit 0; }
node scripts/crawl-operator-deep.mjs --only "$IDS" --limit "${GAPS_LIMIT:-150}" --max-pages 16
