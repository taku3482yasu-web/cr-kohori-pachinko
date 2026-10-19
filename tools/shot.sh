#!/bin/sh
# ページをヘッドレスChromeで画像にする (確認用)
# 使い方: sh tools/shot.sh <ページ (例: tools/trace.html?strength=45)> <出力.png> [幅,高さ] [待つミリ秒]
CHROME="/c/Program Files/Google/Chrome/Application/chrome.exe"
ROOT=$(cd "$(dirname "$0")/.." && pwd -W 2>/dev/null || pwd)
OUT=$(cd "$(dirname "$2")" && pwd -W 2>/dev/null || pwd)/$(basename "$2")
"$CHROME" --headless --disable-gpu --allow-file-access-from-files --hide-scrollbars \
    --virtual-time-budget="${4:-3000}" --window-size="${3:-720,1000}" --screenshot="$OUT" "file:///$ROOT/$1" 2>/dev/null
