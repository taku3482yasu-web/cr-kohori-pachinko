# sounds/heso.m4a を js/sound-heso.js に埋め込む (ファイルを直接開いても音を読めるように)
# 使い方 (koori-pachinko フォルダで): python tools/embed-sound.py
import base64
import os

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
with open(os.path.join(ROOT, 'sounds', 'heso.m4a'), 'rb') as f:
    b = base64.b64encode(f.read()).decode()
js = """// =====================================================================
// 入賞時の音 (ユーザーが録音した sounds/heso.m4a を、ファイルを直接開いても読めるように埋め込んだもの)
// ---------------------------------------------------------------------
// sounds/heso.m4a を差しかえたら作り直す: python tools/embed-sound.py
// 鳴らすところ (start〜end 秒) と音量は config.show.voice
// =====================================================================

const HESO_SOUND = 'data:audio/mp4;base64,""" + b + """';
"""
with open(os.path.join(ROOT, 'js', 'sound-heso.js'), 'w', encoding='utf-8', newline='\n') as f:
    f.write(js)
