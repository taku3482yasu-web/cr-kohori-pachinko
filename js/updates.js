// =====================================================================
// アップデート情報 (ゲームを更新したあと、開いたときに一度だけ表示する。2026-10-19 ユーザー指定)
// ---------------------------------------------------------------------
// 更新を公開するときは UPDATES の先頭に1件足す (id は前のものと違えばよい。日付-その日の番号)。
// 前に見た id をブラウザに覚えておき、それより新しいものがあれば起動時に表示する (スロット版と同じ)。
// - はじめて遊ぶとき (前回の続きも見た id もないとき) は表示せず、見たことにする (オープニングを流すため)
// - この仕組みより前から遊んでいる人 (見た id がない) には、いちばん新しい1件だけ表示する
// - 「次から表示しない」にしたときも見たことにする (あとで表示に戻しても、たまった分は出さない)
// 遊び方ページ (howto.html) には全部の更新を出す。
// =====================================================================

const UPDATES = [
    {
        id: '2026-10-19-3',
        date: '2026-10-19',
        title: 'こおりRASH に新しい相手と「怪」',
        items: [
            'こおりRASH の相手に、おかがっぱ・ひびきまくり・シーシャ・ナイテイ・アルアル が加わりました。アルアルは RASH で連チャンしてから現れ、出てきたら勝ち確定です',
            '目が赤く光る「怪」の状態で出てきた相手は、勝てる確率が上がります。怪が出る保留は、入ったときに先バレ音が鳴ってボタンが紫に光ります',
            'こおりRASH のバトルに負けても、復活して撃破することがあります（1/99 では 900個 の当たり）',
            '突破チャレンジのバトル中に入った保留は、4回の勝負のあとに「もうひとつおまけに！」で結果を見せるようにしました',
            '「〇G連確定」の〇を、残りの保留の当たりの数にしました'
        ]
    },
    {
        id: '2026-10-19-2',
        date: '2026-10-19',
        title: 'BGM と設定推測',
        items: [
            'BGM が鳴るようになりました。通常時・SE城前や満月・突破チャレンジ・こおりRASH・おにおにRASH・大当たり中で曲が変わります（「カスタマイズ」で OFF にできます）',
            '「データ」に設定推測を足しました。回転率・トロフィー・ふるカワのセリフから、設定1〜6 の確率を出します'
        ]
    },
    {
        id: '2026-10-19-1',
        date: '2026-10-19',
        title: '図鑑・データカウンター・遊び方ページ',
        items: [
            '「図鑑」で、これまでの記録・見た演出・実績を見られるようになりました。台を選び直しても残ります',
            '「データ」で、この台の大当たり履歴・出玉の推移・回転数のグラフを見られるようになりました',
            'RASH や突破チャレンジが終わったとき、ときどき設定を示すトロフィーが落ちてきます。ふるカワも、たまに台の設定をほのめかします',
            '「遊び方」で、スペック・ゲームの流れ・演出の見方をまとめて読めるようになりました',
            'スマホのホーム画面に追加して、アプリのように遊べるようになりました (https で公開しているとき)'
        ]
    }
];

const UpdateNotes = (() => {
    const SEEN_KEY = 'koori-pachinko-updates-seen';
    const SHOW_KEY = 'koori-pachinko-updates-show';

    function read(key) {
        try {
            return localStorage.getItem(key);
        } catch (e) {
            return null;
        }
    }

    function write(key, value) {
        try {
            localStorage.setItem(key, value);
        } catch (e) {
            // 保存できない環境では毎回初期値
        }
    }

    // lastSeenId より新しい更新 (新しい順)。lastSeenId が一覧にないときは、いちばん新しい1件
    function newerThan(updates, lastSeenId) {
        const i = updates.findIndex(u => u.id === lastSeenId);
        return i >= 0 ? updates.slice(0, i) : updates.slice(0, 1);
    }

    function isEnabled() {
        return read(SHOW_KEY) !== 'off';
    }

    function setEnabled(on) {
        write(SHOW_KEY, on ? 'on' : 'off');
    }

    function markSeen() {
        if (UPDATES.length) write(SEEN_KEY, UPDATES[0].id);
    }

    // 起動時に表示する更新 (表示しないときは空)。呼ぶと見たことになる
    function takePending(firstVisit) {
        const pending = firstVisit || !isEnabled() ? [] : newerThan(UPDATES, read(SEEN_KEY));
        markSeen();
        return pending;
    }

    return { newerThan, isEnabled, setEnabled, takePending, all: () => UPDATES };
})();
