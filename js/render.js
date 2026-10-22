// =====================================================================
// 盤面の描画 (canvas)
// ---------------------------------------------------------------------
// 動かないもの (盤面の絵・レール・釘・液晶の枠) は最初に1枚の絵に描いておき、
// 毎フレームはそれを貼ってから、液晶・開け閉めする部品・風車・玉を上に描く。
// 盤面の論理座標を SCALE 倍した大きさの canvas に描く。
// =====================================================================

const BoardView = (() => {
    const SCALE = 2;
    // ふつうの 盤面の 色 (2026-10-23 ユーザー指定: 台の デザインを ルパン三世の 台の つくりに 合わせる。黒と 赤の「紅」)。
    //   accent: 赤い 飾り / accentDark: 盤面の まわりの 枠 / skyline: 液晶の 下の 街並み / window: 街の 窓 / deco: 回路の 線
    const BASE_COLORS = {
        boardTop: '#2a0812', boardBottom: '#0a0205',
        snow: 'rgba(255, 150, 170, 0.22)',
        rail: '#e8eaf0', railShadow: '#5a5a66',
        nail: '#d8dee8', nailShade: '#7a8698', nailLight: '#ffffff',
        frame: '#3a0610', frameLight: '#ff4a5a', frameDark: '#120204',
        stage: '#ffd0d8', stageShade: '#c8102e',
        accent: '#ff3a4a', accentDark: '#3a0410', skyline: '#14060a', window: '#ffb84a', deco: 'rgba(255, 90, 110, 0.12)',
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
        // レールの 外は 透明 (筐体の 絵が 盤面の 丸い 形に 合わせて 枠を 描く。2026-10-23 ユーザー指定: 四角の 空きを なくす)
        g.clearRect(0, 0, b.width, b.height);
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
        // 回路・地図の ような うすい 線 (透明な 盤面の 飾り。2026-10-23)
        g.save();
        g.beginPath();
        board.rails.outer.forEach(([x, y], i) => i ? g.lineTo(x, y) : g.moveTo(x, y));
        g.lineTo(board.rails.outer[board.rails.outer.length - 1][0], b.bottomY + 4);
        g.lineTo(board.rails.outer[0][0], b.bottomY + 4);
        g.clip();
        g.strokeStyle = COLORS.deco;
        g.fillStyle = COLORS.deco;
        g.lineWidth = 1;
        for (let i = 0; i < 46; i++) {
            let x = Math.floor(rnd() * b.width), y = Math.floor(rnd() * b.height);
            g.beginPath();
            g.moveTo(x, y);
            for (let k = 0; k < 3; k++) {
                if (rnd() < 0.5) x += (rnd() < 0.5 ? -1 : 1) * (8 + rnd() * 26); else y += (rnd() < 0.5 ? -1 : 1) * (8 + rnd() * 26);
                g.lineTo(x, y);
            }
            g.stroke();
            g.fillRect(x - 1, y - 1, 2, 2);
        }
        // 透明な 板の 光の すじ
        const shine = g.createLinearGradient(0, 0, b.width, b.height);
        shine.addColorStop(0, 'rgba(255,255,255,0)');
        shine.addColorStop(0.3, 'rgba(255,255,255,0.06)');
        shine.addColorStop(0.36, 'rgba(255,255,255,0)');
        shine.addColorStop(0.62, 'rgba(255,255,255,0.04)');
        shine.addColorStop(0.66, 'rgba(255,255,255,0)');
        g.fillStyle = shine;
        g.fillRect(0, 0, b.width, b.height);
        g.restore();
        // 液晶の 下の 街並み (SEタウン。窓が 光る)
        const lc = b.lcd;
        for (let x = lc.x - 6; x < lc.x + lc.w + 6;) {
            const bw = 6 + Math.floor(rnd() * 9), bh = 6 + Math.floor(rnd() * 14);
            g.fillStyle = COLORS.skyline;
            g.fillRect(x, 244 - bh, bw - 1, bh);
            g.fillStyle = COLORS.window;
            for (let wy = 244 - bh + 2; wy < 242; wy += 3) for (let wx = x + 1; wx < x + bw - 2; wx += 2) if (rnd() < 0.35) g.fillRect(wx, wy, 1, 1);
            x += bw;
        }
        // 右下の ダイヤ (氷の 結晶)
        const dx = 318, dy = 452, ds = 9;
        g.strokeStyle = 'rgba(255, 220, 230, 0.75)';
        g.lineWidth = 1;
        g.beginPath();
        g.moveTo(dx - ds, dy - ds * 0.3); g.lineTo(dx - ds * 0.5, dy - ds * 0.8); g.lineTo(dx + ds * 0.5, dy - ds * 0.8); g.lineTo(dx + ds, dy - ds * 0.3); g.lineTo(dx, dy + ds); g.closePath();
        g.fillStyle = COLORS.deco;
        g.fill();
        g.moveTo(dx - ds, dy - ds * 0.3); g.lineTo(dx + ds, dy - ds * 0.3);
        g.moveTo(dx - ds * 0.5, dy - ds * 0.8); g.lineTo(dx, dy + ds); g.lineTo(dx + ds * 0.5, dy - ds * 0.8);
        g.stroke();

        // 右打ちの通り道に色をつける
        g.fillStyle = 'rgba(255, 80, 110, 0.07)';
        g.beginPath();
        [...b.rightDivider, [b.width - 20, 372], [b.width - 20, 228]].forEach(([x, y], i) => i ? g.lineTo(x, y) : g.moveTo(x, y));
        g.fill();

        // レール (外の レールには 赤い 帯を そえる)
        line(g, board.rails.outer, 9, COLORS.accentDark);
        line(g, board.rails.outer, 5, COLORS.accent);
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
        // 枠の上の飾り: 赤い ロゴ「こおりくん」に 白い ふち (ルパン三世の 台の 液晶の 上の ロゴの ように。2026-10-23)
        // 小さすぎるとドット文字の「こ」がつぶれるので 12px 以上
        g.font = 'bold 15px "DotGothic16", "MS Gothic", monospace';
        g.textAlign = 'center';
        g.lineWidth = 3;
        g.strokeStyle = '#ffffff';
        g.strokeText('こおりくん', b.center.x, f.shoulder - 6);   // 液晶を 大きく したので 少し 上
        g.fillStyle = COLORS.accent;
        g.fillText('こおりくん', b.center.x, f.shoulder - 6);

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

    // 盤面の役物 (2026-10-23 ユーザー指定で 新しく した。ルパン三世の 台の ロゴの 役物の ように 落ちて 回る):
    //   ふだんは 液晶の 枠の 屋根の 上に 氷の 結晶の メダル (表: こおりくん / 裏: おにおに) が 乗っている。
    //   t (0〜1。Lcd.gimmick) の あいだ、液晶の 前へ 落ちてきて 大きくなり、くるくる 回って 虹色に 光り、光の すじが 出る。最後に 屋根へ もどる
    //   (役物が 動く ときと 当たり確定の 意味は 前の こおりくんの 役物と 同じ)
    function hexPath(ctx, cx, cy, r, sx) {
        ctx.beginPath();
        for (let i = 0; i < 6; i++) {
            const a = Math.PI / 6 + i * Math.PI / 3;
            const x = cx + Math.cos(a) * r * sx, y = cy + Math.sin(a) * r;
            if (i) ctx.lineTo(x, y); else ctx.moveTo(x, y);
        }
        ctx.closePath();
    }
    function drawGimmick(ctx, b, t, now) {
        const f = b.lcdFrame;
        const cx = (f.left + f.right) / 2;
        const restY = f.top - 9;                  // 屋根の 上 (メダルの まんなか)
        const downY = b.lcd.y + b.lcd.h * 0.5;    // 液晶の まんなか
        let k = 0;   // 0: 屋根の上 / 1: 液晶の前
        if (t !== null) k = t < 0.18 ? (t / 0.18) ** 2 : t < 0.82 ? 1 : 1 - (t - 0.82) / 0.18;
        const r = 9 + k * 30;
        const cy = restY + (downY - restY) * k;
        // 回る (横に つぶれて 見える。裏は おにおに)
        const spin = t !== null && t >= 0.18 && t < 0.82 ? (t - 0.18) / 0.64 * Math.PI * 6 : 0;
        const sx = Math.cos(spin);
        const back = sx < 0;
        const hue = (now * 360) % 360;
        if (k > 0.4) {
            // 光の すじと 虹色の 輪
            ctx.save();
            ctx.globalAlpha = Math.min(1, (k - 0.4) / 0.4);
            for (let i = 0; i < 16; i++) {
                const a = i / 16 * Math.PI * 2 + now * 1.5;
                ctx.strokeStyle = `hsla(${hue + i * 22}, 95%, 65%, 0.55)`;
                ctx.lineWidth = 3;
                ctx.beginPath();
                ctx.moveTo(cx + Math.cos(a) * r * 1.1, cy + Math.sin(a) * r * 1.1);
                ctx.lineTo(cx + Math.cos(a) * r * 2.4, cy + Math.sin(a) * r * 2.4);
                ctx.stroke();
            }
            ctx.fillStyle = `hsla(${hue}, 90%, 60%, 0.35)`;
            ctx.beginPath();
            ctx.arc(cx, cy, r * 1.35, 0, Math.PI * 2);
            ctx.fill();
            ctx.restore();
        }
        // メダル: 銀の ふち (光る ときは 虹色)・氷の 面 (裏は 赤)
        const w = Math.max(0.08, Math.abs(sx));
        hexPath(ctx, cx, cy, r, w);
        ctx.fillStyle = k > 0.4 ? `hsl(${hue}, 90%, 70%)` : '#e8eaf0';
        ctx.fill();
        hexPath(ctx, cx, cy, r * 0.84, w);
        const face = ctx.createLinearGradient(cx - r, cy - r, cx + r, cy + r);
        face.addColorStop(0, back ? '#ff8a8a' : '#ffffff');
        face.addColorStop(0.5, back ? COLORS.accent : '#bff0ff');
        face.addColorStop(1, back ? COLORS.accentDark : '#4aa8e0');
        ctx.fillStyle = face;
        ctx.fill();
        // 顔 (表: こおりくん / 裏: おにおに)。横に つぶす
        ctx.save();
        ctx.translate(cx, cy);
        ctx.scale(w, 1);
        ctx.imageSmoothingEnabled = false;
        if (back && typeof Characters !== 'undefined' && Characters.has('onioni')) {
            const sz = Characters.size('onioni');
            Characters.drawEnemy(ctx, 'onioni', 0, r * 0.62, { scale: (r * 1.25) / sz.h, frame: 0 });
        } else {
            const s = (r * 1.15) / 16;
            drawSprite(ctx, SPRITES.koori, 'walk1', -8 * s, -8 * s - r * 0.05, s);
        }
        ctx.restore();
        // ふだんの メダルの きらり
        if (k === 0) {
            const a = (Math.sin(now * 2) + 1) / 2;
            ctx.fillStyle = `rgba(255,255,255,${a})`;
            ctx.fillRect(cx + r * 0.3, cy - r * 0.6, 1, 4);
            ctx.fillRect(cx + r * 0.3 - 1.5, cy - r * 0.6 + 1.5, 4, 1);
        }
    }

    // lcdCanvas: 液晶の絵 (256x144)。玉と部品は view.world から。gimmick: 役物の進み具合 (0〜1、動いていないときは null)
    function draw(view, world, lcdCanvas, gimmick = null, now = 0) {
        const { ctx, board } = view;
        const b = board.config;
        ctx.setTransform(1, 0, 0, 1, 0, 0);
        ctx.clearRect(0, 0, view.canvas.width, view.canvas.height);   // レールの 外は 透明
        ctx.drawImage(view.base, 0, 0);
        ctx.setTransform(SCALE, 0, 0, SCALE, 0, 0);

        if (lcdCanvas) {
            ctx.imageSmoothingEnabled = false;
            ctx.drawImage(lcdCanvas, b.lcd.x, b.lcd.y, b.lcd.w, b.lcd.h);
        }
        // 盤面の 役物は 筐体 (js/cabinet.js) が 大きく 描く ときは 描かない (view.noGimmick。2026-10-23 ユーザー指定)
        if (!view.noGimmick) drawGimmick(ctx, b, gimmick, now);

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

    // 盤面の 形 (レールの 外の ふち。筐体が この 形に 合わせて 枠を 描く): 盤面の 座標の 点の 列
    function outline(board) {
        const o = board.rails.outer, b = board.config;
        return [...o, [o[o.length - 1][0], b.bottomY + 4], [o[0][0], b.bottomY + 4]];
    }

    return { create, draw, redraw, toBoard, outline, SCALE };
})();
