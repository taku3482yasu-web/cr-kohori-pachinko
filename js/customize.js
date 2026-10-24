// =====================================================================
// カスタマイズ (演出・盤面の見た目。ユーザー指定 2026-10-19)
// ---------------------------------------------------------------------
// 遊ぶ人が選べる。当たりやすさ・出玉には関係しない (見た目と演出だけ)。選んだ内容はこのブラウザに保存する。
//   演出: senyomi (先読みの量: なし / チャンス / おすすめ / 熱) / notice (告知: ふつう / 先告知 / 後告知 / 一発告知) / furukawa (よくしゃべる / ふつう / しゃべらない) / vibrate (ボタンの振動) / bgm (BGM)
//   操作: skip (早送り: 台のボタンの長押し) / leverTap (レバーの操作: 引く / タップでもOK) / autoAim (打ち分け)
//   見た目: theme (盤面の色) / ball (玉の色) / koori (こおりくんの色)
// Customize.get('theme') で読む。Customize.onChange(fn) で変わったときに呼ばれる。
// =====================================================================

const Customize = (() => {
    const OPTIONS = {
        senyomi: { label: '先読み', group: '演出',
            note: '大当たりのうち先読み演出 (保留の色・ボタン・SE城前/満月) が出る割合 (占有率)。なし 0% / チャンス 30% / おすすめ 50% / 熱 90%。占有率が高いほどガセが少なく、出たら当たる割合が高い (チャンス 約35% / おすすめ 約60% / 熱 約90%)',
            choices: { none: 'なし', chance: 'チャンス', recommend: 'おすすめ', hot: '熱' }, default: 'recommend' },
        notice: { label: '告知', group: '演出',
            note: '先告知: 当たりの変動が始まったときにボタンが虹色に光る。後告知: 演出なしで、当たりは図柄がばらばらに止まったあとにボタンが虹色に光って図柄がそろう。一発告知: 演出なしで、当たりは変動の始めにボタンが虹色に光る',
            choices: { normal: 'ふつう', pre: '先告知', post: '後告知', oneshot: '一発告知' }, default: 'normal' },
        furukawa: { label: 'ふるカワ', group: '演出', note: '',
            choices: { often: 'よくしゃべる', normal: 'ふつう', off: 'しゃべらない' }, default: 'normal' },
        // レバブル (2026-10-23 ユーザー指定): 保留が 入ったとき・リーチの ときに レバーが 震える。ハンドルブル (2026-10-24) も いっしょ
        leverBuru: { label: 'レバブル', group: '演出', note: '保留が入ったとき・リーチになったときに、レバーがぶるぶる震えることがある (スマホは台のボタン)。保留が入ったときにハンドルが震えることもある (スマホは本体の振動)。出たらチャンス',
            choices: { on: 'あり', off: 'なし' }, default: 'on' },
        // 演出の 強さ (2026-10-24 ユーザー指定): 控えめ は 筐体の 光 (当たりの 虹色 だけ)・震え・振動・可動液晶を 出さない。派手 は 光を 速く、可動液晶も いつも
        fx: { label: '演出の強さ', group: '演出', note: '控えめ: 筐体の光は当たりの虹色だけ、レバー・ボタン・ハンドルの震えと本体の振動、可動液晶を出さない (夜に遊ぶとき向け)。派手: 筐体の光が速く流れ、可動液晶もいつも出す',
            choices: { quiet: '控えめ', normal: 'ふつう', flashy: '派手' }, default: 'normal' },
        // 可動液晶 (2026-10-23 アップグレード P1): 見せ場で 液晶が 前に せり出して 大きくなる
        lcdZoom: { label: '可動液晶', group: '演出', note: 'バトル・全回転・大当たりの はじまりなどの 見せ場で、液晶が 盤面の 前に せり出して 大きくなる (見た目だけ。玉の 動きは そのまま)',
            choices: { on: 'あり', off: 'なし' }, default: 'on' },
        vibrate: { label: 'ボタンの振動', group: '演出', note: 'スマホの本体の振動',
            choices: { on: 'ON', off: 'OFF' }, default: 'on' },
        // 音量 (2026-10-24 ユーザー指定)。VOLUMES の 倍率
        bgmVolume: { label: 'BGM の音量', group: '演出', note: 'BGM の大きさ (「BGM: OFF」・「音: OFF」のときは鳴らない)',
            choices: { low: '小', normal: 'ふつう', high: '大' }, default: 'normal' },
        seVolume: { label: '効果音の音量', group: '演出', note: '効果音・ファンファーレ・入賞時の音の大きさ',
            choices: { low: '小', normal: 'ふつう', high: '大' }, default: 'normal' },
        // 当たりの 役物 (2026-10-24 ユーザー指定): 通常時の バトルの 当たりで 役物が 変形する 演出 (約 6 秒)。RASH 中の プレミアは なし 以外 いつも
        yaku: { label: '当たりの役物', group: '演出', note: '通常時のバトルで勝ったとき、役物が絵本のように開いて こおりくんに変形する演出 (約 6 秒)。ときどき: 3 回に 1 回くらい',
            choices: { always: '毎回', sometimes: 'ときどき', off: 'なし' }, default: 'always' },
        bgm: { label: 'BGM', group: '演出', note: '通常時・突破チャレンジ・RASH・大当たり中で曲が変わる (「音: OFF」のときは鳴らない)',
            choices: { on: 'ON', off: 'OFF' }, default: 'on' },
        skip: { label: '早送り', group: '操作', note: '台のボタン (B キー) を長押しすると、演出を結果の手前まで飛ばす (2026-10-20)',
            choices: { on: 'ON', off: 'OFF' }, default: 'on' },
        // レバーの 操作 (2026-10-24 ユーザー指定): 引く (下へ ドラッグ・↓ キー) / タップでもOK (レバー・台の ボタンを 押すだけで 引ける)
        leverTap: { label: 'レバーの操作', group: '操作', note: '「レバーを引け！」のとき。引く: レバーをつかんで下へ引く (↓ キーでも)。タップでもOK: レバーやこおりくんのボタン (B キー) を押すだけでも引ける (片手で遊ぶとき・引くのが苦手なとき向け)',
            choices: { off: '引く', on: 'タップでもOK' }, default: 'off' },
        autoAim: { label: '打ち分け', group: '操作', note: '自動: 台の状態に合わせて、強さを左打ち・右打ちに自動で合わせる',
            choices: { off: '手動', on: '自動' }, default: 'off' },
        theme: { label: '盤面の色', group: '見た目', note: '',
            choices: { crimson: '紅', ice: '氷', sunset: '夕焼け', sakura: '夜桜', gold: '黄金' }, default: 'crimson' },
        ball: { label: '玉の色', group: '見た目', note: '',
            choices: { silver: '銀', gold: '金' }, default: 'silver' },
        koori: { label: 'こおりくんの色', group: '見た目', note: '液晶の図柄・ボタンの色も変わる',
            choices: { normal: 'ノーマル', ichigo: 'いちご', melon: 'メロン', lemon: 'レモン' }, default: 'normal' }
    };

    // 盤面の色 (render.js の COLORS を上書き)
    const THEMES = {
        // 紅 (2026-10-23 からの ふつう。render.js の BASE_COLORS)。氷は 前の ふつうの 色
        crimson: {},
        ice: { boardTop: '#0d2a4a', boardBottom: '#071528', snow: 'rgba(200, 235, 255, 0.35)', rail: '#c8d4e0', railShadow: '#56657a', frame: '#1b3a6b', frameLight: '#7fd3f7', frameDark: '#0b1a33',
            stage: '#bff0ff', stageShade: '#4aa8e0', accent: '#7fd3f7', accentDark: '#0b1a33', skyline: '#081830', window: '#bff0ff', deco: 'rgba(127, 211, 247, 0.1)' },
        sunset: { boardTop: '#4a1e3a', boardBottom: '#1a0a1a', snow: 'rgba(255, 200, 150, 0.35)', frame: '#6a2a2a', frameLight: '#ffb070', frameDark: '#2a0a0a', stage: '#ffd8a0', stageShade: '#e08040',
            accent: '#ff9a4a', accentDark: '#2a0a0a', skyline: '#1a0810', window: '#ffd080', deco: 'rgba(255, 176, 112, 0.1)' },
        sakura: { boardTop: '#1a0f2a', boardBottom: '#0a0614', snow: 'rgba(255, 180, 210, 0.5)', frame: '#5a2a4a', frameLight: '#ff9ec8', frameDark: '#200a18', stage: '#ffd0e4', stageShade: '#d06a9a',
            accent: '#ff7ab0', accentDark: '#200a18', skyline: '#10061a', window: '#ffd0e4', deco: 'rgba(255, 158, 200, 0.1)' },
        gold: { boardTop: '#3a2a08', boardBottom: '#140c02', snow: 'rgba(255, 230, 120, 0.4)', frame: '#6a4a10', frameLight: '#ffe066', frameDark: '#201402', stage: '#fff0a0', stageShade: '#c8a030',
            accent: '#ffd84a', accentDark: '#201402', skyline: '#140c02', window: '#fff0a0', deco: 'rgba(255, 224, 102, 0.1)' }
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

    // 音量の 倍率
    const VOLUMES = { low: 0.45, normal: 1, high: 1.6 };
    const volume = key => VOLUMES[get(key)] || 1;

    return { OPTIONS, load, get, set, onChange, boardColors, volume };
})();
