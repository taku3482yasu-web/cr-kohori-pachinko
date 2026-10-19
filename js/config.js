// =====================================================================
// 調整用の数値 (盤面の形・玉の物理・発射・賞球)
// ---------------------------------------------------------------------
// 座標は盤面の論理座標 (横 board.width x 縦 board.height)。左上が (0, 0)、下向きが +y。
// 角度は度で、右が 0°、上が 90° (数学と同じ向き。画面の y は下向きなので変換して使う)。
// 数値はすべて仮値。tools/test.html で打ち出しの強さごとの入賞率を測って調整する。
// =====================================================================

const CONFIG = {
    debug: true,

    board: {
        width: 360,
        height: 500,
        // 外レール・内レールは同じ中心の円弧
        center: { x: 180, y: 235 },
        outerRadius: 170,
        innerRadius: 159,
        outerArc: { from: 200, to: -25 },   // 左下から上を回って右下まで
        innerArc: { from: 200, to: 125 },   // 左下から左上まで (外レールとの間が発射の通り道)
        bottomY: 478,                       // これより下に落ちた玉はアウト

        // 液晶の枠 (玉は入れない)。上は山形の屋根 (平らだと玉が乗ったまま止まる): 両端の高さ shoulder、真ん中の高さ top
        lcdFrame: { left: 88, right: 272, top: 100, shoulder: 121, bottom: 220 },
        // 液晶の画面 (枠の内側)。256x144 の絵を縮めて表示する
        lcd: { x: 94, y: 122, w: 172, h: 96 },
        // 液晶の左のワープ入口 (左上の角と幅・高さ) → 液晶の下のステージへ
        // 屋根から枠ぞいに落ちてくる玉はそのまま入らないよう、右向き (枠のほう) に minVx 以上で動いている玉だけ入る
        warp: { x: 78, y: 146, w: 8, h: 16, minVx: 15, exitX: 100, exitY: 223, exitVx: 70 },
        // ステージの床 (折れ線)。中央の切れ目 (gap) から落ちるとヘソのほぼ真上
        stage: {
            left: [[94, 227], [127, 235], [172, 230]],
            right: [[188, 230], [233, 235], [266, 227]],
            // 床の一番低いところの穴 (手前にこぼれる)
            spills: [{ x: 127, y: 232 }, { x: 233, y: 232 }],
            spillWidth: 6
        },
        // 返しゴム: 外レールを右まで回ってきた玉を、右打ちの通り道へ跳ね返す (外レールの角度 angle から内側へ length)
        rubber: { angle: 22, length: 16, tilt: 35 },
        // 右打ちの通り道を分ける壁
        rightDivider: [[276, 234], [264, 300], [262, 392]],
        // 右打ちのガイド (壁の折れ線)。ゲートへは全部の玉を通し、電チューのまわりは玉が横を抜けられるすき間を残す
        guides: [
            [[278, 240], [293.5, 264]],            // ゲートへ (左)
            [[336, 246], [306.5, 264]],            // ゲートへ (右)
            [[276, 296], [285, 326]],              // 電チューへ (左)
            [[322, 296], [311, 326]]               // 電チューへ (右)
        ],

        // 入賞口 (x: 中心, y: 入口の高さ, width: 両脇の柱 (釘) のすき間)。玉の直径は 6
        pockets: {
            heso:     { x: 180, y: 330, width: 6.8, payout: 'heso' },
            denchu:   { x: 298, y: 340, width: 6.8, payout: 'denchu', kind: 'denchu' },
            attacker: { x: 300, y: 406, width: 60, payout: 'attacker', kind: 'attacker' },   // 右の柱は外の壁にくっつける (すき間に玉がはさまらない)
            general1: { x: 78,  y: 392, width: 6.8, payout: 'general' },
            general2: { x: 232, y: 400, width: 6.8, payout: 'general' }
        },
        // スルーゲート (玉が通り抜けると反応する。普図の抽選は段階2)
        gates: {
            gate: { x: 300, y: 270, width: 7 }
        },
        // 風車 (一定の速さで回る羽根)。omega は 1秒に回る角度 (度、時計回りが +)
        windmills: [
            { x: 62, y: 262, radius: 9, blades: 4, omega: 300 }
        ],

        // 釘の並び。grid: 範囲を間隔で埋める (stagger で1段ごとに半分ずらす)。line: 線の上に等間隔
        // keepout の中・盤面の外・液晶の枠のまわりには打たない。入賞口の柱 (命釘など) は入賞口から自動で作る
        nailRadius: 1.3,
        nails: [
            // 液晶の上 (天釘)
            { type: 'grid', x0: 70, x1: 290, y0: 82, y1: 104, dx: 11, dy: 10, stagger: true },
            // 左の上半分
            { type: 'grid', x0: 36, x1: 92, y0: 112, y1: 236, dx: 11, dy: 11, stagger: true },
            // 風車の下から道釘まで
            { type: 'grid', x0: 38, x1: 92, y0: 278, y1: 294, dx: 12, dy: 10, stagger: true },
            // 道釘 (ヘソへ転がす線。間隔は玉より狭い)
            { type: 'line', from: [66, 282], to: [158, 323], spacing: 3.2 },
            // ジャンプ釘・寄り釘
            { type: 'points', points: [[150, 306], [166, 300], [194, 300], [172, 318], [188, 318]] },
            // ヘソの下
            { type: 'grid', x0: 44, x1: 250, y0: 348, y1: 440, dx: 14, dy: 13, stagger: true },
            // ステージの下 (ステージからこぼれた玉が当たる)
            { type: 'grid', x0: 104, x1: 256, y0: 244, y1: 290, dx: 16, dy: 14, stagger: true },
            // 右打ち: ゲートの下 (電チューの上で玉を散らす)
            { type: 'grid', x0: 280, x1: 320, y0: 278, y1: 290, dx: 12, dy: 12, stagger: true },
            // 右打ち: 電チューの下からアタッカーまで
            { type: 'grid', x0: 272, x1: 330, y0: 356, y1: 384, dx: 13, dy: 12, stagger: true }
        ],
        keepout: [
            { type: 'circle', x: 62, y: 262, r: 15 },         // 風車
            { type: 'rect', x0: 172, x1: 188, y0: 226, y1: 300 }, // ステージ中央からヘソへの落下路
            { type: 'rect', x0: 170, x1: 190, y0: 324, y1: 346 }, // ヘソ
            { type: 'rect', x0: 292, x1: 308, y0: 264, y1: 280 }, // ゲート
            { type: 'rect', x0: 290, x1: 306, y0: 334, y1: 352 }, // 電チュー
            { type: 'rect', x0: 260, x1: 336, y0: 388, y1: 420 }, // アタッカー
            { type: 'rect', x0: 70, x1: 86, y0: 384, y1: 402 },   // 一般入賞口
            { type: 'rect', x0: 224, x1: 240, y0: 392, y1: 410 },
            { type: 'rect', x0: 258, x1: 282, y0: 222, y1: 396 }  // 右打ちの壁
        ]
    },

    ball: {
        radius: 3,
        gravity: 420,        // 盤面は傾いているので実際の重力より小さい
        substeps: 10,        // 1フレームを何回に分けて計算するか (多いほど正確で重い)
        maxBalls: 60,
        // 当たったときの跳ね返り (restitution) と、面に沿った速さの残り (friction)
        surfaces: {
            nail: { restitution: 0.5, friction: 0.97 },
            rail: { restitution: 0.15, friction: 0.9998 },
            wall: { restitution: 0.3, friction: 0.9995 },
            stage: { restitution: 0.2, friction: 0.999 },
            windmill: { restitution: 0.4, friction: 0.9 },
            rubber: { restitution: 0.55, friction: 0.9 }
        },
        jitter: 6,           // 釘に当たったとき速さに足すゆらぎ (毎回同じ動きにならないように)
        // 速さ speed 未満が after 秒続いたら、速さ kick で軽くゆらす (止まったまま 3 秒でアウト)
        stall: { speed: 8, after: 0.4, kick: 40 }
    },

    launch: {
        x: 25.4,             // 発射位置 (外レールと内レールの間)
        y: 470,
        speedMin: 560,       // 強さ 0 のときの初速
        speedMax: 680,       // 強さ 100 のとき
        noise: 0.006,        // 初速のぶれ (割合)
        interval: 0.6,       // 発射の間隔 (秒)。1分に100発
        foulY: 474,          // 戻ってきてこれより下に来たらファール (玉は上皿に戻る)
        defaultStrength: 30,
        // 「左打ち」「右打ち」ボタンで合わせる強さ
        presets: { left: 30, right: 95 }
    },

    // 賞球 (入賞1個あたりに払い出す玉の数)。アタッカー 15 はユーザー指定。ヘソ・一般入賞口は出玉率を 80〜95% にするため少なめ
    payout: { heso: 1, denchu: 1, general: 5, attacker: 15 },

    balls: {
        start: 250,          // はじめの持ち玉
        lend: 125            // 「玉貸し」1回で増える数 (500円分)
    },

    // ----- 設定 1〜6 (ユーザー指定 2026-10-19。一度なくしたが、また作った) -----
    // 設定ごとに釘を変える (釘調整)。回転率 (1000円 = 250発あたりの回転数) を 設定1 約12 〜 設定6 約40 の等間隔にする
    // 出玉率は回転率しだい (設定1 は低く、設定6 は大きく勝てる。ユーザー指定)。両スペック共通
    //   hesoWidth: ヘソの命釘のすき間 (玉の直径は 6。広いほど入りやすい)
    //   warpMinVx: ワープに入る速さ (大きいほど入りにくい = ステージ経由のヘソ入賞が減る)
    //   rotation: 回転率の目標 (tools/simulate.html で測って合わせる)
    settings: [
        { rotation: 12, hesoWidth: 6.5, warpMinVx: 40 },
        { rotation: 17.6, hesoWidth: 8.0, warpMinVx: 15 },
        { rotation: 23.2, hesoWidth: 9.9, warpMinVx: 15 },
        { rotation: 28.8, hesoWidth: 12.2, warpMinVx: 15 },
        { rotation: 34.4, hesoWidth: 15, warpMinVx: 15 },
        { rotation: 40, hesoWidth: 19, warpMinVx: 15 }
    ],

    // ----- スペック (ゲームを始める前に選ぶ。ユーザー指定 2026-10-19、1/99・1/159 に変更) -----
    // 大当たりの振り分け: label (表示する出玉) / rounds (ラウンド数) / count (1ラウンドに入る玉の数。省略は machine.bonus.count)
    //   / next (終わったあと。'normal' = 通常時 / 'jitan' = 時短)。賞球 15 なので 1ラウンド 10カウント = 150個
    //   200個 は 2R x 7C = 210個、1300個 は 9R x 10C = 1350個 にした (賞球 15 ではちょうどにならないため)
    // firstHit: 通常時の特図1 (ヘソ) で当たったとき / rushHit: 特図2 (電チュー) の大当たり・小当たりからの V 入賞
    // 時短の流れ: 初当たりのあとの時短 = 突破チャレンジ。電チューの保留がたまったらバトルにして、その保留 (最大4つ) のどれかで
    //   当たれば RASH 突入 (突破率は challengeSmallRate で合わせる)。RASH 中は大当たりのたびに時短 jitan.spins 回
    //   (時短が終わったあとの残り保留でも小当たりを引ける。tools/simulate.html で測って合わせる)
    // payout: スペックごとの賞球 (config.payout より優先。書いた入賞口だけ変わる)
    specs: {
        s99: {
            label: '1/99',
            note: '甘い確率。初当たりの半分が突破チャレンジ (50%) へ。RUSH は継続率 約79%、半分が 900個',
            hitRate: 1 / 99,
            smallRate: 1 / 8,   // 継続率 79% に合わせた (V に入るまで開くようにしてから)
            firstHit: [
                { weight: 50, label: 200, rounds: 2, count: 7, next: 'normal' },   // 200個のみ
                { weight: 50, label: 200, rounds: 2, count: 7, next: 'jitan' }     // 200個 + 突破チャレンジ
            ],
            rushHit: [
                { weight: 50, label: 200, rounds: 2, count: 7, next: 'jitan' },    // 200個
                { weight: 50, label: 900, rounds: 6, next: 'jitan' }               // 900個
            ],
            challengeSmallRate: 1 / 6.7,   // 突破チャレンジ中に電チューに入った保留の小当たり (突破率 50% に合わせる。1/7 で 47〜48%)
            jitan: { challengeSpins: 1, spins: 6 },
            payout: { heso: 2 },   // 賞球をこのスペックだけ変える (1/99 は当たりが小さいので、ヘソを 2 にして出玉率を上げた)
            target: { challenge: 0.5, continuation: 0.79 }
        },
        s159: {
            label: '1/159',
            note: '初当たりの 75% が突破チャレンジ (50%) へ。RUSH は継続率 約80%、すべて 1300個',
            hitRate: 1 / 159,
            smallRate: 1 / 7.7,   // 継続率 80% に合わせた (V に入るまで開くようにしてから)
            firstHit: [
                { weight: 25, label: 300, rounds: 2, next: 'normal' },   // 300個のみ
                { weight: 75, label: 300, rounds: 2, next: 'jitan' }     // 300個 + 突破チャレンジ
            ],
            rushHit: [
                { weight: 100, label: 1300, rounds: 9, next: 'jitan' }   // 1300個
            ],
            challengeSmallRate: 1 / 6.7,   // 突破チャレンジ中に電チューに入った保留の小当たり (突破率 50% に合わせる。1/7 で 47〜48%)
            jitan: { challengeSpins: 1, spins: 6 },
            target: { challenge: 0.5, continuation: 0.80 }
        }
    },

    // ----- 抽選と動きの時間 (両スペック共通) -----
    machine: {
        holdMax: 4,                  // 保留の上限 (特図1・特図2 それぞれ)
        // 特図2 の変動時間 (秒)。特図1 の変動時間は演出の流れ (config.show) で決まる (js/scenario.js)
        spin: {
            fig2: { miss: 2, small: 3, hit: 6 }
        },
        // 小当たり: アタッカーが V に入るまで開いている (最大 open 秒)。入った玉で V 入賞 → 大当たり (rushHit)
        //   演出で「当たり」と見せたあとに V に入らないことがないように (2026-10-19。前は 1.8秒だけ開いて V入賞率 約93%)
        small: { open: 8 },
        // 大当たり: opening (秒) → ラウンド (count 個入るか maxTime 秒で閉じる) → interval → … → ending
        bonus: { opening: 3, count: 10, maxTime: 25, interval: 1.5, ending: 4 },
        // 普図 (ゲートで抽選 → 電チューが開く)。support = 時短中 (電サポ)
        futsu: {
            normal: { rate: 1 / 16, spin: 12, opens: 1, open: 0.2, gap: 0 },
            support: { rate: 1, spin: 1, opens: 3, open: 1.6, gap: 0.4 },
            holdMax: 4,
            denchuCount: 4           // 1回の当たりで電チューに入る玉の上限 (超えると閉じる)
        }
    },

    // ----- 演出 (段階3。ユーザー指定 2026-10-19) -----
    show: {
        // 図柄 1〜7。奇数は赤、偶数は青 (ユーザー指定)。ids は図柄に描くキャラクター
        figures: {
            1: { name: 'ふるカワ', ids: ['furukawa'] },
            2: { name: 'ひびきまくり', ids: ['hibikimakuri'] },
            3: { name: 'おにおに', ids: ['onioni'] },
            4: { name: 'おかがっぱ', ids: ['okagappa'] },
            5: { name: 'シバター', ids: ['shibata'] },
            6: { name: 'やすさん・たむさん・だけさん', ids: ['yasu', 'tamu', 'dake'] },
            7: { name: 'こおりくん', ids: ['koori'] }
        },
        figureColors: { odd: '#ff3a4a', even: '#3a8aff' },
        // 大当たりでそろう図柄: 時短 (突破チャレンジ) へ行く初当たりと、RUSH 中の大きい当たり (bigLabel 個以上) は奇数 (赤)、
        // それ以外 (時短なしの初当たり・RUSH 中の 200個) は偶数 (青)
        bigLabel: 900,
        hitFigures: { odd: [1, 3, 5, 7], even: [2, 4, 6] },
        // 昇格 (ユーザー指定 2026-10-19): 奇数図柄の当たりのうち rate (40%) は偶数図柄でそろえて見せ、ラウンド中に図柄が現れて奇数に昇格する
        //   delay: 1ラウンド目が始まってから現れるまで (秒) / time: 昇格の演出の長さ (秒)
        //   昇格するまでは、大当たりの画面の「〇個」・総ラウンド数・ふるカワの「大きいのきた！」を出さない (中身がばれないように。Claude が決めた)
        promote: { rate: 0.4, delay: 1.5, time: 3.5 },

        // 保留の色 (こおりくんの体の形)。期待度は低い順に 白 → 青 → 緑 → 紫 → 赤 → 虹。虹は大当たり確定 (ユーザー指定)
        // 玉がヘソに入ったときに、当たり・外れごとの重みで決める
        holdColors: {
            order: ['white', 'blue', 'green', 'purple', 'red', 'rainbow'],
            hit: { white: 10, blue: 12, green: 15, purple: 20, red: 28, rainbow: 15 },
            miss: { white: 900, blue: 60, green: 25, purple: 10, red: 1.7, rainbow: 0 },   // 赤は外れで出にくくして期待度を上げた (2026-10-19 ユーザー指定。5 → 1.7)
            colors: { white: '#e8f6ff', blue: '#4f9bff', green: '#3fdf6f', purple: '#c070ff', red: '#ff3a3a' }
        },

        // 先読みの量 (カスタマイズで選ぶ。ユーザー指定 2026-10-19)
        //   occ: 占有率 = 大当たりのうち先読み演出 (保留の色・ボタン・高確率ステージ) が出る割合
        //   fake: 外れのときに出る先読み (ガセ) の量 (1 = holdColors.miss などの重みのまま)。占有率が高いほどガセを少なくする (ユーザー指定。値は Claude が決めた)
        //   → 占有率が高いほど、先読みが出たときの信頼度が高い
        //   base: holdColors.hit などの重みのときの占有率 (ボタン・高確率ステージの当たりでの出やすさの基準)
        //   change: 色が付く保留のうち、最初は白で出して途中で色が変わる (保留変化) 割合 (当たり hitRate / 外れ missRate)。self: その保留の変動が始まるとき / それ以外: 保留が1つ進むとき
        senyomi: {
            levels: {
                none: { occ: 0, fake: 0 },
                chance: { occ: 0.3, fake: 1 },
                recommend: { occ: 0.5, fake: 0.6 },
                hot: { occ: 0.9, fake: 0.3 }
            },
            base: 0.9,
            // 保留変化は当たりの保留で起きやすい (hitRate) / 外れで起きにくい (missRate)。保留変化したら外れでも必ずチャレンジ演出に入る (ユーザー指定)
            change: { hitRate: 0.7, missRate: 0.1, self: 0.5 }
        },
        // 入賞時の音 (ユーザーが録音した sounds/heso.m4a。js/sound-heso.js に埋め込み): ヘソに入ったときにこの音が鳴って、台のボタンが赤く光る
        //   hitRate: 当たりの保留で鳴る割合 (占有率 60%。ユーザー指定) / reliability: ガセの量の基準 (fake 1 のとき鳴ったら当たりの割合)
        //   start〜end: 録音のうち鳴らすところ (秒。前後の無音を切った) / gain: 音量 (録音が小さめなので大きくする)
        voice: { hitRate: 0.6, reliability: 0.4, start: 1.3, end: 3.5, gain: 4 },   // 録音の2つの音のうち長いほう (ユーザー指定)

        // 台のボタン (こおりくんの体の形)。ヘソに入ったときに 赤く光る・ぶるぶる震える・高い音 のどれかが起きる (ユーザー指定)
        // 起きたらその保留の当たりの確率が reliability (約60%) になるよう、外れのときに起きる確率を自動で計算する
        button: {
            hitRate: 0.3,            // 当たりの保留で起きる確率
            reliability: 0.6,        // 起きたときに当たっている確率 (ユーザー指定)
            kinds: { red: 40, shake: 30, beep: 30 },
            hitOnlyKinds: { rainbow: 20 },   // 当たりのときだけ選ぶ種類 (虹色は確定)
            time: 1.2                // 光る・震える・鳴る時間 (秒)
        },
        // RASH 中・突破チャレンジ中のボタン (ユーザー指定): 当たりの保留の hitRate (60%) で震える・赤くなる・虹色になる。外れでは起きない
        rashButton: {
            hitRate: 0.6,
            kinds: { shake: 35, red: 35, rainbow: 30 }
        },

        // ----- 突破チャレンジ (段階4。ユーザー指定 2026-10-19) -----
        // おにおにとのバトル。電チューの保留が holdMax 個たまる (または gatherTimeout 秒たつ) と始まり、保留1つが1ラウンド。
        // どれかの保留で当たれば突破。保留ごとにこおりくんの武器が変わる (期待度の低い順。おにおに絶対殺す剣は確定)
        //   hit / miss: 当たり・外れの保留で選ぶ重み
        challengeBattle: {
            gatherTimeout: 15,
            weapons: {
                fist: { name: '素手', hit: 10, miss: 80 },
                sword: { name: 'ハルキソード', hit: 25, miss: 15 },
                hammer: { name: 'ハルキハンマー', hit: 40, miss: 5 },
                oniKiller: { name: 'おにおに絶対殺す剣', hit: 25, miss: 0 }
            },
            // 1ラウンド目の前の登場 (intro)、途中のラウンド (round)、最後のラウンド (final) と結果 (result) の秒
            timing: { intro: 3, round: 3.5, final: 5, result: 2.5 },
            map: 'castleHall'
        },

        // ----- RASH (段階4。ユーザー指定) -----
        // RASH 突入の大当たり中に、こおりRASH / おにおにRASH を選ぶ (選ばなければ defaultMode)
        rash: {
            defaultMode: 'koori',
            modes: {
                koori: { name: 'こおりRASH', note: 'バトルで勝てば当たり' },
                onioni: { name: 'おにおにRASH', note: 'おにおにが開眼すれば当たり' }
            }
        },
        // こおりRASH: 当たりの保留と、最後の保留 (このあと時短も保留もない) は必ずバトル。外れでもときどきバトル (成功率から自動で計算)
        //   相手 (成功率の低い順。ゴールド金面犬は確定)。hit: 当たりのときの重み / win: 成功率 (Claude が決めた。金面犬の確定はユーザー指定)
        kooriRash: {
            timing: { roll: 1, battle: 5, result: 2 },
            lastShare: 0.02,   // RASH の変動のうち「最後の保留」になる割合 (測った値。外れのバトルの割合の計算に使う)
            enemies: {
                shibata: { name: 'シバター', hit: 15, win: 0.15, map: 'ebisucho' },
                sasaki: { name: 'Mr.SASAKI', hit: 25, win: 0.35, map: 'tsugakuro' },
                onioni: { name: 'おにおに', hit: 40, win: 0.7, map: 'castleHall' },
                goldDog: { name: 'ゴールド金面犬', hit: 20, win: 1, map: 'goldHall' }
            }
        },
        // ブラックアウト (RASH 中の突発当たり。こおりRASH・おにおにRASH 共通。ユーザー指定 2026-10-19)
        //   RASH 中の当たりの rate の割合で、前ぶれなく暗転 → 虹色のこおりくん → 「当たり」(虹色の文字) → 「こおりがいただいた！」で虹色にフラッシュ
        //   rate は Claude が決めた
        blackout: {
            rate: 0.12,
            timing: { dark: 1.2, koori: 1.5, atari: 1.5, itadaki: 1.8 }
        },
        // オープニング・エンディング (段階6。ユーザー指定): エンディングは RASH の endingAt 回目の大当たりのラウンド中に流す
        story: { endingAt: 10 },
        // RASH の大当たりのあと: 「〇回目」を大きく出してから「〇〇RASH」で続ける (秒。大当たりの ending の中で出す)
        rashCount: { countTime: 2.2 },
        // おにおにRASH: 真ん中でおにおにが椅子に座っている。当たりのときだけ違和感が起きて開眼する (外れでは何も起きない)
        //   wait → anomaly (違和感) → open (開眼) の秒。patterns は当たりのときに選ぶ重み
        onioniRash: {
            timing: { wait: 1.5, anomaly: 3, open: 2 },
            // upsideDown・koori・tomoishi・naitei は 2026-10-19 にユーザー指定で追加。flip は左右反転にした (上下は upsideDown)
            patterns: {
                open: { name: 'そのまま開眼', weight: 20 },
                rainbow: { name: 'おにおにが虹色', weight: 13 },
                flip: { name: '画面が左右反転', weight: 10 },
                upsideDown: { name: '画面が上下逆', weight: 10 },
                mono: { name: '白黒', weight: 10 },
                zoom: { name: '顔がドアップ', weight: 12 },
                koori: { name: 'こおりくんが現れる', weight: 10 },
                tomoishi: { name: 'ともいしのカットイン「内定とりなさい！」', weight: 8 },
                naitei: { name: 'シーシャ・ナイテイ・ナイナイのカットイン「内定は…！」', weight: 7 }
            }
        },
        // RASH 中の保留 (ユーザー指定 2026-10-19): 当たりの保留の rate で、黒い保留か回る保留になる。外れでは出ない (出たら当たり確定)
        rashHolds: { rate: 0.25, kinds: { black: 50, spin: 50 } },

        // 通常時のステージ (背景。ユーザー指定 2026-10-19)
        //   cycle の順に interval 回転ごとに変わる (回転数は Claude が決めた)
        //   hi: 当たりの見込みが高い保留があると、高確率ステージ (SE城前・満月) に移ることがある。その保留を消化したら元のステージに戻る
        //     当たりの保留で hitRate、外れは「移ったら当たりの割合が reliability」になる確率で移る
        //   quick: ステージが変わってから window 回転以内に当たりの保留があれば、rate (約50%) ですぐ次のステージに変わる (当たり濃厚)
        //     外れでは起きない。外れの保留はこの間、高確率ステージにも移らない (濃厚の合図とまぎらわしくならないように)
        stages: {
            cycle: ['tsugakuro', 'kokuraStation', 'ongagawa', 'gameCenter', 'ishinokawa'],
            names: {
                tsugakuro: '通学路', kokuraStation: '小倉駅', ongagawa: '遠賀川', gameCenter: 'ゲームセンター', ishinokawa: '石の川',
                seCastle: 'SE城前', fullMoon: '満月'
            },
            interval: 30,
            hi: { ids: ['seCastle', 'fullMoon'], hitRate: 0.3, reliability: 0.5 },
            quick: { window: 5, rate: 0.5 }
        },

        // 特図1 の変動の流れ (秒)
        //   外れ: 図柄が回って止まる (miss)
        //   チャレンジ: 図柄が回る (roll) → チャレンジ (challenge) → 失敗 (fail) / 成功ならリーチ (reach) → バトル (battle) → 結果 (result)
        //   チャレンジに成功するとリーチになり、バトルに勝つと図柄がそろう (ユーザー指定)。当たりは必ずチャレンジ → 成功 → 勝ち
        // miss: 外れの変動時間を、保留の数 (変動中のものを含めて 1〜4) ごとに。保留がたまるほど速い (高い設定でもよく回るように)
        timing: { miss: [6, 3.5, 2, 1], roll: 3, challenge: 6, fail: 1.5, reach: 2.5, battle: 9, result: 3 },
        // 外れのうちチャレンジが出る割合。リーチ (成功) になる外れの割合は、バトルの成功率から自動で決まる
        challengeRate: 0.07,
        // チャレンジの種類 (ユーザー指定)。hit / miss は当たり・外れのときに選ぶ重み (外れの重みが小さいほど熱い)
        // おかがっぱのミュージックチャレンジ・シバターのプロレスチャレンジは 2026-10-19 にユーザー指定で追加 (熱さの順は Claude が決めた)
        challenges: {
            treasure: { name: 'こおりくんの宝探し', map: 'treasure', hit: 18, miss: 40 },
            music: { name: 'おかがっぱのミュージックチャレンジ', map: 'danceHall', hit: 18, miss: 26 },
            wrestling: { name: 'シバターのプロレスチャレンジ', map: 'castleHall', hit: 20, miss: 18 },
            training: { name: 'おにおにの特訓', map: 'castleHall', hit: 20, miss: 11 },
            bento: { name: 'ともいしのお弁当作りチャレンジ', map: 'ongagawa', hit: 24, miss: 5 }
        },
        // バトルの相手 (ユーザー指定: 成功率が低い順に おかがっぱ・ひびきまくり・おにおに (80%)・シーシャ・ナイテイ・ナイナイ (確定))
        //   hit: 当たりのときに選ぶ重み / win: 成功率。外れのときの重みは成功率から自動で計算する
        battles: {
            okagappa: { name: 'おかがっぱ', hit: 10, win: 0.05, map: 'ongagawa' },
            hibikimakuri: { name: 'ひびきまくり', hit: 20, win: 0.2, map: 'ebisucho' },
            onioni: { name: 'おにおに', hit: 50, win: 0.8, map: 'castleHall' },
            naitei: { name: 'シーシャ・ナイテイ・ナイナイ', hit: 20, win: 1, map: 'goldHall' }
        },
        pushTime: 2,                 // バトルの最後の「PUSH!」でボタンを待つ時間 (秒)。押さなければそのまま進む

        // ふるカワ (通常時の変動の始まりにしゃべる。スロット版のセリフを使う)
        //   熱さ 0〜6 (外れ 0 / チャレンジ外れ 1 / リーチ外れ 3 / 当たり 5 / 虹保留 6) ごとに出てくる確率と文字の色
        furukawa: {
            talkTime: 3.2,
            appearRates: [0.12, 0.3, 0.45, 0.6, 0.75, 0.85, 1],
            colorWeights: [
                { 0: 85, 1: 12, 2: 3 },
                { 0: 50, 1: 35, 2: 15 },
                { 0: 30, 1: 30, 2: 30, 3: 10 },
                { 1: 20, 2: 30, 3: 35, 4: 15 },
                { 2: 10, 3: 30, 4: 45, 5: 15 },
                { 3: 10, 4: 45, 5: 45 },
                { 6: 100 }
            ],
            colors: ['#ffffff', '#4f9bff', '#3fdf6f', '#c070ff', '#ff3a3a', '#ffd700', 'rainbow'],
            chanceLines: {
                4: ['チャンス！', 'これは来るかも…！', 'いけるいける！'],
                5: ['激アツだよ！！', 'ここは熱い！！', 'きたきたーっ！！'],
                6: ['すごいのが来る…！！！', 'ぜったい来るよ！！！']
            },
            expectLines: ['なにか来そう…？', 'ちょっと期待していいかも', 'ん…？ なんだか気になる'],
            // 豆知識 (このゲームのヒント。ユーザー指定)。色が白・青のときに hintRate の割合で言う
            hintRate: 0.4,
            hintLines: [
                '豆知識：虹色の保留は当たり確定だよ！',
                '豆知識：保留の色は 青→緑→紫→赤→虹 の順に熱いよ',
                '豆知識：ボタンが光ったり震えたりしたら、当たり 60% だよ！',
                '豆知識：バトルの相手がおにおにだったら 80% で勝てるよ',
                '豆知識：ナイナイが出てきたら勝ち確定！',
                '豆知識：チャレンジはお弁当作りがいちばん熱いよ',
                '豆知識：SE城前や満月に移ったら、チャンスだよ！',
                '豆知識：ステージが変わってすぐまた変わったら…当たり濃厚！',
                '豆知識：突破チャレンジで おにおに絶対殺す剣 が出たら突破確定！',
                '豆知識：おにおにRASH は、違和感があったら当たりだよ',
                '豆知識：こおりRASH でゴールド金面犬が出たら勝ち確定！',
                '豆知識：RASH 中にボタンが反応したら当たり確定だよ！',
                '豆知識：RASH を 10回続けると…いいことがあるかも？'
            ],
            chatLines: [
                'こおりくん、内定まだなの？ ふーん…',
                'うちの実家なら、これくらい余裕だけどね♪',
                'こおりくん、おなか大丈夫？',
                'ともいしさん、元気かなぁ…',
                'おにおにに借りた3万6千円、返したほうがいいよ？',
                'わたしは戦えないから、応援係ね！',
                'やすさん、じゃんけん弱いのかな？',
                'たむさん、音ゲーのときだけ目が本気…',
                'だけさん、もっとしゃべっていいんだよ？'
            ],
            // バトルの相手が出てきたときの返事と、撃破したときのひとこと
            replies: {
                okagappa: ['まだ何も始まってないよ…？', 'ノリで来たでしょ、ぜったい…'],
                hibikimakuri: ['…うん、響いてるね', '自己紹介、それだけ…？'],
                onioni: ['来ちゃった…！ お金はあとで返すから！', 'こわい…でも負けないよ！'],
                naitei: ['こおりくん、内定のチャンスだよ！'],
                shibata: ['ぶんぶん…？ おはしばたじゃないの？', 'ぶんぶんって、なに…？'],
                sasaki: ['自分で言っちゃうんだ…', 'しご出来なのに、目の下にクマが…'],
                goldDog: ['かわいい…けど、さわっちゃダメ！', 'すっごく自信ありげ…！']
            },
            defeatLines: {
                okagappa: ['おかがっぱ、川にお帰り〜！', 'お皿、割れてないといいね♪'],
                hibikimakuri: ['やっと静かになった…！', '最後まで響いてたね…'],
                onioni: ['おにおにを倒した！ すごいよ！', 'お金のことは…また今度ね！'],
                naitei: ['こおりくん、内定おめでとう！', 'これで内定持ちだね…ふーん♪'],
                shibata: ['シバター、バーイ！', 'いまの、動画にしないでね！'],
                sasaki: ['SASAKIさん、ゆっくり休んでね…', 'すごいです。やばいです。…うつっちゃった'],
                goldDog: ['ワンちゃん、金庫にお帰り〜！', '黄金にならなくてよかった…！']
            },
            // 突破チャレンジが始まるとき・突破したとき
            challengeLines: ['おにおにとの勝負だよ！ がんばって！', '保留がそろった…いくよ！'],
            challengeWinLines: ['おにおにを突破した！ RASH だよ！', 'やったー！ 突破！！'],
            // RASH 中・突破チャレンジ中 (ユーザー指定): 変動の始まりに、当たりの見込み (熱さ) に応じてしゃべる。
            //   当たりの保留は熱さ rashHeat.win、外れは rashHeat.miss (重み)。文字の色は colorWeights[熱さ]、出てくる確率は rashAppearRates[熱さ]
            //   色が赤以上 → rashHotLines、緑・紫 → rashExpectLines、それ以外 → rashCalmLines
            //   当たりが決まった瞬間は、必ず虹色で congratsLine (ユーザー指定)
            rashHeat: { win: { 3: 20, 4: 40, 5: 40 }, miss: { 0: 70, 1: 22, 2: 6, 3: 2 } },
            rashAppearRates: [0.2, 0.3, 0.45, 0.6, 0.8, 0.9, 1],
            rashHotLines: ['あちあちかも！', 'ここがせめどき！', 'いけるよ！ いっけー！！', '一気にたおしちゃえ！！'],
            rashExpectLines: ['いけるかも…？', 'そろそろせめどき…？', 'なんだかあったかい…？'],
            rashCalmLines: ['どんどん回そう！', '右打ち、わすれないでね！', 'まだまだこれからだよ！', 'のんびりいこ♪'],
            congratsLine: 'おめでとう！',
            // 大当たり中 (ユーザー指定): 始め (entry: RASH 突入 / big: bigLabel 個以上 / small: それ以外)・ラウンドの始め
            //   (2ラウンド目から roundRate の確率。最後のラウンドは lastRound)・終わり (endRash: RASH が続く / endNormal: 通常時へ)
            bonusLines: {
                entry: ['RASH 突入だよ！ おめでとう！', 'おにおにを突破したね！ すごい！'],
                big: ['大きいのきた！！', 'いっぱい出るよ〜！', 'うちの実家の金庫みたい…♪'],
                small: ['やったね！ 当たりだよ！', 'まずは出玉ゲット！'],
                round: ['どんどん入れて！', '右打ち、そのままだよ〜', 'いい感じ！', '玉、こぼさないでね！', 'アタッカー、開いてるよ！'],
                lastRound: ['ラストラウンド！', 'もう少しで終わりだよ！'],
                endRash: ['まだまだ続くよ！', 'この調子でいこ！', '次も当てちゃお！'],
                endNormal: ['おつかれさま！ また当てよう！', '次は RASH に行こうね！']
            },
            bonusRoundRate: 0.5,
            bonusColor: 5
        },

        // ----- 設定示唆 (2026-10-19 ユーザー指定。数値は Claude が決めた。スロット版と同じ考え方) -----
        //   trophy: 突破チャレンジ・RASH が終わったとき rate の確率で、液晶の左下にトロフィーが落ちてくる (次の変動から minShow 秒で消える)。
        //     色は「設定○以上」を示す (白は設定1以上 = どの設定でも出る、虹は設定6確定)。weights は台の設定ごとの、出たときの色の重み
        //   lines: 通常時のふるカワが黙っている外れの変動で、linesRate の確率で言う設定示唆のセリフ。weights は台の設定ごとの重み
        //     (0 の設定では言わない = それ以上確定)。short はデータカウンターに出す短い名前
        settingHint: {
            trophy: {
                rate: 0.5,
                minShow: 4,
                weights: {
                    1: { 1: 100 },
                    2: { 1: 55, 2: 45 },
                    3: { 1: 40, 2: 20, 3: 40 },
                    4: { 1: 30, 2: 15, 3: 15, 4: 40 },
                    5: { 1: 25, 2: 10, 3: 10, 4: 15, 5: 40 },
                    6: { 1: 20, 2: 10, 3: 10, 4: 10, 5: 15, 6: 35 }
                },
                colors: {
                    1: { name: '白', main: '#f2f2f2', light: '#ffffff', dark: '#a8a8b8' },
                    2: { name: '青', main: '#3f8cff', light: '#a8ccff', dark: '#1d4ea8' },
                    3: { name: '緑', main: '#3fcf5f', light: '#a8f0b8', dark: '#1d7a33' },
                    4: { name: '紫', main: '#a860ff', light: '#d8b8ff', dark: '#5a2a9a' },
                    5: { name: '赤', main: '#ff3a3a', light: '#ffb0b0', dark: '#9a1a1a' },
                    6: { name: '虹', rainbow: true }
                }
            },
            linesRate: 0.12,
            lines: [
                { text: 'この台、なんだか冷えてる気がする…', short: '冷えてる', weights: { 1: 40, 2: 30, 3: 25, 4: 15, 5: 10, 6: 5 } },
                { text: 'ふつうの台…かな？', short: 'ふつう', weights: { 1: 40, 2: 40, 3: 35, 4: 25, 5: 20, 6: 15 } },
                { text: 'この台、あったかい気がする♪', short: 'あったかい', weights: { 1: 10, 2: 15, 3: 20, 4: 30, 5: 30, 6: 30 } },
                { text: '今日はいい日になりそう！', short: 'いい日', weights: { 1: 0, 2: 15, 3: 15, 4: 15, 5: 15, 6: 15 } },
                { text: 'ここ、高設定のにおいがするよ！', short: '高設定のにおい', weights: { 1: 0, 2: 0, 3: 0, 4: 12, 5: 15, 6: 15 } },
                { text: 'ろく…ろく…！ なんでもない！', short: 'ろく…', weights: { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0, 6: 8 } }
            ]
        }
    },

    // ----- データカウンター (台ごと。2026-10-19 ユーザー指定。数値は Claude が決めた) -----
    //   historyShown: 大当たり履歴に出す件数 / graphPoints: 出玉の推移のグラフに残す点の数 (古いものから間引く)
    //   graphEvery: 出玉の推移を記録する間隔 (秒)
    dataCounter: { historyShown: 20, graphPoints: 300, graphEvery: 5 },

    // ----- 図鑑・実績 (2026-10-19 ユーザー指定。中身は Claude が決めた) -----
    // 台を選び直しても、新しく始めても残る (このブラウザに保存する)。
    // 実績は stat の値が value 以上になると解除 (value: 'all' はそのグループの全種類):
    //   記録 (records のキー): spins (特図1 の回転数) / hits (大当たり) / entries (RASH 突入) / bestStreak (1回の RASH の最高連チャン)
    //     / bestBalls (1回の RASH の最高出玉) / blackouts / renchan (〇G連確定) / promotes (昇格) / endings / holdChanges (保留変化)
    //   'seen:グループ' (見た種類の数) / 'seen:グループ:id' (その演出を見た回数) / 'win:グループ:id' (そのバトルに勝った回数)
    collection: {
        achievements: [
            { id: 'firstHit', name: 'はじめての大当たり', desc: '大当たりを引く', stat: 'hits', value: 1 },
            { id: 'entry', name: '突破！', desc: '突破チャレンジを突破して RASH に入る', stat: 'entries', value: 1 },
            { id: 'streak5', name: '5連チャン', desc: '1回の RASH で 5連する', stat: 'bestStreak', value: 5 },
            { id: 'ending', name: '内定ツラヌキ', desc: 'RASH を 10回続けて、エンディングを見る', stat: 'endings', value: 1 },
            { id: 'balls5000', name: '一撃5000発', desc: '1回の RASH で 5000発 出す', stat: 'bestBalls', value: 5000 },
            { id: 'rainbowHold', name: '虹の保留', desc: '虹色の保留を見る', stat: 'seen:hold:rainbow', value: 1 },
            { id: 'oniKiller', name: '絶対殺す剣', desc: '突破チャレンジで おにおに絶対殺す剣 を見る', stat: 'seen:weapon:oniKiller', value: 1 },
            { id: 'naitei', name: '内定のチャンス', desc: 'シーシャ・ナイテイ・ナイナイとのバトルに勝つ', stat: 'win:battle:naitei', value: 1 },
            { id: 'goldDog', name: '黄金のワンちゃん', desc: 'こおりRASH で ゴールド金面犬 に勝つ', stat: 'win:kooriRash:goldDog', value: 1 },
            { id: 'blackout', name: 'ブラックアウト', desc: 'RASH 中にブラックアウトを見る', stat: 'blackouts', value: 1 },
            { id: 'renchan', name: '連チャン確定', desc: '〇G連確定 を見る', stat: 'renchan', value: 1 },
            { id: 'promote', name: '昇格', desc: '大当たりのラウンド中に図柄が昇格する', stat: 'promotes', value: 1 },
            { id: 'allChallenges', name: 'チャレンジャー', desc: 'チャレンジを全種類見る', stat: 'seen:challenge', value: 'all' },
            { id: 'allAnomalies', name: '違和感マスター', desc: 'おにおにRASH の違和感を全種類見る', stat: 'seen:anomaly', value: 'all' },
            { id: 'allStages', name: '旅の記録', desc: 'ステージを全部めぐる (SE城前・満月も)', stat: 'seen:stage', value: 'all' },
            { id: 'rainbowTrophy', name: '虹のトロフィー', desc: '虹のトロフィー (設定6確定) を見る', stat: 'seen:trophy:6', value: 1 },
            { id: 'spins3000', name: '打ち込み3000回転', desc: '合計 3000回転 まわす', stat: 'spins', value: 3000 }
        ]
    }
};
