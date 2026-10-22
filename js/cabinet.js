// =====================================================================
// 台の筐体 (2026-10-23 ユーザー指定: 台の デザインを 一新。ルパン三世の 台の つくりを 参考に)
// ---------------------------------------------------------------------
// 盤面 (canvas#board) の まわりに 筐体を 描く (canvas.cabinet-art。盤面の 下に 重ねる)。
// 参考に した つくり (実機の 絵は 写さず、こおりくんの 台として 新しく 描く):
//   - 黒い 本体と、左上・右上の 赤い ハウジングに 入った 丸い スピーカー
//   - 上の まんなかの イラストの パネル (こおりくん・おにおに・ふるカワと ロゴ)
//   - 左右の 透明な 結晶の 飾り、赤い 枠に そって 流れる LED
//   - 右: 上から つきだす 白く 光る 管と、その 下の 丸い ランプ。ランプは 先バレで 赤・紫・虹に 光る (lamp)
//   - 下: まんなかの 赤黒の PUSH ユニット (押せる。#cabinet-push が 台の ボタンに つなぐ)・左右の スピーカーの 網
// 台の 状態 (mode: normal / rush / small / bonus、premium、gimmick 役物が 動く 0〜1、button 台の ボタンの 光り方) で 光り方が かわる。
// 大きさは 画面に 合わせて かわる (盤面の 位置を 測って 描く)。
// =====================================================================

const Cabinet = (() => {
    const FONT = '"DotGothic16", "MS Gothic", monospace';
    const LAMP_TIME = 3;   // 先バレの ランプが 光って いる 秒
    let cv = null, g = null, wrap = null, boardEl = null;
    let W = 0, H = 0, dpr = 1;
    const B = { x: 0, y: 0, w: 0, h: 0 };   // 盤面の 位置 (筐体の 中の CSS px)
    let lampState = null;                  // { kind: red / purple / rainbow, at }
    // LED の 色 (台の 状態ごと)
    const LED = { normal: ['#7fd3f7', '#e8f8ff'], small: ['#ffe066', '#fff4b0'], rush: ['#ff3a4a', '#ffd84a'] };
    const RED = '#c8102e', RED_LIGHT = '#ff3a4a', RED_DARK = '#5a0410';

    function create(canvas, board) {
        cv = canvas;
        g = cv.getContext('2d');
        wrap = cv.parentElement;
        boardEl = board;
        resize();
        window.addEventListener('resize', resize);
        if (typeof ResizeObserver !== 'undefined') new ResizeObserver(resize).observe(wrap);
    }
    function resize() {
        if (!cv) return;
        dpr = Math.min(2, window.devicePixelRatio || 1);
        W = wrap.clientWidth;
        H = wrap.clientHeight;
        cv.width = Math.max(1, Math.round(W * dpr));
        cv.height = Math.max(1, Math.round(H * dpr));
        Object.assign(B, { x: boardEl.offsetLeft, y: boardEl.offsetTop, w: boardEl.offsetWidth, h: boardEl.offsetHeight });
    }
    // 先バレ: 右の 丸い ランプを 光らせる (button.js の trigger から。red / purple / rainbow)
    function lamp(kind, now) {
        if (kind === 'red' || kind === 'purple' || kind === 'rainbow') lampState = { kind, at: now };
    }
    const lampOn = t => (lampState && t - lampState.at >= 0 && t - lampState.at < LAMP_TIME ? lampState : null);

    // ----- 道具 -----
    const hsl = (h, s = 90, l = 62, a = 1) => `hsla(${((h % 360) + 360) % 360}, ${s}%, ${l}%, ${a})`;
    function rr(x, y, w, h, r) {
        r = Math.max(0, Math.min(r, w / 2, h / 2));
        g.beginPath();
        g.moveTo(x + r, y);
        g.arcTo(x + w, y, x + w, y + h, r);
        g.arcTo(x + w, y + h, x, y + h, r);
        g.arcTo(x, y + h, x, y, r);
        g.arcTo(x, y, x + w, y, r);
        g.closePath();
    }
    const lin = (x0, y0, x1, y1, stops) => {
        const gr = g.createLinearGradient(x0, y0, x1, y1);
        stops.forEach(([o, c]) => gr.addColorStop(o, c));
        return gr;
    };
    const rad = (x, y, r0, r1, stops) => {
        const gr = g.createRadialGradient(x, y, r0, x, y, r1);
        stops.forEach(([o, c]) => gr.addColorStop(o, c));
        return gr;
    };
    const rainbowish = st => st.mode === 'bonus' || st.premium;
    function ledColor(st, i, t) {
        if (rainbowish(st)) return hsl(i * 18 - t * 240, 95, st.premium ? 72 : 62);
        const [a, b] = LED[st.mode] || LED.normal;
        return (Math.floor(i / 3 + t * (st.mode === 'rush' ? 6 : 2)) % 2) ? a : b;
    }
    const side = () => B.x;                      // 盤面の 左の 枠の 幅
    const rside = () => W - (B.x + B.w);         // 右の 枠の 幅
    const bottomTop = () => B.y + B.h;           // 下の 段の 上

    // ----- 部品 -----
    // 黒い 本体
    function body() {
        const top = B.y * 0.18;
        rr(1, top, W - 2, H - top - 1, Math.min(26, W * 0.05));
        g.fillStyle = lin(0, top, W, H, [[0, '#1c1c24'], [0.5, '#0c0c12'], [1, '#050508']]);
        g.fill();
        g.lineWidth = 2;
        g.strokeStyle = '#2a2a34';
        g.stroke();
        // 黒い 面の 細かい 凹凸 (ななめの 線)
        g.save();
        rr(1, top, W - 2, H - top - 1, Math.min(26, W * 0.05));
        g.clip();
        g.strokeStyle = 'rgba(255,255,255,.035)';
        g.lineWidth = 1;
        for (let x = -H; x < W; x += 9) {
            g.beginPath();
            g.moveTo(x, H);
            g.lineTo(x + H, 0);
            g.stroke();
        }
        g.restore();
    }
    // 赤い 枠: 盤面の まわりの 赤い ふち と、左上・右上の スピーカーの ハウジング
    function redFrame(st, t) {
        const s = side();
        // 盤面を かこむ 赤い ふち (上が まるい)
        const pad = Math.max(4, s * 0.28);
        rr(B.x - pad, B.y - pad * 1.2, B.w + pad * 2, B.h * 0.78, Math.min(B.w * 0.35, 120));
        g.fillStyle = lin(0, B.y, 0, B.y + B.h * 0.78, [[0, RED_LIGHT], [0.25, RED], [1, RED_DARK]]);
        g.fill();
        // ハウジング (スピーカーの 入れもの)
        const hr = Math.min(B.y * 0.52, B.w * 0.16);
        for (const [cx, dir] of [[B.x + hr * 0.55, -1], [B.x + B.w - hr * 0.55, 1]]) {
            const cy = B.y - hr * 0.15;
            g.beginPath();
            g.ellipse(cx, cy, hr * 1.15, hr * 1.05, dir * 0.25, 0, Math.PI * 2);
            g.fillStyle = lin(cx - hr, cy - hr, cx + hr, cy + hr, [[0, '#ff5a6a'], [0.45, RED], [1, RED_DARK]]);
            g.fill();
            g.strokeStyle = 'rgba(0,0,0,.5)';
            g.lineWidth = 2;
            g.stroke();
            speaker(cx, cy, hr * 0.72, st, t);
        }
        // 赤い 枠の ふちの LED (流れる)
        const n = 40;
        for (let i = 0; i < n; i++) {
            const k = i / (n - 1);
            const y = B.y + B.h * 0.7 * (1 - k);
            for (const x of [B.x - pad * 0.55, B.x + B.w + pad * 0.55]) {
                const on = (i + Math.floor(t * (st.mode === 'normal' ? 8 : 18))) % 6 < 2;
                g.fillStyle = on ? ledColor(st, i, t) : 'rgba(255,255,255,.12)';
                g.fillRect(x - 1, y - 1, 2, 2);
            }
        }
    }
    function speaker(cx, cy, r0, st, t) {
        g.beginPath();
        g.arc(cx, cy, r0, 0, Math.PI * 2);
        g.fillStyle = rad(cx - r0 * 0.3, cy - r0 * 0.3, r0 * 0.1, r0, [[0, '#3a3a44'], [1, '#08080c']]);
        g.fill();
        // 網の 点
        g.fillStyle = '#1e1e26';
        const step = Math.max(2, r0 / 4.5);
        for (let y = -r0; y <= r0; y += step) for (let x = -r0; x <= r0; x += step) if (x * x + y * y < (r0 * 0.82) ** 2) g.fillRect(cx + x - 0.7, cy + y - 0.7, 1.4, 1.4);
        // まわりの 光の 輪 (状態の 色)
        g.strokeStyle = rainbowish(st) ? hsl(t * 200 + cx) : (LED[st.mode] || LED.normal)[0];
        g.lineWidth = Math.max(1.2, r0 * 0.08);
        g.globalAlpha = 0.45 + 0.4 * Math.sin(t * 5 + cx);
        g.beginPath();
        g.arc(cx, cy, r0 * 1.02, 0, Math.PI * 2);
        g.stroke();
        g.globalAlpha = 1;
    }
    // 上の まんなかの イラストの パネル (こおりくん・おにおに・ふるカワと ロゴ)
    function topPanel(st, t) {
        const hr = Math.min(B.y * 0.52, B.w * 0.16);
        const px = B.x + hr * 1.05, pw = B.w - hr * 2.1;   // ハウジングに 少し かぶせて 広く
        const py = B.y * 0.16, ph = B.y * 0.78;
        if (pw < 40 || ph < 20) return;
        const cx = px + pw / 2, cy = py + ph / 2;
        g.save();
        rr(px, py, pw, ph, ph * 0.12);
        g.clip();
        // ピンクと 水色の まんがの 地 + 集中線
        g.fillStyle = lin(px, py, px + pw, py + ph, [[0, '#ffd0e0'], [0.5, '#ffe8f0'], [1, '#bfe8ff']]);
        g.fillRect(px, py, pw, ph);
        g.strokeStyle = 'rgba(255,120,160,.25)';
        g.lineWidth = 1;
        for (let i = 0; i < 28; i++) {
            const a = i / 28 * Math.PI * 2 + t * 0.2;
            g.beginPath();
            g.moveTo(cx + Math.cos(a) * ph * 0.3, cy + Math.sin(a) * ph * 0.3);
            g.lineTo(cx + Math.cos(a) * pw, cy + Math.sin(a) * pw);
            g.stroke();
        }
        // キャラ: 左に こおりくん、右に おにおに (パネルの 下から のぞく)。ロゴの 上に ふるカワ
        const s = ph * 0.62 / 16;
        if (typeof SPRITES !== 'undefined' && SPRITES.koori) drawSprite(g, SPRITES.koori, Math.floor(t * 2) % 2 ? 'walk1' : 'walk2', px + pw * 0.02, py + ph - 16 * s * 0.92, s);
        if (typeof Characters !== 'undefined' && Characters.has('onioni')) {
            const sz = Characters.size('onioni');
            const sc = (ph * 0.78) / sz.h;
            Characters.drawEnemy(g, 'onioni', px + pw - sz.w * sc * 0.55, py + ph * 1.04, { scale: sc, frame: Math.floor(t * 2) % 2 });
        }
        if (typeof SPRITES !== 'undefined' && SPRITES.furukawa) drawSprite(g, SPRITES.furukawa, Math.floor(t * 3) % 2 ? 'talk' : 'idle', cx - 8 * s * 0.4, py + ph * 0.02, s * 0.4);
        g.restore();
        // ロゴ (赤い ドットの 字に 白い ふち)
        const size = Math.min(ph * 0.3, pw * 0.1);
        g.textAlign = 'center';
        g.textBaseline = 'middle';
        g.font = `bold ${Math.round(size)}px ${FONT}`;
        g.lineWidth = Math.max(3, size * 0.24);
        g.strokeStyle = '#ffffff';
        g.strokeText('Pこおりくん', cx, py + ph * 0.5);
        g.fillStyle = lin(0, py + ph * 0.3, 0, py + ph * 0.7, [[0, RED_LIGHT], [1, '#8a0a1a']]);
        g.fillText('Pこおりくん', cx, py + ph * 0.5);
        // 「内定ツラヌキ物語」の スタンプ
        const ss = size * 0.42;
        g.font = `bold ${Math.round(ss)}px ${FONT}`;
        const label = '内定ツラヌキ物語';
        const lw = g.measureText(label).width + ss;
        g.save();
        g.translate(cx, py + ph * 0.82);
        g.rotate(-0.05);
        rr(-lw / 2, -ss * 0.75, lw, ss * 1.5, ss * 0.5);
        g.fillStyle = '#ffe066';
        g.fill();
        g.strokeStyle = '#a04a00';
        g.lineWidth = 1.5;
        g.stroke();
        g.fillStyle = '#7a2a00';
        g.fillText(label, 0, 1);
        g.restore();
        // ふち
        rr(px, py, pw, ph, ph * 0.12);
        g.strokeStyle = '#2a2a34';
        g.lineWidth = 2;
        g.stroke();
        g.textAlign = 'left';
    }
    // 左右の 透明な 結晶の 飾り (光る)
    function crystals(st, t) {
        const s = side();
        if (s < 8) return;
        const glow = rainbowish(st) ? hsl(t * 120, 90, 70) : st.mode === 'rush' ? '#ff9ab0' : '#c8b0ff';
        const cluster = (x, y, size, dir) => {
            for (let k = 0; k < 4; k++) {
                const h = size * (1 - k * 0.18), w = size * 0.32;
                const ox = x + dir * k * w * 0.6, oy = y + k * size * 0.12;
                g.beginPath();
                g.moveTo(ox, oy - h);
                g.lineTo(ox + w / 2, oy - h * 0.7);
                g.lineTo(ox + w / 2, oy);
                g.lineTo(ox - w / 2, oy);
                g.lineTo(ox - w / 2, oy - h * 0.7);
                g.closePath();
                g.fillStyle = lin(ox, oy - h, ox, oy, [[0, 'rgba(255,255,255,.9)'], [0.4, glow], [1, 'rgba(80,40,160,.35)']]);
                g.globalAlpha = 0.55 + 0.3 * Math.sin(t * 3 + k + y);
                g.fill();
                g.globalAlpha = 1;
            }
        };
        cluster(s * 0.35, B.y + B.h * 0.28, s * 1.4, 1);
        cluster(s * 0.35, B.y + B.h * 0.62, s * 1.1, 1);
        if (rside() >= 8) cluster(W - rside() * 0.35, B.y + B.h * 0.9, rside() * 1.1, -1);
    }
    // 右: 白く 光る 管 (上から つきだす) と、黒い つかみ
    function tube(st, t) {
        const r = rside();
        if (r < 12) return;
        const cx = B.x + B.w + r * 0.55, tw = Math.max(5, r * 0.36);
        const top = 4, bottom = B.y + B.h * 0.5;
        // 黒い つかみ (上と 下で 管を はさむ)
        g.fillStyle = '#121218';
        rr(cx - tw * 0.9, top - 2, tw * 1.8, tw * 1.6, tw * 0.5);
        g.fill();
        rr(cx - tw * 0.9, bottom - tw * 2.2, tw * 1.8, tw * 2.4, tw * 0.5);
        g.fill();
        // 管
        const flash = st.gimmick != null ? 1 : 0;
        const core = rainbowish(st) ? hsl(t * 220, 95, 75) : st.mode === 'rush' ? '#ff8a9a' : '#ffffff';
        g.shadowColor = rainbowish(st) ? core : st.mode === 'rush' ? '#ff3a4a' : '#bff0ff';
        g.shadowBlur = 10 + flash * 24 + 4 * Math.sin(t * 4);
        rr(cx - tw / 2, top + tw * 1.2, tw, bottom - top - tw * 3.2, tw / 2);
        g.fillStyle = lin(cx - tw / 2, 0, cx + tw / 2, 0, [[0, 'rgba(200,220,235,.9)'], [0.45, core], [1, 'rgba(160,180,200,.9)']]);
        g.fill();
        g.shadowBlur = 0;
        // 中を 光が 流れる
        const L = bottom - top - tw * 3.2;
        for (let i = 0; i < 3; i++) {
            const k = (t * (st.mode === 'normal' ? 0.5 : 1.4) + i / 3) % 1;
            g.fillStyle = 'rgba(255,255,255,.9)';
            g.fillRect(cx - tw * 0.2, top + tw * 1.2 + L * k * 0.9, tw * 0.4, tw * 1.2);
        }
    }
    // 右の 丸い ランプ (先バレで 赤・紫・虹)。管の 下に つく
    function lampDraw(st, t) {
        const r = rside();
        if (r < 12) return;
        const cx = B.x + B.w + r * 0.55, cy = B.y + B.h * 0.5 + r * 0.25;
        const R = Math.min(r * 0.62, B.w * 0.09);
        // 赤い 入れもの
        g.beginPath();
        g.arc(cx, cy, R * 1.25, 0, Math.PI * 2);
        g.fillStyle = lin(cx - R, cy - R, cx + R, cy + R, [[0, '#ff5a6a'], [0.5, RED], [1, RED_DARK]]);
        g.fill();
        // 銀の 輪
        g.beginPath();
        g.arc(cx, cy, R * 1.02, 0, Math.PI * 2);
        g.fillStyle = lin(cx - R, cy - R, cx + R, cy + R, [[0, '#ffffff'], [0.5, '#8a96a6'], [1, '#d8e0ea']]);
        g.fill();
        // ガラスの 丸 (光って いないときは 暗い)
        const on = lampOn(t);
        let fill;
        if (on) {
            const e = t - on.at;
            const blink = 0.65 + 0.35 * Math.sin(e * 18);
            const c = on.kind === 'rainbow' ? hsl(e * 540, 95, 62) : on.kind === 'purple' ? `rgba(190,80,255,${blink})` : `rgba(255,40,60,${blink})`;
            const edge = on.kind === 'purple' ? '#3a0a5a' : on.kind === 'rainbow' ? hsl(e * 540 + 120, 90, 40) : '#5a0410';
            fill = rad(cx - R * 0.25, cy - R * 0.25, R * 0.05, R * 0.9, [[0, '#ffffff'], [0.35, c], [1, edge]]);
            g.shadowColor = on.kind === 'rainbow' ? hsl(e * 540) : on.kind === 'purple' ? '#be50ff' : '#ff2838';
            g.shadowBlur = 24;
        } else fill = rad(cx - R * 0.3, cy - R * 0.3, R * 0.05, R * 0.9, [[0, '#6a7488'], [0.4, '#1a2234'], [1, '#05070d']]);
        g.beginPath();
        g.arc(cx, cy, R * 0.86, 0, Math.PI * 2);
        g.fillStyle = fill;
        g.fill();
        g.shadowBlur = 0;
        // 光の すじ (光って いるとき)
        if (on) {
            g.strokeStyle = on.kind === 'rainbow' ? hsl(t * 300, 95, 75, 0.6) : on.kind === 'purple' ? 'rgba(220,160,255,.5)' : 'rgba(255,150,160,.5)';
            g.lineWidth = 1.5;
            for (let i = 0; i < 12; i++) {
                const a = i / 12 * Math.PI * 2 + t * 2;
                g.beginPath();
                g.moveTo(cx + Math.cos(a) * R * 1.3, cy + Math.sin(a) * R * 1.3);
                g.lineTo(cx + Math.cos(a) * R * 2, cy + Math.sin(a) * R * 2);
                g.stroke();
            }
        }
        // 映りこみ
        g.fillStyle = 'rgba(255,255,255,.55)';
        g.beginPath();
        g.ellipse(cx - R * 0.3, cy - R * 0.38, R * 0.28, R * 0.14, -0.5, 0, Math.PI * 2);
        g.fill();
    }
    // 盤面の 窓の ふち (黒と 銀、内側に 状態の 色の 光)
    function bezel(st, t) {
        const p = Math.max(3, B.w * 0.012);
        const glow = rainbowish(st) ? hsl(t * 200) : (LED[st.mode] || LED.normal)[0];
        g.shadowColor = glow;
        g.shadowBlur = 14 + 6 * Math.sin(t * 4);
        rr(B.x - p, B.y - p, B.w + p * 2, B.h + p * 2, Math.min(18, B.w * 0.04));
        g.fillStyle = lin(B.x, B.y, B.x + B.w, B.y + B.h, [[0, '#d8dee8'], [0.45, '#4a4a56'], [0.7, '#c8ccd8'], [1, '#2a2a34']]);
        g.fill();
        g.shadowBlur = 0;
    }
    // 下の 段: まんなかの PUSH ユニット・左右の スピーカーの 網・ハンドルの 飾り・玉の 列
    function bottom(st, t) {
        const y0 = bottomTop() + Math.max(4, B.h * 0.015);
        const bh = H - y0 - 4;
        if (bh < 24) return;
        // 左右の スピーカーの 網 (黒い メッシュに 状態の 色の ライン)
        for (const [gx, gw] of [[W * 0.06, W * 0.28], [W * 0.66, W * 0.28]]) {
            const gy = y0 + bh * 0.28, gh = bh * 0.5;
            rr(gx, gy, gw, gh, gh * 0.35);
            g.fillStyle = '#08080c';
            g.fill();
            g.fillStyle = '#1e1e26';
            for (let y = gy + 3; y < gy + gh - 2; y += 4) for (let x = gx + 4; x < gx + gw - 3; x += 4) g.fillRect(x, y, 1.6, 1.6);
            g.strokeStyle = ledColor(st, gx, t);
            g.lineWidth = 1.5;
            g.globalAlpha = 0.7;
            g.beginPath();
            g.moveTo(gx + gw * 0.1, gy - 3);
            g.lineTo(gx + gw * 0.9, gy - 3);
            g.stroke();
            g.globalAlpha = 1;
        }
        // まんなかの PUSH ユニット (赤黒の 曲がった 台座と 丸い ボタン)
        const ux = W / 2, uw = W * 0.24, uy = y0 - bh * 0.05;
        g.beginPath();
        g.moveTo(ux - uw * 0.5, H - 4);
        g.bezierCurveTo(ux - uw * 0.55, uy + bh * 0.4, ux - uw * 0.3, uy + bh * 0.1, ux - uw * 0.22, uy);
        g.lineTo(ux + uw * 0.22, uy);
        g.bezierCurveTo(ux + uw * 0.3, uy + bh * 0.1, ux + uw * 0.55, uy + bh * 0.4, ux + uw * 0.5, H - 4);
        g.closePath();
        g.fillStyle = lin(ux - uw / 2, 0, ux + uw / 2, 0, [[0, '#0c0c10'], [0.3, '#2a2a34'], [0.5, RED], [0.7, '#2a2a34'], [1, '#0c0c10']]);
        g.fill();
        // 丸い PUSH ボタン (台の ボタンの 光り方に 合わせる)
        const p = pushRect();
        if (p) {
            const br = p.w / 2, by = p.y + br;
            const bs = st.button || {};
            let face = lin(ux - br, by - br, ux + br, by + br, [[0, '#ffffff'], [0.5, '#c8d0da'], [1, '#6a7688']]);
            if (bs.kind && bs.lit) {
                const c = bs.kind === 'rainbow' ? hsl(t * 400, 95, 65) : bs.kind === 'purple' ? '#be50ff' : bs.kind === 'red' ? '#ff3a4a' : '#ffe066';
                face = rad(ux, by, br * 0.1, br, [[0, '#ffffff'], [0.5, c], [1, c]]);
                g.shadowColor = c;
                g.shadowBlur = 20;
            } else if (bs.push) {
                g.shadowColor = '#ffe066';
                g.shadowBlur = 10 + 10 * Math.abs(Math.sin(t * 6));
            }
            g.beginPath();
            g.arc(ux, by, br, 0, Math.PI * 2);
            g.fillStyle = face;
            g.fill();
            g.shadowBlur = 0;
            g.strokeStyle = '#2a2a34';
            g.lineWidth = 2;
            g.stroke();
            g.font = `bold ${Math.round(br * 0.5)}px ${FONT}`;
            g.textAlign = 'center';
            g.textBaseline = 'middle';
            g.fillStyle = bs.push && Math.floor(t * 4) % 2 ? RED : '#2a2a34';
            g.fillText('PUSH', ux, by + 1);
            g.textAlign = 'left';
        }
        // 玉の 列 (持ち玉 25 発ごとに 1 つ。左右の 網の 上)
        const ballR = Math.max(1.6, bh * 0.05);
        const max = Math.floor((W * 0.28 - ballR * 4) / (ballR * 2.2));
        const n = Math.min(max * 2, Math.floor((st.balls || 0) / 25));
        for (let i = 0; i < n; i++) {
            const leftSide = i % 2 === 0, k = Math.floor(i / 2);
            const x = leftSide ? W * 0.06 + ballR * 2 + k * ballR * 2.2 : W * 0.94 - ballR * 2 - k * ballR * 2.2;
            const y = y0 + bh * 0.14;
            g.beginPath();
            g.arc(x, y, ballR, 0, Math.PI * 2);
            g.fillStyle = lin(x - ballR, y - ballR, x + ballR, y + ballR, [[0, '#ffffff'], [0.5, '#c8d0da'], [1, '#6a7688']]);
            g.fill();
        }
        // ハンドルの 飾り (右下の オレンジの 玉)
        const hr = Math.min(bh * 0.14, W * 0.04);
        g.beginPath();
        g.arc(W - hr * 2, H - hr * 1.8, hr, 0, Math.PI * 2);
        g.fillStyle = lin(W - hr * 3, H - hr * 2.8, W - hr, H - hr, [[0, '#ffd0a0'], [0.5, '#ff7a2a'], [1, '#a03a0a']]);
        g.fill();
    }

    // 下の PUSH の 位置 (#cabinet-push を 重ねる)。下の 段が せまい (スマホ) ときは null
    function pushRect() {
        const y0 = bottomTop() + Math.max(4, B.h * 0.015), bh = H - y0 - 4;
        if (bh < 24) return null;
        const uw = W * 0.24, br = Math.min(uw * 0.34, bh * 0.3), by = y0 - bh * 0.05 + br * 0.9;
        return { x: W / 2 - br, y: by - br, w: br * 2, h: br * 2 };
    }

    // 毎フレーム。st: { mode, premium, gimmick, balls, button: { kind, lit, push } }
    function draw(t, st) {
        if (!cv) return;
        if (cv.width !== Math.round(wrap.clientWidth * dpr) || boardEl.offsetWidth !== B.w) resize();
        g.setTransform(dpr, 0, 0, dpr, 0, 0);
        g.clearRect(0, 0, W, H);
        body();
        crystals(st, t);
        redFrame(st, t);
        topPanel(st, t);
        bottom(st, t);
        tube(st, t);
        bezel(st, t);
        lampDraw(st, t);
    }

    return { create, draw, resize, lamp, pushRect, LAMP_TIME };
})();
