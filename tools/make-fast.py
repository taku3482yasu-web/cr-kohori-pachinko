# tools/fast.html を index.html から作り直す (index.html を変えたら実行する)
# fast.html は index.html と同じゲームを、画面の更新を早送りして動かす確認用のページ
import os
import re

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
HEAD = """<!--
    確認用: index.html と同じゲームを、画面の更新 (requestAnimationFrame) を早送りして動かす。
    ヘッドレスChromeでは画面の更新がほとんど進まないので、オープニングなど「時間で進むもの」はこちらで確かめる。
    例: sh tools/shot.sh "tools/fast.html?spec=s99&story=opening" out.png 1100,900 3000
    index.html を変えたら作り直す (python tools/make-fast.py)。
-->
<script>
// 確認用: requestAnimationFrame を早送りする (1回ごとに 1/60 秒進める)
(() => { let ts = 0; window.requestAnimationFrame = cb => setTimeout(() => { ts += 1000 / 60; cb(ts); }, 0); })();
</script>
"""

with open(os.path.join(ROOT, 'index.html'), encoding='utf-8') as f:
    s = f.read()
s = s.replace('href="css/', 'href="../css/').replace('src="js/', 'src="../js/')
s = re.sub(r'(\s*<script src="\.\./js/config\.js)', lambda m: '\n' + HEAD + m.group(1), s, count=1)
with open(os.path.join(ROOT, 'tools', 'fast.html'), 'w', encoding='utf-8', newline='\n') as f:
    f.write(s)
