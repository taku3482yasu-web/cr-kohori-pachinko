// =====================================================================
// 液晶 (256x144 のドット絵の画面)
// ---------------------------------------------------------------------
// 段階1では仮の画面: 通学路の背景の上をこおりくんが歩き、ヘソに入ると「START!」が出る。
// 図柄の変動・リーチ・RUSH などの演出は段階3以降で作る。
// =====================================================================

const Lcd = (() => {
    const W = 256;
    const H = 144;
    const FONT = '"DotGothic16", "MS Gothic", "Osaka-Mono", monospace';
    let canvas, ctx;
    let flash = null;   // { text, color, until }

    function init() {
        canvas = document.createElement('canvas');
        canvas.width = W;
        canvas.height = H;
        ctx = canvas.getContext('2d');
        return canvas;
    }

    function show(text, color, now, seconds = 0.8) {
        flash = { text, color, until: now + seconds };
    }

    function text(str, x, y, size, color, align = 'center') {
        ctx.font = `${size}px ${FONT}`;
        ctx.textAlign = align;
        ctx.textBaseline = 'middle';
        ctx.fillStyle = '#000';
        ctx.fillText(str, x + 1, y + 1);
        ctx.fillStyle = color;
        ctx.fillText(str, x, y);
    }

    function draw(now) {
        ctx.imageSmoothingEnabled = false;
        Backgrounds.draw(ctx, 'tsugakuro', now * 24);
        const frame = Math.floor(now * 4) % 2 ? 'walk1' : 'walk2';
        drawSprite(ctx, SPRITES.koori, frame, 112, 92, 2);
        text('段階1 盤面テスト', W / 2, 14, 12, '#ffffff');
        if (flash && now < flash.until) {
            const t = 1 - (flash.until - now) / 0.8;
            text(flash.text, W / 2, 60, 22 + Math.round(Math.sin(Math.min(1, t) * Math.PI) * 4), flash.color);
        }
        return canvas;
    }

    return { init, draw, show, W, H };
})();
