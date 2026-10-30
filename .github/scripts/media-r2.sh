#!/usr/bin/env bash
# 공식 사진(webp)을 Cloudflare R2에 두기(2026-10-30 소유자 결정 ⓒ — GitHub Pages 1GB 한도 때문에 사진 저장이 900MB에서 멈춤).
# 설정(저장소 Settings → Secrets and variables → Actions):
#   Secrets  R2_ACCOUNT_ID · R2_ACCESS_KEY_ID · R2_SECRET_ACCESS_KEY
#   Variables R2_BUCKET(버킷 이름) · R2_PUBLIC_BASE(공개 주소, 예: https://pub-xxxx.r2.dev 또는 연결한 도메인)
# 설정이 없으면 모든 명령이 아무것도 하지 않고 끝난다(지금처럼 media 브랜치 + Pages).
#
# 사용:
#   media-r2.sh on                 설정이 다 있으면 exit 0, 아니면 exit 1
#   media-r2.sh pull <dir> [prefix] R2 → 로컬(이미 받은 사진을 다시 받지 않게 수집 전에)
#   media-r2.sh push <dir>         로컬 webp → R2(지우지 않음), 올린 뒤 로컬 webp가 R2에 모두 있는지 확인
#   media-r2.sh keys <out>         R2에 있는 webp 목록(media-guard의 ‘직전 파일 목록’)
#   media-r2.sh git-json-only <dir> media 브랜치에서 webp를 빼고 목록 파일(json)만 남긴다 — push 확인이 끝난 뒤에만
set -euo pipefail
cmd="${1:-}"; shift || true

configured() { [ -n "${R2_ACCOUNT_ID:-}" ] && [ -n "${R2_ACCESS_KEY_ID:-}" ] && [ -n "${R2_SECRET_ACCESS_KEY:-}" ] && [ -n "${R2_BUCKET:-}" ] && [ -n "${R2_PUBLIC_BASE:-}" ]; }
if [ "$cmd" = "on" ]; then configured && exit 0 || exit 1; fi
if ! configured; then echo "R2 설정 없음 — 건너뜀($cmd)"; exit 0; fi

export AWS_ACCESS_KEY_ID="$R2_ACCESS_KEY_ID" AWS_SECRET_ACCESS_KEY="$R2_SECRET_ACCESS_KEY" AWS_DEFAULT_REGION=auto
# 최신 AWS CLI의 기본 체크섬(CRC64 등)을 R2가 다르게 처리할 수 있어 필요할 때만 계산한다.
export AWS_REQUEST_CHECKSUM_CALCULATION=when_required AWS_RESPONSE_CHECKSUM_VALIDATION=when_required
EP="https://${R2_ACCOUNT_ID}.r2.cloudflarestorage.com"
S3="s3://${R2_BUCKET}"
aws_s3() { aws s3 "$@" --endpoint-url "$EP" --only-show-errors; }
list_keys() { aws s3 ls "$S3/" --recursive --endpoint-url "$EP" | awk '{ $1=$2=$3=""; sub(/^ +/, ""); print }' | grep -E '\.webp$' | sort -u || true; }

case "$cmd" in
  pull)
    dir="$1"; prefix="${2:-}"
    aws_s3 sync "$S3/${prefix}" "$dir/${prefix}" --exclude "*.json"
    echo "R2 → $dir/${prefix}: $(find "$dir/${prefix}" -name '*.webp' | wc -l)장"
    ;;
  keys)
    list_keys > "$1"; echo "R2 사진 $(wc -l < "$1")장"
    ;;
  push)
    dir="$1"
    aws_s3 sync "$dir" "$S3" --exclude ".git/*" --exclude "*" --include "*.webp" --cache-control "public, max-age=31536000, immutable" --content-type image/webp
    tmp="$(mktemp)"; list_keys > "$tmp"
    (cd "$dir" && find camps cards -name '*.webp' 2>/dev/null | sort -u) > "$tmp.local"
    missing="$(comm -23 "$tmp.local" "$tmp" | wc -l)"
    echo "R2 올림 확인: 로컬 $(wc -l < "$tmp.local")장 · R2 $(wc -l < "$tmp")장 · R2에 없는 로컬 사진 ${missing}장"
    if [ "$missing" != "0" ]; then echo "::error::R2에 올라가지 않은 사진 ${missing}장 — media 브랜치에서 사진을 빼지 않습니다."; comm -23 "$tmp.local" "$tmp" | head -5; exit 1; fi
    ;;
  git-json-only)
    dir="$1"
    # push가 모두 확인된 뒤에만 부른다. 사진 파일은 R2에, 브랜치에는 manifest·hero·카드 색인 같은 목록 파일만.
    git -C "$dir" rm -r -q --cached --ignore-unmatch -- '*.webp' >/dev/null || true
    git -C "$dir" add -A -- . ':(exclude)*.webp'
    printf '*.webp\n' > "$dir/.gitignore"; git -C "$dir" add .gitignore
    ;;
  *) echo "사용: media-r2.sh on|pull|keys|push|git-json-only"; exit 2 ;;
esac
