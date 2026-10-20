// =====================================================================
// 盤面の描画 (canvas)
// ---------------------------------------------------------------------
// 動かないもの (盤面の絵・レール・釘・液晶の枠) は最初に1枚の絵に描いておき、
// 毎フレームはそれを貼ってから、液晶・開け閉めする部品・風車・玉を上に描く。
// 盤面の論理座標を SCALE 倍した大きさの canvas に描く。
// =====================================================================

const BoardView = (() => {
    const SCALE = 2;
    const BASE_COLORS = {
        boardTop: '#0d2a4a', boardBottom: '#071528',
        snow: 'rgba(200, 235, 255, 0.35)',
        rail: '#c8d4e0', railShadow: '#56657a',
        nail: '#d8dee8', nailShade: '#7a8698', nailLight: '#ffffff',
        frame: '#1b3a6b', frameLight: '#7fd3f7', frameDark: '#0b1a33',
        stage: '#bff0ff', stageShade: '#4aa8e0',
        pocket: '#ffcc33', pocketDark: '#a06a10',
        denchu: '#ff6a8a', attacker: '#ff3355', attackerOpen: '#ffe066',
        gate: '#9cff8a', warp: '#ffffff',
        windmill: '#ff9eb5', windmillHub: '#ffffff',
        ball: '#e8edf2', ballShade: '#8a96a6', ballLight: '#ffffff'
    };
    // いまの色 (カスタマイズの盤面の色・玉の色で上書きする)
    const COLORS = { ...BASE_COLORS };
    function applyColors() {
        Object.assign(COLORS, BASE_COLORS, typeof Customize !== 'undefined' ? Customize.boardColors() : {});
    }

    function create(canvas, board, config) {
        applyColors();
        const b = board.config;
        canvas.width = b.width * SCALE;
        canvas.height = b.height * SCALE;
        const ctx = canvas.getContext('2d');
        const base = document.createElement('canvas');
        base.width = canvas.width;
        base.height = canvas.height;
        drawStatic(base.getContext('2d'), board, config);
        // ドットフォントの読み込みが終わったら描き直す (読み込み前は別の字体で描かれるため)
        if (document.fonts && document.fonts.ready) {
            document.fonts.ready.then(() => {
                const g = base.getContext('2d');
                g.setTransform(1, 0, 0, 1, 0, 0);
                g.clearRect(0, 0, base.width, base.height);
                drawStatic(g, board, config);
            });
        }
        return { canvas, ctx, base, board, config };
    }

    function line(g, points, width, color) {
        g.strokeStyle = color;
        g.lineWidth = width;
        g.lineCap = 'round';
        g.lineJoin = 'round';
        g.beginPath();
        points.forEach(([x, y], i) => i ? g.lineTo(x, y) : g.moveTo(x, y));
        g.stroke();
    }

    function disc(g, x, y, r, color) {
        g.fillStyle = color;
        g.beginPath();
        g.arc(x, y, r, 0, Math.PI * 2);
        g.fill();
    }

    function drawStatic(g, board, config) {
        const b = board.config;
        g.save();
        g.scale(SCALE, SCALE);

        // 盤面の地 (氷の夜空)
        const grad = g.createLinearGradient(0, 0, 0, b.height);
        grad.addColorStop(0, COLORS.boardTop);
        grad.addColorStop(1, COLORS.boardBottom);
        g.fillStyle = '#05070d';
        g.fillRect(0, 0, b.width, b.height);
        g.fillStyle = grad;
        g.beginPath();
        board.rails.outer.forEach(([x, y], i) => i ? g.lineTo(x, y) : g.moveTo(x, y));
        g.lineTo(board.rails.outer[board.rails.outer.length - 1][0], b.bottomY + 4);
        g.lineTo(board.rails.outer[0][0], b.bottomY + 4);
        g.fill();
        // 雪の粒 (毎回同じ配置)
        let seed = 7;
        const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
        g.fillStyle = COLORS.snow;
        for (let i = 0; i < 260; i++) g.fillRect(Math.floor(rnd() * b.width), Math.floor(rnd() * b.height), 1, 1);

        // 右打ちの通り道に色をつける
        g.fillStyle = 'rgba(255, 80, 110, 0.07)';
        g.beginPath();
        [...b.rightDivider, [b.width - 20, 372], [b.width - 20, 228]].forEach(([x, y], i) => i ? g.lineTo(x, y) : g.moveTo(x, y));
        g.fill();

        // レール
        line(g, board.rails.outer, 3, COLORS.railShadow);
        line(g, board.rails.outer, 1.6, COLORS.rail);
        line(g, board.rails.inner, 3, COLORS.railShadow);
        line(g, board.rails.inner, 1.6, COLORS.rail);
        const os = board.rails.outer[0], oe = board.rails.outer[board.rails.outer.length - 1], is = board.rails.inner[0];
        line(g, [os, [os[0], b.bottomY + 4]], 1.6, COLORS.rail);
        line(g, [oe, [oe[0], b.bottomY + 4]], 1.6, COLORS.rail);
        line(g, [is, [is[0], config.launch.foulY + 4]], 1.6, COLORS.rail);

        // 返しゴム
        const rb = board.rubber;
        line(g, [[rb.x1, rb.y1], [rb.x2, rb.y2]], 3, '#ff6a8a');

        // 壁 (床・右打ちの壁)
        board.segments.filter(s => s.surface === 'wall').forEach(s => line(g, [[s.x1, s.y1], [s.x2, s.y2]], 1.4, '#8fb4d8'));

        // 液晶の枠 (氷のブロック)
        const f = b.lcdFrame;
        const framePath = Board.framePolygon(f);
        g.fillStyle = COLORS.frame;
        g.beginPath();
        framePath.forEach(([x, y], i) => i ? g.lineTo(x, y) : g.moveTo(x, y));
        g.closePath();
        g.fill();
        line(g, framePath, 1.5, COLORS.frameLight);
        g.fillStyle = COLORS.frameDark;
        g.fillRect(b.lcd.x - 2, b.lcd.y - 2, b.lcd.w + 4, b.lcd.h + 4);
        // 枠の上の飾り: 「こおり」の文字
        g.fillStyle = COLORS.frameLight;
        // 小さすぎるとドット文字の「こ」がつぶれるので 12px
        g.font = '12px "DotGothic16", "MS Gothic", monospace';
        g.textAlign = 'center';
        g.fillText('P こおりくん', b.center.x, f.shoulder - 3);

        // ワープ入口
        const w = b.warp;
        g.fillStyle = 'rgba(255, 255, 255, 0.25)';
        g.fillRect(w.x, w.y, w.w, w.h);
        line(g, [[w.x, w.y], [w.x, w.y + w.h]], 1, COLORS.warp);

        // ステージ
        [b.stage.left, b.stage.right].forEach(points => {
            line(g, points, 3, COLORS.stageShade);
            line(g, points, 1.4, COLORS.stage);
        });
        b.stage.spills.forEach(s => disc(g, s.x, s.y + 2, 1.5, '#000'));

        // 入賞口
        Object.entries(b.pockets).forEach(([id, p]) => {
            const half = p.width / 2 + b.nailRadius;
            const color = p.kind === 'denchu' ? COLORS.denchu : p.kind === 'attacker' ? COLORS.attacker : COLORS.pocket;
            g.fillStyle = COLORS.pocketDark;
            g.fillRect(p.x - half - 2, p.y + 1, half * 2 + 4, 6);
            g.fillStyle = color;
            g.fillRect(p.x - half - 2, p.y + 6, half * 2 + 4, 2);
            if (id === 'heso') {
                g.fillStyle = '#fff';
                g.font = '6px "DotGothic16", "MS Gothic", monospace';
                g.fillText('START', p.x, p.y + 14);
            }
        });
        // ゲート
        Object.values(b.gates).forEach(gt => {
            g.strokeStyle = COLORS.gate;
            g.lineWidth = 1;
            g.strokeRect(gt.x - gt.width / 2 - 2, gt.y - 3, gt.width + 4, 6);
        });

        // 釘
        board.circles.filter(c => c.surface === 'nail').forEach(c => {
            disc(g, c.x + 0.3, c.y + 0.3, c.r, COLORS.nailShade);
            disc(g, c.x, c.y, c.r, COLORS.nail);
            g.fillStyle = COLORS.nailLight;
            g.fillRect(c.x - 0.6, c.y - 0.6, 0.6, 0.6);
        });

        // 右打ちの矢印
        g.fillStyle = 'rgba(255, 120, 140, 0.8)';
        g.font = '7px "DotGothic16", "MS Gothic", monospace';
        g.fillText('右打ち→', 306, 232);
        g.restore();
    }

    // 盤面の役物 (ユーザー指定 2026-10-20): ふだんは液晶の枠の屋根の上に小さいこおりくんが座っている。
    // t (0〜1。Lcd.gimmick) のあいだ、液晶の前へ落ちてきて大きくなり、虹色に光ってぶるぶる震え、最後に屋根へ戻る
    function drawGimmick(ctx, b, t, now) {
        const f = b.lcdFrame;
        const cx = (f.left + f.right) / 2;
        const restY = f.top - 15;        // 屋根の上 (足もと)
        const downY = b.lcd.y + b.lcd.h * 0.8;
        let k = 0;   // 0: 屋根の上 / 1: 液晶の前
        if (t !== null) k = t < 0.2 ? (t / 0.2) ** 2 : t < 0.8 ? 1 : 1 - (t - 0.8) / 0.2;
        const scale = 1 + k * 3;
        const size = 16 * scale;
        const shake = t !== null && t >= 0.2 && t < 0.8 ? Math.sin(now * 50) * 1.5 : 0;
        const footY = restY + (downY - restY) * k;
        const x = cx - size / 2 + shake;
        const y = footY - size;
        if (k > 0.5) {
            // 虹色の後光
            ctx.fillStyle = `hsla(${(now * 360) % 360}, 90%, 60%, 0.45)`;
            ctx.fillRect(x - 8, y - 8, size + 16, size + 16);
        }
        ctx.imageSmoothingEnabled = false;
        drawSprite(ctx, SPRITES.koori, 'walk1', x, y, scale);
    }

    // lcdCanvas: 液晶の絵 (256x144)。玉と部品は view.world から。gimmick: 役物の進み具合 (0〜1、動いていないときは null)
    function draw(view, world, lcdCanvas, gimmick = null, now = 0) {
        const { ctx, board } = view;
        const b = board.config;
        ctx.setTransform(1, 0, 0, 1, 0, 0);
        ctx.drawImage(view.base, 0, 0);
        ctx.setTransform(SCALE, 0, 0, SCALE, 0, 0);

        if (lcdCanvas) {
            ctx.imageSmoothingEnabled = false;
            ctx.drawImage(lcdCanvas, b.lcd.x, b.lcd.y, b.lcd.w, b.lcd.h);
        }
        drawGimmick(ctx, b, gimmick, now);

        // 電チューの羽根・アタッカーのふた
        Object.entries(board.parts).forEach(([id, part]) => {
            const kind = b.pockets[id].kind;
            const color = kind === 'attacker' ? (part.open ? COLORS.attackerOpen : COLORS.attacker) : COLORS.denchu;
            (part.open ? part.opened : part.closed).forEach(s => line(ctx, [[s.x1, s.y1], [s.x2, s.y2]], kind === 'attacker' ? 3 : 2, color));
            if (kind === 'attacker' && part.open) {
                const p = b.pockets[id];
                ctx.fillStyle = 'rgba(255, 224, 102, 0.35)';
                ctx.fillRect(p.x - p.width / 2, p.y, p.width, 6);
            }
        });

        // 風車
        board.windmills.forEach(m => {
            Board.windmillBlades(m).forEach(s => line(ctx, [[s.x1, s.y1], [s.x2, s.y2]], 2, COLORS.windmill));
            disc(ctx, m.x, m.y, 2, COLORS.windmillHub);
        });

        // 玉
        world.balls.forEach(ball => {
            disc(ctx, ball.x + 0.4, ball.y + 0.5, ball.r, 'rgba(0, 0, 0, 0.35)');
            disc(ctx, ball.x, ball.y, ball.r, COLORS.ballShade);
            disc(ctx, ball.x - 0.4, ball.y - 0.4, ball.r - 0.7, COLORS.ball);
            disc(ctx, ball.x - 1.1, ball.y - 1.1, 0.8, COLORS.ballLight);
        });
    }

    // カスタマイズで色が変わったときに、動かない部分を描き直す
    function redraw(view) {
        applyColors();
        const g = view.base.getContext('2d');
        g.setTransform(1, 0, 0, 1, 0, 0);
        g.clearRect(0, 0, view.base.width, view.base.height);
        drawStatic(g, view.board, view.config);
    }

    // 画面上の位置 (CSS ピクセル) → 盤面の論理座標
    function toBoard(view, clientX, clientY) {
        const rect = view.canvas.getBoundingClientRect();
        return [(clientX - rect.left) / rect.width * view.board.config.width, (clientY - rect.top) / rect.height * view.board.config.height];
    }

    return { create, draw, redraw, toBoard, SCALE };
})();
