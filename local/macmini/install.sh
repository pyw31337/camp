#!/usr/bin/env bash
# 렛츠캠핑 맥미니 야간 작업 설치(소유자 2026-10-23). 맥미니 터미널에서 한 번:
#   curl -fsSL https://raw.githubusercontent.com/pyw31337/camp/main/local/macmini/install.sh | bash
#   (또는 저장소를 받은 뒤 bash local/macmini/install.sh) — 다시 실행해도 안전(업데이트).
# 하는 일: 전용 클론(~/.letscamp/camp) · Apple Vision 판독기 컴파일 · 판독 모델 준비 · 기존 정기 작업 찾기 · launchd 등록(15분마다 깨움).
# 실제로 일하는 시간은 nightshift.mjs가 정한다(평일 18~08시, 주말·공휴일 종일, 기존 작업·바쁠 때는 쉼).
set -euo pipefail
LC="$HOME/.letscamp"; CLONE="$LC/camp"; BIN="$LC/bin"; LABEL="com.letscamp.nightshift"
PLIST="$HOME/Library/LaunchAgents/$LABEL.plist"
say() { printf '\n\033[1m%s\033[0m\n' "$*"; }
need() { command -v "$1" >/dev/null 2>&1 || { echo "❌ $1 이(가) 없어요 → $2"; exit 1; }; }

[ "$(uname)" = Darwin ] || { echo "맥에서만 실행해요"; exit 1; }
need git "xcode-select --install"
need swiftc "xcode-select --install"
need node "brew install node (22 이상)"
node -e 'process.exit(Number(process.versions.node.split(".")[0]) >= 22 ? 0 : 1)' || { echo "❌ Node 22 이상이 필요해요 → brew upgrade node"; exit 1; }
need gh "brew install gh && gh auth login"
gh auth status >/dev/null 2>&1 || { echo "❌ GitHub 로그인이 필요해요 → gh auth login (repo·workflow 권한)"; exit 1; }
gh auth setup-git >/dev/null

say "1/6 전용 클론 준비 ($CLONE)"
mkdir -p "$LC/logs" "$BIN"
[ -d "$CLONE/.git" ] || gh repo clone pyw31337/camp "$CLONE" -- --depth 50
git -C "$CLONE" fetch -q origin main
git -C "$CLONE" checkout -q -B nightshift origin/main
git -C "$CLONE" reset -q --hard origin/main
git -C "$CLONE" config user.name "letscamp-macmini-bot"
git -C "$CLONE" config user.email "letscamp-macmini-bot@users.noreply.github.com"

say "2/6 Apple Vision 판독기 컴파일"
swiftc -O "$CLONE/local/macmini/vision-ocr.swift" -o "$BIN/vision-ocr"
echo "✅ $BIN/vision-ocr"

say "3/6 판독 라이브러리 설치(npm)"
( cd "$CLONE/pipeline" && npm ci --silent && npm i --no-save --silent @huggingface/transformers@3.8.1 )

say "4/6 로컬 비전 모델(Ollama, 선택)"
: > "$LC/env"
if command -v ollama >/dev/null 2>&1; then
  MEM_GB=$(( $(sysctl -n hw.memsize) / 1073741824 ))
  MODEL="qwen2.5vl:7b"; [ "$MEM_GB" -lt 16 ] && MODEL="qwen2.5vl:3b"
  echo "메모리 ${MEM_GB}GB → $MODEL"
  ollama pull "$MODEL"
  echo "export LOCAL_VLM_MODEL=$MODEL" >> "$LC/env"
else
  echo "ℹ️  Ollama가 없어 비전 모델 없이(CLIP + Apple Vision 간판 글자) 판독해요."
  echo "   더 정확하게: brew install ollama && brew services start ollama → install.sh 다시 실행"
fi

say "5/6 기존 정기 작업 찾기(겹치지 않게)"
node "$CLONE/local/macmini/detect-existing.mjs"
echo "   빠진 작업이 있으면 ~/.letscamp/avoid.txt 에 적어 주세요(형식은 README)."

say "6/6 launchd 등록(15분마다 깨워 확인)"
NODE="$(command -v node)"
mkdir -p "$(dirname "$PLIST")"
cat > "$PLIST" <<EOF
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0"><dict>
  <key>Label</key><string>$LABEL</string>
  <key>ProgramArguments</key><array>
    <string>/bin/bash</string><string>-c</string>
    <string>[ -f "$LC/env" ] &amp;&amp; . "$LC/env"; exec "$NODE" "$CLONE/local/macmini/nightshift.mjs"</string>
  </array>
  <key>EnvironmentVariables</key><dict><key>PATH</key><string>$(dirname "$NODE"):/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin</string></dict>
  <key>StartInterval</key><integer>900</integer>
  <key>LowPriorityIO</key><true/>
  <key>Nice</key><integer>10</integer>
  <key>StandardOutPath</key><string>$LC/logs/launchd.log</string>
  <key>StandardErrorPath</key><string>$LC/logs/launchd.log</string>
</dict></plist>
EOF
launchctl bootout "gui/$(id -u)" "$PLIST" 2>/dev/null || true
launchctl bootstrap "gui/$(id -u)" "$PLIST"
echo "✅ 등록됨: $LABEL"

say "확인"
"$NODE" "$CLONE/local/macmini/nightshift.mjs" --dry-run || true
if pmset -g | grep -Eq '^ *sleep +[1-9]'; then
  echo "⚠️  잠자기가 켜져 있어요. 전원 연결 시 잠자기 끄기(권장):  sudo pmset -c sleep 0"
fi
echo "로그: ~/.letscamp/logs/  ·  상태: ~/.letscamp/status.json  ·  끄기: bash $CLONE/local/macmini/uninstall.sh"
