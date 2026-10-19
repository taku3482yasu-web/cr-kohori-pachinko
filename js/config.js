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
        lcdFrame: { left: 96, right: 264, top: 100, shoulder: 124, bottom: 214 },
        // 液晶の画面 (枠の内側)。256x144 の絵を縮めて表示する
        lcd: { x: 104, y: 126, w: 152, h: 84 },
        // 液晶の左のワープ入口 (左上の角と幅・高さ) → 液晶の下のステージへ
        // 屋根から枠ぞいに落ちてくる玉はそのまま入らないよう、右向き (枠のほう) に minVx 以上で動いている玉だけ入る
        warp: { x: 86, y: 150, w: 8, h: 16, minVx: 15, exitX: 108, exitY: 217, exitVx: 70 },
        // ステージの床 (折れ線)。中央の切れ目 (gap) から落ちるとヘソのほぼ真上
        stage: {
            left: [[102, 221], [132, 229], [172, 224]],
            right: [[188, 224], [228, 229], [258, 221]],
            // 床の一番低いところの穴 (手前にこぼれる)
            spills: [{ x: 132, y: 226 }, { x: 228, y: 226 }],
            spillWidth: 6
        },
        // 返しゴム: 外レールを右まで回ってきた玉を、右打ちの通り道へ跳ね返す (外レールの角度 angle から内側へ length)
        rubber: { angle: 22, length: 16, tilt: 35 },
        // 右打ちの通り道を分ける壁
        rightDivider: [[268, 228], [262, 300], [262, 392]],
        // 右打ちのガイド (壁の折れ線)。ゲートへは全部の玉を通し、電チューのまわりは玉が横を抜けられるすき間を残す
        guides: [
            [[266, 238], [293.5, 264]],            // ゲートへ (左)
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
            { type: 'rect', x0: 256, x1: 274, y0: 220, y1: 396 }  // 右打ちの壁
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

    // ----- スペック (ゲームを始める前に選ぶ。ユーザー指定 2026-10-19) -----
    // 大当たりの振り分け: rounds (ラウンド数) と next (終わったあと。'normal' = 通常時 / 'jitan' = 時短 = RUSH)
    //   1ラウンド = アタッカーに count 個 (賞球 15 → 150個)。2R = 300個 / 10R = 1500個
    // firstHit: 通常時の特図1 (ヘソ) で当たったとき / rushHit: 特図2 (電チュー) の大当たり・小当たりからの V 入賞
    // board: スペックごとの釘調整 (お店が機種ごとに釘を調整するのと同じ)。出玉率を 80〜95% に合わせる (ユーザー指定 2026-10-19)
    //   hesoWidth: ヘソの命釘のすき間 (玉の直径は 6。広いほど入りやすい)
    //   warpMinVx: ワープに入る速さ (大きいほど入りにくい = ステージ経由のヘソ入賞が減る)
    // jitan.spins: 時短の回数 (特図を何回まわすか)。小当たりの確率と合わせて RUSH の継続率が決まる
    //   (時短が終わったあとの残り保留でも小当たりを引ける。継続率は tools/simulate.html で測って合わせる)
    specs: {
        s199: {
            label: '1/199',
            note: '甘めの確率。初当たりの半分が RUSH へ。RUSH は継続率 約85%、半分が 1500個',
            hitRate: 1 / 199,
            smallRate: 1 / 7,
            firstHit: [
                { weight: 50, rounds: 2, next: 'normal' },   // 300個のみ
                { weight: 50, rounds: 2, next: 'jitan' }     // 300個 + RUSH
            ],
            rushHit: [
                { weight: 50, rounds: 2, next: 'jitan' },    // 300個
                { weight: 50, rounds: 10, next: 'jitan' }    // 1500個
            ],
            jitan: { spins: 8 },
            board: { hesoWidth: 6.7, warpMinVx: 15 },
            target: { rushEntry: 0.5, continuation: 0.85 }
        },
        s319: {
            label: '1/319',
            note: '重い確率。初当たりはすべて RUSH へ挑戦。RUSH は継続率 約80%、すべて 1500個',
            hitRate: 1 / 319,
            smallRate: 1 / 7,
            firstHit: [
                { weight: 100, rounds: 2, next: 'jitan' }    // 300個 + 時短 (RUSH への挑戦)
            ],
            rushHit: [
                { weight: 100, rounds: 10, next: 'jitan' }   // 1500個
            ],
            jitan: { spins: 6 },
            board: { hesoWidth: 6.4, warpMinVx: 70 },
            target: { rushEntry: 0.8, continuation: 0.80 }
        }
    },

    // ----- 抽選と動きの時間 (両スペック共通) -----
    machine: {
        holdMax: 4,                  // 保留の上限 (特図1・特図2 それぞれ)
        // 特図2 の変動時間 (秒)。特図1 の変動時間は演出の流れ (config.show) で決まる (js/scenario.js)
        spin: {
            fig2: { miss: 2, small: 3, hit: 6 }
        },
        // 小当たり: アタッカーが open 秒開く。そのあいだに入った玉で V 入賞 → 大当たり (rushHit)
        small: { open: 1.8 },
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
        // 大当たりでそろう図柄: RUSH へ行く大当たりと 1500個 は奇数 (赤)、それ以外 (RUSH へ行かない 300個・RUSH 中の 300個) は偶数 (青)
        hitFigures: { odd: [1, 3, 5, 7], even: [2, 4, 6] },

        // 保留の色 (こおりくんの体の形)。期待度は低い順に 白 → 青 → 緑 → 紫 → 赤 → 虹。虹は大当たり確定 (ユーザー指定)
        // 玉がヘソに入ったときに、当たり・外れごとの重みで決める
        holdColors: {
            order: ['white', 'blue', 'green', 'purple', 'red', 'rainbow'],
            hit: { white: 10, blue: 12, green: 15, purple: 20, red: 28, rainbow: 15 },
            miss: { white: 900, blue: 60, green: 25, purple: 10, red: 5, rainbow: 0 },
            colors: { white: '#e8f6ff', blue: '#4f9bff', green: '#3fdf6f', purple: '#c070ff', red: '#ff3a3a' }
        },

        // 台のボタン (こおりくんの体の形)。ヘソに入ったときに 赤く光る・ぶるぶる震える・高い音 のどれかが起きる (ユーザー指定)
        // 起きたらその保留の当たりの確率が reliability (約60%) になるよう、外れのときに起きる確率を自動で計算する
        button: {
            hitRate: 0.3,            // 当たりの保留で起きる確率
            reliability: 0.6,        // 起きたときに当たっている確率 (ユーザー指定)
            kinds: { red: 40, shake: 30, beep: 30 },
            time: 1.2                // 光る・震える・鳴る時間 (秒)
        },

        // 特図1 の変動の流れ (秒)
        //   外れ: 図柄が回って止まる (miss。保留が shortenAt 個以上なら missShort)
        //   チャレンジ: 図柄が回る (roll) → チャレンジ (challenge) → 失敗 (fail) / 成功ならリーチ (reach) → バトル (battle) → 結果 (result)
        //   チャレンジに成功するとリーチになり、バトルに勝つと図柄がそろう (ユーザー指定)。当たりは必ずチャレンジ → 成功 → 勝ち
        timing: { miss: 7, missShort: 3.5, shortenAt: 3, roll: 3, challenge: 6, fail: 1.5, reach: 2.5, battle: 9, result: 3 },
        // 外れのうちチャレンジが出る割合。リーチ (成功) になる外れの割合は、バトルの成功率から自動で決まる
        challengeRate: 0.07,
        // チャレンジの種類 (ユーザー指定)。hit / miss は当たり・外れのときに選ぶ重み (外れの重みが小さいほど熱い)
        challenges: {
            treasure: { name: 'こおりくんの宝探し', map: 'treasure', hit: 25, miss: 60 },
            training: { name: 'おにおにの特訓', map: 'castleHall', hit: 35, miss: 30 },
            bento: { name: 'ともいしのお弁当作りチャレンジ', map: 'ongagawa', hit: 40, miss: 10 }
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
                naitei: ['こおりくん、内定のチャンスだよ！']
            },
            defeatLines: {
                okagappa: ['おかがっぱ、川にお帰り〜！', 'お皿、割れてないといいね♪'],
                hibikimakuri: ['やっと静かになった…！', '最後まで響いてたね…'],
                onioni: ['おにおにを倒した！ すごいよ！', 'お金のことは…また今度ね！'],
                naitei: ['こおりくん、内定おめでとう！', 'これで内定持ちだね…ふーん♪']
            }
        }
    }
};
