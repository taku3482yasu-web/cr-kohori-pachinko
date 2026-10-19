// =====================================================================
// 液晶 (256x144 のドット絵の画面)
// ---------------------------------------------------------------------
// 段階2では、台の状態がわかるだけの仮の画面:
//   特図の数字3つ (左 → 右 → 中の順に止まる。左右がそろうとリーチ)、保留の玉、
//   大当たりのラウンドとカウント、小当たり (V を狙え)、時短の残り回数、右打ち・左打ちの案内
// 図柄のドット絵・リーチ演出・RUSH の演出は段階3以降で作り直す。
// Lcd.event(e) で台 (Machine) のイベントを受け取り、Lcd.draw(now, machine) で描く。
// =====================================================================

const Lcd = (() => {
    const W = 256;
    const H = 144;
    const FONT = '"DotGothic16", "MS Gothic", "Osaka-Mono", monospace';
    let canvas, ctx;
    let flash = null;       // 画面の真ん中に一瞬出す文字 { text, color, until, length }
    let reels = null;       // 変動中の数字 { start, duration, final: [左, 中, 右], reach }
    let shown = [7, 1, 3];  // 止まっている数字
    let aimNotice = null;   // { aim, until }
    let summary = null;     // RUSH が終わったときの結果 { hits, balls, until }

    function init() {
        canvas = document.createElement('canvas');
        canvas.width = W;
        canvas.height = H;
        ctx = canvas.getContext('2d');
        return canvas;
    }

    function reset() {
        flash = null;
        reels = null;
        summary = null;
        aimNotice = null;
    }

    function show(text, color, now, seconds = 1.2) {
        flash = { text, color, until: now + seconds, length: seconds };
    }

    const rand9 = () => 1 + Math.floor(Math.random() * 9);

    // 止まる数字: 大当たりはそろい目 (10R は 7)、外れはそろわない (リーチなら左右だけそろう)
    function finalDigits(result, reach) {
        if (result.kind === 'hit') {
            const n = result.alloc.rounds >= 10 ? 7 : [1, 2, 3, 4, 5, 6, 8, 9][Math.floor(Math.random() * 8)];
            return [n, n, n];
        }
        const l = rand9();
        const r = reach ? l : rand9();
        let c = rand9();
        while (c === l && c === r) c = rand9();
        return [l, c, r];
    }

    function event(e, now) {
        if (e.type === 'spinStart') {
            const reach = e.result.kind === 'hit' || (e.fig === 1 && e.duration >= CONFIG.machine.spin.fig1.reach);
            reels = { start: now, duration: e.duration, final: e.result.kind === 'small' ? [0, 0, 0] : finalDigits(e.result, reach), reach, small: e.result.kind === 'small' };
        } else if (e.type === 'spinEnd') {
            if (reels && !reels.small) shown = reels.final;
            reels = null;
        } else if (e.type === 'bonusStart') {
            const size = e.rounds * CONFIG.machine.bonus.count * CONFIG.payout.attacker;
            show(e.fromV ? `V入賞！ ${size}個` : `大当たり！ ${size}個`, '#ffe066', now, CONFIG.machine.bonus.opening);
        } else if (e.type === 'smallStart') {
            show('V を狙え！', '#ff6a8a', now, CONFIG.machine.small.open);
        } else if (e.type === 'jitanStart') {
            show(e.rushHits === 1 ? 'RUSH 突入！' : `RUSH ${e.rushHits}連！`, '#7fd3f7', now, 2);
        } else if (e.type === 'ending' && e.next === 'normal') {
            show('通常時へ', '#ffffff', now, CONFIG.machine.bonus.ending);
        } else if (e.type === 'rushEnd') {
            summary = { hits: e.hits, balls: e.balls, until: now + 5 };
        }
    }

    function aim(direction, now) {
        aimNotice = { aim: direction, until: now + (direction === 'left' ? 4 : 2.5) };
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

    // 数字1つ (枠つき)。digit 0 は V
    function drawDigit(x, y, digit, color, rolling) {
        ctx.fillStyle = 'rgba(0, 0, 0, 0.55)';
        ctx.fillRect(x - 22, y - 26, 44, 52);
        ctx.strokeStyle = rolling ? '#5a7aa0' : color;
        ctx.lineWidth = 2;
        ctx.strokeRect(x - 22, y - 26, 44, 52);
        text(digit === 0 ? 'V' : String(digit), x, y + 2, 40, color);
    }

    function drawReels(now, m) {
        const y = 66;
        const xs = [64, 128, 192];
        if (!reels) {
            xs.forEach((x, i) => drawDigit(x, y, shown[i], '#ffffff', false));
            return;
        }
        const t = (now - reels.start) / reels.duration;
        // 止まる順番: 左 (40%) → 右 (60%) → 中 (最後)
        const stops = [0.4, 1, 0.6];
        xs.forEach((x, i) => {
            const stopped = t >= stops[i];
            const digit = stopped ? reels.final[i] : 1 + Math.floor((now * 14 + i * 3) % 9);
            const color = reels.small ? '#ff6a8a' : reels.reach && stopped && i !== 1 ? '#ffe066' : '#ffffff';
            drawDigit(x, y, digit, color, !stopped);
        });
        if (reels.reach && t >= 0.6 && t < 1) {
            const blink = Math.floor(now * 4) % 2;
            text('リーチ！', W / 2, 18, 16, blink ? '#ff6a8a' : '#ffe066');
        }
    }

    // 保留の玉 (特図1 は左下、特図2 は右下)
    function drawHolds(m) {
        const dot = (x, y, color) => {
            ctx.fillStyle = color;
            ctx.beginPath();
            ctx.arc(x, y, 4, 0, Math.PI * 2);
            ctx.fill();
        };
        for (let i = 0; i < CONFIG.machine.holdMax; i++) {
            dot(12 + i * 11, 134, i < m.holds[1].length ? '#ffffff' : 'rgba(255,255,255,0.15)');
            dot(W - 12 - i * 11, 134, i < m.holds[2].length ? '#ff9ec0' : 'rgba(255,158,192,0.15)');
        }
        text('特図1', 12, 122, 9, '#cfe6ff', 'left');
        text('特図2', W - 12, 122, 9, '#ffd0e0', 'right');
    }

    function drawBonus(now, m) {
        const b = m.bonus;
        const size = b.alloc.rounds * CONFIG.machine.bonus.count * CONFIG.payout.attacker;
        ctx.fillStyle = 'rgba(0, 0, 0, 0.5)';
        ctx.fillRect(0, 0, W, H);
        text(`${size}個 大当たり`, W / 2, 24, 18, '#ffe066');
        text(`ROUND ${Math.max(1, b.round)} / ${b.alloc.rounds}`, W / 2, 62, 22, '#ffffff');
        if (b.phase === 'open') text(`COUNT ${b.count} / ${CONFIG.machine.bonus.count}`, W / 2, 90, 14, '#7fd3f7');
        text('右打ち →', W / 2, 116, 14, Math.floor(now * 3) % 2 ? '#ff6a8a' : '#ffffff');
    }

    function draw(now, m) {
        ctx.imageSmoothingEnabled = false;
        const rushing = m && (Machine.inJitan(m) || m.rush.active);
        const map = m && m.bonus ? 'goldHall' : rushing ? 'seCastle' : 'tsugakuro';
        Backgrounds.draw(ctx, map, now * (rushing ? 40 : 18));
        const frame = Math.floor(now * 4) % 2 ? 'walk1' : 'walk2';
        drawSprite(ctx, SPRITES.koori, frame, 4, 92, 1.5);
        if (!m) return canvas;

        if (m.bonus) drawBonus(now, m);
        else {
            drawReels(now, m);
            if (Machine.inJitan(m)) {
                const left = m.jitanLeft + (m.spin && m.spin.jitan ? 1 : 0);
                text(`RUSH ${m.rush.hits}連  時短 残り ${left}回`, W / 2, 108, 12, '#7fd3f7');
            } else if (m.rush.active) text('残り保留で V を狙え', W / 2, 108, 12, '#7fd3f7');
        }
        drawHolds(m);

        if (aimNotice && now < aimNotice.until && !m.bonus) {
            const blink = Math.floor(now * 3) % 2;
            if (aimNotice.aim === 'right') text('右打ち →', W - 40, 14, 13, blink ? '#ff6a8a' : '#ffffff');
            else text('← 左打ちに戻してください', W / 2, 14, 11, blink ? '#ffe066' : '#ffffff');
        }
        if (summary && now < summary.until) {
            ctx.fillStyle = 'rgba(0, 0, 0, 0.7)';
            ctx.fillRect(28, 34, W - 56, 64);
            text('RUSH 終了', W / 2, 50, 14, '#ffffff');
            text(`${summary.hits}連  ${summary.balls >= 0 ? '+' : ''}${summary.balls}玉`, W / 2, 76, 18, '#ffe066');
        }
        if (flash && now < flash.until) {
            const t = 1 - (flash.until - now) / flash.length;
            ctx.fillStyle = 'rgba(0, 0, 0, 0.45)';
            ctx.fillRect(0, 44, W, 44);
            text(flash.text, W / 2, 66, 20 + Math.round(Math.sin(Math.min(1, t * 4) * Math.PI / 2) * 4), flash.color);
        }
        return canvas;
    }

    return { init, reset, draw, event, aim, show, W, H };
})();
