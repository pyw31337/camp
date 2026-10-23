#!/usr/bin/env bash
# 맥미니 야간 작업 끄기. 기록(~/.letscamp)은 남긴다 — 완전히 지우려면 rm -rf ~/.letscamp
set -euo pipefail
PLIST="$HOME/Library/LaunchAgents/com.letscamp.nightshift.plist"
launchctl bootout "gui/$(id -u)" "$PLIST" 2>/dev/null || true
rm -f "$PLIST"
echo "야간 작업을 껐어요."
