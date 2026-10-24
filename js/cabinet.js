// =====================================================================
// 台の筐体 (2026-10-23 ユーザー指定: 台の デザインを 一新。ルパン三世の 台の つくりを 参考に)
// ---------------------------------------------------------------------
// 盤面 (canvas#board) の 上に 重ねて 描く (canvas.cabinet-art)。盤面の 丸い 形 (BoardView.outline。上が まるく、
// 横は まっすぐ、下は たいら) の 窓を くりぬき、その ふちに 合わせて 枠を 描く (四角の 空きを なくす。ユーザー指定)。
// 参考に した つくり (実機の 絵は 写さず、こおりくんの 台として 新しく 描く):
//   - 黒い 本体と、窓の 上の 角の 赤い ハウジングに 入った 丸い スピーカー、窓の ふちの 赤い 帯と 流れる LED
//   - 上の まんなかの イラストの パネル (こおりくん・おにおに・ふるカワと ロゴ)
//   - 左右の 透明な 結晶の 飾り
//   - 右: 上から つきだす 白く 光る 管と、その 下の 丸い ランプ。ランプは 先バレで 赤・紫・虹に 光る (lamp)
//   - 下: まんなかの レバー (台座から のびた 棒の 上に PUSH ボタン。押せる: #cabinet-push が 台の ボタンに つなぐ)・左右の スピーカーの 網
// 台の 状態 (mode: normal / rush / small / bonus、premium、gimmick 役物が 動く 0〜1、button 台の ボタンの 光り方) で 光り方が かわる。
// =====================================================================

const Cabinet = (() => {
    const FONT = '"DotGothic16", "MS Gothic", monospace';
    const LAMP_TIME = 3;   // 先バレの ランプが 光って いる 秒
    let cv = null, g = null, wrap = null, boardEl = null, shape = null;
    let W = 0, H = 0, dpr = 1;
    const B = { x: 0, y: 0, w: 0, h: 0, s: 1 };   // 盤面の 位置 (筐体の 中の CSS px)。s: 盤面の 座標 1 の 大きさ
    let lampState = null;                        // { kind: red / purple / rainbow, at }
    const LED = { normal: ['#7fd3f7', '#e8f8ff'], small: ['#ffe066', '#fff4b0'], rush: ['#ff3a4a', '#ffd84a'] };
    const RED = '#c8102e', RED_LIGHT = '#ff3a4a', RED_DARK = '#5a0410';

    // shape: { outline: 盤面の 座標の 点の 列 (窓の 形), width: 盤面の 幅 (座標) }
    function create(canvas, board, sh) {
        cv = canvas;
        g = cv.getContext('2d');
        wrap = cv.parentElement;
        boardEl = board;
        shape = sh || null;
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
        B.s = B.w / ((shape && shape.width) || 360);
    }
    function lamp(kind, now) {
        if (kind === 'red' || kind === 'purple' || kind === 'rainbow' || kind === 'glitch') lampState = { kind, at: now };   // glitch: 違和感 (P4)
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
    // 演出の 光 (2026-10-23 ユーザー指定。st.cue は Lcd.light()): 当たり (hit) は 虹色。当たりが 見えてから HIT_TIME 秒は
    // 変動が 終わっても 虹色で 強く 光る (hitAt)。color は その色で 速く 流れる、strobe は 白く 点滅、dim は 暗く、glitch は ちらつく
    const HIT_TIME = 4;
    let hitAt = -Infinity, lastCue = null;
    const hitting = (st, t) => Boolean(st.cue && st.cue.kind === 'hit') || t - hitAt < HIT_TIME;
    const rainbowish = st => st.mode === 'bonus' || st.premium || st.hit;
    function ledColor(st, i, t) {
        const cue = st.cue;
        if (st.hit) return hsl(i * 26 - t * 620, 100, 64);
        if (cue && cue.kind === 'strobe') return Math.floor(t * 16) % 2 ? '#ffffff' : '#ffe066';
        if (cue && cue.kind === 'glitch') return Math.random() < 0.5 ? '#ffffff' : '#20242c';
        if (cue && cue.kind === 'dim') return '#3a4258';
        if (cue && cue.kind === 'color') return (Math.floor(i / 2 + t * 8) % 3) ? cue.color : '#ffffff';
        if (rainbowish(st)) return hsl(i * 18 - t * 240, 95, st.premium ? 72 : 62);
        const [a, b] = LED[st.mode] || LED.normal;
        return (Math.floor(i / 3 + t * (st.mode === 'rush' ? 6 : 2)) % 2) ? a : b;
    }
    // 盤面の 座標 → 筐体の CSS px
    const X = x => B.x + x * B.s, Y = y => B.y + y * B.s;
    // 窓の 点 (CSS px)。shape が ないときは 盤面の 四角
    function windowPoints() {
        if (!shape || !shape.outline) return [[B.x, B.y], [B.x + B.w, B.y], [B.x + B.w, B.y + B.h], [B.x, B.y + B.h]];
        return shape.outline.map(([x, y]) => [X(x), Y(y)]);
    }
    function windowPath(pts) {
        pts.forEach(([x, y], i) => (i ? g.lineTo(x, y) : g.moveTo(x, y)));
        g.closePath();
    }
    const winTop = pts => Math.min(...pts.map(p => p[1]));
    const winBottom = pts => Math.max(...pts.map(p => p[1]));
    const winLeft = pts => Math.min(...pts.map(p => p[0]));
    const winRight = pts => Math.max(...pts.map(p => p[0]));
    const band = () => Math.max(5, B.w * 0.04);   // 窓の ふちの 赤い 帯の 太さ

    // ----- 部品 -----
    // 黒い 本体 (窓を くりぬく)
    function body(pts) {
        const top = Math.max(2, winTop(pts) - B.w * 0.42);
        g.beginPath();
        rr(1, top, W - 2, H - top - 1, Math.min(26, W * 0.05));
        windowPath(pts);
        g.fillStyle = lin(0, top, W, H, [[0, '#1c1c24'], [0.5, '#0c0c12'], [1, '#050508']]);
        g.fill('evenodd');
        // 黒い 面の 細かい 凹凸 (ななめの 線)
        g.save();
        g.beginPath();
        rr(1, top, W - 2, H - top - 1, Math.min(26, W * 0.05));
        windowPath(pts);
        g.clip('evenodd');
        g.strokeStyle = 'rgba(255,255,255,.035)';
        g.lineWidth = 1;
        for (let x = -H; x < W; x += 9) {
            g.beginPath();
            g.moveTo(x, H);
            g.lineTo(x + H, 0);
            g.stroke();
        }
        g.restore();
        g.beginPath();
        rr(1, top, W - 2, H - top - 1, Math.min(26, W * 0.05));
        g.lineWidth = 2;
        g.strokeStyle = '#2a2a34';
        g.stroke();
    }
    // 窓の ふち: 赤い 帯・銀の 線・内側の 光 (状態の 色)・流れる LED
    function windowRim(pts, st, t) {
        const bw = band();
        // 赤い 帯 (窓の 外だけ。draw で 窓の 外に 切りぬいて ある)
        g.lineJoin = 'round';
        g.beginPath();
        windowPath(pts);
        g.strokeStyle = lin(0, winTop(pts), 0, winBottom(pts), [[0, RED_LIGHT], [0.3, RED], [1, RED_DARK]]);
        g.lineWidth = bw * 2;
        g.stroke();
        // 銀の 線
        g.beginPath();
        windowPath(pts);
        g.strokeStyle = '#e8eaf0';
        g.lineWidth = Math.max(1.5, bw * 0.22);
        g.stroke();
        // 流れる LED (帯の まんなか。窓の ふちに そって 点を ならべる)
        const path = [];
        for (let i = 0; i < pts.length; i++) {
            const [x1, y1] = pts[i], [x2, y2] = pts[(i + 1) % pts.length];
            const d = Math.hypot(x2 - x1, y2 - y1);
            path.push({ x1, y1, x2, y2, d });
        }
        const total = path.reduce((a, p) => a + p.d, 0);
        const n = Math.floor(total / Math.max(7, bw * 1.1));
        let seg = 0, acc = 0;
        for (let i = 0; i < n; i++) {
            const at = (i / n) * total;
            while (seg < path.length - 1 && acc + path[seg].d < at) { acc += path[seg].d; seg++; }
            const p = path[seg], k = p.d ? (at - acc) / p.d : 0;
            const x = p.x1 + (p.x2 - p.x1) * k, y = p.y1 + (p.y2 - p.y1) * k;
            // 外側へ 少し ずらす (帯の まんなか)
            const nx = -(p.y2 - p.y1) / (p.d || 1), ny = (p.x2 - p.x1) / (p.d || 1);
            const cue = st.cue;
            const on = st.hit ? (Math.floor(t * 10) % 2 ? true : i % 2 === 0)
                : cue && cue.kind === 'strobe' ? Math.floor(t * 16) % 2 === 0
                : cue && cue.kind === 'glitch' ? Math.random() < 0.4
                : cue && cue.kind === 'dim' ? (i + Math.floor(t * 3)) % 12 === 0
                : cue && cue.kind === 'color' ? (i + Math.floor(t * cue.speed)) % 5 < 3
                : (i + Math.floor(t * (st.mode === 'normal' ? 10 : 24))) % 7 < 2;
            g.fillStyle = on ? ledColor(st, i, t) : 'rgba(255,255,255,.18)';
            const dot = st.hit || (cue && cue.kind !== 'dim') ? 3 : 2;   // 演出中は 粒を 大きく
            g.fillRect(x - nx * bw * 0.55 - dot / 2, y - ny * bw * 0.55 - dot / 2, dot, dot);
        }
    }
    // 窓の 内側の ふちの 光 (状態の 色。盤面の ふちに うすく かかる)
    function innerGlow(pts, st, t) {
        const cue = st.cue;
        const glow = st.hit ? hsl(t * 520) : cue && cue.kind === 'color' ? cue.color : cue && cue.kind === 'strobe' ? (Math.floor(t * 16) % 2 ? '#ffffff' : '#ffe066')
            : cue && cue.kind === 'dim' ? '#2a3044' : rainbowish(st) ? hsl(t * 200) : (LED[st.mode] || LED.normal)[0];
        g.save();
        g.beginPath();
        windowPath(pts);
        g.clip();
        g.shadowColor = glow;
        const strong = st.hit || (cue && cue.kind !== 'dim');
        g.shadowBlur = (strong ? 26 : 14) + 6 * Math.sin(t * (strong ? 12 : 4));
        g.beginPath();
        windowPath(pts);
        g.strokeStyle = glow;
        g.globalAlpha = 0.8;
        g.lineWidth = strong ? 4 : 2;
        g.stroke();
        g.restore();
    }
    // 窓の 上の 角の 赤い ハウジング と スピーカー
    function housings(pts, st, t) {
        const hr = B.w * 0.135;
        const top = winTop(pts);
        for (const [cx, dir] of [[B.x + B.w * 0.1, -1], [B.x + B.w * 0.9, 1]]) {
            const cy = top + B.w * 0.08;
            g.beginPath();
            g.ellipse(cx, cy, hr * 1.12, hr * 1.02, dir * 0.3, 0, Math.PI * 2);
            g.fillStyle = lin(cx - hr, cy - hr, cx + hr, cy + hr, [[0, '#ff5a6a'], [0.45, RED], [1, RED_DARK]]);
            g.fill();
            g.strokeStyle = 'rgba(0,0,0,.55)';
            g.lineWidth = 2;
            g.stroke();
            speaker(cx, cy, hr * 0.72, st, t);
        }
    }
    function speaker(cx, cy, r0, st, t) {
        g.beginPath();
        g.arc(cx, cy, r0, 0, Math.PI * 2);
        g.fillStyle = rad(cx - r0 * 0.3, cy - r0 * 0.3, r0 * 0.1, r0, [[0, '#3a3a44'], [1, '#08080c']]);
        g.fill();
        g.fillStyle = '#1e1e26';
        const step = Math.max(2, r0 / 4.5);
        for (let y = -r0; y <= r0; y += step) for (let x = -r0; x <= r0; x += step) if (x * x + y * y < (r0 * 0.82) ** 2) g.fillRect(cx + x - 0.7, cy + y - 0.7, 1.4, 1.4);
        g.strokeStyle = st.hit ? hsl(t * 500 + cx) : st.cue && st.cue.kind === 'color' ? st.cue.color : rainbowish(st) ? hsl(t * 200 + cx) : (LED[st.mode] || LED.normal)[0];
        g.lineWidth = Math.max(1.2, r0 * 0.08);
        g.globalAlpha = 0.45 + 0.4 * Math.sin(t * 5 + cx);
        g.beginPath();
        g.arc(cx, cy, r0 * 1.02, 0, Math.PI * 2);
        g.stroke();
        g.globalAlpha = 1;
    }
    // 上の まんなかの イラストの パネル (こおりくん・おにおに・ふるカワと ロゴ)
    function topPanel(pts, st, t) {
        const top = winTop(pts);
        const pw = B.w * 0.56, px = B.x + (B.w - pw) / 2;
        const py = Math.max(3, top - B.w * 0.38), ph = top - band() * 1.1 - py;
        if (pw < 40 || ph < 20) return;
        const cx = px + pw / 2, cy = py + ph / 2;
        g.save();
        rr(px, py, pw, ph, ph * 0.12);
        g.clip();
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
        const s = ph * 0.62 / 16;
        if (typeof SPRITES !== 'undefined' && SPRITES.koori) drawSprite(g, SPRITES.koori, Math.floor(t * 2) % 2 ? 'walk1' : 'walk2', px + pw * 0.02, py + ph - 16 * s * 0.92, s);
        if (typeof Characters !== 'undefined' && Characters.has('onioni')) {
            const sz = Characters.size('onioni');
            const sc = (ph * 0.78) / sz.h;
            Characters.drawEnemy(g, 'onioni', px + pw - sz.w * sc * 0.55, py + ph * 1.04, { scale: sc, frame: Math.floor(t * 2) % 2 });
        }
        if (typeof SPRITES !== 'undefined' && SPRITES.furukawa) drawSprite(g, SPRITES.furukawa, Math.floor(t * 3) % 2 ? 'talk' : 'idle', cx - 8 * s * 0.4, py + ph * 0.02, s * 0.4);
        g.restore();
        const size = Math.min(ph * 0.3, pw * 0.1);
        g.textAlign = 'center';
        g.textBaseline = 'middle';
        g.font = `bold ${Math.round(size)}px ${FONT}`;
        g.lineWidth = Math.max(3, size * 0.24);
        g.strokeStyle = '#ffffff';
        g.strokeText('Pこおりくん', cx, py + ph * 0.5);
        g.fillStyle = lin(0, py + ph * 0.3, 0, py + ph * 0.7, [[0, RED_LIGHT], [1, '#8a0a1a']]);
        g.fillText('Pこおりくん', cx, py + ph * 0.5);
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
        rr(px, py, pw, ph, ph * 0.12);
        g.strokeStyle = '#2a2a34';
        g.lineWidth = 2;
        g.stroke();
        g.textAlign = 'left';
    }
    // 左右の 透明な 結晶の 飾り (窓の 外)
    function crystals(pts, st, t) {
        const left = winLeft(pts) - band(), right = W - (winRight(pts) + band());
        const glow = st.hit ? hsl(t * 400, 95, 70) : st.cue && st.cue.kind === 'color' ? st.cue.color : rainbowish(st) ? hsl(t * 120, 90, 70) : st.mode === 'rush' ? '#ff9ab0' : '#c8b0ff';
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
        if (left > 6) {
            cluster(left * 0.4, B.y + B.h * 0.42, Math.max(left * 1.6, 18), 1);
            cluster(left * 0.4, B.y + B.h * 0.72, Math.max(left * 1.3, 14), 1);
        }
        if (right > 6) cluster(W - right * 0.4, B.y + B.h * 0.86, Math.max(right * 1.3, 14), -1);
    }
    // 右: 白く 光る 管 (上から つきだす) と つかみ。下に 丸い ランプ
    function tubeX(pts) {
        const r = winRight(pts);
        return Math.min(W - 6, r + (W - r) * 0.45);
    }
    const lampY = () => Y(296);
    function tube(pts, st, t) {
        const cx = tubeX(pts), tw = Math.max(6, B.w * 0.03);
        const top = 4, bottom = lampY() - B.w * 0.06;
        g.fillStyle = '#121218';
        rr(cx - tw * 0.9, top - 2, tw * 1.8, tw * 1.6, tw * 0.5);
        g.fill();
        const flash = st.gimmick != null ? 1 : 0;
        const core = st.hit ? hsl(t * 500, 95, 75) : st.cue && st.cue.kind === 'color' ? st.cue.color : rainbowish(st) ? hsl(t * 220, 95, 75) : st.mode === 'rush' ? '#ff8a9a' : '#ffffff';
        g.shadowColor = rainbowish(st) ? core : st.mode === 'rush' ? '#ff3a4a' : '#bff0ff';
        g.shadowBlur = 10 + flash * 24 + 4 * Math.sin(t * 4);
        rr(cx - tw / 2, top + tw * 1.2, tw, bottom - top - tw * 1.2, tw / 2);
        g.fillStyle = lin(cx - tw / 2, 0, cx + tw / 2, 0, [[0, 'rgba(200,220,235,.9)'], [0.45, core], [1, 'rgba(160,180,200,.9)']]);
        g.fill();
        g.shadowBlur = 0;
        const L = bottom - top - tw * 2.4;
        for (let i = 0; i < 3; i++) {
            const k = (t * (st.mode === 'normal' ? 0.5 : 1.4) + i / 3) % 1;
            g.fillStyle = 'rgba(255,255,255,.9)';
            g.fillRect(cx - tw * 0.2, top + tw * 1.2 + L * k, tw * 0.4, tw * 1.2);
        }
        // 下の つかみ (ランプの 上)
        g.fillStyle = '#121218';
        rr(cx - tw * 0.9, bottom - tw * 1.2, tw * 1.8, tw * 2.2, tw * 0.5);
        g.fill();
    }
    function lampDraw(pts, st, t) {
        const cx = tubeX(pts), cy = lampY() + B.w * 0.02;
        const R = B.w * 0.06;
        g.beginPath();
        g.arc(cx, cy, R * 1.25, 0, Math.PI * 2);
        g.fillStyle = lin(cx - R, cy - R, cx + R, cy + R, [[0, '#ff5a6a'], [0.5, RED], [1, RED_DARK]]);
        g.fill();
        g.beginPath();
        g.arc(cx, cy, R * 1.02, 0, Math.PI * 2);
        g.fillStyle = lin(cx - R, cy - R, cx + R, cy + R, [[0, '#ffffff'], [0.5, '#8a96a6'], [1, '#d8e0ea']]);
        g.fill();
        const on = lampOn(t);
        let fill;
        if (on) {
            const e = t - on.at;
            const blink = on.kind === 'glitch' ? (Math.random() < 0.5 ? 1 : 0.08) : 0.65 + 0.35 * Math.sin(e * 18);
            const c = on.kind === 'glitch' ? `rgba(240,250,255,${blink})` : on.kind === 'rainbow' ? hsl(e * 540, 95, 62) : on.kind === 'purple' ? `rgba(190,80,255,${blink})` : `rgba(255,40,60,${blink})`;
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
        g.fillStyle = 'rgba(255,255,255,.55)';
        g.beginPath();
        g.ellipse(cx - R * 0.3, cy - R * 0.38, R * 0.28, R * 0.14, -0.5, 0, Math.PI * 2);
        g.fill();
    }
    // 下の 段: レバー (台座から のびた 棒の 上に PUSH ボタン)・左右の スピーカーの 網・持ち玉の 列・ハンドルの 飾り
    function lever(pts) {
        const y0 = winBottom(pts) + band();
        const bh = H - y0 - 4;
        if (bh < 24) return null;
        const cx = W / 2;
        const capR = Math.min(B.w * 0.075, bh * 0.36);
        const capY = y0 + capR * 0.7;   // 窓の すぐ 下まで のびる
        return { cx, capY, capR, baseY: H - 4, baseW: W * 0.26, y0, bh };
    }
    function bottom(pts, st, t) {
        const L = lever(pts);
        if (!L) return;
        const { cx, baseY, baseW, y0, bh } = L;
        let { capR } = L;
        // 左右の スピーカーの 網
        for (const [gx, gw] of [[W * 0.05, W * 0.3], [W * 0.65, W * 0.3]]) {
            const gy = y0 + bh * 0.3, gh = bh * 0.52;
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
        // 持ち玉の 列 (25 発ごとに 1 つ)
        const ballR = Math.max(1.6, bh * 0.045);
        const max = Math.floor((W * 0.3 - ballR * 4) / (ballR * 2.2));
        const n = Math.min(max * 2, Math.floor((st.balls || 0) / 25));
        for (let i = 0; i < n; i++) {
            const leftSide = i % 2 === 0, k = Math.floor(i / 2);
            const x = leftSide ? W * 0.05 + ballR * 2 + k * ballR * 2.2 : W * 0.95 - ballR * 2 - k * ballR * 2.2;
            const y = y0 + bh * 0.15;
            g.beginPath();
            g.arc(x, y, ballR, 0, Math.PI * 2);
            g.fillStyle = lin(x - ballR, y - ballR, x + ballR, y + ballR, [[0, '#ffffff'], [0.5, '#c8d0da'], [1, '#6a7688']]);
            g.fill();
        }
        // レバーの 台座 (赤黒の 曲がった 土台)
        g.beginPath();
        g.moveTo(cx - baseW * 0.5, baseY);
        g.bezierCurveTo(cx - baseW * 0.5, baseY - bh * 0.22, cx - baseW * 0.24, baseY - bh * 0.3, cx - baseW * 0.18, baseY - bh * 0.34);
        g.lineTo(cx + baseW * 0.18, baseY - bh * 0.34);
        g.bezierCurveTo(cx + baseW * 0.24, baseY - bh * 0.3, cx + baseW * 0.5, baseY - bh * 0.22, cx + baseW * 0.5, baseY);
        g.closePath();
        g.fillStyle = lin(cx - baseW / 2, 0, cx + baseW / 2, 0, [[0, '#0c0c10'], [0.3, '#2a2a34'], [0.5, '#3a3a46'], [0.7, '#2a2a34'], [1, '#0c0c10']]);
        g.fill();
        // 台座の 赤い すじ
        g.strokeStyle = RED;
        g.lineWidth = Math.max(2, baseW * 0.05);
        g.beginPath();
        g.moveTo(cx - baseW * 0.32, baseY - 2);
        g.quadraticCurveTo(cx - baseW * 0.2, baseY - bh * 0.26, cx - baseW * 0.12, baseY - bh * 0.32);
        g.moveTo(cx + baseW * 0.32, baseY - 2);
        g.quadraticCurveTo(cx + baseW * 0.2, baseY - bh * 0.26, cx + baseW * 0.12, baseY - bh * 0.32);
        g.stroke();
        // レバーの 棒 (上へ 細くなる。押すと 少し 沈む)。レバブルで ぶるぶる、「レバーを引け！」で 虹色に 光る (2026-10-23)
        //   引くと (bs.pull 0〜1。2026-10-24) 手前に 倒れて くるので、ボタンが 下がって 少し 大きく 見える
        const bs = st.button || {};
        const pull = bs.pull || 0;
        const sink = bs.pressed && !bs.lever ? capR * 0.25 : 0;
        // 引く 量は 前より 大きく 動かす (2026-10-24 ユーザー指定: 引く 感覚を わかりやすく)。棒の 根元は こえない
        const drop = Math.min(capR * 1.8, Math.max(capR * 0.8, baseY - bh * 0.32 - L.capY - capR * 0.3));
        const capY = L.capY + sink + pull * drop;
        const capR0 = capR;
        capR *= 1 + pull * 0.4;
        // 引け！の 色 (2026-10-24 ユーザー指定: 色の 段階)。虹は 色が 流れる、ほかは その 色で 明るさが 脈打つ
        const LEVER_HUE = { blue: 212, red: 355, gold: 46 };
        const hue = LEVER_HUE[bs.leverColor];
        const lc = (off, s, l) => hue == null ? hsl(t * 400 + off, s, l) : hsl(hue + off * 0.05, s, l + 12 * Math.sin(t * 12) - (off ? 8 : 0));
        const jig = bs.buru ? Math.sin(t * 90) * capR * 0.14 : 0;
        g.save();
        g.translate(jig, bs.buru ? Math.cos(t * 70) * capR * 0.05 : 0);
        if (bs.lever) {
            g.shadowColor = lc(0, 95, 60);
            g.shadowBlur = 26;
        }
        const sw0 = baseW * 0.3, sw1 = capR * 0.9;
        const sy0 = baseY - bh * 0.32;
        g.beginPath();
        g.moveTo(cx - sw0 / 2, sy0);
        g.bezierCurveTo(cx - sw0 * 0.55, (sy0 + capY) / 2, cx - sw1 * 0.5, capY + capR, cx - sw1 * 0.55, capY + capR * 0.2);
        g.lineTo(cx + sw1 * 0.55, capY + capR * 0.2);
        g.bezierCurveTo(cx + sw1 * 0.5, capY + capR, cx + sw0 * 0.55, (sy0 + capY) / 2, cx + sw0 / 2, sy0);
        g.closePath();
        g.fillStyle = bs.lever ? lin(0, capY, 0, sy0, [[0, lc(0, 95, 65)], [0.5, lc(120, 95, 55)], [1, lc(240, 95, 45)]])
            : lin(cx - sw0 / 2, 0, cx + sw0 / 2, 0, [[0, '#1a1a20'], [0.35, RED_DARK], [0.5, RED_LIGHT], [0.65, RED_DARK], [1, '#1a1a20']]);
        g.fill();
        g.shadowBlur = 0;
        // 棒の 黒い ふち
        g.strokeStyle = '#08080c';
        g.lineWidth = 1.5;
        g.stroke();
        // 上の PUSH ボタン (ななめから 見た 丸い ボタン。台の ボタンの 光り方に 合わせる)
        g.beginPath();
        g.ellipse(cx, capY + capR * 0.28, capR * 1.08, capR * 0.62, 0, 0, Math.PI * 2);
        g.fillStyle = '#2a2a34';
        g.fill();   // ボタンの 側面
        let face = lin(cx - capR, capY - capR, cx + capR, capY + capR, [[0, '#ffffff'], [0.5, '#c8d0da'], [1, '#6a7688']]);
        if (bs.lever) {
            const c = lc(0, 95, 65);
            face = rad(cx, capY, capR * 0.1, capR, [[0, '#ffffff'], [0.5, c], [1, lc(180, 95, 55)]]);
            g.shadowColor = c;
            g.shadowBlur = 26;
        } else if (bs.kind && bs.lit) {
            const c = bs.kind === 'rainbow' ? hsl(t * 400, 95, 65) : bs.kind === 'purple' ? '#be50ff' : bs.kind === 'red' ? '#ff3a4a' : '#ffe066';
            face = rad(cx, capY, capR * 0.1, capR, [[0, '#ffffff'], [0.5, c], [1, c]]);
            g.shadowColor = c;
            g.shadowBlur = 22;
        } else if (bs.push && bs.pushStyle && bs.pushStyle.color !== 'white') {
            // PUSH の 色の 段階 (2026-10-24): 青 < 赤 < 金 < 虹。長押しは ため で 明るく なる
            const PUSH_HUE = { blue: 212, red: 355, gold: 46 };
            const h = PUSH_HUE[bs.pushStyle.color];
            const c = h == null ? hsl(t * 400, 95, 65) : hsl(h, 95, 60 + 10 * Math.abs(Math.sin(t * 6)));
            face = rad(cx, capY, capR * 0.1, capR, [[0, '#ffffff'], [0.5, c], [1, c]]);
            g.shadowColor = c;
            g.shadowBlur = 14 + 12 * Math.abs(Math.sin(t * 6)) + 20 * (bs.pushStyle.charge || 0);
        } else if (bs.push) {
            g.shadowColor = '#ffe066';
            g.shadowBlur = 10 + 12 * Math.abs(Math.sin(t * 6)) + 20 * ((bs.pushStyle && bs.pushStyle.charge) || 0);
        }
        g.beginPath();
        g.ellipse(cx, capY, capR, capR * 0.55, 0, 0, Math.PI * 2);
        g.fillStyle = face;
        g.fill();
        g.shadowBlur = 0;
        g.strokeStyle = '#d8dee8';
        g.lineWidth = 1.5;
        g.stroke();
        g.save();
        g.translate(cx, capY);
        g.scale(1, 0.55);
        g.font = `bold ${Math.round(capR * 0.55)}px ${FONT}`;
        g.textAlign = 'center';
        g.textBaseline = 'middle';
        g.fillStyle = bs.push && Math.floor(t * 4) % 2 ? RED : '#2a2a34';
        g.fillText('PUSH', 0, 1);
        g.restore();
        g.restore();   // ぶるぶる の 位置を もどす
        leverGuide(L, bs, t, capR0, drop, lc);
        // 「レバーを引け！」: ボタンの 左右に「引け」と、手前 (下) へ 流れる ▼
        if (bs.lever && !pull) {
            g.font = `bold ${Math.round(capR0 * 0.8)}px ${FONT}`;
            g.textAlign = 'center';
            g.textBaseline = 'middle';
            g.lineWidth = 3;
            g.strokeStyle = '#000000';
            const k = (t * 2) % 1;
            for (const dx of [-1, 1]) {
                const x = cx + dx * capR0 * 1.7;
                g.globalAlpha = 1;
                g.strokeText('引け', x, capY - capR0 * 0.6);
                g.fillStyle = lc(dx * 90, 95, 65);
                g.fillText('引け', x, capY - capR0 * 0.6);
                g.globalAlpha = 1 - k;
                g.strokeText('▼', x, capY + capR0 * (0.2 + k * 0.8));
                g.fillStyle = '#ffe066';
                g.fillText('▼', x, capY + capR0 * (0.2 + k * 0.8));
            }
            g.globalAlpha = 1;
            g.textAlign = 'left';
        }
        // ハンドルの 飾り (右下の オレンジの 玉)
        const hr = Math.min(bh * 0.14, W * 0.04);
        g.beginPath();
        g.arc(W - hr * 2, H - hr * 1.8, hr, 0, Math.PI * 2);
        g.fillStyle = lin(W - hr * 3, H - hr * 2.8, W - hr, H - hr, [[0, '#ffd0a0'], [0.5, '#ff7a2a'], [1, '#a03a0a']]);
        g.fill();
    }

    // レバーを 引く 手がかり (2026-10-24 ユーザー指定: 引くのを わかりやすく)
    //   待っている あいだ: うすい ボタンの 影が 下へ すべって「下へ 引く」動きを 見せる
    //   引いている あいだ: 右に 引いた 量の ゲージ (4 段の 目もり。カチッと 合わせる)
    //   引ききった 瞬間: 光の 輪が 広がって「ガコン!!」
    function leverGuide(L, bs, t, capR, drop, lc) {
        const { cx } = L;
        const top = L.capY, end = L.capY + drop;
        if (bs.lever && !bs.grabbing && bs.pulledAge == null) {
            const k = (t * 1.2) % 1;
            const y = top + drop * Math.min(1, k * 1.4);
            g.globalAlpha = 0.45 * (1 - k);
            g.beginPath();
            g.ellipse(cx, y, capR * 1.1, capR * 0.6, 0, 0, Math.PI * 2);
            g.fillStyle = lc(0, 95, 70);
            g.fill();
            g.globalAlpha = 1;
            g.font = `bold ${Math.round(Math.max(10, capR * 0.62))}px ${FONT}`;
            g.textAlign = 'center';
            g.textBaseline = 'middle';
            g.lineWidth = 3;
            g.strokeStyle = '#000000';
            const ly = Math.min(H - capR * 0.4, end + capR * 1.0);
            g.strokeText('↓ 下へ引く ↓', cx, ly);
            g.fillStyle = Math.floor(t * 4) % 2 ? '#ffffff' : '#ffe066';
            g.fillText('↓ 下へ引く ↓', cx, ly);
            g.textAlign = 'left';
        }
        if (bs.grabbing) {
            const gx = cx + capR * 2.1, gw = Math.max(5, capR * 0.32);
            const gy = top - capR * 0.4, gh = drop + capR * 0.8;
            g.fillStyle = 'rgba(0,0,0,.65)';
            g.fillRect(gx - 1, gy - 1, gw + 2, gh + 2);
            g.fillStyle = bs.pull >= 0.75 ? '#ff3a4a' : bs.pull >= 0.5 ? '#ffd23a' : '#4aa8ff';
            g.fillRect(gx, gy, gw, gh * bs.pull);
            g.fillStyle = '#ffffff';
            for (let i = 1; i < 4; i++) g.fillRect(gx - 2, gy + gh * i / 4, gw + 4, 1.5);
            if (bs.pull >= 0.5) {
                g.font = `bold ${Math.round(Math.max(9, capR * 0.5))}px ${FONT}`;
                g.textAlign = 'left';
                g.textBaseline = 'middle';
                g.lineWidth = 3;
                g.strokeStyle = '#000000';
                g.strokeText('あと少し！', gx + gw + 4, gy + gh * bs.pull);
                g.fillStyle = '#ffe066';
                g.fillText('あと少し！', gx + gw + 4, gy + gh * bs.pull);
            }
        }
        if (bs.pulledAge != null && bs.pulledAge < 0.55) {
            const a = bs.pulledAge / 0.55;
            g.globalAlpha = 1 - a;
            g.strokeStyle = '#ffffff';
            g.lineWidth = 4 * (1 - a) + 1;
            g.beginPath();
            g.ellipse(cx, end, capR * (1.2 + a * 4), capR * (0.7 + a * 2.2), 0, 0, Math.PI * 2);
            g.stroke();
            g.fillStyle = '#ffe066';
            for (let i = 0; i < 10; i++) {
                const ang = i / 10 * Math.PI * 2;
                const r = capR * (1.4 + a * 3.5);
                g.fillRect(cx + Math.cos(ang) * r - 2, end + Math.sin(ang) * r * 0.6 - 2, 4, 4);
            }
            // 文字は 左右の スピーカーの 上 (レバーの 上は 盤面の 窓で かくれる)
            let size = Math.round(capR * (1.1 + Math.max(0, 0.15 - bs.pulledAge) * 4));
            g.textAlign = 'center';
            g.textBaseline = 'middle';
            g.font = `bold ${size}px ${FONT}`;
            while (size > 8 && g.measureText('ガコン!!').width > W * 0.3) g.font = `bold ${--size}px ${FONT}`;
            g.lineWidth = 4;
            g.strokeStyle = '#000000';
            g.fillStyle = hsl(t * 400, 95, 65);
            for (const x of [W * 0.2, W * 0.8]) {
                g.strokeText('ガコン!!', x, L.y0 + L.bh * 0.55);
                g.fillText('ガコン!!', x, L.y0 + L.bh * 0.55);
            }
            g.globalAlpha = 1;
            g.textAlign = 'left';
        }
    }

    // 下の PUSH (レバーの 上の ボタン) の 位置 (#cabinet-push を 重ねる)。下の 段が せまいときは null
    // (スマホも 筐体を 縦に 長くして 段を 残している。css/style.css の @media)
    //   wide: 「レバーを引け！」の あいだは、レバーの 左右・下を ふくむ 広い ところを つかめる (2026-10-24 ユーザー指定: 引きやすく)
    function pushRect(wide = false) {
        const L = cv && lever(windowPoints());
        if (!L) return null;
        if (wide) {
            const w = Math.max(L.capR * 5, L.baseW * 1.4);
            const y = L.capY - L.capR * 1.6;
            return { x: L.cx - w / 2, y, w, h: H - y };
        }
        return { x: L.cx - L.capR * 1.1, y: L.capY - L.capR * 0.7, w: L.capR * 2.2, h: L.capR * 1.6 };
    }

    // ----- 役物: 氷の 結晶の メダル (表: こおりくん / 裏: おにおに) -----
    // ふだんは 窓の 上の ふちに 大きく かかって 乗っている (2026-10-23 ユーザー指定: もとから 大きく 上に)。
    // 役物が 動く (st.gimmick: 0〜1。Lcd.gimmick) と、液晶の 前へ 落ちてきて さらに 大きくなり、くるくる 回って
    // 表と 裏が 入れかわり、虹色に 光って 光の すじが 出る。最後に 上へ もどる (当たり確定の 意味は 前と 同じ)
    function hexPath(cx, cy, r, sx) {
        g.beginPath();
        for (let i = 0; i < 6; i++) {
            const a = Math.PI / 6 + i * Math.PI / 3;
            const x = cx + Math.cos(a) * r * sx, y = cy + Math.sin(a) * r;
            if (i) g.lineTo(x, y); else g.moveTo(x, y);
        }
        g.closePath();
    }
    function medal(pts, st, t) {
        const restR = B.w * 0.12, downR = B.w * 0.18;
        const restX = B.x + B.w / 2, restY = winTop(pts) - restR * 0.05;
        const lcd = (shape && shape.lcd) || { x: 90, y: 118, w: 180, h: 101 };
        const downX = X(lcd.x + lcd.w / 2), downY = Y(lcd.y + lcd.h / 2);
        const gt = st.gimmick;
        let k = 0;   // 0: 上 / 1: 液晶の 前
        if (gt != null) k = gt < 0.18 ? (gt / 0.18) ** 2 : gt < 0.82 ? 1 : 1 - (gt - 0.82) / 0.18;
        // 落ちきった ところで 少し はねる
        const bounce = gt != null && gt >= 0.18 && gt < 0.26 ? Math.sin((gt - 0.18) / 0.08 * Math.PI) * restR * 0.25 : 0;
        const r = restR + (downR - restR) * k;
        const cx = restX + (downX - restX) * k, cy = restY + (downY - restY) * k - bounce;
        const spin = gt != null && gt >= 0.18 && gt < 0.82 ? (gt - 0.18) / 0.64 * Math.PI * 6 : 0;
        const sx = Math.cos(spin), back = sx < 0;
        const hue = (t * 360) % 360;
        if (k > 0.4) {
            g.save();
            g.globalAlpha = Math.min(1, (k - 0.4) / 0.4);
            for (let i = 0; i < 16; i++) {
                const a = i / 16 * Math.PI * 2 + t * 1.5;
                g.strokeStyle = hsl(hue + i * 22, 95, 65, 0.6);
                g.lineWidth = Math.max(3, r * 0.08);
                g.beginPath();
                g.moveTo(cx + Math.cos(a) * r * 1.1, cy + Math.sin(a) * r * 1.1);
                g.lineTo(cx + Math.cos(a) * r * 2.3, cy + Math.sin(a) * r * 2.3);
                g.stroke();
            }
            g.fillStyle = hsl(hue, 90, 60, 0.35);
            g.beginPath();
            g.arc(cx, cy, r * 1.35, 0, Math.PI * 2);
            g.fill();
            g.restore();
        }
        // 影 (上に 乗っている とき)
        const w = Math.max(0.08, Math.abs(sx));
        if (k === 0) {
            g.shadowColor = 'rgba(0,0,0,.6)';
            g.shadowBlur = 10;
            g.shadowOffsetY = 4;
        }
        hexPath(cx, cy, r, w);
        g.fillStyle = k > 0.4 ? hsl(hue, 90, 70) : lin(cx - r, cy - r, cx + r, cy + r, [[0, '#ffffff'], [0.5, '#8a96a6'], [1, '#e8eaf0']]);
        g.fill();
        g.shadowColor = 'transparent';
        g.shadowBlur = 0;
        g.shadowOffsetY = 0;
        hexPath(cx, cy, r * 0.84, w);
        g.fillStyle = back ? lin(cx - r, cy - r, cx + r, cy + r, [[0, '#ff8a8a'], [0.5, RED_LIGHT], [1, RED_DARK]])
            : lin(cx - r, cy - r, cx + r, cy + r, [[0, '#ffffff'], [0.5, '#bff0ff'], [1, '#4aa8e0']]);
        g.fill();
        // 結晶の 面の 線
        g.strokeStyle = 'rgba(255,255,255,.55)';
        g.lineWidth = 1;
        for (let i = 0; i < 3; i++) {
            const a = Math.PI / 6 + i * Math.PI / 3;
            g.beginPath();
            g.moveTo(cx + Math.cos(a) * r * 0.84 * w, cy + Math.sin(a) * r * 0.84);
            g.lineTo(cx - Math.cos(a) * r * 0.84 * w, cy - Math.sin(a) * r * 0.84);
            g.stroke();
        }
        // 顔 (表: こおりくん / 裏: おにおに)。横に つぶす
        g.save();
        g.translate(cx, cy);
        g.scale(w, 1);
        g.imageSmoothingEnabled = false;
        if (back && typeof Characters !== 'undefined' && Characters.has('onioni')) {
            const sz = Characters.size('onioni');
            Characters.drawEnemy(g, 'onioni', 0, r * 0.62, { scale: (r * 1.25) / sz.h, frame: 0 });
        } else if (typeof SPRITES !== 'undefined' && SPRITES.koori) {
            const s = (r * 1.15) / 16;
            drawSprite(g, SPRITES.koori, Math.floor(t * 2) % 2 && k === 0 ? 'walk2' : 'walk1', -8 * s, -8 * s - r * 0.05, s);
        }
        g.restore();
        // ふだんの きらり
        if (k === 0) {
            const a = (Math.sin(t * 2) + 1) / 2;
            g.fillStyle = `rgba(255,255,255,${a})`;
            g.fillRect(cx + r * 0.35, cy - r * 0.62, 1.5, r * 0.3);
            g.fillRect(cx + r * 0.35 - r * 0.14, cy - r * 0.62 + r * 0.14, r * 0.3, 1.5);
        }
    }

    // 当たりの 瞬間の 虹色の 光の すじ (窓の 外。はじめの 1.6 秒)
    function hitBurst(pts, t) {
        const e = t - hitAt;
        if (e < 0 || e > 1.6) return;
        const a = 1 - e / 1.6;
        g.save();
        g.beginPath();
        g.rect(-10, -10, W + 20, H + 20);
        windowPath(pts);
        g.clip('evenodd');
        g.fillStyle = `rgba(255,255,255,${0.35 * a * (Math.floor(e * 14) % 2)})`;
        g.fillRect(0, 0, W, H);
        const cx = W / 2, cy = B.y + B.h * 0.4, R = Math.hypot(W, H);
        for (let i = 0; i < 18; i++) {
            const ang = i / 18 * Math.PI * 2 + e * 1.5;
            g.beginPath();
            g.moveTo(cx, cy);
            g.arc(cx, cy, R, ang, ang + 0.12);
            g.closePath();
            g.fillStyle = hsl(i * 20 + e * 300, 95, 65, 0.35 * a);
            g.fill();
        }
        g.restore();
    }

    // 毎フレーム。st: { mode, premium, gimmick, balls, button: { kind, lit, push, pressed }, cue: 演出の 光 (Lcd.light) }
    function draw(t, st) {
        if (!cv) return;
        if (cv.width !== Math.round(wrap.clientWidth * dpr) || boardEl.offsetWidth !== B.w) resize();
        g.setTransform(dpr, 0, 0, dpr, 0, 0);
        g.clearRect(0, 0, W, H);
        // 当たりが 見えた 瞬間: 虹色に 切りかえ、先バレの ランプも 虹色
        if (st.cue && st.cue.kind === 'hit' && !(lastCue && lastCue.kind === 'hit')) {
            hitAt = t;
            lamp('rainbow', t);
        }
        lastCue = st.cue;
        st = { ...st, hit: hitting(st, t) };
        const pts = windowPoints();
        body(pts);
        innerGlow(pts, st, t);
        // ここから 先は 窓の 外だけ (盤面の 中の 釘・玉に かからない)
        g.save();
        g.beginPath();
        g.rect(-10, -10, W + 20, H + 20);
        windowPath(pts);
        g.clip('evenodd');
        crystals(pts, st, t);
        windowRim(pts, st, t);
        topPanel(pts, st, t);
        housings(pts, st, t);
        tube(pts, st, t);
        lampDraw(pts, st, t);
        bottom(pts, st, t);
        g.restore();
        hitBurst(pts, t);
        // 役物 (窓の 外にも 中にも 描く。盤面の 上に 落ちてくる)
        medal(pts, st, t);
    }

    return { create, draw, resize, lamp, pushRect, LAMP_TIME };
})();
