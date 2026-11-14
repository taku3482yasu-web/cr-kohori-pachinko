// =====================================================================
// ドット絵の 高精細化 (2026-11-14 ユーザー指定: こおりくんシリーズの ドット絵を もっと 緻密に・鮮明に)
// ---------------------------------------------------------------------
// 1 ドット = 1 色の 絵 (グリッド) を、4 倍の 細かさの 絵に 作り直して canvas に 焼く。
//   1. Scale2x (EPX) を 2 回: 階段に なった 斜めの 線・丸を なめらかに つなぐ (4 倍)
//   2. 光と 影: 絵の 外側の 上・左の ふちを 明るく (光)、下・右の ふちを 暗く (影)。上から 光が 当たる 丸みも 付けて 立体に 見せる
//   3. 絵の すぐ 外側に 細い 暗い 輪郭 (背景の 上でも くっきり)
// 作った 絵は キャッシュして、描く ときは drawImage で のせるだけ (毎フレーム 作り直さない)。
// 液晶の canvas 自体も 細かく する (PixelHD.setupCanvas)。座標は 今までの 256x144 の まま 使える。
// シリーズの ほかの ゲームにも 同じ ファイルを 写して 使う。
// =====================================================================

const PixelHD = (() => {
    const UP = 4;            // 絵を 何倍の 細かさに するか
    const LIGHT = 0.16;      // 上の ふちを 明るく する 量
    const LIGHT_SIDE = 0.07; // 左の ふち
    const SHADE = 0.2;       // 下の ふち を 暗く する 量
    const SHADE_SIDE = 0.1;  // 右の ふち
    const GRADIENT = 0.14;   // 上下の 明るさの 差
    const OUTLINE = 0.3;     // 輪郭の 暗さ (もとの 色に かける)
    const SMALL = 10;        // この 点の 数より 小さい 色の かたまりは なめらかに しない

    // ----- 色 -----
    const parsed = new Map();
    const probe = typeof document !== 'undefined' ? document.createElement('canvas').getContext('2d') : null;
    function rgba(color) {
        if (parsed.has(color)) return parsed.get(color);
        let out = [0, 0, 0, 255];
        const m = /^#([0-9a-f]{3,8})$/i.exec(color);
        if (m) {
            let h = m[1];
            if (h.length <= 4) h = [...h].map(c => c + c).join('');
            out = [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16), h.length >= 8 ? parseInt(h.slice(6, 8), 16) : 255];
        } else if (probe) {
            probe.clearRect(0, 0, 1, 1);
            probe.fillStyle = '#000';
            probe.fillStyle = color;
            probe.fillRect(0, 0, 1, 1);
            out = [...probe.getImageData(0, 0, 1, 1).data];
        }
        parsed.set(color, out);
        return out;
    }

    // ----- グリッド (w x h の 色の 番号。0 は 透明) -----
    function makeGrid(w, h) {
        return { w, h, cells: new Int32Array(w * h), colors: [null], index: new Map() };
    }
    function colorId(grid, color) {
        if (!color) return 0;
        let id = grid.index.get(color);
        if (id == null) {
            id = grid.colors.length;
            grid.colors.push(color);
            grid.index.set(color, id);
        }
        return id;
    }
    function fill(grid, x, y, w, h, color) {
        const id = colorId(grid, color);
        const x0 = Math.max(0, Math.round(x)), y0 = Math.max(0, Math.round(y));
        const x1 = Math.min(grid.w, Math.round(x + w)), y1 = Math.min(grid.h, Math.round(y + h));
        for (let yy = y0; yy < y1; yy++) for (let xx = x0; xx < x1; xx++) grid.cells[yy * grid.w + xx] = id;
    }

    // 文字列の ドット絵 (1 文字 = 1 ドット、palette で 色) → グリッド
    function fromRows(rows, palette) {
        const w = Math.max(...rows.map(r => r.length)), h = rows.length;
        const grid = makeGrid(w, h);
        rows.forEach((row, y) => { for (let x = 0; x < row.length; x++) { const c = palette[row[x]]; if (c) fill(grid, x, y, 1, 1, c); } });
        return grid;
    }

    // r(x, y, w, h, 色) で 描く 絵 → グリッド。はみ出す 絵の ため、まず 範囲を 測る
    function fromRects(w, h, draw) {
        let minX = 0, minY = 0, maxX = w, maxY = h;
        draw((x, y, rw, rh) => {
            minX = Math.min(minX, Math.floor(x)); minY = Math.min(minY, Math.floor(y));
            maxX = Math.max(maxX, Math.ceil(x + rw)); maxY = Math.max(maxY, Math.ceil(y + rh));
        });
        const grid = makeGrid(maxX - minX, maxY - minY);
        grid.ox = minX;
        grid.oy = minY;
        draw((x, y, rw, rh, color) => fill(grid, x - minX, y - minY, rw, rh, color));
        return grid;
    }

    // 1 画素 = 1 ドットで 描いた canvas (背景など) → グリッド。半透明の 画素も そのまま 色に する
    function fromCanvas(src) {
        const w = src.width, h = src.height;
        const data = src.getContext('2d').getImageData(0, 0, w, h).data;
        const grid = makeGrid(w, h);
        for (let i = 0; i < w * h; i++) {
            const a = data[i * 4 + 3];
            if (!a) continue;
            const hex = '#' + [data[i * 4], data[i * 4 + 1], data[i * 4 + 2], a].map(v => v.toString(16).padStart(2, '0')).join('');
            grid.cells[i] = colorId(grid, hex);
        }
        return grid;
    }

    // ----- Scale2x (EPX) -----
    // 同じ 色で つながった かたまりの 大きさ (点の 数)。透明は いつも 大きい
    function regionSizes(grid) {
        const { w, h, cells } = grid;
        const size = new Int32Array(w * h), stack = [];
        for (let i = 0; i < w * h; i++) {
            if (size[i]) continue;
            const c = cells[i];
            const members = [i];
            size[i] = -1;
            stack.push(i);
            while (stack.length) {
                const j = stack.pop(), x = j % w, y = (j - x) / w;
                for (const k of [x > 0 ? j - 1 : -1, x < w - 1 ? j + 1 : -1, y > 0 ? j - w : -1, y < h - 1 ? j + w : -1]) {
                    if (k >= 0 && !size[k] && cells[k] === c) { size[k] = -1; members.push(k); stack.push(k); }
                }
            }
            const n = c === 0 ? 1e9 : members.length;
            for (const j of members) size[j] = n;
        }
        return size;
    }

    // small: この 点の 数より 小さい かたまり (目・口・ボタンなど) は 形を 変えない (丸めると 顔が くずれる)
    function scale2x(grid, small) {
        const { w, h, cells } = grid;
        const out = new Int32Array(w * 2 * h * 2), W2 = w * 2;
        const sizes = regionSizes(grid);
        const big = (x, y) => x < 0 || y < 0 || x >= w || y >= h || sizes[y * w + x] >= small;
        const at = (x, y) => (x < 0 || y < 0 || x >= w || y >= h ? -1 : cells[y * w + x]);
        for (let y = 0; y < h; y++) {
            for (let x = 0; x < w; x++) {
                const p = cells[y * w + x];
                const a = at(x, y - 1), b = at(x + 1, y), c = at(x - 1, y), d = at(x, y + 1);
                let e0 = p, e1 = p, e2 = p, e3 = p;
                if (big(x, y)) {
                    if (c === a && c !== d && a !== b && a !== -1 && big(x - 1, y)) e0 = a;
                    if (a === b && a !== c && b !== d && b !== -1 && big(x + 1, y)) e1 = b;
                    if (d === c && d !== b && c !== a && c !== -1 && big(x - 1, y)) e2 = c;
                    if (b === d && b !== a && d !== c && d !== -1 && big(x + 1, y)) e3 = d;
                }
                const o = y * 2 * W2 + x * 2;
                out[o] = e0; out[o + 1] = e1; out[o + W2] = e2; out[o + W2 + 1] = e3;
            }
        }
        return { ...grid, w: w * 2, h: h * 2, cells: out };
    }

    // ----- 焼く -----
    // opts: { tint: 色 (白く 光る・黒い 影など、形だけ 使う), map: 色を 置きかえる 関数, flat: true で 光と 影を 付けない, soft: 背景用に ひかえめ }
    function bake(grid, opts = {}) {
        let g = grid;
        for (let s = 1; s < UP; s *= 2) g = scale2x(g, SMALL * s * s);
        const { w, h, cells } = g;
        const canvas = document.createElement('canvas');
        canvas.width = w;
        canvas.height = h;
        const c2 = canvas.getContext('2d');
        const img = c2.createImageData(w, h);
        const d = img.data;
        const tint = opts.tint ? rgba(opts.tint) : null;
        const pal = g.colors.map(c => (c ? rgba(opts.map ? opts.map(c) : c) : null));   // map: 色の 置きかえ (金色に する など)
        const id = (x, y) => (x < 0 || y < 0 || x >= w || y >= h ? 0 : cells[y * w + x]);
        const edge = UP / 2;   // 光と 影の 太さ (細かい ドットで 2 つぶん = もとの 半ドット)
        for (let y = 0; y < h; y++) {
            for (let x = 0; x < w; x++) {
                const p = cells[y * w + x];
                const o = (y * w + x) * 4;
                if (!p) {
                    // 輪郭: 絵の すぐ 外側に 細い 暗い ふち (となりの 色を 暗く した 色)。背景の 上でも くっきり 見える
                    if (opts.flat || opts.soft) continue;
                    const k = id(x, y - 1) || id(x - 1, y) || id(x + 1, y) || id(x, y + 1);
                    if (k) {
                        const c = tint || pal[k];
                        const dk = tint ? 1 : OUTLINE;
                        d[o] = c[0] * dk; d[o + 1] = c[1] * dk; d[o + 2] = c[2] * dk; d[o + 3] = Math.round(c[3] * 0.85);
                    } else {
                        const k2 = id(x - 1, y - 1) || id(x + 1, y - 1) || id(x - 1, y + 1) || id(x + 1, y + 1);
                        if (k2) {
                            const c = tint || pal[k2];
                            const dk = tint ? 1 : OUTLINE;
                            d[o] = c[0] * dk; d[o + 1] = c[1] * dk; d[o + 2] = c[2] * dk; d[o + 3] = Math.round(c[3] * 0.4);
                        }
                    }
                    continue;
                }
                const c = tint || pal[p];
                let f = 0;
                if (!opts.flat && !tint) {
                    // 光と 影は 絵の 外側の ふち (となりが 透明) だけ に 付ける。目・口など 中の 細かい 所は くっきり 残す
                    let top = false, bottom = false, left = false, right = false;
                    for (let k = 1; k <= edge; k++) {
                        if (!id(x, y - k)) top = true;
                        if (!id(x, y + k)) bottom = true;
                        if (!id(x - k, y)) left = true;
                        if (!id(x + k, y)) right = true;
                    }
                    if (top) f += LIGHT;
                    if (left) f += LIGHT_SIDE;
                    if (bottom) f -= SHADE;
                    if (right) f -= SHADE_SIDE;
                    // 上から 光が 当たる 丸み (上ほど 少し 明るく、下ほど 少し 暗く)
                    f += GRADIENT * (0.5 - y / h);
                    if (opts.soft) f *= 0.45;   // 背景は ひかえめに
                }
                const sh = v => (f >= 0 ? v + (255 - v) * f : v * (1 + f));
                d[o] = sh(c[0]); d[o + 1] = sh(c[1]); d[o + 2] = sh(c[2]); d[o + 3] = c[3];
            }
        }
        c2.putImageData(img, 0, 0);
        return { canvas, ox: (grid.ox || 0), oy: (grid.oy || 0), w: grid.w, h: grid.h };
    }

    // ----- キャッシュ -----
    const cache = new Map();
    function cached(key, make) {
        let v = cache.get(key);
        if (!v) { v = make(); cache.set(key, v); }
        return v;
    }

    // 焼いた 絵を (x, y) に 1 ドット = scale で のせる。flip で 左右反転
    function draw(ctx, baked, x, y, scale, flip = false) {
        const dw = baked.w * scale, dh = baked.h * scale;
        const dx = x + baked.ox * scale, dy = y + baked.oy * scale;
        const smooth = ctx.imageSmoothingEnabled;
        ctx.imageSmoothingEnabled = false;
        if (flip) {
            ctx.save();
            ctx.translate(dx + dw, dy);
            ctx.scale(-1, 1);
            ctx.drawImage(baked.canvas, 0, 0, dw, dh);
            ctx.restore();
        } else {
            ctx.drawImage(baked.canvas, dx, dy, dw, dh);
        }
        ctx.imageSmoothingEnabled = smooth;
    }

    // ----- 液晶の canvas を 細かく する -----
    // 内部の 大きさは w x h の まま (座標は 今まで どおり)、実際の 画素は ratio 倍。
    // 毎フレームの 頭で begin(ctx) を 呼ぶと 拡大が もとに 戻る (途中で setTransform されても 大丈夫)
    let RATIO = 3;
    function setupCanvas(canvas, w, h, ratio = RATIO) {
        RATIO = ratio;
        canvas.width = w * ratio;
        canvas.height = h * ratio;
        const ctx = canvas.getContext('2d');
        ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
        ctx.imageSmoothingEnabled = false;
        return ctx;
    }
    function begin(ctx) { ctx.setTransform(RATIO, 0, 0, RATIO, 0, 0); }
    // 画面を 写す canvas (スナップショット・裏の 絵) を 同じ 細かさで 作る
    function offscreen(w, h) {
        const canvas = document.createElement('canvas');
        canvas.width = w * RATIO;
        canvas.height = h * RATIO;
        const ctx = canvas.getContext('2d');
        ctx.setTransform(RATIO, 0, 0, RATIO, 0, 0);
        ctx.imageSmoothingEnabled = false;
        return { canvas, ctx };
    }

    return {
        UP, fromRows, fromRects, fromCanvas, bake, cached, draw, setupCanvas, begin, offscreen,
        get ratio() { return RATIO; }
    };
})();
