// =====================================================================
// 液晶の図柄 (1〜7 と V)
// ---------------------------------------------------------------------
// 1 ふるカワ / 2 ひびきまくり / 3 おにおに / 4 おかがっぱ / 5 シバター / 6 やすさん・たむさん・だけさん / 7 こおりくん
// 奇数は赤、偶数は青 (ユーザー指定。config.show.figureColors)。V は小当たり。
// Figures.draw(ctx, 図柄, 中心x, 中心y, 幅, 高さ, { dim, glow }) で描く。大きさごとに一度だけ絵を作って使い回す。
// =====================================================================

const Figures = (() => {
    const FONT = '"DotGothic16", "MS Gothic", "Osaka-Mono", monospace';
    const cache = {};
    const RES = 2;   // 液晶 (lcd.js) と 同じ 細かさ

    const isOdd = n => typeof n === 'number' && n % 2 === 1;

    function color(n) {
        const c = CONFIG.show.figureColors;
        return n === 'V' ? '#ffe066' : isOdd(n) ? c.odd : c.even;
    }

    // キャラクター 1人を (cx, footY) に、高さ maxH・幅 maxW に収まるよう描く
    function drawCharacter(g, id, cx, footY, maxW, maxH) {
        const sprite = SPRITES[id];
        if (sprite) {
            const frameName = Object.keys(sprite.frames).find(k => k === 'walk1' || k === 'idle') || Object.keys(sprite.frames)[0];
            const rows = sprite.frames[frameName];
            const scale = Math.min(maxW / rows[0].length, maxH / rows.length);
            drawSprite(g, sprite, frameName, cx - rows[0].length * scale / 2, footY - rows.length * scale, scale);
            return;
        }
        const size = Characters.size(id);
        const scale = Math.min(maxW / size.w, maxH / size.h);
        if (Characters.isCompanion(id)) Characters.drawCompanion(g, id, cx, footY, { scale });
        else Characters.drawEnemy(g, id, cx, footY, { scale });
    }

    function build(n, w, h) {
        const c = document.createElement('canvas');
        c.width = w * RES;
        c.height = h * RES;
        const g = c.getContext('2d');
        g.scale(RES, RES);   // 液晶と 同じ 2 倍の 細かさ (2026-10-23 P1)
        g.imageSmoothingEnabled = false;
        const main = color(n);
        // 札: 暗い地に色の縁
        g.fillStyle = '#0b1424';
        g.fillRect(0, 0, w, h);
        g.fillStyle = main;
        g.fillRect(0, 0, w, 2);
        g.fillRect(0, h - 2, w, 2);
        g.fillRect(0, 0, 2, h);
        g.fillRect(w - 2, 0, 2, h);
        g.fillStyle = isOdd(n) ? 'rgba(255, 58, 74, 0.18)' : n === 'V' ? 'rgba(255, 224, 102, 0.18)' : 'rgba(58, 138, 255, 0.18)';
        g.fillRect(2, 2, w - 4, h - 4);

        if (n === 'V') {
            g.font = `bold ${Math.round(h * 0.7)}px ${FONT}`;
            g.textAlign = 'center';
            g.textBaseline = 'middle';
            g.fillStyle = '#000';
            g.fillText('V', w / 2 + 1, h / 2 + 2);
            g.fillStyle = main;
            g.fillText('V', w / 2, h / 2 + 1);
            return c;
        }
        // キャラクター
        const ids = CONFIG.show.figures[n].ids;
        const foot = h - 4;
        if (ids.length === 1) drawCharacter(g, ids[0], w / 2, foot, w - 8, h - 10);
        else ids.forEach((id, i) => drawCharacter(g, id, w * (i + 0.5) / ids.length, foot, w / ids.length, (h - 10) * 0.8));
        // 数字 (左上)
        const size = Math.max(10, Math.round(h * 0.42));
        g.font = `bold ${size}px ${FONT}`;
        g.textAlign = 'left';
        g.textBaseline = 'top';
        g.fillStyle = '#000';
        g.fillText(String(n), 4, 2);
        g.fillStyle = main;
        g.fillText(String(n), 3, 1);
        return c;
    }

    function tile(n, w, h) {
        const key = `${n}:${w}x${h}`;
        if (!cache[key]) cache[key] = build(n, w, h);
        return cache[key];
    }

    // options.dim: 暗くする (止まる前・外れ) / options.glow: 色の光 (リーチ・当たり)
    function draw(ctx, n, cx, cy, w, h, options = {}) {
        const x = Math.round(cx - w / 2);
        const y = Math.round(cy - h / 2);
        if (options.glow) {
            ctx.fillStyle = color(n);
            ctx.globalAlpha = 0.35 + 0.25 * options.glow;
            ctx.fillRect(x - 3, y - 3, w + 6, h + 6);
            ctx.globalAlpha = 1;
        }
        ctx.drawImage(tile(n, w, h), x, y, w, h);
        if (options.dim) {
            ctx.fillStyle = `rgba(0, 0, 0, ${options.dim})`;
            ctx.fillRect(x, y, w, h);
        }
    }

    // こおりくんの色を変えたときに、作っておいた絵を捨てる
    function clearCache() {
        Object.keys(cache).forEach(k => delete cache[k]);
    }

    return { draw, color, isOdd, clearCache, COUNT: 7 };
})();
