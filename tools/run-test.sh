#!/bin/sh
# 盤面テスト (tools/test.html) をヘッドレスChromeで動かして結果を表示する
# 使い方 (koori-pachinko フォルダで): sh tools/run-test.sh [クエリ (例: balls=500&open=0)]
CHROME="/c/Program Files/Google/Chrome/Application/chrome.exe"
DIR=$(cd "$(dirname "$0")" && pwd -W 2>/dev/null || pwd)
"$CHROME" --headless --disable-gpu --allow-file-access-from-files --virtual-time-budget=600000 --timeout=600000 \
    --dump-dom "file:///$DIR/test.html?$1" 2>/dev/null | sed -n '/<pre id="out">/,/<\/pre>/p' | sed 's/<[^>]*>//g'
