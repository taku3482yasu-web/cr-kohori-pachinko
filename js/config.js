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
        // 液晶 (2026-10-23 ユーザー指定: 映像を 大きく。枠 lcdFrame の 内側 いっぱいに した。枠は 玉が 当たる 壁なので 変えない。前は 94, 122, 172, 96)
        lcd: { x: 90, y: 118, w: 180, h: 101 },
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
    // premium: プレミアボーナス (ユーザー指定 2026-10-22)。RASH 中 (突破チャレンジ・遊タイムは除く) の大当たり・小当たりの rate (約3%) が
    //   rushHit の代わりにこの振り分けになる。継続率は変わらない (時短へ)。知らせ方は RASH のモードで決まっていて、そのボーナスでしか出ない:
    //   こおりRASH は 怪 のバトル / おにおにRASH は ゴールド金面犬がとなりに座る違和感 / おかピポRASH は ブラックアウト。どれも盤面の役物が落ちてくる
    //   1800ボーナス は 12R x 10C = 1800個、2600ボーナス は 16R x 11C = 2640個 (賞球 15 でちょうどにならないため)
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
            premium: { rate: 0.03, name: '1800ボーナス', label: 1800, rounds: 12, next: 'jitan', premium: true },
            challengeSmallRate: 1 / 6.7,   // 突破チャレンジ中に電チューに入った保留の小当たり (突破率 50% に合わせる。1/7 で 47〜48%)
            jitan: { challengeSpins: 1, spins: 6 },
            // 遊タイム (天井。ユーザー指定 2026-10-20): 通常時に at 回まわして当たらなければ、時短 spins 回 (回数は Claude が決めた。RASH 突入 約98%)
            yutime: { at: 300, spins: 30 },
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
            premium: { rate: 0.03, name: '2600ボーナス', label: 2600, rounds: 16, count: 11, next: 'jitan', premium: true },
            challengeSmallRate: 1 / 6.7,   // 突破チャレンジ中に電チューに入った保留の小当たり (突破率 50% に合わせる。1/7 で 47〜48%)
            jitan: { challengeSpins: 1, spins: 6 },
            yutime: { at: 500, spins: 30 },   // 遊タイム (ユーザー指定 2026-10-20)
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
        small: { open: 20 },   // 最大 20秒 (2026-10-20 ユーザー指定。前は 8秒)
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
        // 可動液晶 (2026-10-23 アップグレード P1): 見せ場で 液晶が この 倍率まで 大きくなり、offsetY だけ 上へ (盤面の 単位)
        lcdZoom: { scale: 1.5, offsetY: 20 },   // 上の 氷の メダル (役物) に かからない ように 下へ
        // 図柄 1〜7。奇数は赤、偶数は青 (ユーザー指定)。ids は図柄に描くキャラクター
        figures: {
            1: { name: 'ふるカワ', ids: ['furukawa'] },
            2: { name: 'ひびきまくり', ids: ['hibikimakuri'] },
            3: { name: 'おにおに', ids: ['onioni'] },
            4: { name: 'おかがっぱ', ids: ['okagappa'] },
            5: { name: 'シバター', ids: ['shibata'] },
            6: { name: 'やすさん・たむさん・だけさん', ids: ['yasu', 'tamu', 'dake'] },
            7: { name: 'こおりくん', ids: ['koori'] },
            // おにおにRASH の違和感と全回転でだけ出る図柄 (ユーザー指定 2026-10-19・2026-10-20)。ふだんの変動には出ない (Figures.COUNT は 7)
            8: { name: 'シーシャ・ナイテイ・ナイナイ', ids: ['naitei'] },
            9: { name: 'シーシャ・ナイテイ・アルアル', ids: ['aruaru'] }
        },
        figureColors: { odd: '#ff3a4a', even: '#3a8aff' },
        // 大当たりでそろう図柄: 時短 (突破チャレンジ) へ行く初当たりと、RUSH 中の大きい当たり (bigLabel 個以上) は奇数 (赤)、
        // それ以外 (時短なしの初当たり・RUSH 中の 200個) は偶数 (青)
        bigLabel: 900,
        hitFigures: { odd: [1, 3, 5, 7], even: [2, 4, 6] },
        // 昇格 (ユーザー指定 2026-10-19): 奇数図柄の当たりのうち rate (40%) は偶数図柄でそろえて見せ、ラウンド中に図柄が現れて奇数に昇格する
        //   delay: 1ラウンド目が始まってから現れるまで (秒) / time: 昇格の演出の長さ (秒)
        //   昇格するまでは、大当たりの画面の「〇個」・総ラウンド数・ふるカワの「大きいのきた！」を出さない (中身がばれないように。Claude が決めた)
        promote: { rate: 0.4, delay: 1.5, time: 3.5, vRate: 0.5, vDelay: 0.3 },
        // V への昇格 (ユーザー指定 2026-10-20): 小当たり (V入賞の当たり) の vRate (50%。Claude が決めた) は V 以外の図柄 (1〜7) でそろえて見せ、
        //   大当たりのラウンドの始め (vDelay 秒後) に V 図柄に昇格する。出玉は変わらないので、昇格の前も「〇個」を出す

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
        //   rel: 先読み演出 (色が付いた保留・保留変化・ボタン・入賞時の音・高確率ステージ) が出たときに当たる割合。外れ (ガセ) の量はこれから自動で計算する
        //     占有率が高いほど当たる割合が上がり、熱で約90% (2026-10-20 ユーザー指定。チャンス・おすすめの値は Claude が決めた)。ガセが減るので、演出も出にくくなる
        //     色が付いた保留は全体で rel。色ごとの差 (青は低く赤は高い) は holdColors.miss の重みで決まる。虹は当たり確定のまま
        //   base: holdColors.hit などの重みのときの占有率 (ボタン・高確率ステージの当たりでの出やすさの基準)
        //   change: 色が付く当たりの保留のうち、最初は白で出して途中で色が変わる (保留変化) 割合 (hitRate)。外れで変わる割合は rel から自動で計算する。
        //     self: その保留の変動が始まるとき / それ以外: 保留が1つ進むとき
        senyomi: {
            levels: {
                none: { occ: 0, rel: 0 },
                chance: { occ: 0.3, rel: 0.35 },
                recommend: { occ: 0.5, rel: 0.6 },
                hot: { occ: 0.9, rel: 0.9 }
            },
            base: 0.9,
            // 保留変化したら外れでも必ずチャレンジ演出に入る (ユーザー指定)
            change: { hitRate: 0.7, self: 0.5 }
        },
        // 入賞時の音 (ユーザーが録音した sounds/heso.m4a。js/sound-heso.js に埋め込み): ヘソに入ったときにこの音が鳴って、台のボタンが赤く光る
        //   hitRate: 当たりの保留で鳴る割合 (占有率 60%。ユーザー指定)。外れで鳴る割合は先読みの量 (senyomi.levels の rel) から自動で計算する
        //   start〜end: 録音のうち鳴らすところ (秒。前後の無音を切った) / gain: 音量 (録音が小さめなので大きくする)
        //   eerie: こおりRASH の怪の先バレ音 (ユーザー指定 2026-10-20)。同じ録音を おどろおどろしくして鳴らす (js/audio.js の eerieVoice。数値は Claude が決めた)
        //     rate: 再生の速さ (低く・ゆっくり) / second: 少し低くずらして重ねる音の速さの比 / wobble: 音の高さのゆれ (セント) / wobbleHz: ゆれの速さ
        //     echo: こだまの間隔 (秒) / feedback: こだまの残り方 / lowpass: こもらせる周波数 (Hz) / drone: 低いうなりの周波数 (Hz。2つでうなる)
        voice: { hitRate: 0.6, start: 1.3, end: 3.5, gain: 4,   // 録音の2つの音のうち長いほう (ユーザー指定)
            eerie: { rate: 0.72, second: 0.94, wobble: 40, wobbleHz: 5, echo: 0.32, feedback: 0.45, lowpass: 1600, drone: [55, 58.5] } },

        // 台のボタン (こおりくんの体の形)。ヘソに入ったときに 赤く光る・ぶるぶる震える・高い音 のどれかが起きる (ユーザー指定)
        // 起きたらその保留が当たる割合は先読みの量 (senyomi.levels の rel。熱で約90%) で、外れのときに起きる確率を自動で計算する
        button: {
            hitRate: 0.3,            // 当たりの保留で起きる確率
            kinds: { red: 40, shake: 30, beep: 30 },
            hitOnlyKinds: { rainbow: 20 },   // 当たりのときだけ選ぶ種類 (虹色は確定)
            time: 1.2                // 光る・震える・鳴る時間 (秒)
        },
        // RASH 中・突破チャレンジ中のボタン (ユーザー指定): 当たりの保留の hitRate (60%) で震える・赤くなる・虹色になる。外れでは起きない
        // (こおりRASH の怪の保留は、当たり・外れどちらでも入賞時の音と紫のボタン。kooriRash の kai)
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
            // 1ラウンド目の前の登場 (intro)、途中のラウンド (round)、最後のラウンド (final) と結果 (result)、
            // おまけのラウンドの前の「もうひとつおまけに！」(extra) の秒
            // おまけ (ユーザー指定 2026-10-19): バトルが始まってから電チューに入った保留は、見た目では保留を増やさず、
            //   決着のあと (突破できなかったとき) に「もうひとつおまけに！」で1ラウンド。突破したときは RASH の保留として残る
            timing: { intro: 3, round: 3.5, final: 5, result: 2.5, extra: 2.5 },
            map: 'castleHall'
        },

        // ----- RASH (段階4。ユーザー指定) -----
        // RASH 突入の大当たり中に、こおりRASH / おにおにRASH を選ぶ (選ばなければ defaultMode)
        rash: {
            defaultMode: 'koori',
            modes: {
                koori: { name: 'こおりRASH', note: 'バトルで勝てば当たり', color: '#7fd3f7' },
                onioni: { name: 'おにおにRASH', note: 'おにおにが開眼すれば当たり', color: '#ff6a6a' },
                // おかピポRASH (ユーザー指定 2026-10-20): RASH の 5連目 (minStreak) から、大当たり中のボタンの切り替えで選べる。
                //   RASH が終わる (または次に RASH に入る) と defaultMode に戻る
                okapipo: { name: 'おかピポRASH', note: '一発告知で当たり', color: '#ff4fa0', minStreak: 5 }
            }
        },
        // おかピポRASH (ユーザー指定 2026-10-20): おかピポ (おかがっぱ) が DJ をしている。一発告知だけの RASH で、外れでは何も起きない。
        //   当たりは変動の始め (roll のあと、notice) に一発告知 → おかピポが大量発生して虹色に光り (pipo)、図柄がそろう
        //   notices: 当たりの演出の種類と重み (= 当たりのうちの割合 %)。shake: ボタンが震える / voice: 先バレ音 / rainbow: ボタンが虹色 / gimmick: 盤面の役物が落ちる (この4つは pnotice → pipo)
        //     gold: 金色のおかがっぱ (一発告知。おかピポRASH のベース。約40%。ユーザー指定 2026-10-20): 金色のおかがっぱが goldLines を言い (pgold)、
        //       おかがっぱの顔が大量発生して (pface) 当たる
        //     gun: 告知なし (当たりの10%。ユーザー指定 2026-10-20): 何も告知せずに おかがっぱ群 が横切って (pgun)、図柄がそろう (palign)
        //     4つの一発告知の重みは、前の 30 / 25 / 25 / 20 を残りの 50% に縮めた (Claude が決めた)
        //   おかピポRASH 中は、電チューに入ったときのボタン・先バレ音・RASH の保留・怪も出さない (一発告知だけにするため)
        okapipoRash: {
            timing: { roll: 0.8, notice: 1.6, pipo: 2.8, gold: 3.6, face: 2.8, gun: 2.6, align: 1 },
            map: 'gameCenter',
            notices: {
                gold: { name: '金色のおかがっぱ', weight: 40, flow: 'gold' },
                gun: { name: 'おかがっぱ群 (告知なし)', weight: 10, flow: 'gun' },
                shake: { name: 'ボタンが震える', weight: 15 },
                voice: { name: '先バレ音が鳴る', weight: 13 },
                rainbow: { name: 'ボタンが虹色に光る', weight: 12 },
                gimmick: { name: '役物が落ちる', weight: 10 }
            },
            goldLines: ['あ～らあらあら', 'き～んいろだわ', 'very nice おかピポ']
        },
        // こおりRASH: 当たりの保留と、最後の保留 (このあと時短も保留もない) は必ずバトル。外れでもときどきバトル (成功率から自動で計算)
        //   相手 (成功率の低い順。ゴールド金面犬・アルアルは確定)。hit: 当たりのときの重み / win: 成功率 (Claude が決めた。金面犬の確定はユーザー指定)
        //   おかがっぱ・ひびきまくり・シーシャ・ナイテイ・アルアル は 2026-10-19 ユーザー指定で追加 (おかがっぱ・ひびきまくりは勝ちにくい、アルアルは確定撃破)
        //   minStreak: RASH が この連チャン数 (表示の「〇連」) 以上のときだけ出る。アルアルは RASH で1回以上連チャンしてから (ユーザー指定の「1G連以上」)
        //   kai: 怪の状態 (ユーザー指定 2026-10-19。アルアル以外)。目のまわりに靄がかかり、目が赤く光る。名前は「〇〇・怪」(ひびきまくりは「ひびかない・怪」)。
        //     成功率が上がる (期待度アップ)。hit は当たりのときの重み、win は成功率 (Claude が決めた)。minStreak は怪だけの登場の条件
        //     2026-10-22 ユーザー指定で、怪はプレミアボーナス (specs.*.premium) 確定にした (win はすべて 1。ふつうの当たり・外れでは出ない)。
        //     怪になるかは玉が電チューに入ったときに決め、入賞時の音 (先バレ音) が鳴ってボタンが紫に光る (ユーザー指定)。
        //     そのため怪の保留はブラックアウトにせず、必ずバトルにする (怪の保留になる割合は成功率から自動で計算する)
        //   どの相手が出るかは演出だけで、当たりやすさ・継続率は変わらない (外れのバトルの重みは成功率から自動で計算する)
        kooriRash: {
            timing: { roll: 1, battle: 5, result: 2 },
            lastShare: 0.02,   // RASH の変動のうち「最後の保留」になる割合 (測った値。外れのバトルの割合の計算に使う)
            enemies: {
                okagappa: { name: 'おかがっぱ', hit: 6, win: 0.06, map: 'ongagawa', kai: { name: 'おかがっぱ・怪', hit: 3, win: 1 } },
                hibikimakuri: { name: 'ひびきまくり', hit: 8, win: 0.1, map: 'ebisucho', kai: { name: 'ひびかない・怪', hit: 3, win: 1 } },
                shibata: { name: 'シバター', hit: 12, win: 0.15, map: 'ebisucho', kai: { name: 'シバター・怪', hit: 4, win: 1 } },
                sasaki: { name: 'Mr.SASAKI', hit: 20, win: 0.35, map: 'tsugakuro', kai: { name: 'Mr.SASAKI・怪', hit: 6, win: 1 } },
                onioni: { name: 'おにおに', hit: 30, win: 0.7, map: 'castleHall', kai: { name: 'おにおに・怪', hit: 8, win: 1 } },
                goldDog: { name: 'ゴールド金面犬', hit: 14, win: 1, map: 'goldHall', kai: { name: 'ゴールド金面犬・怪', hit: 3, win: 1, minStreak: 2 } },   // 怪は連チャンしてから (ユーザー指定)
                aruaru: { name: 'シーシャ・ナイテイ・アルアル', hit: 10, win: 1, map: 'goldHall', minStreak: 2 }
            }
        },
        // 復活 (こおりRASH のバトル。ユーザー指定 2026-10-19): 当たりのバトルを一度負けに見せて、暗転 →「内定がないと」→「こおり生きていけない…」
        //   →「それでも、まだ、あきらめたくない」→ 大きい「それでも」がだんだん虹色に →こおりくんと「こおり生きていける！」で虹色のフラッシュ → 撃破
        //   share: こおりRASH の当たりのうち復活になる割合 (占有率。先読みがない保留でも起きる) / labels: スペックごとに、復活する当たりの出玉 (1/99 は 900個 確定)
        //   確定の相手 (ゴールド金面犬・アルアル) とブラックアウトでは起きない。timing は場面ごとの秒
        revival: {
            share: 0.2,
            labels: { s99: 900 },
            timing: { dark: 1.2, naitei: 1.8, cant: 2.2, still: 2.4, soredemo: 2.4, flash: 1.8, kill: 2.4 }
        },
        // お仲間召喚 (こおりRASH のバトル。ユーザー指定 2026-10-20): バトルの途中で画面が光り、やすさん・たむさん・だけさん のだれかが現れて相手を撃破 (撃破確定)。
        //   rate: 当たりのバトルで起きる割合 (外れでは起きない。Claude が決めた)。確定の相手 (ゴールド金面犬・アルアル) と復活では起きない
        //   time: 召喚の場面の秒 / members: 出てくる仲間 (Characters の仲間の id と名前)
        summon: { rate: 0.15, time: 3, members: { yasu: 'やすさん', tamu: 'たむさん', dake: 'だけさん' } },
        // お仲間の応援 (こおりRASH のバトル。ユーザー指定 2026-10-20、中身は Claude が決めた): バトル中に こおりくんのうしろで
        //   やすさん → たむさん → だけさん の順に 0〜3人 が応援する。人数が多いほど勝ちやすい (勝ち win / 負け miss の重み)。
        //   3人そろうと「全員で応援！」(3人の応援で負けることもある)。当たりやすさは変わらない
        cheer: { win: { 0: 40, 1: 25, 2: 20, 3: 15 }, miss: { 0: 75, 1: 17, 2: 7, 3: 1 } },
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
            // talk: 当たりのラウンドの始めに、ふるカワが さっきの違和感を教えるひとこと (ユーザー指定 2026-10-20。吹き出しに入るよう短く)
            patterns: {
                open: { name: 'そのまま開眼', weight: 20, talk: 'さっきは そのまま開眼したね！' },
                rainbow: { name: 'おにおにが虹色', weight: 13, talk: 'おにおにが虹色に光ってたよ！' },
                flip: { name: '画面が左右反転', weight: 10, talk: 'さっき画面が左右反転してたよ！' },
                upsideDown: { name: '画面が上下逆', weight: 10, talk: '画面が上下さかさまだったね！' },
                mono: { name: '白黒', weight: 10, talk: '画面が白黒になってたよ！' },
                zoom: { name: '顔がドアップ', weight: 12, talk: '顔がドアップになってたね…！' },
                koori: { name: 'こおりくんが現れる', weight: 10, talk: 'こおりくんが見に来てたよ！' },
                tomoishi: { name: 'ともいしのカットイン「内定とりなさい！」', weight: 8, talk: 'ともいしさんが応援してたね！' },
                naitei: { name: 'シーシャ・ナイテイ・ナイナイのカットイン「内定は…！」', weight: 7, talk: 'ナイナイが出てきてたよ…！' },
                // 2026-10-19 ユーザー指定で追加 (重みは Claude が決めた)
                kai: { name: 'おにおにが おにおに・怪 になる', weight: 9, talk: 'おにおに・怪 になってたよ！' },
                figure8: { name: '図柄に 8 (ナイナイ) が出る', weight: 5, labels: { s99: 900 }, talk: '図柄に 8 が出てたよ！' },
                figure9: { name: '図柄に 9 (アルアル) が出る', weight: 4, labels: { s99: 900 }, talk: '図柄に 9 が出てたよ！' },
                reverse: { name: '文字が全部逆になる', weight: 8, talk: '文字が全部さかさまだったね！' },
                count77: { name: '残り回数が「あと77回」', weight: 7, talk: '「あと77回」って出てたよ！' },
                // 2026-10-20 ユーザー指定で10個追加 (中身と重みは Claude が決めた)
                sleepTalk: { name: 'おにおにが寝言「お金かえせ…」', weight: 5, talk: 'おにおにが寝言を言ってたね…' },
                rainbowZ: { name: 'Zzz が虹色', weight: 5, talk: 'Zzz が虹色になってたよ！' },
                twin: { name: 'おにおにが2人になる', weight: 5, talk: 'おにおにが2人いたよ！？' },
                tiny: { name: 'おにおにが小さくなる', weight: 5, talk: 'おにおにが小さくなってたね！' },
                goldThrone: { name: '椅子が金色になる', weight: 5, talk: '椅子が金色になってたよ！' },
                oneEye: { name: '片目だけ開いている', weight: 5, talk: '片目だけ開いてたよ…！' },
                fullMoon: { name: '急に満月の夜になる', weight: 5, talk: '急に満月の夜になってたね！' },
                shake: { name: '画面がゆれる', weight: 5, talk: '画面がゆれてたよ！' },
                okagappaWalk: { name: 'おかがっぱが横切る', weight: 5, talk: 'おかがっぱが横切ってたよ！' },
                // 2026-10-22 ユーザー指定で、プレミアボーナス (specs.*.premium) のときだけ出す (重みは使わない)
                goldDogSit: { name: 'ゴールド金面犬がとなりに座っている', weight: 0, premium: true, talk: '金面犬がとなりに座ってたよ！' }
            }
            // labels: スペックごとに、この違和感が出る当たりの出玉 (図柄 8・9 は 1/99 で 900個 確定。ユーザー指定)
        },
        // RASH の残り回数 (ユーザー指定 2026-10-19): RASH 中は液晶の右上に「あと〇回」(時短の残り。時短が終わったら残り保留の数)。
        // おにおにRASH の違和感 count77 では「あと77回」と出る (出たら当たり)
        rashLeft: { fake: 77 },
        // RASH 中の保留 (ユーザー指定 2026-10-19): 当たりの保留の rate で、黒い保留か回る保留になる。外れでは出ない (出たら当たり確定)
        rashHolds: { rate: 0.25, kinds: { black: 50, spin: 50 } },

        // 通常時のステージ (背景。ユーザー指定 2026-10-19)
        //   cycle の順に interval 回転ごとに変わる (回転数は Claude が決めた)
        //   hi: 当たりの見込みが高い保留があると、高確率ステージ (SE城前・満月) に移ることがある。その保留を消化したら元のステージに戻る
        //     当たりの保留で hitRate (先読みを出す保留のうち)、外れは「移ったら当たる割合が先読みの量の rel」になる確率で移る
        //   quick: ステージが変わってから window 回転以内に当たりの保留があれば、rate (約50%) ですぐ次のステージに変わる (当たり濃厚)
        //     外れでは起きない。外れの保留はこの間、高確率ステージにも移らない (濃厚の合図とまぎらわしくならないように)
        stages: {
            cycle: ['tsugakuro', 'kokuraStation', 'ongagawa', 'gameCenter', 'ishinokawa'],
            names: {
                tsugakuro: '通学路', kokuraStation: '小倉駅', ongagawa: '遠賀川', gameCenter: 'ゲームセンター', ishinokawa: '石の川',
                seCastle: 'SE城前', fullMoon: '満月'
            },
            interval: 30,
            hi: { ids: ['seCastle', 'fullMoon'], hitRate: 0.3 },
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
        // ライバルバトル (2026-10-23 アップグレード P3。最新のスロット koori-slot から): チーム5DX < チームASK-3 < チームお願いマッスル の 順に 熱い。
        //   team: 3 人 並んで 出る (まんなかが リーダー)。leader の 必殺技・セリフを 使う。hit は Claude の 案
        //   win (2026-10-23 ユーザー指定: メンバーの 単独より 上。おにおにより 下): 5DX 30%・ASK-3 50%・お願いマッスル 70%
        //   kai (ユーザー指定: 怪に なったら 確定): 当たりの rate で 怪 (目の まわりに 靄、赤く 光る 目。名前は「〇〇・怪」)。外れでは 出ない (rate は Claude の 案)
        battles: {
            okagappa: { name: 'おかがっぱ', hit: 10, win: 0.05, map: 'ongagawa' },
            hibikimakuri: { name: 'ひびきまくり', hit: 20, win: 0.2, map: 'ebisucho' },
            rival5dx: { name: 'チーム5DX', hit: 8, win: 0.3, map: 'tsugakuro', team: ['hibikimakuri', 'okagappa', 'yamamou'], leader: 'okagappa', color: '#7fd3f7', kai: { rate: 0.1 } },
            ask3: { name: 'チームASK-3', hit: 10, win: 0.5, map: 'kokuraStation', team: ['sasaki', 'asahara', 'kotani'], leader: 'asahara', color: '#ffe066', kai: { rate: 0.12 } },
            muscle: { name: 'チームお願いマッスル', hit: 14, win: 0.7, map: 'castleHall', team: ['shibata', 'ueno', 'ikekimu'], leader: 'ueno', color: '#ff6a3a', kai: { rate: 0.15 } },
            onioni: { name: 'おにおに', hit: 50, win: 0.8, map: 'castleHall' },
            naitei: { name: 'シーシャ・ナイテイ・ナイナイ', hit: 20, win: 1, map: 'goldHall' }
        },
        pushTime: 2,                 // バトルの最後の「PUSH!」でボタンを待つ時間 (秒)。押さなければそのまま進む
        // レバー (2026-10-23 ユーザー指定。2026-10-24 に「レバーを押せ！」から「レバーを引け！」に): バトルの最後の PUSH の かわりに
        //   「レバーを引け！」が 出ることが ある。ボタンでは なく 筐体の レバーを 手前に 引く (下へ ドラッグ・↓ キー)。
        //   reliability: 出たら 当たる 割合 (ユーザー指定: 85% くらい)。hit: 当たりの バトルで 出る 割合 (Claude が 決めた)
        //   change: はじめは「PUSH！」で、PUSH を 押すと (押さなくても changeAt 秒で)「レバーを引け！」に 変わる 割合 (ユーザー指定: 変化する 場合が ある。割合は Claude が 決めた)
        //   time: レバーの ときに 待つ 秒 (引く ぶん PUSH より 長く)
        //   rashHit (ユーザー指定: RASH 中に 引け！が 出たら 当たり確定): こおりRASH の 当たりの バトルで 出る 割合 (外れでは 出ない。割合は Claude が 決めた)
        //   colors (2026-10-24 ユーザー指定: 色の段階): 引け！の 色。hit / miss は 当たり・外れの ときの 重み (Claude が 決めた)。
        //     出たら 当たる 割合は おおよそ 青 67%・赤 85%・金 95%・虹 100% (全体で reliability)。RASH 中は hit の 重み
        //   revival (2026-10-24 ユーザー指定: 引いても 負けたあとの 復活): 通常時の 当たりの バトルの うち、引け！で 一度 負けて 見せ、
        //     暗転 →「もう一回 引け！」→ 撃破 に なる 割合 (Claude が 決めた)。変動が 長く なるので 台の 乱数 (rng) で 決める
        //   hold (2026-10-24 ユーザー指定: 保留を レバーで 変える): 保留変化の うち、変わる ときに「引け！」が 出て、引くと (待っても) 色が 変わる 割合
        //   holdTime / againTime: 保留の 引け！・もう一回 引け！で 待つ 秒
        lever: { hit: 0.2, reliability: 0.85, change: 0.4, changeAt: 0.7, time: 3, rashHit: 0.15,
            colors: {
                blue: { name: '青', color: '#4aa8ff', hit: 20, miss: 55 },
                red: { name: '赤', color: '#ff3a4a', hit: 35, miss: 35 },
                gold: { name: '金', color: '#ffd23a', hit: 35, miss: 10 },
                rainbow: { name: '虹', color: 'rainbow', hit: 10, miss: 0 }
            },
            revival: 0.04, againTime: 3, timing: { dark: 1.0, flash: 1.8, kill: 2.4 },
            hold: 0.35, holdTime: 3 },
        // PUSH の 押し方と 色 (2026-10-24 ユーザー指定: 長押しは ため演出、連打は 連撃演出。色の 段階も)。重みは Claude が 決めた
        //   modes: tap 1 回 / long 長押し (ためて フルチャージで 一撃) / mash 連打 (mashCount 回で 連撃の とどめ)。hit / miss は 当たり・外れの 重み
        //   colors: 白 < 青 < 赤 < 金 < 虹 (虹は 確定)。time: 長押し・連打の ときに 待つ 秒 / longTime: フルチャージまでの 秒
        //   レバーを引け！の ときは 使わない。通常時の バトルと こおりRASH の バトルの 最後の PUSH
        pushStyle: {
            modes: { tap: { name: 'PUSH', hit: 50, miss: 70 }, long: { name: '長押し', hit: 25, miss: 15 }, mash: { name: '連打', hit: 25, miss: 15 } },
            colors: {
                white: { name: '白', color: '#ffffff', hit: 25, miss: 60 },
                blue: { name: '青', color: '#4aa8ff', hit: 25, miss: 28 },
                red: { name: '赤', color: '#ff3a4a', hit: 25, miss: 10 },
                gold: { name: '金', color: '#ffd23a', hit: 17, miss: 2 },
                rainbow: { name: '虹', color: 'rainbow', hit: 8, miss: 0 }
            },
            time: 3.5, longTime: 1.2, mashCount: 10
        },
        // 保留の「?」と 段階の 変化 (2026-10-24 ユーザー指定): 保留変化の ときに 白 → 青 → … と 1 段ずつ 上がって いく (stepTime 秒ごと)。
        //   question: 保留変化する 保留の うち、変わるまで「?」で 出す 割合 (Claude が 決めた)。見た目だけ
        holdStep: { question: 0.3, stepTime: 0.45 },
        // 大当たり中の レバー (2026-10-24 ユーザー指定: 上乗せ チャンス): 1 ラウンド目に「レバーを引け！ 上乗せチャンス」。
        //   引くと 昇格 (上乗せ)、外れ (ガセ) は「残念…」。出玉は 変えない (前から 決まって いる 昇格を 見せる だけ)。
        //   promote: 昇格する 大当たりで 出す 割合 / gasa: 昇格しない 小さい 大当たりで 出す 割合 / delay: ラウンドが 始まって から 出す 秒 / time: 待つ 秒 (Claude が 決めた)
        //   奇数の 図柄で 当たったときは ガセも 出さない (2026-10-24 ユーザー指定)
        bonusLever: { promote: 0.5, gasa: 0.12, delay: 1.2, time: 3 },
        // ハンドルブル (2026-10-24 ユーザー指定): 保留が 入ったときに ハンドルが ぶるぶる 震える (スマホは 本体の 振動)。
        //   holdHit: 当たりで 出る 割合、holdReliability: 出たら 当たる 割合 (Claude が 決めた)。カスタマイズの「レバブル」と いっしょに あり / なし
        handleBuru: { holdHit: 0.1, holdReliability: 0.7, time: 1.4 },
        // レバブル (2026-10-23 ユーザー指定。カスタマイズで あり / なし): レバーが ぶるぶる 震える (スマホは 台の ボタンが 震える)。
        //   hold: 保留が 入ったとき / spin: 変動中 (リーチに なったとき)。hit: 当たりで 出る 割合、reliability: 出たら 当たる 割合 (Claude が 決めた)
        leverBuru: { holdHit: 0.15, holdReliability: 0.6, spinHit: 0.3, spinReliability: 0.75, time: 1.4 },
        // 先バレ (入賞時の 音) の ボタンの 赤・紫を 光らせて おく 時間 (秒。2026-10-23 ユーザー指定で 長く)
        voiceButtonTime: 2.5,
        // 擬似連 (ユーザー指定 2026-10-20): チャレンジの前に「NEXT」で図柄が回り直す。回り直す回数 (0〜3 = 擬似1〜4連) の重みは
        //   hit: 当たり / reach: リーチ外れ / fail: チャレンジ失敗 で別 (外れの「チャレンジにも入らない変動」では出ない)。数値は Claude が決めた
        //   time: 1回の「NEXT」の秒
        gizi: {
            time: 1.6,
            weights: {
                hit: { 0: 35, 1: 25, 2: 22, 3: 18 },
                reach: { 0: 65, 1: 22, 2: 10, 3: 3 },
                fail: { 0: 85, 1: 12, 2: 3, 3: 0 }
            }
        },
        // ステップアップ予告 (ユーザー指定 2026-10-20): 変動の始めにキャラが1段ずつ出てくる。3段目まで続くとチャンス。
        //   3段目の文字が赤ならチャンス、金なら約90%で当たり (ユーザー指定。ほかの数値は Claude が決めた)
        //   outcomes: 何段目まで行くか・3段目の文字の色。hit: 当たりの変動で出る割合 / reliability: 出たら当たる割合
        //     外れの変動で出る割合は reliability になるよう、スペックの大当たり確率から自動で計算する (Scenario.stepUpRates)
        //     3段目まで行った外れは、必ずチャレンジに入る (失敗する)
        //   kinds: 種類 (どれも期待度は同じ)。steps の who は出てくるキャラ (ドット絵・敵・仲間の id)、text は文字
        //   stepTime: 1段の秒 / tail: 最後の段のあとの秒
        stepUp: {
            stepTime: 1.1,
            tail: 0.5,
            outcomes: {
                s1: { step: 1, color: 'white', hit: 0.08, reliability: 0.03 },
                s2: { step: 2, color: 'white', hit: 0.12, reliability: 0.08 },
                s3white: { step: 3, color: 'white', hit: 0.1, reliability: 0.25 },
                s3red: { step: 3, color: 'red', hit: 0.16, reliability: 0.5 },
                s3gold: { step: 3, color: 'gold', hit: 0.1, reliability: 0.9 }
            },
            colors: { white: '#ffffff', red: '#ff3a3a', gold: '#ffd040' },
            kinds: {
                koori: { name: 'こおりくん', steps: [{ who: 'koori', text: 'こおりくん、出発！' }, { who: 'koori', text: '内定を目指せ！' }, { who: 'koori', text: 'ツラヌケ！！' }] },
                furukawa: { name: 'ふるカワ', steps: [{ who: 'furukawa', text: 'ふるカワが見てる…' }, { who: 'furukawa', text: 'ふるカワが応援！' }, { who: 'furukawa', text: 'ふるカワ大興奮！！' }] },
                tomoishi: { name: 'ともいし', steps: [{ who: 'tomoishi', text: 'ともいし登場' }, { who: 'tomoishi', text: '内定とりなさい！' }, { who: 'tomoishi', text: '今すぐとりなさい！！' }] },
                companions: { name: 'お仲間', steps: [{ who: 'yasu', text: 'やすさん登場！' }, { who: 'tamu', text: 'たむさんも来た！' }, { who: 'dake', text: 'だけさんで全員集合！！' }] },
                onioni: { name: 'おにおに', steps: [{ who: 'onioni', text: 'おにおにの気配…' }, { who: 'onioni', text: 'おにおにが怒った！' }, { who: 'onioni', text: 'おにおに激怒！！' }] }
            }
        },
        // 群予告 (ユーザー指定 2026-10-20): 変動の始めにキャラの群れが画面を横切る。こおり群・おにおに群は約90%、ひびきまくり群は当たり確定 (ユーザー指定)
        //   hit: 当たりの変動で出る割合 (Claude が決めた) / reliability: 出たら当たる割合。外れで出る割合は自動で計算する (Scenario.revealRate)
        //   who: 群れになるキャラ / time: 横切る秒。群予告が出た外れは必ずチャレンジに入る (失敗)
        gun: {
            time: 2.4,
            kinds: {
                koori: { name: 'こおり群', who: 'koori', hit: 0.06, reliability: 0.9 },
                onioni: { name: 'おにおに群', who: 'onioni', hit: 0.06, reliability: 0.9 },
                hibiki: { name: 'ひびきまくり群', who: 'hibikimakuri', hit: 0.04, reliability: 1 }
            }
        },
        // こおりカットイン (ユーザー指定 2026-10-20): リーチのあと、バトルの前にこおりくんのカットイン。色で期待度
        //   赤は 80% 越え・金は約95% (ユーザー指定。青・緑と hit は Claude が決めた)。リーチの変動の中で、出たら当たる割合が reliability
        cutin: {
            time: 2,
            colors: {
                blue: { name: '青', color: '#3a8aff', hit: 0.15, reliability: 0.3 },
                green: { name: '緑', color: '#3fdf6f', hit: 0.15, reliability: 0.5 },
                red: { name: '赤', color: '#ff3a3a', hit: 0.2, reliability: 0.83 },
                gold: { name: '金', color: '#ffd040', hit: 0.1, reliability: 0.95 }
            },
            lines: { blue: 'いくぞ！', green: 'いくぞ！！', red: '絶対勝つ！！', gold: '内定ツラヌク！！！' }
        },
        // 盤面の役物 (ユーザー指定 2026-10-20、数値は Claude が決めた。2026-10-23 に 見た目を 氷の メダルに 新しく した: render.js の drawGimmick):
        //   ふだんは液晶の枠の屋根に小さい役物が乗っていて、
        //   バトルの始めに液晶の前へ落ちてきて虹色に光る (time 秒で戻る)。リーチの変動の中で、出たら当たる割合が reliability
        //   2026-10-22 ユーザー指定で 当たり確定 (reliability 1。前は 約70%)。RASH 中はプレミアボーナス (specs.*.premium) の知らせでも落ちてくる
        gimmick: { hit: 0.25, reliability: 1, time: 2 },
        // リーチの発展 (SP → SPSP。ユーザー指定 2026-10-20、数値は Claude が決めた): バトルは相手で SPリーチ / SPSPリーチ (最終決戦) に分かれる。
        //   SPSP の相手のバトルの rate は、はじめ SPリーチ の相手 (from のどれか) が出てきて、「発展！！」(time 秒) で SPSP の相手に変わる
        //   どの相手と戦うかは前と同じなので、成功率は変わらない (発展したら SPSP の成功率)
        develop: { rate: 0.6, time: 2.5, from: ['okagappa', 'hibikimakuri'], sp: { okagappa: 'SP', hibikimakuri: 'SP', onioni: 'SPSP', naitei: 'SPSP', rival5dx: 'SP', ask3: 'SP', muscle: 'SPSP' } },
        // 必殺技と 敵の セリフ (2026-10-23 アップグレード P3。最新のスロット koori-slot の battleLines.js から。onioni・naitei の セリフは Claude の 案)
        //   バトルの はじめに 相手の intro、決着で 勝てば こおりくんの 必殺技 (koori) と 相手の lose、負ければ 相手の 必殺技と win
        //   2026-10-23 ユーザー指定: セリフと 必殺技は 最新の スロットの データ (js/battle-lines.js) を 先に 使う。ここは スロットに ない ぶん (おにおに・ナイナイ) と 名前
        battleTalk: {
            names: { okagappa: 'おかがっぱ', hibikimakuri: 'ひびきまくり', yamamou: 'やまもぅ', sasaki: 'Mr.SASAKI', kotani: 'Mr.KOTANI', asahara: 'KING.ASAHARA',
                shibata: 'シバター', ueno: 'マッスルウエノーブル', ikekimu: 'イケキム', onioni: 'おにおに', naitei: 'シーシャ・ナイテイ・ナイナイ' },
            koori: '大腸炎アタック',
            specials: {
                okagappa: 'おかピポっと光線', hibikimakuri: '大音響4DX', yamamou: 'おちょくりボーンフィーバー',
                sasaki: 'ASAスラッシュ', kotani: 'NABIテンポ', asahara: 'DOPAPANCHI',
                shibata: 'シバタードライバー', ikekimu: 'イケキムドライブ', ueno: 'マッスルウエノクラッシュ',
                onioni: '鬼鬼の金棒', naitei: '不採用の裁き'
            },
            lines: {
                okagappa: { intro: 'ま～だまだ戦わねば！', win: 'お宝はいただきだぜ　イェア！', lose: 'ノリが…足りなかった…イェア…' },
                hibikimakuri: { intro: '響きです。', win: 'すっごいひびいたね～', lose: 'ひびかなかった～…' },
                asahara: { intro: 'CS城の主の力、見せてやろう！', win: 'フハハハ！ワシの勝ちだ！', lose: 'ぐぬぬ…覚えておれ！' },
                ueno: { intro: '我が筋肉の前にひれ伏すがよい！', win: '筋肉は裏切らない！', lose: '筋肉が…足りなかった…' },
                onioni: { intro: '金を 返しに 来たのか？', special: 'ぐはは！ 金棒を くらえ！', win: 'ぐははは！ 出直してこい！', lose: 'ぐぬぬ… 覚えておれ…' },
                naitei: { intro: '内定が ほしいか…？', special: 'お前に内定はない！', win: 'お前に 内定は ない！', lose: '…内定を やろう' }
            }
        },
        // 「こおりいきていける！」(2026-10-23 アップグレード P3。最新のスロットの AT 直撃の 見せ方): 通常時の 当たりの rate で、
        //   ノイズ → 暗転 → 虹色の こおりくんと「こおりいきていける！」→ 図柄が そろう (チャレンジ・バトルなし。大当たり 確定。rate は Claude の 案)
        ikiteru: { rate: 0.02, timing: { kroll: 1.2, knoise: 0.9, kdark: 1.2, klive: 2.8, kend: 1.6 } },
        // 1・3・5 の ひび割れ (2026-10-24 ユーザー指定。プレミア): 通常時の 当たりの rate (1 割) は、外れの ように 1・3・5 で 止まる (チャレンジ失敗は なし。2026-10-24 ユーザー指定)。
        //   そのあと 画面が まっぷたつに ひび割れて (xcrack)、すき間から おにおに・怪が 出てきて (xemerge)、画面を 粉砕し (xsmash)、
        //   咆哮を あげて (xroar)、7・7・7 で そろって「おめでとう!!」(xalign)。7 は 奇数 (大きい 当たり) なので、
        //   奇数の 当たりだけで 選び、全体で 当たりの rate に なるよう 割合を 上げる (Scenario.crackRate)
        crack: { rate: 0.1, timing: { xstop: 1.1, xcrack: 1.5, xemerge: 2.2, xsmash: 1.0, xroar: 2.2, xalign: 2.6 } },
        // 当たりの 役物 (2026-10-24 ユーザー指定): 通常時の バトルの 当たりは、図柄が そろう 前に 盤面の 役物が 落ちてきて 回転し、
        //   役物 そのものが 変形して 機械の 役物らしい こおりくんに 組み上がる (js/cabinet.js の yakuMedal・mechKoori)。RASH 中は プレミアボーナスの ときだけ。time 秒
        yaku: { time: 5.2 },
        // 天国の カットイン (2026-10-23 アップグレード P3。最新のスロットの 天国の 示唆): RUSH が 終わったとき、残りの 保留に 当たりが あれば rate で
        //   シーシャ・ナイテイ (ナイナイ か アルアル) が「まだ 終わらせない…」(出たら 残りの 保留で 当たり 確定)
        heavenCutin: { rate: 0.25, time: 2.4 },
        // 違和感演出 (2026-10-23 アップグレード P4。最新のスロットの 違和感演出 から): 通常時の 変動の はじめに、なにかが おかしい。
        //   hit: 当たりの 変動で 出る 割合 / reliability: 出たら 当たる 割合 (外れで 出る 割合は 自動で 計算する。数値は Claude の 案)。
        //   変動の 長さは 変えない 見た目だけの 演出なので、台の 抽選とは 別の 乱数 (fxRandom) で 選ぶ
        iwakan: {
            time: 0.9,   // 変動の はじめの この 秒の あいだ
            kinds: {
                noise: { name: '液晶に ノイズ', hit: 0.04, reliability: 0.7 },
                silent: { name: '音が 消える', hit: 0.03, reliability: 0.75 },
                reverse: { name: '図柄が 逆に 回る', hit: 0.03, reliability: 0.8 },
                stop: { name: '図柄が 一瞬 止まる', hit: 0.03, reliability: 0.8 },
                lamp: { name: 'ランプが ひとりでに チカチカ', hit: 0.02, reliability: 0.85 }
            }
        },
        // 全回転 (プレミア。ユーザー指定 2026-10-20): 当たりの変動の rate で、チャレンジ・バトルなしに3つの図柄が同じキャラのまま回って当たる (大当たり確定)
        //   kinds: 5種類 (ユーザー指定)。figure はそろう図柄 (8 ナイナイ・9 アルアルは全回転だけの図柄)。
        //     odd / even: 奇数 (突破チャレンジへ行く当たり)・偶数の当たりで選べるか (図柄の色と出玉の振り分けを合わせる)。weight と rate は Claude が決めた
        //   timing: zroll (ふつうに回る) → zenkaiten (全回転) → zend (止まって大当たり) の秒
        zenkaiten: {
            rate: 0.03,
            timing: { zroll: 1.5, zenkaiten: 6, zend: 2.5 },
            kinds: {
                koori: { name: 'こおりくん', figure: 7, weight: 30, odd: true, even: false },
                naitei: { name: 'シーシャ・ナイテイ・ナイナイ', figure: 8, weight: 15, odd: true, even: true },
                aruaru: { name: 'シーシャ・ナイテイ・アルアル', figure: 9, weight: 10, odd: true, even: true },
                onioni: { name: 'おにおに', figure: 3, weight: 25, odd: true, even: false },
                okagappa: { name: 'おかがっぱ', figure: 4, weight: 20, odd: false, even: true }
            }
        },
        // 追撃チャンス (通常時のバトル。ユーザー指定 2026-10-20): PUSH のあとに「追撃チャンス！」で、こおりくんがもう2回攻撃して追加ダメージ。
        //   当たりのバトルで hitRate、外れのバトルで missRate の割合で出る (Claude が決めた)。出たらそのバトルの成功率が上がる
        //   (おかがっぱ 約5% → 約19% / ひびきまくり 約20% → 約53% / おにおに 約80% → 約95%)。相手ごとの成功率 (全体) は変わらない
        //   time: 追撃の場面の秒 (リーチの変動がこのぶん長くなる)
        pursuit: { hitRate: 0.45, missRate: 0.1, time: 3 },

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
                '豆知識：先読みを「熱」にすると、ボタンや保留の色が出たら 約90% だよ！',
                '豆知識：7 のリーチは当たり確定だよ！',
                '豆知識：バトルの相手がおにおにだったら 80% で勝てるよ',
                '豆知識：ナイナイが出てきたら勝ち確定！',
                '豆知識：チャレンジはお弁当作りがいちばん熱いよ',
                '豆知識：SE城前や満月に移ったら、チャンスだよ！',
                '豆知識：ステージが変わってすぐまた変わったら…当たり濃厚！',
                '豆知識：突破チャレンジで おにおに絶対殺す剣 が出たら突破確定！',
                '豆知識：おにおにRASH は、違和感があったら当たりだよ',
                '豆知識：こおりRASH でゴールド金面犬が出たら勝ち確定！',
                '豆知識：RASH 中にボタンが赤や虹に光ったら当たり確定。紫は「怪」のチャンスだよ！',
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
                rival5dx: ['チーム5DX だ！ ノリで 押してくるよ！', '3人 まとめて 来た…！'],
                ask3: ['チームASK-3！ 計算ずくで 来るよ…', 'KING.ASAHARA が いる…！'],
                muscle: ['お願いマッスル！ いちばん 強い チームだよ！！', '筋肉が すごい…！ でも 熱いよ！'],
                shibata: ['ぶんぶん…？ おはしばたじゃないの？', 'ぶんぶんって、なに…？'],
                sasaki: ['自分で言っちゃうんだ…', 'しご出来なのに、目の下にクマが…'],
                goldDog: ['かわいい…けど、さわっちゃダメ！', 'すっごく自信ありげ…！'],
                aruaru: ['アルアルさん！ 来てくれたんだ！', 'お兄さんが相手なら…勝ったも同然！'],
                // 怪の状態の相手が出てきたとき (相手ごとの返事の代わり)
                kai: ['目が赤く光ってる…！ チャンスかも！', 'なんだか様子がおかしい…？ いけるよ！']
            },
            defeatLines: {
                okagappa: ['おかがっぱ、川にお帰り〜！', 'お皿、割れてないといいね♪'],
                hibikimakuri: ['やっと静かになった…！', '最後まで響いてたね…'],
                onioni: ['おにおにを倒した！ すごいよ！', 'お金のことは…また今度ね！'],
                naitei: ['こおりくん、内定おめでとう！', 'これで内定持ちだね…ふーん♪'],
                rival5dx: ['チーム5DX、ノリで 負けたね！', '3人とも 川にお帰り〜！'],
                ask3: ['計算外だったね、ASK-3！', 'KING.ASAHARA を 倒した！'],
                muscle: ['お願いマッスルに 勝った！ すごい！！', '筋肉より 内定だね！'],
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
    //     / kaiWins (こおりRASH で怪の相手に勝った) / revivals (こおりRASH の復活) / pursuitWins (通常時のバトルで追撃チャンスから撃破)
    //     / bestGizi (擬似連の最高。擬似〇連の〇) / yutimes (遊タイムに入った) / develops (SPSP への発展) / gimmicks (盤面の役物の落下)
    //     / premiums (プレミアボーナス。1800ボーナス・2600ボーナス)
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
            { id: 'kai', name: '怪退治', desc: 'こおりRASH で 怪 の相手に勝つ', stat: 'kaiWins', value: 1 },
            { id: 'revival', name: 'こおり生きていける', desc: 'こおりRASH でバトルに負けたあと、復活して撃破する', stat: 'revivals', value: 1 },
            { id: 'zenkaiten', name: '全回転', desc: '全回転を見る', stat: 'seen:zenkaiten', value: 1 },
            { id: 'allZenkaiten', name: '全回転コンプリート', desc: '全回転を5種類ぜんぶ見る', stat: 'seen:zenkaiten', value: 'all' },
            { id: 'goldStep', name: '金の文字', desc: 'ステップアップ予告で3段目が金文字になる', stat: 'seen:stepUp:gold', value: 1 },
            { id: 'gizi4', name: '擬似4連', desc: '擬似連を4連まで続ける', stat: 'bestGizi', value: 4 },
            { id: 'okapipo', name: 'おかピポ大量発生', desc: 'おかピポRASH で当たる', stat: 'seen:okapipo', value: 1 },
            { id: 'allOkapipo', name: '一発告知マスター', desc: 'おかピポRASH の一発告知を全種類見る', stat: 'seen:okapipo', value: 'all' },
            { id: 'hibikiGun', name: 'ひびきまくり群', desc: 'ひびきまくり群 (当たり確定) を見る', stat: 'seen:gun:hibiki', value: 1 },
            { id: 'goldCutin', name: '金のカットイン', desc: 'こおりカットインの金を見る', stat: 'seen:cutin:gold', value: 1 },
            { id: 'develop', name: '最終決戦', desc: 'SPリーチから SPSPリーチ に発展する', stat: 'develops', value: 1 },
            { id: 'gimmick', name: '役物落下', desc: '盤面の 氷のメダル が落ちてくるのを見る', stat: 'gimmicks', value: 1 },
            { id: 'yutime', name: '遊タイム', desc: '遊タイムに入る', stat: 'yutimes', value: 1 },
            { id: 'pursuit', name: '追撃成功', desc: '通常時のバトルで、追撃チャンスから撃破する', stat: 'pursuitWins', value: 1 },
            { id: 'summon', name: 'お仲間召喚', desc: 'こおりRASH で お仲間召喚 を見る', stat: 'seen:summon', value: 1 },
            { id: 'allSummons', name: '3人そろって', desc: 'お仲間召喚で やすさん・たむさん・だけさん を全員見る', stat: 'seen:summon', value: 'all' },
            { id: 'aruaruRash',name: 'お兄さん登場', desc: 'こおりRASH で シーシャ・ナイテイ・アルアル と戦う', stat: 'seen:kooriRash:aruaru', value: 1 },
            { id: 'premium', name: 'プレミアボーナス', desc: 'RASH 中に 1800ボーナス か 2600ボーナス を引く', stat: 'premiums', value: 1 },
            { id: 'blackout', name: 'ブラックアウト', desc: 'RASH 中にブラックアウトを見る', stat: 'blackouts', value: 1 },
            { id: 'renchan', name: '連チャン確定', desc: '〇G連確定 を見る', stat: 'renchan', value: 1 },
            { id: 'promote', name: '昇格', desc: '大当たりのラウンド中に図柄が昇格する', stat: 'promotes', value: 1 },
            { id: 'allChallenges', name: 'チャレンジャー', desc: 'チャレンジを全種類見る', stat: 'seen:challenge', value: 'all' },
            { id: 'allAnomalies', name: '違和感マスター', desc: 'おにおにRASH の違和感を全種類見る', stat: 'seen:anomaly', value: 'all' },
            { id: 'allStages', name: '旅の記録', desc: 'ステージを全部めぐる (SE城前・満月も)', stat: 'seen:stage', value: 'all' },
            { id: 'rainbowTrophy', name: '虹のトロフィー', desc: '虹のトロフィー (設定6確定) を見る', stat: 'seen:trophy:6', value: 1 },
            // レバーを引け！ (2026-10-24 ユーザー指定)
            { id: 'leverRainbow', name: '虹の引け！', desc: '虹色の「レバーを引け！」を見る', stat: 'seen:lever:rainbow', value: 1 },
            { id: 'leverRash', name: '引け！確定', desc: 'RASH 中に「レバーを引け！」(当たり確定) を見る', stat: 'seen:lever:rash', value: 1 },
            { id: 'leverRevival', name: 'もう一回引け', desc: '引いても負けたあと、「もう一回 レバーを引け！」で復活する', stat: 'seen:lever:revival', value: 1 },
            { id: 'allLever', name: 'レバーマスター', desc: '「レバーを引け！」を全種類見る', stat: 'seen:lever', value: 'all' },
            { id: 'spins3000', name: '打ち込み3000回転', desc: '合計 3000回転 まわす', stat: 'spins', value: 3000 }
        ]
    }
};
