// =====================================================================
// 液晶: 突破チャレンジと おにおにRASH (段階4。ユーザー指定 2026-10-19)
// ---------------------------------------------------------------------
// 突破チャレンジ (plan.kind 'challenge'): おにおにとのバトル。保留1つが1ラウンドで、ラウンドごとにこおりくんの武器が変わる
//   (素手 → ハルキソード → ハルキハンマー → おにおに絶対殺す剣)。cintro → cround (受け止められる) / cfinal → cresult
// おにおにRASH (plan.kind 'onioni'): 真ん中でおにおにが椅子に座って眠っている。当たりのときだけ違和感
//   (そのまま開眼 / 虹色 / 画面が反転 / 白黒 / 顔のドアップ) が起きて開眼する
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
        m.holds[2].forEach((h, i) => weaponIcon(h.weapon || 'fist', W - 12 - i * 16, 134, now, false));
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

    // 画面全体にかける効果 (おにおにRASH の反転・白黒)。なければ null
    function postEffect(plan, phase) {
        if (!plan || plan.kind !== 'onioni' || !phase) return null;
        if (phase.name !== 'anomaly' && phase.name !== 'open') return null;
        if (plan.pattern === 'flip' && phase.name === 'anomaly') return 'flip';
        if (plan.pattern === 'mono' && phase.name === 'anomaly') return 'mono';
        return null;
    }

    return { init, drawChallenge, drawChallengeHolds, drawOnioniRash, postEffect, drawWeapon };
})();
