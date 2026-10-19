// =====================================================================
// 液晶 (256x144 のドット絵の画面)
// ---------------------------------------------------------------------
// 変動の流れは Scenario が決めた plan.phases どおりに描く (台の m.spin.elapsed に合わせる):
//   roll      図柄が回る (外れはここで 左 → 右 → 中 の順に止まる)
//   challenge チャレンジ (宝探し・特訓・お弁当作り)。最後に成功・失敗がわかる。図柄は上に小さく回る
//   fail      チャレンジ失敗。図柄がばらばらに止まる
//   reach     チャレンジ成功 → 左右がそろってリーチ。バトルの相手が出てくる
//   battle    バトル。最後に「PUSH!」(台のボタン)
//   result    撃破なら図柄がそろう (大当たり)、負けなら中の図柄がずれて止まる
// 保留 (こおりくんの体の形。色つき)・ふるカワの吹き出し・大当たり・RUSH の表示もここ。
// Lcd.event(e) で台 (Machine) のイベントを受け取り、Lcd.draw(now, machine) で描く。
// =====================================================================

const Lcd = (() => {
    const W = 256;
    const H = 144;
    const FONT = '"DotGothic16", "MS Gothic", "Osaka-Mono", monospace';
    const BIG = { w: 56, h: 64, y: 66, xs: [52, 128, 204] };
    const SMALL = { w: 22, h: 26, y: 17, xs: [14, 38, 62] };
    let canvas, ctx;
    let flash = null;       // 画面の真ん中に一瞬出す文字 { text, color, until, length }
    let shown = [7, 1, 3];  // 止まっている図柄
    let aimNotice = null;   // { aim, until }
    let summary = null;     // RUSH が終わったときの結果 { hits, balls, until }
    let bubble = null;      // ふるカワの吹き出し { text, color, until }
    let spinView = null;    // いまの変動の見た目の情報 { plan, gaugeStop, pushedAt }
    let lastPhase = null;   // 効果音を鳴らすための、前のフレームの場面

    function init() {
        canvas = document.createElement('canvas');
        canvas.width = W;
        canvas.height = H;
        ctx = canvas.getContext('2d');
        return canvas;
    }

    function reset() {
        flash = summary = aimNotice = bubble = spinView = null;
    }

    function show(text, color, now, seconds = 1.2) {
        flash = { text, color, until: now + seconds, length: seconds };
    }

    function say(text, color, now) {
        bubble = { text, color, until: now + CONFIG.show.furukawa.talkTime };
    }

    // ----- 台のイベント -----
    function event(e, now) {
        if (e.type === 'hold') {
            Sound.play('hold');
            if (e.result.button) MachineButton.trigger(e.result.button, now);
        } else if (e.type === 'spinStart') {
            spinView = { plan: e.plan, gaugeStop: 0.55 + Math.random() * 0.35, pushedAt: null };
            if (e.plan.talk) say(e.plan.talk.text, e.plan.talk.color, now);
        } else if (e.type === 'spinEnd') {
            if (spinView) shown = spinView.plan.digits;
            spinView = null;
            MachineButton.prompt(false);
        } else if (e.type === 'bonusStart') {
            const head = e.entry ? 'RUSH 突入！' : e.fromV ? 'V入賞！' : '大当たり！';
            show(`${head} ${e.label}個`, '#ffe066', now, CONFIG.machine.bonus.opening);
            if (e.fromV) Sound.play('v');
        } else if (e.type === 'smallStart') {
            show('V を狙え！', '#ff6a8a', now, CONFIG.machine.small.open);
        } else if (e.type === 'roundStart') {
            Sound.play('round');
        } else if (e.type === 'jitanStart') {
            show(e.challenge ? '突破チャレンジ！' : `RUSH ${e.rushHits - 1}連！`, '#7fd3f7', now, 2);
        } else if (e.type === 'ending' && e.next === 'normal') {
            show('通常時へ', '#ffffff', now, CONFIG.machine.bonus.ending);
        } else if (e.type === 'rushEnd') {
            summary = { hits: e.hits - 1, balls: e.balls, failed: e.challengeFailed, until: now + 5 };
        }
    }

    function aim(direction, now) {
        aimNotice = { aim: direction, until: now + (direction === 'left' ? 4 : 2.5) };
    }

    // 台のボタンが押された (バトルの PUSH)
    function push(now) {
        if (spinView && currentPhase && currentPhase.name === 'battle' && currentPhase.pushing && spinView.pushedAt === null) {
            spinView.pushedAt = now;
            Sound.play('attack');
        }
    }

    // ----- 描く道具 -----
    function rainbow(now, offset = 0) {
        return `hsl(${Math.floor((now * 240 + offset) % 360)}, 90%, 62%)`;
    }

    function text(str, x, y, size, color, align = 'center', now = 0) {
        ctx.font = `${size}px ${FONT}`;
        ctx.textAlign = align;
        ctx.textBaseline = 'middle';
        ctx.fillStyle = '#000';
        ctx.fillText(str, x + 1, y + 1);
        ctx.fillStyle = color === 'rainbow' ? rainbow(now) : color;
        ctx.fillText(str, x, y);
    }

    function band(y, h, alpha = 0.5) {
        ctx.fillStyle = `rgba(0, 0, 0, ${alpha})`;
        ctx.fillRect(0, y, W, h);
    }

    // ----- 場面 (いまの変動のどこにいるか) -----
    let currentPhase = null;
    function phaseAt(plan, elapsed) {
        let start = 0;
        for (let i = 0; i < plan.phases.length; i++) {
            const ph = plan.phases[i];
            if (elapsed < start + ph.t || i === plan.phases.length - 1) {
                return { name: ph.name, t: ph.t, local: Math.min(ph.t, elapsed - start), index: i };
            }
            start += ph.t;
        }
        return null;
    }

    // ----- 図柄 -----
    // 各リールが止まっているか ([左, 中, 右]) と、大きく出すか
    function reelState(plan, phase) {
        const stop = [false, false, false];
        let big = true;
        const n = phase.name;
        const local = phase.local;
        if (plan.type === undefined || plan.type === 'plain') {
            // 外れ・特図2: 左 45% → 右 70% → 中 100%
            const r = local / phase.t;
            stop[0] = r >= 0.45;
            stop[2] = r >= 0.7;
            stop[1] = r >= 0.999;
        } else if (n === 'challenge' || n === 'battle') {
            big = false;
            if (n === 'battle') stop[0] = stop[2] = true;
        } else if (n === 'fail') {
            stop[0] = local >= 0.2;
            stop[2] = local >= 0.5;
            stop[1] = local >= 0.8;
        } else if (n === 'reach') {
            // 左右が止まってリーチ → 1.4秒で小さくなり、バトルの相手が出てくる
            stop[0] = local >= 0.2;
            stop[2] = local >= 0.6;
            big = local < 1.4;
        } else if (n === 'result') {
            stop[0] = stop[2] = true;
            stop[1] = local >= 0.6;
            big = local >= 0.6;
        }
        return { stop, big };
    }

    // 回っている図柄 (縦に流れる)
    function drawRolling(layout, i, now, speed) {
        const x = layout.xs[i];
        const { w, h, y } = layout;
        const pos = now * speed + i * 2.3;
        const frac = pos % 1;
        const first = Math.floor(pos) % Figures.COUNT + 1;
        const next = first % Figures.COUNT + 1;
        ctx.save();
        ctx.beginPath();
        ctx.rect(x - w / 2 - 1, y - h / 2 - 1, w + 2, h + 2);
        ctx.clip();
        Figures.draw(ctx, first, x, y + frac * h, w, h, { dim: 0.25 });
        Figures.draw(ctx, next, x, y + frac * h - h, w, h, { dim: 0.25 });
        ctx.restore();
    }

    function drawReels(now, plan, phase) {
        const digits = plan ? plan.digits : shown;
        const state = plan ? reelState(plan, phase) : { stop: [true, true, true], big: true };
        const layout = state.big ? BIG : SMALL;
        const reach = plan && plan.type === 'reach' && state.stop[0] && state.stop[2] && !state.stop[1];
        const aligned = state.stop.every(Boolean) && digits[0] === digits[1] && digits[1] === digits[2];
        for (let i = 0; i < 3; i++) {
            if (!state.stop[i]) {
                drawRolling(layout, i, now, i === 1 && reach ? 5 : 12);
                continue;
            }
            const glow = aligned ? 0.5 + 0.5 * Math.sin(now * 8) : reach && i !== 1 ? 0.4 : 0;
            Figures.draw(ctx, digits[i], layout.xs[i], layout.y, layout.w, layout.h, { glow });
        }
        return { reach, aligned, big: state.big };
    }

    // ----- チャレンジ (6秒。最後の1秒で成功・失敗) -----
    function drawChallenge(now, plan, phase) {
        const c = CONFIG.show.challenges[plan.challenge];
        const success = plan.type === 'reach';
        const p = phase.local / phase.t;
        const frame = Math.floor(now * 4) % 2;
        // ゲージ: 成功なら満タン、失敗なら途中で止まる
        const fillEnd = 0.8;
        const gauge = Math.min(p / fillEnd, 1) * (success ? 1 : spinView.gaugeStop);
        const reveal = p >= fillEnd;

        if (plan.challenge === 'treasure') {
            const kx = Math.min(80, 10 + p * 140);
            drawSprite(ctx, SPRITES.koori, frame ? 'walk1' : 'walk2', kx, 92, 2);
            [150, 182, 214].forEach((x, i) => {
                const open = reveal && i === 1;
                ctx.fillStyle = '#6a3a14';
                ctx.fillRect(x - 12, 104, 24, 16);
                ctx.fillStyle = open ? (success ? '#ffe066' : '#3a2a20') : '#c88a2a';
                ctx.fillRect(x - 12, open ? 94 : 100, 24, open ? 6 : 6);
                ctx.fillStyle = '#ffd700';
                ctx.fillRect(x - 2, 106, 4, 4);
                if (open && success) {
                    ctx.fillStyle = `rgba(255, 240, 150, ${0.4 + 0.3 * Math.sin(now * 10)})`;
                    ctx.fillRect(x - 8, 60, 16, 44);
                }
            });
        } else if (plan.challenge === 'training') {
            // おにおにの前で腕立て (上下に弾む)
            Characters.drawEnemy(ctx, 'onioni', 196, 124, { scale: 1.6, frame });
            const bob = Math.abs(Math.sin(now * 9)) * 6;
            drawSprite(ctx, SPRITES.koori, 'walk1', 60, 92 + bob, 2);
            if (!reveal) text(`${Math.floor(gauge * 100)}回！`, 76, 82, 10, '#ffffff');
        } else {
            // ともいしのお弁当: おかずが箱に落ちていく
            drawSprite(ctx, SPRITES.tomoishi, frame ? 'idle' : 'shout', 40, 86, 2);
            ctx.fillStyle = '#e8e0c8';
            ctx.fillRect(140, 100, 64, 24);
            ctx.fillStyle = '#c84a2a';
            ctx.fillRect(142, 102, 60, 20);
            const items = Math.floor(gauge * 8);
            const colors = ['#ffffff', '#ffe066', '#ff6a3a', '#5ad04a', '#ffffff', '#ff9eb5', '#ffe066', '#8a5a3a'];
            for (let i = 0; i < items; i++) {
                ctx.fillStyle = reveal && !success ? '#2a1a10' : colors[i];
                ctx.fillRect(145 + (i % 4) * 14, 104 + Math.floor(i / 4) * 9, 11, 7);
            }
            if (!reveal) {
                const fy = 40 + ((now * 90) % 60);
                ctx.fillStyle = colors[items % colors.length];
                ctx.fillRect(166, fy, 10, 7);
            }
        }

        // 題名とゲージ
        band(30, 18, 0.55);
        text(c.name, W / 2 + 30, 39, 11, '#ffe066');
        ctx.fillStyle = '#10182a';
        ctx.fillRect(86, 54, 160, 8);
        ctx.fillStyle = success && reveal ? rainbow(now) : '#7fd3f7';
        ctx.fillRect(87, 55, Math.round(158 * gauge), 6);
        if (reveal) {
            const word = { treasure: ['お宝発見！', 'からっぽ…'], training: ['特訓成功！', 'ヘトヘト…'], bento: ['お弁当完成！', 'こげちゃった…'] }[plan.challenge];
            band(66, 26, 0.5);
            text(success ? word[0] : word[1], W / 2, 79, 18, success ? '#ffe066' : '#8aa4c0');
        }
    }

    // ----- バトル -----
    function enemyScale(id, maxH) {
        return Math.min(2, maxH / Characters.size(id).h);
    }

    function hpBar(x, y, w, ratio, color) {
        ctx.fillStyle = '#000';
        ctx.fillRect(x, y, w, 5);
        ctx.fillStyle = color;
        ctx.fillRect(x + 1, y + 1, Math.round((w - 2) * Math.max(0, ratio)), 3);
    }

    // phase.name が 'reach' (相手が出てくる) / 'battle' / 'result'
    function drawBattle(now, plan, phase) {
        const b = CONFIG.show.battles[plan.enemy];
        const frame = Math.floor(now * 4) % 2;
        const ground = 128;
        const scale = enemyScale(plan.enemy, 70);
        let ex = 196, kx = 50, enemyHurt = false, kooriHurt = false, enemyAlpha = 1, kooriDown = false;
        let enemyHp = 1, kooriHp = 1;

        if (phase.name === 'reach') {
            ex = 196 + Math.max(0, 1 - (phase.local - 1.4) / 0.8) * 90;   // リーチのあと、右から入ってくる
        } else if (phase.name === 'battle') {
            // 1.2秒ごとに攻撃しあう (偶数回目はこおりくん、奇数回目は相手)
            const pushStart = phase.t - CONFIG.show.pushTime;
            const fightT = Math.min(phase.local, pushStart);
            const turn = Math.floor(fightT / 1.2);
            const inTurn = (fightT % 1.2) / 1.2;
            enemyHp = 1 - Math.min(turn, 4) * 0.15;
            kooriHp = 1 - Math.min(Math.floor(turn / 2), 2) * 0.2;
            if (phase.local < pushStart) {
                const lunge = Math.sin(Math.min(1, inTurn * 2) * Math.PI) * 60;
                if (turn % 2 === 0) { kx += lunge; enemyHurt = inTurn > 0.35 && inTurn < 0.6; }
                else { ex -= lunge; kooriHurt = inTurn > 0.35 && inTurn < 0.6; }
                if (inTurn < 0.05 && lastTurn !== turn) { Sound.play(turn % 2 === 0 ? 'attack' : 'hurt'); lastTurn = turn; }
            }
        } else if (phase.name === 'result') {
            const k = Math.min(1, phase.local / 0.6);
            if (plan.win) {
                kx = 50 + Math.sin(Math.min(1, k * 1.5) * Math.PI) * 110;
                enemyHurt = Math.floor(now * 12) % 2 === 0 && k < 1;
                enemyAlpha = 1 - k;
                enemyHp = 0.4 * (1 - k);
            } else {
                ex = 196 - Math.sin(Math.min(1, k * 1.5) * Math.PI) * 110;
                kooriHurt = k < 1;
                kooriDown = k >= 0.5;
                kooriHp = 0.6 * (1 - k);
                enemyHp = 0.4;
            }
        }

        if (enemyAlpha > 0) Characters.drawEnemy(ctx, plan.enemy, ex, ground, { scale, frame, hurt: enemyHurt, alpha: enemyAlpha });
        if (kooriDown) {
            ctx.save();
            ctx.translate(kx + 16, ground - 8);
            ctx.rotate(Math.PI / 2);
            drawSprite(ctx, SPRITES.koori, 'down', -16, -16, 2);
            ctx.restore();
        } else {
            drawSprite(ctx, SPRITES.koori, kooriHurt ? 'down' : frame ? 'walk1' : 'walk2', kx, ground - 32 + (kooriHurt ? 2 : 0), 2);
        }

        // 名前と体力
        band(30, 20, 0.5);
        const titleColor = plan.enemy === 'naitei' ? 'rainbow' : plan.enemy === 'onioni' ? '#ff3a3a' : '#ffffff';
        text(`VS ${b.name}`, W / 2 + 34, 40, plan.enemy === 'naitei' ? 10 : 12, titleColor, 'center', now);
        hpBar(90, 54, 70, kooriHp, '#7fd3f7');
        hpBar(176, 54, 70, enemyHp, '#ff6a8a');

        if (phase.name === 'battle' && phase.pushing) {
            const pushed = spinView.pushedAt !== null;
            if (!pushed) {
                band(66, 26, 0.5);
                text('PUSH！', W / 2, 79, 22, Math.floor(now * 8) % 2 ? '#ffe066' : '#ff3a3a');
            } else {
                ctx.fillStyle = `rgba(255, 255, 255, ${Math.max(0, 0.8 - (now - spinView.pushedAt) * 2)})`;
                ctx.fillRect(0, 0, W, H);
            }
        }
        if (phase.name === 'result' && phase.local >= 0.3 && phase.local < 0.9) {
            band(66, 26, 0.55);
            text(plan.win ? '撃破！！' : '敗北…', W / 2, 79, 22, plan.win ? '#ffe066' : '#8aa4c0');
        }
    }
    let lastTurn = -1;

    // ----- 保留 (こおりくんの体の形) -----
    function holdIcon(x, y, size, color, now, active = false) {
        const fill = color === 'rainbow' ? rainbow(now, x * 3) : CONFIG.show.holdColors.colors[color] || '#e8f6ff';
        const s = size;
        if (active) {
            ctx.fillStyle = 'rgba(255, 255, 255, 0.25)';
            ctx.fillRect(x - s / 2 - 2, y - s / 2 - 2, s + 4, s + 4);
        }
        ctx.fillStyle = '#1b3a6b';
        ctx.fillRect(x - s / 2, y - s / 2, s, s);
        ctx.fillStyle = fill;
        ctx.fillRect(x - s / 2 + 1, y - s / 2 + 1, s - 2, s - 2);
        ctx.fillStyle = 'rgba(255, 255, 255, 0.7)';
        ctx.fillRect(x - s / 2 + 2, y - s / 2 + 2, Math.max(1, s / 5), Math.max(1, s / 3));
        ctx.fillStyle = '#10162a';
        const eye = Math.max(1, Math.round(s / 8));
        ctx.fillRect(Math.round(x - s / 5), Math.round(y - s / 10), eye, eye * 2);
        ctx.fillRect(Math.round(x + s / 5 - eye), Math.round(y - s / 10), eye, eye * 2);
    }

    function drawHolds(now, m) {
        m.holds[1].forEach((h, i) => holdIcon(14 + i * 13, 136, 10, h.holdColor, now));
        for (let i = m.holds[1].length; i < CONFIG.machine.holdMax; i++) {
            ctx.fillStyle = 'rgba(255, 255, 255, 0.12)';
            ctx.fillRect(10 + i * 13, 132, 8, 8);
        }
        m.holds[2].forEach((h, i) => holdIcon(W - 14 - i * 13, 136, 10, 'white', now));
        // 変動中の保留 (当該保留) は真ん中の下に大きく
        if (m.spin && m.spin.fig === 1 && !m.bonus) holdIcon(W / 2, 134, 12, m.spin.result.holdColor, now, true);
    }

    // ----- ふるカワ -----
    function drawFurukawa(now) {
        if (!bubble || now >= bubble.until) return;
        const talkFrame = Math.floor(now * 6) % 2 ? 'talk' : 'idle';
        drawSprite(ctx, SPRITES.furukawa, talkFrame, W - 34, H - 46, 1.6);
        const colors = CONFIG.show.furukawa.colors;
        const color = colors[bubble.color] || '#ffffff';
        ctx.font = `10px ${FONT}`;
        const width = Math.min(W - 60, ctx.measureText(bubble.text).width + 12);
        const bx = W - 40 - width;
        const by = H - 52;
        ctx.fillStyle = 'rgba(10, 16, 32, 0.85)';
        ctx.fillRect(bx, by, width, 18);
        ctx.strokeStyle = color === 'rainbow' ? rainbow(now) : color;
        ctx.lineWidth = 1;
        ctx.strokeRect(bx + 0.5, by + 0.5, width - 1, 17);
        ctx.fillStyle = 'rgba(10, 16, 32, 0.85)';
        ctx.fillRect(bx + width, by + 6, 4, 4);
        text(bubble.text, bx + width / 2, by + 9, 10, color, 'center', now);
    }

    // ----- 大当たり中 -----
    function drawBonus(now, m) {
        const b = m.bonus;
        band(0, H, 0.45);
        Figures.draw(ctx, shown[0], 30, 50, 34, 40, { glow: 0.5 });
        text(`${b.alloc.label}個 大当たり`, W / 2 + 14, 22, 16, '#ffe066');
        text(`ROUND ${Math.max(1, b.round)} / ${b.alloc.rounds}`, W / 2 + 14, 58, 20, '#ffffff');
        if (b.phase === 'open') text(`COUNT ${b.count} / ${b.alloc.count || CONFIG.machine.bonus.count}`, W / 2 + 14, 84, 13, '#7fd3f7');
        text('右打ち →', W / 2, 110, 14, Math.floor(now * 3) % 2 ? '#ff6a8a' : '#ffffff');
    }

    // ----- 1フレーム -----
    function background(m, plan, phase) {
        if (m.bonus) return 'goldHall';
        if (plan && phase) {
            if (phase.name === 'challenge') return CONFIG.show.challenges[plan.challenge].map;
            if (phase.name === 'reach' || phase.name === 'battle' || phase.name === 'result') return CONFIG.show.battles[plan.enemy].map;
        }
        return Machine.inJitan(m) || m.rush.active ? 'seCastle' : 'tsugakuro';
    }

    function phaseSounds(plan, phase) {
        const key = phase ? `${phase.index}` : null;
        if (key === lastPhase) return;
        lastPhase = key;
        if (!phase) return;
        if (phase.name === 'challenge') Sound.play('challenge');
        if (phase.name === 'fail') Sound.play('fail');
        if (phase.name === 'reach') Sound.play('reach');
        if (phase.name === 'result') Sound.play(plan.win ? 'win' : 'lose');
    }

    function draw(now, m) {
        ctx.imageSmoothingEnabled = false;
        const plan = m && m.spin && spinView ? spinView.plan : null;
        const phase = plan ? phaseAt(plan, m.spin.elapsed) : null;
        if (phase && phase.name === 'battle') phase.pushing = phase.local >= phase.t - CONFIG.show.pushTime;
        currentPhase = phase;
        const rushing = m && (Machine.inJitan(m) || m.rush.active);
        Backgrounds.draw(ctx, m ? background(m, plan, phase) : 'tsugakuro', now * (rushing ? 40 : 18));
        if (!m) return canvas;
        phaseSounds(plan, phase);

        // バトル中は PUSH の案内を台のボタンにも出す
        MachineButton.prompt(Boolean(phase && phase.name === 'battle' && phase.pushing && spinView.pushedAt === null));

        if (m.bonus) drawBonus(now, m);
        else {
            if (phase && phase.name === 'challenge') drawChallenge(now, plan, phase);
            if (phase && ((phase.name === 'reach' && phase.local >= 1.4) || phase.name === 'battle' || (phase.name === 'result' && phase.local < 0.6))) drawBattle(now, plan, phase);
            const state = drawReels(now, plan, phase);
            if (phase && phase.name === 'reach' && phase.local >= 0.6 && phase.local < 1.4) {
                band(104, 20, 0.6);
                text('リーチ！', W / 2, 114, 18, Math.floor(now * 6) % 2 ? '#ff6a8a' : '#ffe066');
            }
            if (state.aligned && plan && plan.win) text('大当たり！', W / 2, 18, 14, 'rainbow', 'center', now);
            const left = m.jitanLeft + (m.spin && m.spin.jitan ? 1 : 0);
            if (Machine.inJitan(m)) {
                text(m.rush.challenge ? `突破チャレンジ  残り ${left}回` : `RUSH ${m.rush.hits - 1}連  時短 残り ${left}回`, W / 2, 112, 11, '#7fd3f7');
            } else if (m.rush.active) text('残り保留で V を狙え', W / 2, 112, 11, '#7fd3f7');
        }

        // ふるカワのバトルの返事・撃破のひとこと
        if (plan && phase && phase.name === 'reach' && phase.local >= 1.6 && plan.reply && (!bubble || bubble.key !== 'reply' + m.stats.spins1)) {
            say(plan.reply, 0, now);
            bubble.key = 'reply' + m.stats.spins1;
        }
        if (plan && phase && phase.name === 'result' && plan.defeatLine && phase.local > 0.6 && (!bubble || bubble.key !== 'defeat' + m.stats.spins1)) {
            say(plan.defeatLine, 5, now);
            bubble.key = 'defeat' + m.stats.spins1;
        }
        drawHolds(now, m);
        drawFurukawa(now);

        if (aimNotice && now < aimNotice.until && !m.bonus) {
            const blink = Math.floor(now * 3) % 2;
            if (aimNotice.aim === 'right') text('右打ち →', W - 40, 12, 12, blink ? '#ff6a8a' : '#ffffff');
            else text('← 左打ちに戻してください', W / 2, 12, 11, blink ? '#ffe066' : '#ffffff');
        }
        if (summary && now < summary.until) {
            ctx.fillStyle = 'rgba(0, 0, 0, 0.7)';
            ctx.fillRect(28, 34, W - 56, 64);
            if (summary.failed) {
                text('突破ならず…', W / 2, 66, 16, '#8aa4c0');
            } else {
                text('RUSH 終了', W / 2, 50, 14, '#ffffff');
                text(`${summary.hits}連  ${summary.balls >= 0 ? '+' : ''}${summary.balls}玉`, W / 2, 76, 18, '#ffe066');
            }
        }
        if (flash && now < flash.until) {
            const t = 1 - (flash.until - now) / flash.length;
            band(44, 44, 0.45);
            text(flash.text, W / 2, 66, 20 + Math.round(Math.sin(Math.min(1, t * 4) * Math.PI / 2) * 4), flash.color);
        }
        return canvas;
    }

    return { init, reset, draw, event, aim, show, push, W, H };
})();
