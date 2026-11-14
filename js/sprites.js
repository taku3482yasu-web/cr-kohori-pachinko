// =====================================================================
// ドット絵データ (キャラクター)
// ---------------------------------------------------------------------
// キャラクターは「1文字 = 1ドット」の文字列で描き、パレットで色を割り当てる。
// '.' は透明。
// =====================================================================

const SPRITES = {
    // こおりくん (16x16): 氷のキューブの体
    koori: {
        palette: {
            o: '#1b3a6b',  // 輪郭
            w: '#ffffff',  // ハイライト
            c: '#bff0ff',  // 氷 (明)
            b: '#7fd3f7',  // 氷 (影)
            d: '#4aa8e0',  // 足
            k: '#10162a',  // 目・口
            p: '#ff9eb5'   // ほっぺ
        },
        frames: (() => {
            // 体 (両フレーム共通) + 足 (歩きの2コマ)
            const body = [
                '................',
                '.oooooooooooooo.',
                '.owwwcccccccbbo.',
                '.owwccccccccbbo.',
                '.owcccccccccbbo.',
                '.occckcccckccbo.',
                '.occckcccckccbo.',
                '.ocpcccccccpcbo.',
                '.occccckkccccbo.',
                '.occcccccccccbo.',
                '.obcccccccccbbo.',
                '.obbbbbbbbbbbdo.',
                '.oooooooooooooo.'
            ];
            // 負けたとき: 目が × になる
            const down = [...body];
            down[4] = '.owckckcckckbbo.';
            down[5] = '.occckcccckccbo.';
            down[6] = '.occkckcckckcbo.';
            return {
                down: [...down, '...odo....odo...', '...ooo....ooo...', '................'],
                walk1: [...body, '...odo....odo...', '...ooo....ooo...', '................'],
                walk2: [...body, '....odo..odo....', '....ooo..ooo....', '................']
            };
        })()
    },

    // ともいし (16x18): こおりくんのお母さん。パーマ頭の石に黄色いエプロン。idle と shout (口を開けて叫ぶ) の2コマ
    tomoishi: {
        step: { rows: 2 },   // 足ぶみ (下の 2 行が 足。2026-11-14。drawSprite が 左右の 足を 交互に 持ち上げる)
        palette: {
            o: '#2a2a30',  // 輪郭
            h: '#7a4ab0',  // パーマの髪
            H: '#a87ad8',  // 髪のつや
            G: '#d0d0da',  // 石 (明)
            g: '#a0a0ac',  // 石
            d: '#70707c',  // 石 (影)
            k: '#10162a',  // 目
            p: '#ff9eb5',  // ほっぺ
            m: '#c03048',  // 口
            a: '#ffe08a',  // エプロン
            A: '#d8a840',  // エプロンの影
            f: '#4a4a54'   // 足
        },
        frames: (() => {
            const top = [
                '...hHhhHhhHh....',
                '..hhhhhhhhhhhh..',
                '.hHhhhHhhhhHhhh.',
                '.hoooooooooooohh',
                '.oGGGgggggggggo.',
                'oGGgggggggggggdo',
                'oGgggkgggggkggdo',
                'oggggkgggggkggdo',
                'ogpgggggggggpgdo'
            ];
            // エプロン (肩ひもつき)
            const apron = [
                'oggaggggggggaddo',
                'oggaaaaaaaaaaddo',
                'odgaaaappaaaAddo',
                '.oddAAAAAAAAddo.',
                '..oooooooooooo..',
                '...ofo....ofo...',
                '...ooo....ooo...'
            ];
            return {
                idle: [...top, 'oggggggmmgggggdo', 'oggggggggggggddo', ...apron],
                // 口を縦に開けて叫ぶ
                shout: [...top, 'oggggmmmmmggggdo', 'oggggmmkmmgggddo', ...apron]
            };
        })()
    },

    // ふるカワ (16x20): リボンのボブヘアの女の子。idle と talk (口が開く) の2コマ
    furukawa: {
        step: { rows: 3 },   // 足ぶみ (下の 3 行が 足。2026-11-14)
        palette: {
            o: '#2a1a1a',  // 輪郭
            h: '#7a4a2a',  // 髪
            H: '#b07a48',  // 髪のつや
            r: '#ff4f8b',  // リボン
            s: '#ffe2cc',  // 肌
            e: '#2a1830',  // 目
            w: '#ffffff',  // 目のハイライト
            p: '#ff9eb5',  // ほっぺ
            k: '#a03048',  // 口
            d: '#ff8ab8',  // 服
            D: '#e0609a',  // 服の影
            f: '#6a3a2a'   // くつ
        },
        frames: (() => {
            const head = [
                '....oooooooo....',
                '...ohhhhhhhhorr.',
                '..ohhHHhhhhhhorr',
                '..ohhhhhhhhhhho.',
                '.ohhhsssssshhhho',
                '.ohhsssssssshho.',
                '.ohssewssewssho.',
                '.ohsseessseesho.',
                '.ohspsssssspsho.'
            ];
            const body = [
                '..ohhsssssshhho.',
                '...oooddddooo...',
                '...odDddddDdo...',
                '..osdddrrdddso..',
                '..osddddddddso..',
                '...oDddddddDo...',
                '...oDDDDDDDDo...',
                '....oso..oso....',
                '....off..off....',
                '....ooo..ooo....'
            ];
            const mouth = '.ohhssskkssshho.';
            return {
                idle: [...head, mouth, ...body],
                // 口を縦に開ける (あごの行にも口を描く)
                talk: [...head, mouth, '..ohhsskksshhho.', ...body.slice(1)]
            };
        })()
    }
};

// 文字列のドット絵を ctx に描く。scale 倍、flip で左右反転
// 2026-11-14 (ユーザー指定: シリーズの ドット絵を 緻密に): js/pixel-hd.js で 4 倍の 細かさに 作り直した 絵を のせる
const SPRITE_HD = new WeakMap();
// 足ぶみ (koori から 写した。2026-11-14 ユーザー指定: ずっと 立った まま 動かない → ドット絵 そのものを 動かす):
// sprite.step が ある キャラは、足の 行の 左半分 か 右半分を 1 ドット 持ち上げた コマを 作り、時間で 交互に 出す
// (止まる → 左足 → 止まる → 右足)。絵は 足さず、もとの 足の ドットを 動かす
function steppedRows(sprite, frameName, side) {
    const cache = sprite._steps || (sprite._steps = {});
    const key = frameName + ':' + side;
    if (cache[key]) return cache[key];
    const rows = sprite.frames[frameName].map(row => row.split(''));
    const n = sprite.step.rows, width = rows[0].length, half = width / 2;
    for (let i = rows.length - n; i < rows.length; i++) {
        for (let c = side === 'L' ? 0 : half; c < (side === 'L' ? half : width); c++) {
            const px = rows[i][c];
            if (px !== '.') rows[i - 1][c] = px;
            else if (i - 1 >= rows.length - n) rows[i - 1][c] = '.';
            rows[i][c] = '.';
        }
    }
    return (cache[key] = rows.map(row => row.join('')));
}

function drawSprite(ctx, sprite, frameName, x, y, scale = 1, flip = false) {
    let rows = sprite.frames[frameName];
    if (sprite.step && typeof performance !== 'undefined') {
        const phase = Math.floor(performance.now() / 240) % 4;
        if (phase === 1) rows = steppedRows(sprite, frameName, 'L');
        else if (phase === 3) rows = steppedRows(sprite, frameName, 'R');
    }
    if (typeof PixelHD !== 'undefined' && typeof document !== 'undefined') {
        let baked = SPRITE_HD.get(rows);
        if (!baked) { baked = PixelHD.bake(PixelHD.fromRows(rows, sprite.palette)); SPRITE_HD.set(rows, baked); }
        PixelHD.draw(ctx, baked, x, y, scale, flip);
        return;
    }
    const width = rows[0].length;
    rows.forEach((row, ry) => {
        for (let rx = 0; rx < row.length; rx++) {
            const color = sprite.palette[row[rx]];
            if (!color) continue;
            const px = flip ? width - 1 - rx : rx;
            // 端を丸めて隣のドットと隙間なくつなげる (拡大率が整数でなくても格子が出ない)
            const x0 = Math.round(x + px * scale), x1 = Math.round(x + (px + 1) * scale);
            const y0 = Math.round(y + ry * scale), y1 = Math.round(y + (ry + 1) * scale);
            ctx.fillStyle = color;
            ctx.fillRect(x0, y0, x1 - x0, y1 - y0);
        }
    });
}
