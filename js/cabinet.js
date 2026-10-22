// =====================================================================
// 台の筐体 (2026-10-23 ユーザー指定: 台の デザインを 一新。フォルダの 画像を 参考に)
// ---------------------------------------------------------------------
// 盤面 (canvas#board) の まわりに 筐体を 描く (canvas.cabinet-art。盤面の 下に 重ねる)。
// 参考に した つくり (実機の 絵は 写さず、こおりくんの 台として 新しく 描く):
//   - 上の パネル: タイトルの ロゴと、左右の 丸い スピーカー
//   - 氷の 透明な 枠と、流れる LED の ライン (台の 状態で 色が かわる)
//   - 役物: 上に こおりくんの 大きな 頭、右に おにおにの 金棒 (光る 長い 棒)
//   - 下: 玉の 受け皿 (持ち玉で 玉が ふえる)・スピーカーの 網・ハンドルの 飾り
// 台の 状態 (mode: normal / rush / small / bonus、premium、gimmick 役物が 動く 0〜1) で 光り方と 役物が かわる。
// 大きさは 画面に 合わせて かわる (盤面の 位置を 測って 描く)。
// =====================================================================

const Cabinet = (() => {
    const FONT = '"DotGothic16", "MS Gothic", monospace';
    let cv = null, g = null, wrap = null, boardEl = null;
    let W = 0, H = 0, dpr = 1;
    const B = { x: 0, y: 0, w: 0, h: 0 };   // 盤面の 位置 (筐体の 中の CSS px)
    // LED の 色 (台の 状態ごと)
    const LED = { normal: ['#7fd3f7', '#e8f8ff'], small: ['#ffe066', '#fff4b0'], rush: ['#ff4a6a', '#ffd84a'] };

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

    // ----- 道具 -----
    const hsl = (h, s = 90, l = 62) => `hsl(${((h % 360) + 360) % 360}, ${s}%, ${l}%)`;
    function rr(x, y, w, h, r) {
        g.beginPath();
        g.moveTo(x + r, y);
        g.arcTo(x + w, y, x + w, y + h, r);
        g.arcTo(x + w, y + h, x, y + h, r);
        g.arcTo(x, y + h, x, y, r);
        g.arcTo(x, y, x + w, y, r);
        g.closePath();
    }
    const grad = (x0, y0, x1, y1, stops) => {
        const gr = g.createLinearGradient(x0, y0, x1, y1);
        stops.forEach(([o, c]) => gr.addColorStop(o, c));
        return gr;
    };
    // いまの LED の 色 (i: 何番目の 光, t: 時間)
    function ledColor(st, i, t) {
        if (st.mode === 'bonus' || st.premium) return hsl(i * 18 - t * 240, 95, st.premium ? 70 : 62);
        const [a, b] = LED[st.mode] || LED.normal;
        return (Math.floor(i / 3 + t * (st.mode === 'rush' ? 6 : 2)) % 2) ? a : b;
    }

    // ----- 部品 -----
    // 筐体の 体 (こい 紺に 氷の 光)
    function body(st, t) {
        const top = B.y * 0.34;
        rr(1, top, W - 2, H - top - 1, Math.min(28, W * 0.06));
        g.fillStyle = grad(0, top, 0, H, [[0, '#14294a'], [0.5, '#0b1a33'], [1, '#050c18']]);
        g.fill();
        g.lineWidth = 2;
        g.strokeStyle = '#2a4a78';
        g.stroke();
    }
    // 左右の 氷の 枠 (透明な 水色の 結晶。ななめの 面)
    function iceFrame(st, t) {
        const side = B.x;
        if (side < 6) return;
        const y0 = B.y - side * 0.4, y1 = B.y + B.h + side * 0.2;
        for (const [x, dir] of [[0, 1], [W, -1]]) {
            g.beginPath();
            g.moveTo(x, y0 + side);
            g.lineTo(x + dir * side * 0.95, y0);
            g.lineTo(x + dir * side * 0.95, y1);
            g.lineTo(x + dir * side * 0.35, y1 + side * 0.6);
            g.lineTo(x, y1);
            g.closePath();
            g.fillStyle = grad(x, 0, x + dir * side, 0, [[0, 'rgba(160,220,255,.10)'], [0.6, 'rgba(190,240,255,.30)'], [1, 'rgba(120,190,240,.12)']]);
            g.fill();
            // 結晶の 面の 線
            g.strokeStyle = 'rgba(220,245,255,.35)';
            g.lineWidth = 1;
            for (let k = 0; k < 6; k++) {
                const yy = y0 + (y1 - y0) * (k + 0.5) / 6;
                g.beginPath();
                g.moveTo(x + dir * 2, yy);
                g.lineTo(x + dir * side * 0.9, yy - side * 0.5);
                g.stroke();
            }
        }
    }
    // 流れる LED の ライン (枠の 外側に そって)
    function leds(st, t) {
        const side = B.x;
        if (side < 6) return;
        const n = 26, y0 = B.y - side * 0.2, y1 = B.y + B.h;
        const r = Math.max(1.5, side * 0.07);
        for (const xr of [side * 0.55, W - side * 0.55]) {
            for (let i = 0; i < n; i++) {
                const y = y0 + (y1 - y0) * i / (n - 1);
                const wave = 0.35 + 0.65 * Math.max(0, Math.sin((i / n) * Math.PI * 4 - t * (st.mode === 'normal' ? 3 : 8)));
                g.globalAlpha = wave;
                g.fillStyle = ledColor(st, i, t);
                g.shadowColor = g.fillStyle;
                g.shadowBlur = r * 4;
                g.beginPath();
                g.arc(xr, y, r, 0, Math.PI * 2);
                g.fill();
            }
        }
        g.shadowBlur = 0;
        g.globalAlpha = 1;
    }
    // 盤面の 枠 (銀の ふち + 状態の 色の 光)
    function bezel(st, t) {
        const p = Math.max(3, B.w * 0.012);
        const glow = st.mode === 'bonus' || st.premium ? hsl(t * 200) : (LED[st.mode] || LED.normal)[0];
        g.shadowColor = glow;
        g.shadowBlur = 18 + 8 * Math.sin(t * 4);
        rr(B.x - p, B.y - p, B.w + p * 2, B.h + p * 2, Math.min(18, B.w * 0.04));
        g.fillStyle = grad(B.x, B.y, B.x + B.w, B.y + B.h, [[0, '#e8f0f8'], [0.4, '#7a8aa0'], [0.7, '#dfe8f2'], [1, '#56657a']]);
        g.fill();
        g.shadowBlur = 0;
    }
    // 上の パネル: タイトルと スピーカー
    function topPanel(st, t) {
        const ph = B.y * 0.62;           // パネルの 高さ
        const py = B.y - ph - B.y * 0.06;
        if (ph < 18) return;
        const px = B.x * 0.7, pw = W - px * 2;
        rr(px, py, pw, ph, ph * 0.3);
        g.fillStyle = grad(0, py, 0, py + ph, [[0, '#1f3a6b'], [1, '#0b1a33']]);
        g.fill();
        g.strokeStyle = '#7fd3f7';
        g.lineWidth = 1.5;
        g.stroke();
        // スピーカー (左右の 丸)
        const sr = ph * 0.42;
        for (const cx of [px + sr * 1.2, px + pw - sr * 1.2]) speaker(cx, py + ph / 2, sr, st, t);
        // タイトル (ドットの 字。グラデーションで 光らせる)
        const cx = W / 2, size = Math.min(ph * 0.46, pw * 0.085);
        g.textAlign = 'center';
        g.textBaseline = 'middle';
        g.font = `bold ${Math.round(size)}px ${FONT}`;
        const shine = (Math.sin(t * 2) + 1) / 2;
        g.lineWidth = Math.max(2, size * 0.16);
        g.strokeStyle = '#05070d';
        g.strokeText('Pこおりくん', cx, py + ph * 0.42);
        g.fillStyle = grad(0, py, 0, py + ph * 0.7, [[0, '#ffffff'], [0.5 - shine * 0.2, '#bff0ff'], [1, '#4aa8e0']]);
        g.fillText('Pこおりくん', cx, py + ph * 0.42);
        g.font = `${Math.round(size * 0.42)}px ${FONT}`;
        g.fillStyle = '#ffe680';
        g.fillText('～内定ツラヌキ物語～', cx, py + ph * 0.8);
        g.textAlign = 'left';
    }
    function speaker(cx, cy, r, st, t) {
        g.beginPath();
        g.arc(cx, cy, r, 0, Math.PI * 2);
        g.fillStyle = '#0a0f1a';
        g.fill();
        // 光の 輪
        g.strokeStyle = st.mode === 'bonus' || st.premium ? hsl(t * 200 + cx) : (LED[st.mode] || LED.normal)[0];
        g.lineWidth = Math.max(1.5, r * 0.14);
        g.globalAlpha = 0.6 + 0.4 * Math.sin(t * 5 + cx);
        g.stroke();
        g.globalAlpha = 1;
        // 網の 点
        g.fillStyle = '#26324a';
        const step = Math.max(2, r / 4);
        for (let y = -r; y <= r; y += step) for (let x = -r; x <= r; x += step) if (x * x + y * y < (r * 0.75) ** 2) g.fillRect(cx + x - 0.6, cy + y - 0.6, 1.2, 1.2);
    }
    // 役物: こおりくんの 大きな 頭 (パネルの 上から のぞく)。役物が 動くと とびだして 目が 光る
    function kooriHead(st, t) {
        if (typeof SPRITES === 'undefined' || !SPRITES.koori || B.y < 30) return;
        const size = Math.min(B.y * 0.78, W * 0.24);
        const s = size / 16;
        const pop = st.gimmick != null ? Math.sin(Math.min(1, st.gimmick * 3) * Math.PI / 2) : 0;
        const bob = Math.sin(t * 2.2) * s * 0.5;
        const x = B.x * 0.2, y = Math.max(2, B.y * 0.04) + s + bob - pop * s * 2;
        g.save();
        if (st.mode === 'bonus' || pop > 0) { g.shadowColor = '#bff0ff'; g.shadowBlur = 20; }
        drawSprite(g, SPRITES.koori, Math.floor(t * 2) % 2 ? 'walk1' : 'walk2', x, y, s);
        g.restore();
        // 目が 光る (先読み・役物・大当たり)
        if (pop > 0 || st.mode === 'bonus') {
            g.fillStyle = `rgba(255,255,255,${0.5 + 0.5 * Math.sin(t * 20)})`;
            g.fillRect(x + 5 * s, y + 5 * s, s, s * 2);
            g.fillRect(x + 10 * s, y + 5 * s, s, s * 2);
        }
    }
    // 役物: おにおにの 金棒 (右に 立つ 光る 棒)。大当たりで 虹色、役物が 動くと 大きく 光る
    function club(st, t) {
        const side = W - (B.x + B.w);
        if (side < 14) return;
        const cw = side * 0.5, cx = B.x + B.w + side * 0.5;
        const top = B.y * 0.15, bottom = B.y + B.h * 0.82;
        const pop = st.gimmick != null ? 1 : 0;
        // 棒 (黒と 赤)
        rr(cx - cw / 2, top, cw, bottom - top, cw / 2);
        g.fillStyle = grad(cx - cw / 2, 0, cx + cw / 2, 0, [[0, '#2a0a0a'], [0.35, '#a01818'], [0.6, '#e04040'], [1, '#3a0a0a']]);
        g.fill();
        // 光る 芯
        const core = st.mode === 'bonus' || st.premium ? hsl(t * 220) : st.mode === 'rush' ? '#ffd84a' : '#ff8a6a';
        g.shadowColor = core;
        g.shadowBlur = 14 + pop * 20 + 6 * Math.sin(t * 6);
        rr(cx - cw * 0.14, top + cw, cw * 0.28, bottom - top - cw * 2, cw * 0.14);
        g.fillStyle = core;
        g.globalAlpha = 0.75 + 0.25 * Math.sin(t * 8);
        g.fill();
        g.globalAlpha = 1;
        g.shadowBlur = 0;
        // 金の 鋲 (金棒の いぼ)
        const n = Math.max(4, Math.floor((bottom - top) / (cw * 1.3)));
        for (let i = 0; i < n; i++) {
            const y = top + cw + (bottom - top - cw * 2) * (i + 0.5) / n;
            for (const d of [-1, 1]) {
                const x = cx + d * cw * 0.5;
                g.beginPath();
                g.arc(x, y, cw * 0.2, 0, Math.PI * 2);
                g.fillStyle = grad(x - cw * 0.2, y - cw * 0.2, x + cw * 0.2, y + cw * 0.2, [[0, '#fff4b0'], [0.6, '#ffd84a'], [1, '#a06a10']]);
                g.fill();
            }
        }
        // 先の 光る 玉
        g.beginPath();
        g.arc(cx, top + cw * 0.5, cw * 0.55, 0, Math.PI * 2);
        g.fillStyle = core;
        g.shadowColor = core;
        g.shadowBlur = 16 + pop * 16;
        g.fill();
        g.shadowBlur = 0;
        // 根もとの おにおにの メダル
        const mr = side * 0.42, my = bottom + mr * 0.6;
        g.beginPath();
        g.arc(cx, my, mr, 0, Math.PI * 2);
        g.fillStyle = grad(cx - mr, my - mr, cx + mr, my + mr, [[0, '#ffe680'], [1, '#a06a10']]);
        g.fill();
        if (typeof Characters !== 'undefined' && Characters.has('onioni')) {
            const sz = Characters.size ? Characters.size('onioni') : { w: 32, h: 40 };
            const sc = (mr * 1.5) / Math.max(sz.w || 32, sz.h || 40);
            Characters.drawEnemy(g, 'onioni', cx, my + mr * 0.72, { scale: sc, frame: Math.floor(t * 2) % 2 });
        }
    }
    // 下: 受け皿・スピーカーの 網・ハンドルの 飾り
    function tray(st, t) {
        const y0 = B.y + B.h + Math.max(6, B.h * 0.02);
        const th = H - y0 - 4;
        if (th < 16) return;
        // 受け皿 (曲がった 皿に 玉)
        const tx = W * 0.16, tw = W * 0.68, ty = y0 + th * 0.12, tHt = th * 0.42;
        rr(tx, ty, tw, tHt, tHt * 0.5);
        g.fillStyle = grad(0, ty, 0, ty + tHt, [[0, '#2a3a5a'], [1, '#101a2e']]);
        g.fill();
        g.strokeStyle = '#7fd3f7';
        g.lineWidth = 1.5;
        g.stroke();
        // 玉 (持ち玉で ふえる。いちばん多くて 2 段)
        const br = Math.max(2, tHt * 0.18);
        const count = Math.min(Math.floor((st.balls || 0) / 25), Math.floor((tw - br * 4) / (br * 2.1)) * 2);
        for (let i = 0; i < count; i++) {
            const row = i % 2, col = Math.floor(i / 2);
            const x = tx + br * 2 + col * br * 2.1 + row * br, y = ty + tHt - br * (1.4 + row * 1.7);
            g.beginPath();
            g.arc(x, y, br, 0, Math.PI * 2);
            g.fillStyle = grad(x - br, y - br, x + br, y + br, [[0, '#ffffff'], [0.5, '#c8d0da'], [1, '#6a7688']]);
            g.fill();
        }
        // スピーカーの 網 (左右)
        const gy = ty + tHt + th * 0.08, gh = th - (gy - y0) - th * 0.06;
        for (const gx of [W * 0.05, W * 0.71]) {
            rr(gx, gy, W * 0.24, gh, gh * 0.3);
            g.fillStyle = '#0a0f1a';
            g.fill();
            g.fillStyle = '#26324a';
            for (let y = gy + 3; y < gy + gh - 2; y += 4) for (let x = gx + 4; x < gx + W * 0.24 - 3; x += 4) g.fillRect(x, y, 1.5, 1.5);
        }
        // まんなかの 氷の しるし
        const ex = W / 2, ey = gy + gh / 2, er = Math.min(gh * 0.45, W * 0.06);
        g.save();
        g.translate(ex, ey);
        g.rotate(Math.PI / 4);
        g.fillStyle = grad(-er, -er, er, er, [[0, '#ffffff'], [0.5, '#bff0ff'], [1, '#4aa8e0']]);
        g.shadowColor = '#bff0ff';
        g.shadowBlur = 8 + 6 * Math.sin(t * 3);
        g.fillRect(-er / 1.5, -er / 1.5, er * 1.33, er * 1.33);
        g.restore();
        // ハンドルの 飾り (右下の オレンジの 玉)
        const hr = Math.min(th * 0.22, W * 0.045);
        g.beginPath();
        g.arc(W - hr * 1.8, H - hr * 1.6, hr, 0, Math.PI * 2);
        g.fillStyle = grad(W - hr * 2.8, H - hr * 2.6, W - hr, H - hr, [[0, '#ffd0a0'], [0.5, '#ff7a2a'], [1, '#a03a0a']]);
        g.fill();
    }

    // 上の 角から つきだす 氷の 結晶の 羽 (左は こおりくんの うしろ、右は 金棒の うしろ)
    function wings(st, t) {
        const h = B.y * 0.9;
        if (h < 30) return;
        const glow = st.mode === 'bonus' || st.premium ? hsl(t * 160, 90, 75) : '#bff0ff';
        for (const [x0, dir] of [[W * 0.02, 1], [W * 0.98, -1]]) {
            for (let k = 0; k < 4; k++) {
                const len = h * (1.05 - k * 0.18), base = B.y * 0.7;
                const tipX = x0 + dir * W * (0.02 + k * 0.07), tipY = Math.max(1, base - len);
                g.beginPath();
                g.moveTo(x0 + dir * W * k * 0.05, base);
                g.lineTo(tipX, tipY);
                g.lineTo(x0 + dir * W * (0.1 + k * 0.07), base);
                g.closePath();
                g.fillStyle = grad(tipX, tipY, tipX, base, [[0, 'rgba(255,255,255,.95)'], [0.35, 'rgba(170,230,255,.8)'], [1, 'rgba(60,140,220,.35)']]);
                g.fill();
                g.strokeStyle = glow;
                g.globalAlpha = 0.5 + 0.3 * Math.sin(t * 3 + k);
                g.lineWidth = 1;
                g.stroke();
                g.globalAlpha = 1;
            }
        }
    }
    // おにおにの 赤の ライン (体の ふちに そって)
    function redLine(st, t) {
        const top = B.y * 0.34;
        g.strokeStyle = st.mode === 'rush' ? '#ff4a6a' : '#c02838';
        g.lineWidth = Math.max(2, W * 0.008);
        g.globalAlpha = 0.85;
        g.beginPath();
        g.moveTo(W * 0.03, H * 0.55);
        g.lineTo(W * 0.03, top + W * 0.06);
        g.quadraticCurveTo(W * 0.03, top + 3, W * 0.12, top + 3);
        g.moveTo(W * 0.97, H * 0.55);
        g.lineTo(W * 0.97, top + W * 0.06);
        g.quadraticCurveTo(W * 0.97, top + 3, W * 0.88, top + 3);
        g.stroke();
        g.globalAlpha = 1;
    }
    // パネルの ふちを まわる LED
    function panelLeds(st, t) {
        const ph = B.y * 0.62, py = B.y - ph - B.y * 0.06, px = B.x * 0.7, pw = W - px * 2;
        if (ph < 18) return;
        const n = 30;
        for (let i = 0; i < n; i++) {
            const x = px + ph * 0.3 + (pw - ph * 0.6) * i / (n - 1);
            const on = (i + Math.floor(t * (st.mode === 'normal' ? 6 : 14))) % 5 === 0;
            g.fillStyle = on ? ledColor(st, i, t) : 'rgba(255,255,255,.15)';
            g.fillRect(x - 1.5, py + 1, 3, 2);
            g.fillRect(x - 1.5, py + ph - 3, 3, 2);
        }
    }
    // 盤面の まわりの 氷の 飾りと きらめき
    function frost(st, t) {
        const corners = [[B.x, B.y, 1, 1], [B.x + B.w, B.y, -1, 1], [B.x, B.y + B.h, 1, -1], [B.x + B.w, B.y + B.h, -1, -1]];
        const sz = Math.max(8, B.w * 0.07);
        for (const [x, y, dx, dy] of corners) {
            g.beginPath();
            g.moveTo(x - dx * sz * 0.3, y - dy * sz * 0.3);
            g.lineTo(x + dx * sz, y - dy * sz * 0.1);
            g.lineTo(x + dx * sz * 0.2, y + dy * sz * 0.2);
            g.lineTo(x - dx * sz * 0.1, y + dy * sz);
            g.closePath();
            g.fillStyle = 'rgba(220,245,255,.8)';
            g.fill();
        }
        // きらめき (★)
        for (let i = 0; i < 6; i++) {
            const k = (t * 0.4 + i / 6) % 1;
            const x = B.x + ((i * 97) % 100) / 100 * B.w, y = B.y - 4 + (i % 2 ? B.h + 8 : 0);
            const a = Math.sin(k * Math.PI);
            g.globalAlpha = a;
            g.fillStyle = '#ffffff';
            g.fillRect(x - 0.5, y - 4 * a, 1, 8 * a);
            g.fillRect(x - 4 * a, y - 0.5, 8 * a, 1);
        }
        g.globalAlpha = 1;
    }

    // 毎フレーム。st: { mode, premium, gimmick, balls }
    function draw(t, st) {
        if (!cv) return;
        if (cv.width !== Math.round(wrap.clientWidth * dpr) || boardEl.offsetWidth !== B.w) resize();
        g.setTransform(dpr, 0, 0, dpr, 0, 0);
        g.clearRect(0, 0, W, H);
        body(st, t);
        wings(st, t);
        redLine(st, t);
        iceFrame(st, t);
        leds(st, t);
        topPanel(st, t);
        panelLeds(st, t);
        club(st, t);
        tray(st, t);
        bezel(st, t);
        frost(st, t);
        kooriHead(st, t);
    }

    return { create, draw, resize };
})();
