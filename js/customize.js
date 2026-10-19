// =====================================================================
// カスタマイズ (演出・盤面の見た目。ユーザー指定 2026-10-19)
// ---------------------------------------------------------------------
// 遊ぶ人が選べる。当たりやすさ・出玉には関係しない (見た目と演出だけ)。選んだ内容はこのブラウザに保存する。
//   演出: senyomi (先読みの量: なし / チャンス / おすすめ / 熱) / notice (告知: ふつう / 先告知) / furukawa (よくしゃべる / ふつう / しゃべらない) / vibrate (ボタンの振動)
//   見た目: theme (盤面の色) / ball (玉の色) / koori (こおりくんの色)
// Customize.get('theme') で読む。Customize.onChange(fn) で変わったときに呼ばれる。
// =====================================================================

const Customize = (() => {
    const OPTIONS = {
        senyomi: { label: '先読み', group: '演出',
            note: '大当たりのうち先読み演出 (保留の色・ボタン・SE城前/満月) が出る割合 (占有率)。なし 0% / チャンス 30% / おすすめ 50% / 熱 90%。占有率が高いほどガセが少ない',
            choices: { none: 'なし', chance: 'チャンス', recommend: 'おすすめ', hot: '熱' }, default: 'recommend' },
        notice: { label: '告知', group: '演出', note: '先告知: 当たりの変動が始まったときにボタンが虹色に光って教えてくれる',
            choices: { normal: 'ふつう', pre: '先告知' }, default: 'normal' },
        furukawa: { label: 'ふるカワ', group: '演出', note: '',
            choices: { often: 'よくしゃべる', normal: 'ふつう', off: 'しゃべらない' }, default: 'normal' },
        vibrate: { label: 'ボタンの振動', group: '演出', note: 'スマホの本体の振動',
            choices: { on: 'ON', off: 'OFF' }, default: 'on' },
        theme: { label: '盤面の色', group: '見た目', note: '',
            choices: { ice: '氷', sunset: '夕焼け', sakura: '夜桜', gold: '黄金' }, default: 'ice' },
        ball: { label: '玉の色', group: '見た目', note: '',
            choices: { silver: '銀', gold: '金' }, default: 'silver' },
        koori: { label: 'こおりくんの色', group: '見た目', note: '液晶の図柄・ボタンの色も変わる',
            choices: { normal: 'ノーマル', ichigo: 'いちご', melon: 'メロン', lemon: 'レモン' }, default: 'normal' }
    };

    // 盤面の色 (render.js の COLORS を上書き)
    const THEMES = {
        ice: {},
        sunset: { boardTop: '#4a1e3a', boardBottom: '#1a0a1a', snow: 'rgba(255, 200, 150, 0.35)', frame: '#6a2a2a', frameLight: '#ffb070', frameDark: '#2a0a0a', stage: '#ffd8a0', stageShade: '#e08040' },
        sakura: { boardTop: '#1a0f2a', boardBottom: '#0a0614', snow: 'rgba(255, 180, 210, 0.5)', frame: '#5a2a4a', frameLight: '#ff9ec8', frameDark: '#200a18', stage: '#ffd0e4', stageShade: '#d06a9a' },
        gold: { boardTop: '#3a2a08', boardBottom: '#140c02', snow: 'rgba(255, 230, 120, 0.4)', frame: '#6a4a10', frameLight: '#ffe066', frameDark: '#201402', stage: '#fff0a0', stageShade: '#c8a030' }
    };
    const BALLS = {
        silver: {},
        gold: { ball: '#ffe680', ballShade: '#a07810', ballLight: '#fffbe0' }
    };
    // こおりくんの色 (sprites.js の SPRITES.koori.palette の c: 明 / b: 影 / d: 足)
    const KOORI = {
        normal: { c: '#bff0ff', b: '#7fd3f7', d: '#4aa8e0' },
        ichigo: { c: '#ffd0dc', b: '#ff8aa8', d: '#e0507a' },
        melon: { c: '#d4f8c0', b: '#8ae070', d: '#4ab040' },
        lemon: { c: '#fff6b0', b: '#ffe050', d: '#e0b020' }
    };
    // 台のボタン (CSS) の色
    const BUTTON = {
        normal: 'linear-gradient(135deg, #ffffff 0%, #bff0ff 35%, #7fd3f7 100%)',
        ichigo: 'linear-gradient(135deg, #ffffff 0%, #ffd0dc 35%, #ff8aa8 100%)',
        melon: 'linear-gradient(135deg, #ffffff 0%, #d4f8c0 35%, #8ae070 100%)',
        lemon: 'linear-gradient(135deg, #ffffff 0%, #fff6b0 35%, #ffe050 100%)'
    };

    const KEY = 'koori-pachinko-customize';
    let values = {};
    const listeners = [];

    function load() {
        try { values = JSON.parse(localStorage.getItem(KEY) || '{}') || {}; } catch (e) { values = {}; }
        Object.entries(OPTIONS).forEach(([k, o]) => { if (!(values[k] in o.choices)) values[k] = o.default; });
        apply();
    }

    function get(key) {
        return values[key] ?? OPTIONS[key].default;
    }

    function set(key, value) {
        if (!OPTIONS[key] || !(value in OPTIONS[key].choices)) return;
        values[key] = value;
        try { localStorage.setItem(KEY, JSON.stringify(values)); } catch (e) { /* 保存できない環境 */ }
        apply();
        listeners.forEach(fn => fn(key, value));
    }

    function onChange(fn) {
        listeners.push(fn);
    }

    // こおりくんの色をドット絵に反映する
    function apply() {
        if (typeof SPRITES !== 'undefined') Object.assign(SPRITES.koori.palette, KOORI[get('koori')]);
        if (typeof Figures !== 'undefined' && Figures.clearCache) Figures.clearCache();
        if (typeof document !== 'undefined') document.documentElement.style.setProperty('--koori-button', BUTTON[get('koori')]);
    }

    // 盤面の色 (テーマ + 玉)
    function boardColors() {
        return { ...THEMES[get('theme')], ...BALLS[get('ball')] };
    }

    return { OPTIONS, load, get, set, onChange, boardColors };
})();
