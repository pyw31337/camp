#!/usr/bin/env bash
# 시안 줄바꿈·말줄임 검사. 사용: bash design/checks/run.sh  (Playwright가 전역 설치되어 있어야 함)
set -euo pipefail
here="$(cd "$(dirname "$0")" && pwd)"
out="$(mktemp -d)"
{ printf '<!doctype html><html lang="ko"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover"></head><body>'; cat "$here/../mockup-v2/index.html"; printf '</body></html>'; } > "$out/preview.html"
cp -r "$here/../mockup-v2/assets" "$out/"
export PW="${PW:-$(npm root -g)/playwright}"
node "$here/truncation-check.cjs" "$out"
node "$here/wrap-check.cjs" "$out"
