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

    // 賞球 (入賞1個あたりに払い出す玉の数)
    payout: { heso: 3, denchu: 1, general: 10, attacker: 15 },

    balls: {
        start: 250,          // はじめの持ち玉
        lend: 125            // 「玉貸し」1回で増える数 (500円分)
    }
};
