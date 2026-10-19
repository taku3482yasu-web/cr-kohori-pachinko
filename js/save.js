// =====================================================================
// 前回の続き (このブラウザに保存する。ユーザー指定 2026-10-19)
// ---------------------------------------------------------------------
// 遊んでいるあいだ数秒ごとと、ページを閉じるときに保存する。次に開いたときに「前回から続ける / 新しく始める」を選ぶ。
// 保存するもの: スペック・設定・持ち玉・集計・回転数のリセット位置・台の中身 (保留・RASH・大当たりの途中など。Machine.snapshot)
// 盤面を飛んでいる途中の玉は保存しない (そのぶんは持ち玉に戻す)。
// =====================================================================

const SaveData = (() => {
    const KEY = 'koori-pachinko-save';
    const VERSION = 1;

    function load() {
        try {
            const data = JSON.parse(localStorage.getItem(KEY) || 'null');
            if (!data || data.version !== VERSION || !CONFIG.specs[data.specId]) return null;
            return data;
        } catch (e) {
            return null;
        }
    }

    function save(data) {
        try { localStorage.setItem(KEY, JSON.stringify({ ...data, version: VERSION, savedAt: Date.now() })); } catch (e) { /* 保存できない環境 */ }
    }

    function clear() {
        try { localStorage.removeItem(KEY); } catch (e) { /* 無視 */ }
    }

    return { load, save, clear };
})();
