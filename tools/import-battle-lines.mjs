// =====================================================================
// 敵の セリフと 必殺技を 最新の スロット (koori-slot) から 読みこむ (2026-10-23 ユーザー指定)
// ---------------------------------------------------------------------
// ../koori-slot/src/presentation/lcd/battleLines.js の SPECIALS (必殺技の 名前) と LINES (セリフ) から、
// パチンコの バトルに 出る キャラ (config.show.battles の 相手と チームの メンバー・こおりくん) の ぶんを 取り出して
// js/battle-lines.js (window.BATTLE_LINES) に 書き出す。スロットの セリフを 直したら もう一度 動かす。
//   LINES の 形: { intro: 出てきたとき, special: 必殺技の 前, win: 敵が 勝ったとき, lose: 敵が 負けたとき }
//
// 使い方 (koori-pachinko フォルダで):  node tools/import-battle-lines.mjs [スロットの battleLines.js]
// =====================================================================

import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const SRC = process.argv[2] || path.join(ROOT, '..', 'koori-slot', 'src', 'presentation', 'lcd', 'battleLines.js');
if (!fs.existsSync(SRC)) {
    console.error(`見つからない: ${SRC}`);
    process.exit(1);
}
const { SPECIALS, LINES } = await import(pathToFileURL(SRC).href);

// パチンコの config から バトルに 出る キャラを 集める
const ctx = { console, Math };
ctx.window = ctx;
vm.createContext(ctx);
vm.runInContext(fs.readFileSync(path.join(ROOT, 'js', 'config.js'), 'utf8'), ctx);
const battles = vm.runInContext('CONFIG.show.battles', ctx);
const ids = new Set(['koori']);
for (const [id, b] of Object.entries(battles)) (b.team || [id]).forEach(who => ids.add(who));

const specials = {}, lines = {};
for (const id of ids) {
    if (SPECIALS[id]) specials[id] = SPECIALS[id];
    if (LINES[id]) lines[id] = LINES[id];
}
const missing = [...ids].filter(id => id !== 'koori' && !LINES[id]);
const body = `// 敵の セリフと 必殺技 (node tools/import-battle-lines.mjs が 最新の スロット koori-slot の battleLines.js から 書き出す。手で 直さない)。${new Date().toISOString().slice(0, 10)}\n`
    + `// スロットに ない キャラ (${missing.join('・') || 'なし'}) は js/config.js の show.battleTalk を 使う\n`
    + `window.BATTLE_LINES = ${JSON.stringify({ specials, lines }, null, 4)};\n`;
fs.writeFileSync(path.join(ROOT, 'js', 'battle-lines.js'), body);
console.log(`js/battle-lines.js を 書きました: 必殺技 ${Object.keys(specials).length}・セリフ ${Object.keys(lines).length} (スロットに ない: ${missing.join('・') || 'なし'})`);
