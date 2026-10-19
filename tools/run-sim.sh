#!/bin/sh
# 出玉シミュレーター (tools/simulate.html) をヘッドレスChromeで動かして結果を表示する
# 使い方 (koori-pachinko フォルダで): sh tools/run-sim.sh [クエリ (例: hours=200&spec=s199)]
CHROME="/c/Program Files/Google/Chrome/Application/chrome.exe"
DIR=$(cd "$(dirname "$0")" && pwd -W 2>/dev/null || pwd)
"$CHROME" --headless --disable-gpu --allow-file-access-from-files --virtual-time-budget=3600000 --timeout=3600000 \
    --dump-dom "file:///$DIR/simulate.html?$1" 2>/dev/null | sed -n '/<pre id="out">/,/<\/pre>/p' | sed 's/<[^>]*>//g'
