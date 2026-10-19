# =====================================================================
# js / css の版番号を付け直す (ブラウザに古いファイルを使わせないため)
# ---------------------------------------------------------------------
# index.html と tools/fast.html が読み込む js/xxx.js・css/xxx.css に、ファイルの中身から作った版番号 ?v=xxxxxxxx を付ける。
# 中身が変わったファイルだけ番号が変わるので、ブラウザはそのファイルだけ読み込み直す。
# 使い方 (koori-pachinko フォルダで): python tools/bump-version.py
# 書きかえた HTML のパスを1行ずつ出す (git のフックがコミットに含める)。
# =====================================================================

import hashlib
import os
import re
import sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
PAGES = ['index.html', 'howto.html', os.path.join('tools', 'fast.html')]
PATTERN = re.compile(r'((?:src|href)=")((?:\.\./)?)((?:js|css)/[\w\-./]+?\.(?:js|css))(\?v=\w+)?(")')


def version(path):
    # 改行を LF にそろえてから作る (Windows で CRLF で取り出しても、ほかの PC と同じ番号になる)
    with open(os.path.join(ROOT, path), 'rb') as f:
        return hashlib.md5(f.read().replace(b'\r\n', b'\n')).hexdigest()[:8]


def main():
    changed = []
    for page in PAGES:
        full = os.path.join(ROOT, page)
        if not os.path.exists(full):
            continue
        with open(full, encoding='utf-8') as f:
            text = f.read()

        def replace(m):
            return f'{m.group(1)}{m.group(2)}{m.group(3)}?v={version(m.group(3))}{m.group(5)}'

        new = PATTERN.sub(replace, text)
        if new != text:
            with open(full, 'w', encoding='utf-8', newline='\n') as f:
                f.write(new)
            changed.append(page.replace(os.sep, '/'))
    print('\n'.join(changed))


if __name__ == '__main__':
    sys.exit(main())
