// =====================================================================
// 液晶: 突破チャレンジと おにおにRASH (段階4。ユーザー指定 2026-10-19)
// ---------------------------------------------------------------------
// 突破チャレンジ (plan.kind 'challenge'): おにおにとのバトル。保留1つが1ラウンドで、ラウンドごとにこおりくんの武器が変わる
//   (素手 → ハルキソード → ハルキハンマー → おにおに絶対殺す剣)。cintro → cround (受け止められる) / cfinal → cresult
// おにおにRASH (plan.kind 'onioni'): 真ん中でおにおにが椅子に座って眠っている。当たりのときだけ違和感
//   (そのまま開眼 / 虹色 / 画面が反転 / 白黒 / 顔のドアップ) が起きて開眼する
// ブラックアウト (plan.kind 'blackout'。RASH 中の突発当たり): dark → bokoori (虹色のこおりくん) → atari (「当たり」) → itadaki
// Lcd から kit ({ ctx, W, H, text, band, rainbow }) を受け取って描く。こおりRASH のバトルは Lcd の drawBattle を使う。
// =====================================================================

const RashView = (() => {
    let kit;
    const ONI = { w: 42, h: 46 };       // おにおにのドット絵の大きさ (characters.js)
    const EYES = [[14, 11], [23, 11]];  // おにおにの目 (左上、3x2 ドット)

    function init(k) {
        kit = k;
    }

    // ----- 武器 -----
    // (x, y) は持つ手の位置。angle は振り上げの角度 (ラジアン)
    function drawWeapon(id, x, y, angle, now) {
        const { ctx } = kit;
        if (id === 'fist') {
            // 素手: こぶしだけ
            ctx.fillStyle = '#bff0ff';
            ctx.fillRect(x - 3, y - 3, 7, 6);
            ctx.fillStyle = '#1b3a6b';
            ctx.fillRect(x - 3, y - 3, 7, 1);
            return;
        }
        ctx.save();
        ctx.translate(x, y);
        ctx.rotate(angle);
        if (id === 'sword') {
            ctx.fillStyle = '#e8eef4';
            ctx.fillRect(-1, -22, 3, 18);
            ctx.fillStyle = '#ffffff';
            ctx.fillRect(-1, -22, 1, 18);
            ctx.fillStyle = '#ffd700';
            ctx.fillRect(-4, -4, 9, 2);
            ctx.fillStyle = '#6a3a14';
            ctx.fillRect(-1, -2, 3, 5);
        } else if (id === 'hammer') {
            ctx.fillStyle = '#8a5a2a';
            ctx.fillRect(-1, -18, 3, 20);
            ctx.fillStyle = '#7a8290';
            ctx.fillRect(-7, -26, 15, 10);
            ctx.fillStyle = '#b0b8c4';
            ctx.fillRect(-7, -26, 15, 2);
        } else if (id === 'oniKiller') {
            // おにおに絶対殺す剣: 大きくて虹色に光る
            ctx.fillStyle = 'rgba(255, 255, 255, 0.35)';
            ctx.fillRect(-5, -38, 11, 34);
            ctx.fillStyle = kit.rainbow(now);
            ctx.fillRect(-2, -36, 5, 32);
            ctx.fillStyle = '#ffffff';
            ctx.fillRect(-1, -36, 1, 32);
            ctx.fillStyle = '#c0102a';
            ctx.fillRect(-6, -5, 13, 3);
            ctx.fillStyle = '#2a1a10';
            ctx.fillRect(-1, -2, 3, 6);
        }
        ctx.restore();
    }

    // 保留の武器のアイコン (小さい枠の中)
    function weaponIcon(id, x, y, now, active) {
        const { ctx } = kit;
        ctx.fillStyle = active ? 'rgba(255, 255, 255, 0.3)' : 'rgba(10, 16, 32, 0.8)';
        ctx.fillRect(x - 7, y - 7, 14, 14);
        ctx.strokeStyle = id === 'oniKiller' ? kit.rainbow(now) : '#7fd3f7';
        ctx.lineWidth = 1;
        ctx.strokeRect(x - 6.5, y - 6.5, 13, 13);
        ctx.save();
        ctx.translate(x, y + 5);
        ctx.scale(0.45, 0.45);
        ctx.translate(-x, -(y + 5));
        drawWeapon(id, x, y + 5, 0.5, now);
        ctx.restore();
    }

    // ----- おにおに (目を閉じる・虹色にする) -----
    function onioniBox(cx, ground, scale) {
        return { left: Math.round(cx - ONI.w * scale / 2), top: Math.round(ground - ONI.h * scale), scale };
    }

    function closeEyes(box) {
        const { ctx } = kit;
        EYES.forEach(([ex, ey]) => {
            const x = box.left + ex * box.scale, y = box.top + ey * box.scale;
            ctx.fillStyle = '#d83a2a';
            ctx.fillRect(x - 1, y - 1, 3 * box.scale + 2, 2 * box.scale + 2);
            ctx.fillStyle = '#1a0a0a';
            ctx.fillRect(x, y + box.scale, 3 * box.scale, Math.max(1, box.scale * 0.6));
        });
    }

    // 開いた目を光らせる
    function glowEyes(box, now) {
        const { ctx } = kit;
        EYES.forEach(([ex, ey]) => {
            const x = box.left + ex * box.scale, y = box.top + ey * box.scale;
            ctx.fillStyle = `rgba(255, 240, 80, ${0.4 + 0.3 * Math.sin(now * 20)})`;
            ctx.fillRect(x - box.scale, y - box.scale, 5 * box.scale, 4 * box.scale);
        });
    }

    let tintCanvas = null;
    // glow: 開いた目を光らせる (おにおにRASH の開眼)
    function drawOnioni(cx, ground, scale, { eyesOpen = false, glow = false, rainbow = false, now = 0, hurt = false, alpha = 1 } = {}) {
        const box = onioniBox(cx, ground, scale);
        if (rainbow) {
            // 一度べつの絵に描いてから、虹色を重ねる
            const w = Math.ceil(ONI.w * scale) + 2, h = Math.ceil(ONI.h * scale) + 2;
            if (!tintCanvas || tintCanvas.width < w || tintCanvas.height < h) {
                tintCanvas = document.createElement('canvas');
                tintCanvas.width = w;
                tintCanvas.height = h;
            }
            const g = tintCanvas.getContext('2d');
            g.clearRect(0, 0, tintCanvas.width, tintCanvas.height);
            Characters.drawEnemy(g, 'onioni', w / 2, h - 1, { scale });
            g.globalCompositeOperation = 'source-atop';
            g.globalAlpha = 0.6;
            const grad = g.createLinearGradient(0, 0, w, h);
            for (let i = 0; i < 6; i++) grad.addColorStop(i / 5, `hsl(${(now * 240 + i * 60) % 360}, 90%, 60%)`);
            g.fillStyle = grad;
            g.fillRect(0, 0, w, h);
            g.globalAlpha = 1;
            g.globalCompositeOperation = 'source-over';
            kit.ctx.drawImage(tintCanvas, Math.round(cx - w / 2), Math.round(ground - h + 1));
        } else {
            Characters.drawEnemy(kit.ctx, 'onioni', cx, ground, { scale, hurt, alpha });
        }
        if (!eyesOpen) closeEyes(box);
        else if (glow) glowEyes(box, now);
        return box;
    }

    // ----- 突破チャレンジ -----
    function hpBar(x, y, w, ratio, color) {
        const { ctx } = kit;
        ctx.fillStyle = '#000';
        ctx.fillRect(x, y, w, 5);
        ctx.fillStyle = color;
        ctx.fillRect(x + 1, y + 1, Math.round((w - 2) * Math.max(0, ratio)), 3);
    }

    function drawChallenge(now, plan, phase, m, spinView) {
        const { ctx, W, text, band, rainbow } = kit;
        const weapons = CONFIG.show.challengeBattle.weapons;
        const frame = Math.floor(now * 4) % 2;
        const ground = 128;
        const round = plan.round;
        const n = phase.name;
        const local = phase.local;
        let kx = 46, ox = 196, kooriHurt = false, oniHurt = false, oniAlpha = 1, kooriDown = false;
        let swing = -0.6;   // 武器の角度
        let oniHp = 1 - round * 0.15, kooriHp = 1 - round * 0.1;
        let clash = false;

        if (n === 'cintro') {
            ox = 196 + Math.max(0, 1 - local / 1.2) * 90;
        } else if (n === 'cround') {
            // 斬りかかる → おにおにが受け止める → 反撃
            const dash = Math.sin(Math.min(1, local / 1.4) * Math.PI);
            kx += dash * 100;
            swing = local < 0.9 ? -1.4 : 0.8;
            clash = local > 0.6 && local < 1.2;
            if (local > 1.8 && local < 2.8) {
                ox -= Math.sin((local - 1.8) * Math.PI) * 80;
                kooriHurt = local > 2.2 && local < 2.6;
            }
        } else if (n === 'cfinal') {
            // ためて (PUSH) → 最後の一撃
            const pushStart = phase.t - CONFIG.show.pushTime;
            if (local < pushStart) {
                kx = 46 + Math.sin(local * 30) * (local / pushStart) * 2;
                swing = -1.6;
            } else {
                swing = -2;
            }
        } else if (n === 'cresult') {
            const k = Math.min(1, local / 0.8);
            if (plan.win) {
                kx = 46 + Math.sin(Math.min(1, k * 1.4) * Math.PI) * 120;
                swing = k < 0.4 ? -2 : 1.2;
                oniHurt = k < 1 && Math.floor(now * 12) % 2 === 0;
                oniAlpha = local < 0.8 ? 1 : Math.max(0, 1 - (local - 0.8) * 1.5);
                oniHp = Math.max(0, 0.3 * (1 - k));
            } else {
                ox = 196 - Math.sin(Math.min(1, k * 1.4) * Math.PI) * 110;
                kooriHurt = k < 1;
                kooriDown = k >= 0.5;
                kooriHp = 0.4 * (1 - k);
            }
        }

        if (oniAlpha > 0) drawOnioni(ox, ground, 1.7, { eyesOpen: true, now, hurt: oniHurt, alpha: oniAlpha });
        if (kooriDown) {
            ctx.save();
            ctx.translate(kx + 16, ground - 8);
            ctx.rotate(Math.PI / 2);
            drawSprite(ctx, SPRITES.koori, 'down', -16, -16, 2);
            ctx.restore();
        } else {
            drawSprite(ctx, SPRITES.koori, kooriHurt ? 'down' : frame ? 'walk1' : 'walk2', kx, ground - 32, 2);
            drawWeapon(plan.weapon, kx + 30, ground - 16, swing, now);
        }
        if (clash) {
            ctx.fillStyle = '#ffffff';
            ctx.fillRect(kx + 34, ground - 46, 10, 10);
            text('ガキン！', kx + 40, ground - 58, 12, '#ffe066');
        }

        // 題名・体力・武器の名前
        band(30, 20, 0.5);
        text('突破チャレンジ  VS おにおに', W / 2 + 34, 40, 11, '#ff6a6a');
        hpBar(90, 54, 70, kooriHp, '#7fd3f7');
        hpBar(176, 54, 70, oniHp, '#ff6a8a');
        const weaponName = weapons[plan.weapon].name;
        if ((n === 'cround' && local < 1) || (n === 'cfinal' && local < 1.6)) {
            band(64, 22, 0.55);
            text(weaponName + '！', W / 2, 75, plan.weapon === 'oniKiller' ? 13 : 16, plan.weapon === 'oniKiller' ? 'rainbow' : '#ffffff', 'center', now);
        }
        if (n === 'cextra') {
            band(60, 30, 0.6);
            text('もうひとつおまけに！', W / 2, 77, 18, local < 0.3 ? '#ffffff' : 'rainbow', 'center', now);
        }
        if (n === 'cintro' && local > 1) {
            band(64, 22, 0.55);
            text(`保留 ${m.challengeRun ? m.challengeRun.count : ''}個で勝負！`, W / 2, 75, 16, '#ffe066');
        }
        if (n === 'cfinal' && phase.pushing) {
            if (spinView.pushedAt === null) {
                band(66, 26, 0.5);
                text('PUSH！', W / 2, 79, 22, Math.floor(now * 8) % 2 ? '#ffe066' : '#ff3a3a');
            } else {
                ctx.fillStyle = `rgba(255, 255, 255, ${Math.max(0, 0.8 - (now - spinView.pushedAt) * 2)})`;
                ctx.fillRect(0, 0, W, kit.H);
            }
        }
        if (n === 'cresult' && local >= 0.4) {
            band(66, 26, 0.55);
            text(plan.win ? '突破！！' : '突破ならず…', W / 2, 79, 22, plan.win ? 'rainbow' : '#8aa4c0', 'center', now);
        }
        void rainbow;
    }

    // 突破チャレンジ中の保留: 武器のアイコンで出す (右下)
    function drawChallengeHolds(now, m) {
        const { W } = kit;
        m.holds[2].filter(h => !h.extra).forEach((h, i) => weaponIcon(h.weapon || 'fist', W - 12 - i * 16, 134, now, false));   // おまけの保留は出さない
        if (m.spin && m.spin.plan.kind === 'challenge') weaponIcon(m.spin.plan.weapon, W / 2, 134, now, true);
    }

    // ----- おにおにRASH -----
    function drawThrone(cx, ground) {
        const { ctx } = kit;
        ctx.fillStyle = '#4a0a14';
        ctx.fillRect(cx - 40, ground - 92, 80, 92);
        ctx.fillStyle = '#7a1a24';
        ctx.fillRect(cx - 34, ground - 86, 68, 70);
        ctx.fillStyle = '#d0a040';
        ctx.fillRect(cx - 40, ground - 92, 80, 4);
        ctx.fillRect(cx - 44, ground - 30, 10, 30);
        ctx.fillRect(cx + 34, ground - 30, 10, 30);
        ctx.fillStyle = '#ffd700';
        ctx.fillRect(cx - 6, ground - 100, 12, 8);
    }

    function drawOnioniRash(now, plan, phase) {
        const { ctx, W, H, text, band } = kit;
        const cx = W / 2, ground = 124;
        const n = phase.name;
        const local = phase.local;
        const pattern = plan.pattern;
        const open = n === 'open';
        drawThrone(cx, ground);

        if (pattern === 'zoom' && (n === 'anomaly' || open)) {
            // 顔のドアップ: 顔のまわりだけを大きく
            const scale = 6 + (n === 'anomaly' ? Math.min(1, local / 0.6) * 2 : 2);
            const faceY = 12;   // ドット絵の顔の真ん中の高さ
            const ground2 = H / 2 + (ONI.h - faceY) * scale;
            drawOnioni(cx, ground2, scale, { eyesOpen: open, glow: open, now });
        } else {
            drawOnioni(cx, ground - 4, 1.8, { eyesOpen: open, glow: open, rainbow: pattern === 'rainbow' && (n === 'anomaly' || open), now });
        }

        const anomaly = n === 'anomaly';
        if (pattern === 'koori' && (anomaly || open)) {
            // こおりくんが現れる: 横から歩いてきて、おにおにを見上げる
            const kx = anomaly ? Math.min(40, -30 + local * 70) : 40;
            drawSprite(ctx, SPRITES.koori, Math.floor(now * 5) % 2 ? 'walk1' : 'walk2', kx, ground - 34, 2);
            if (anomaly && local > 1.2) text('？', kx + 34, ground - 44, 14, '#ffe066');
        }
        if ((pattern === 'tomoishi' || pattern === 'naitei') && anomaly && local > 0.3) {
            // カットイン: 斜めの帯にキャラクターとセリフ
            const k = Math.min(1, (local - 0.3) / 0.25);
            ctx.save();
            ctx.fillStyle = pattern === 'tomoishi' ? 'rgba(120, 60, 160, 0.92)' : 'rgba(120, 20, 20, 0.92)';
            ctx.beginPath();
            ctx.moveTo(W * (1 - k), 34);
            ctx.lineTo(W * (1 - k) + W, 22);
            ctx.lineTo(W * (1 - k) + W, 96);
            ctx.lineTo(W * (1 - k), 108);
            ctx.closePath();
            ctx.fill();
            const ox = W * (1 - k);
            if (pattern === 'tomoishi') {
                drawSprite(ctx, SPRITES.tomoishi, Math.floor(now * 4) % 2 ? 'shout' : 'idle', ox + 14, 40, 3.4);
                text('内定とりなさい！', ox + 162, 64, 17, '#ffe066');
            } else {
                Characters.drawEnemy(ctx, 'naitei', ox + 46, 106, { scale: 1.45 });
                text('内定は…！', ox + 168, 64, 20, '#ffffff');
            }
            ctx.restore();
        }

        if (!open) {
            // 眠っている: Zzz
            const z = (now * 0.7) % 1;
            text('Z', cx + 30 + z * 10, 50 - z * 20, 8 + Math.round(z * 6), `rgba(255,255,255,${1 - z})`);
        }
        if (open) {
            if (local < 0.3) {
                ctx.fillStyle = `rgba(255, 255, 255, ${0.9 - local * 3})`;
                ctx.fillRect(0, 0, W, H);
            }
            band(96, 24, 0.55);
            text('開眼！！', W / 2, 108, 20, 'rainbow', 'center', now);
        }
        void band;
    }

    // ----- ブラックアウト -----
    let kooriTint = null;
    function rainbowKoori(cx, footY, scale, now) {
        const rows = SPRITES.koori.frames.walk1;
        const w = Math.ceil(rows[0].length * scale), h = Math.ceil(rows.length * scale);
        if (!kooriTint || kooriTint.width !== w || kooriTint.height !== h) {
            kooriTint = document.createElement('canvas');
            kooriTint.width = w;
            kooriTint.height = h;
        }
        const g = kooriTint.getContext('2d');
        g.clearRect(0, 0, w, h);
        g.imageSmoothingEnabled = false;
        drawSprite(g, SPRITES.koori, Math.floor(now * 4) % 2 ? 'walk1' : 'walk2', 0, 0, scale);
        g.globalCompositeOperation = 'source-atop';
        g.globalAlpha = 0.55;
        const grad = g.createLinearGradient(0, 0, w, h);
        for (let i = 0; i < 6; i++) grad.addColorStop(i / 5, `hsl(${(now * 300 + i * 60) % 360}, 95%, 60%)`);
        g.fillStyle = grad;
        g.fillRect(0, 0, w, h);
        g.globalAlpha = 1;
        g.globalCompositeOperation = 'source-over';
        kit.ctx.drawImage(kooriTint, Math.round(cx - w / 2), Math.round(footY - h));
    }

    function drawBlackout(now, plan, phase) {
        const { ctx, W, H, text } = kit;
        const n = phase.name;
        const local = phase.local;
        // 暗転 (最初の 0.3 秒で暗くなる)
        ctx.fillStyle = n === 'dark' ? `rgba(0, 0, 0, ${Math.min(1, local / 0.3)})` : '#000000';
        ctx.fillRect(0, 0, W, H);
        if (n === 'dark') return;
        // 虹色のこおりくん (下からせり上がる)
        const rise = n === 'bokoori' ? Math.min(1, local / 0.8) : 1;
        const footY = (n === 'bokoori' ? 160 - rise * 60 : 100) + Math.sin(now * 3) * 2;
        ctx.fillStyle = `rgba(255, 255, 255, ${0.15 + 0.1 * Math.sin(now * 8)})`;
        ctx.beginPath();
        ctx.arc(W / 2, footY - 24, 36, 0, Math.PI * 2);
        ctx.fill();
        rainbowKoori(W / 2, footY, 3, now);
        if (n === 'atari' || n === 'itadaki') {
            // 「当たり」: 虹色の文字が1文字ずつ
            const chars = ['当', 'た', 'り'];
            const shown = n === 'itadaki' ? 3 : Math.min(3, Math.floor(local / 0.35) + 1);
            for (let i = 0; i < shown; i++) text(chars[i], W / 2 - 40 + i * 40, 30, 28, 'rainbow', 'center', now + i * 0.2);
        }
        if (n === 'itadaki') {
            // 虹色にフラッシュ
            const flash = Math.max(0, 0.75 - local * 0.9);
            ctx.fillStyle = `hsla(${(now * 600) % 360}, 95%, 70%, ${flash})`;
            ctx.fillRect(0, 0, W, H);
            kit.band(112, 24, 0.6);
            text('こおりがいただいた！', W / 2, 124, 16, 'rainbow', 'center', now);
        }
    }

    // ----- 復活 (こおりRASH のバトルに負けたあと。ユーザー指定 2026-10-19) -----
    // 暗転 →「内定がないと」→「こおり生きていけない…」→「それでも、まだ、あきらめたくない」
    // → 大きい「それでも」がだんだん虹色に → 虹色のこおりくんと「こおり生きていける！」で虹色のフラッシュ (このあと rvkill で撃破)
    function drawRevival(now, plan, phase) {
        const { ctx, W, H, text } = kit;
        const n = phase.name;
        const local = phase.local;
        const fadeIn = Math.min(1, local / 0.5);
        ctx.fillStyle = n === 'rvdark' ? `rgba(0, 0, 0, ${Math.min(1, local / 0.4)})` : '#000000';
        ctx.fillRect(0, 0, W, H);
        const white = a => `rgba(255, 255, 255, ${a})`;
        if (n === 'rvnaitei') text('内定がないと', W / 2, 70, 18, white(fadeIn));
        if (n === 'rvcant') {
            text('内定がないと', W / 2, 52, 14, white(0.45));
            const dots = '.....'.slice(0, Math.min(5, Math.floor(local / 0.25)));
            text(`こおり生きていけない${dots}`, W / 2, 84, 16, `rgba(255, 106, 106, ${fadeIn})`);
        }
        if (n === 'rvstill') {
            // 文字が変わる: 前の文字が消えて、新しい文字が出る
            const k = Math.min(1, local / 0.6);
            if (k < 1) text('こおり生きていけない.....', W / 2, 84, 16, `rgba(255, 106, 106, ${1 - k})`);
            text('それでも、まだ、', W / 2, 60, 16, white(k));
            text('あきらめたくない', W / 2, 88, 20, white(Math.max(0, (local - 0.6) / 0.6)));
        }
        if (n === 'rvsoredemo') {
            // 大きい「それでも」。だんだん虹色になる
            const grow = Math.min(1, local / 0.4);
            const size = Math.round(24 + grow * 14);
            const rainbowness = Math.min(1, Math.max(0, (local - 0.5) / (phase.t - 0.8)));
            ctx.save();
            ctx.globalAlpha = 1 - rainbowness;
            text('それでも', W / 2, 82, size, '#ffffff');
            ctx.globalAlpha = rainbowness;
            text('それでも', W / 2, 82, size, 'rainbow', 'center', now);
            ctx.restore();
        }
        if (n === 'rvflash') {
            // 虹色のこおりくん + 「こおり生きていける！」で虹色のフラッシュ
            ctx.fillStyle = `rgba(255, 255, 255, ${0.15 + 0.1 * Math.sin(now * 8)})`;
            ctx.beginPath();
            ctx.arc(W / 2, 70, 36, 0, Math.PI * 2);
            ctx.fill();
            rainbowKoori(W / 2, 96 + Math.sin(now * 3) * 2, 3, now);
            const flash = Math.max(0, 0.85 - local * 0.8);
            ctx.fillStyle = `hsla(${(now * 600) % 360}, 95%, 70%, ${flash})`;
            ctx.fillRect(0, 0, W, H);
            kit.band(112, 24, 0.6);
            text('こおり生きていける！', W / 2, 124, 16, 'rainbow', 'center', now);
        }
    }

    // ----- 〇G連確定 (RASH 中の大当たりのラウンド中。残り保留に当たりがあるとき) -----
    // 暗転 → こおりRASH ならこおりくん、おにおにRASH ならおにおにが虹色に光る →「〇G連確定！」
    function drawRenchan(now, t, games, mode) {
        const { ctx, W, H, text } = kit;
        ctx.fillStyle = `rgba(0, 0, 0, ${Math.min(1, t / 0.3)})`;
        ctx.fillRect(0, 0, W, H);
        if (t < 0.6) return;
        const glow = 0.2 + 0.1 * Math.sin(now * 10);
        ctx.fillStyle = `hsla(${(now * 300) % 360}, 90%, 60%, ${glow})`;
        ctx.beginPath();
        ctx.arc(W / 2, 74, 46, 0, Math.PI * 2);
        ctx.fill();
        if (mode === 'onioni') drawOnioni(W / 2, 112, 1.6, { eyesOpen: true, glow: true, rainbow: true, now });
        else rainbowKoori(W / 2, 108, 3.4, now);
        if (t > 1.1) {
            kit.band(116, 26, 0.6);
            text(`${games}G連確定！`, W / 2, 129, 20, 'rainbow', 'center', now);
        }
        if (t > 1.1 && t < 1.4) {
            ctx.fillStyle = `rgba(255, 255, 255, ${(1.4 - t) * 3})`;
            ctx.fillRect(0, 0, W, H);
        }
    }

    // 画面全体にかける効果 (おにおにRASH の反転・白黒)。なければ null
    function postEffect(plan, phase) {
        if (!plan || plan.kind !== 'onioni' || !phase) return null;
        if (phase.name !== 'anomaly' && phase.name !== 'open') return null;
        if (plan.pattern === 'flip' && phase.name === 'anomaly') return 'flip';
        if (plan.pattern === 'upsideDown' && phase.name === 'anomaly') return 'upsideDown';
        if (plan.pattern === 'mono' && phase.name === 'anomaly') return 'mono';
        return null;
    }

    return { init, drawChallenge, drawChallengeHolds, drawOnioniRash, drawBlackout, drawRevival, drawRenchan, postEffect, drawWeapon };
})();
