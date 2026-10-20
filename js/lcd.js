// =====================================================================
// 液晶 (256x144 のドット絵の画面)
// ---------------------------------------------------------------------
// 変動の流れは Scenario が決めた plan.phases どおりに描く (台の m.spin.elapsed に合わせる):
//   stepup    ステップアップ予告 (plan.stepUp。キャラが1段ずつ出てくる。図柄は回ったまま)
//   roll      図柄が回る (外れはここで 左 → 右 → 中 の順に止まる)
//   next      擬似連の「NEXT」(plan.gizi 回。図柄が回り直す)
//   challenge チャレンジ (宝探し・特訓・お弁当作り)。最後に成功・失敗がわかる。図柄は上に小さく回る
//   fail      チャレンジ失敗。図柄がばらばらに止まる
//   reach     チャレンジ成功 → 左右がそろってリーチ。バトルの相手が出てくる
//   battle    バトル。最後に「PUSH!」(台のボタン)
//   pursuit   追撃チャンス (plan.pursuit のときだけ)。こおりくんがもう2回攻撃して追加ダメージ
//   result    撃破なら図柄がそろう (大当たり)、負けなら中の図柄がずれて止まる
//   全回転 (plan.type 'zenkaiten'): zroll (ふつうに回る) → zenkaiten (3つとも同じキャラの図柄のまま回る) → zend (止まって大当たり)
// 保留 (こおりくんの体の形。色つき)・ふるカワの吹き出し・大当たり・RASH の表示もここ。
// 特図2 (突破チャレンジ・こおりRASH・おにおにRASH) は plan.kind で分ける。突破チャレンジとおにおにRASH は js/lcd-rash.js
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
    let summary = null;     // RASH が終わったときの結果 { hits, balls, until }
    let trophy = null;      // 設定示唆トロフィー { level, start, until } (次の変動から minShow 秒で消える)
    let anomalyTalk = null; // おにおにRASH の当たりの違和感 (ラウンドの始めにふるカワが教える。config の patterns の talk)
    let bubble = null;      // ふるカワの吹き出し { text, color, until }
    let spinView = null;    // いまの変動の見た目の情報 { plan, gaugeStop, pushedAt }
    let lastPhase = null;   // 効果音を鳴らすための、前のフレームの場面

    function init() {
        canvas = document.createElement('canvas');
        canvas.width = W;
        canvas.height = H;
        ctx = canvas.getContext('2d');
        RashView.init({ ctx, W, H, text, band, rainbow });
        Story.init({ ctx, W, H, text, band, rainbow });
        return canvas;
    }

    // RASH のモードを選んでいるところ (RASH 突入の大当たり中。main.js が出し入れする)
    let choosing = false;
    function setChoosing(on) {
        choosing = on;
    }
    let rashCount = null;   // 大当たりの終わりの「〇回目」→「〇〇RASH」 { count, start }
    let stageFx = null;     // ステージが変わったところ { stage: { id, kind }, start }
    let renchan = null;     // 「〇G連確定！」{ games, start }
    let holdFx = null;      // 保留変化 { result, current, start }
    let promoteFx = null;   // 図柄の昇格 { start, from, to, bonus }
    let machineRef = null;  // いまの台 (イベントのときに大当たりの中身を見るため)

    // 図柄の昇格: 偶数の図柄が大きく現れて震え、光って奇数の図柄に変わる →「昇格！」
    function drawPromote(now) {
        if (!promoteFx) return;
        const t = now - promoteFx.start;
        if (t < 0) return;
        const total = CONFIG.show.promote.time;
        if (t > total) {
            promoteFx = null;
            return;
        }
        const flip = 1.6;
        if (t >= flip && !promoteFx.bonus.promote.done) {
            promoteFx.bonus.promote.done = true;
            shown = [promoteFx.to, promoteFx.to, promoteFx.to];
            Sound.play('win');
            say(CONFIG.show.furukawa.congratsLine, 6, now);
        }
        band(0, H, 0.6);
        const shake = t < flip ? Math.sin(t * 60) * Math.min(3, t * 3) : 0;
        const digit = t < flip ? promoteFx.from : promoteFx.to;
        const pop = t < 0.3 ? t / 0.3 : 1;
        Figures.draw(ctx, digit, W / 2 + shake, 62, Math.round(56 * pop) || 1, Math.round(64 * pop) || 1, { glow: t >= flip ? 1 : 0.3 });
        if (t >= flip && t < flip + 0.3) {
            ctx.fillStyle = `rgba(255, 255, 255, ${(flip + 0.3 - t) * 3})`;
            ctx.fillRect(0, 0, W, H);
        }
        if (t >= flip) text(promoteFx.to === 'V' ? 'V 昇格！' : '昇格！', W / 2, 112, 22, 'rainbow', 'center', now);
        else if (t > 0.5) text('…！？', W / 2, 112, 16, '#ffffff');
    }

    // 保留変化: 変わった保留のまわりに光の輪と「ピキーン！」
    function drawHoldFx(now, m) {
        if (!holdFx) return;
        const t = now - holdFx.start;
        if (t > 1.2) { holdFx = null; return; }
        let x, y = 134;
        if (holdFx.current) x = W / 2;
        else {
            const i = m.holds[1].indexOf(holdFx.result);
            if (i < 0) return;
            x = 14 + i * 13;
            y = 136;
        }
        const r = 6 + t * 18;
        ctx.strokeStyle = `rgba(255, 255, 255, ${Math.max(0, 1 - t)})`;
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(x, y, r, 0, Math.PI * 2);
        ctx.stroke();
        if (t < 0.8) text('ピキーン！', Math.min(W - 30, Math.max(30, x)), y - 16, 9, holdFx.result.holdColor === 'rainbow' ? 'rainbow' : '#ffffff', 'center', now);
    }
    const RENCHAN_TIME = 3.5;

    // ステージが変わった: 白い光が横切って、ステージの名前 (高確率ステージは「チャンス！」)
    function drawStageFx(now) {
        if (!stageFx) return;
        const t = now - stageFx.start;
        if (t > 2) { stageFx = null; return; }
        if (t < 0.35) {
            const x = (t / 0.35) * (W + 60) - 60;
            ctx.fillStyle = 'rgba(255, 255, 255, 0.85)';
            ctx.fillRect(x, 0, 60, H);
        }
        const st = CONFIG.show.stages;
        const kind = stageFx.stage.kind;
        const name = st.names[stageFx.stage.id] || '';
        if (t > 0.2 && t < 1.8) {
            band(4, 22, 0.55);
            if (kind === 'hi') text(`チャンス！ ${name}`, W / 2, 15, 14, Math.floor(now * 6) % 2 ? '#ff3a3a' : '#ffe066');
            else text(`ステージ: ${name}`, W / 2, 15, 12, '#ffffff');
        }
    }

    function drawRashCount(now) {
        if (!rashCount) return;
        const t = now - rashCount.start;
        const total = CONFIG.machine.bonus.ending;
        if (t > total) { rashCount = null; return; }
        band(0, H, 0.6);
        if (t < CONFIG.show.rashCount.countTime) {
            const pop = Math.min(1, t / 0.25);
            text(`${rashCount.count}回目`, W / 2, 66, Math.round(20 + 18 * pop), '#ffe066');
        } else {
            text(`${rashName()}`, W / 2, 62, 24, rashMode === 'onioni' ? '#ff6a6a' : '#7fd3f7');
            text('継続！', W / 2, 92, 16, '#ffffff');
        }
    }

    function reset() {
        flash = summary = aimNotice = bubble = spinView = stageFx = renchan = holdFx = promoteFx = trophy = null;
    }

    function show(text, color, now, seconds = 1.2) {
        flash = { text, color, until: now + seconds, length: seconds };
    }

    function say(text, color, now) {
        if (Customize.get('furukawa') === 'off') return;
        bubble = { text, color, until: now + CONFIG.show.furukawa.talkTime };
    }

    // 大当たり中のふるカワ (始め・ラウンド・終わり)。delay 秒あとから出す (大当たりの文字と重ならないように)
    let lastBonusLine = null;
    function bonusTalk(kind, now, delay = 0) {
        if (Story.active() || Customize.get('furukawa') === 'off') return;
        const f = CONFIG.show.furukawa;
        const list = f.bonusLines[kind].filter(line => line !== lastBonusLine);
        const line = list[Math.floor(Math.random() * list.length)] || f.bonusLines[kind][0];
        lastBonusLine = line;
        bubble = { text: line, color: f.bonusColor, from: now + delay, until: now + delay + f.talkTime };
    }

    // ----- 台のイベント -----
    function event(e, now) {
        // ラウンド中の紹介のカードは、大当たりの始まりの表示 (opening) が終わってから
        if (e.type === 'bonusStart') infoStart = now + CONFIG.machine.bonus.opening;
        if (e.type === 'hold' && e.result.extra) {
            // おまけの保留 (突破チャレンジのバトル中に入った): 入ったことを見せない・鳴らさない
        } else if (e.type === 'hold') {
            Sound.play('hold');
            if (e.result.voice) {
                // 入賞時の音 (録音) が鳴って、ボタンが赤く光る
                Sound.playVoice(Boolean(e.result.kai));   // 怪の先バレは おどろおどろしい音
                MachineButton.trigger(e.result.kai ? 'purple' : 'red', now);   // こおりRASH の怪の先バレは紫
            } else if (e.result.button) MachineButton.trigger(e.result.button, now);
        } else if (e.type === 'holdChange') {
            // 保留変化: ピキーン！
            holdFx = { result: e.result, current: e.current, start: now };
            Sound.play('success');
        } else if (e.type === 'trophy') {
            trophy = { level: e.level, start: now, until: Infinity };
            Sound.play(e.level === 6 ? 'win' : 'success');
        } else if (e.type === 'spinStart') {
            if (trophy) trophy.until = Math.max(now, trophy.start + summaryTime) + CONFIG.show.settingHint.trophy.minShow;
            spinView = { plan: e.plan, gaugeStop: 0.55 + Math.random() * 0.35, pushedAt: null };
            if (e.plan.talk) {
                say(e.plan.talk.text, e.plan.talk.color, now);
                // ステップアップ予告のあいだは、文字に重ならないよう予告が終わってからしゃべる
                const first = e.plan.phases[0];
                if (bubble && first.name === 'stepup') { bubble.from = now + first.t; bubble.until += first.t; }
            }
            else if (Customize.get('furukawa') === 'often' && e.fig === 1 && e.plan.type === 'plain') {
                // よくしゃべる: ふだんは黙っている変動でも、キャラクターの話か豆知識
                const f = CONFIG.show.furukawa;
                const list = Math.random() < f.hintRate ? f.hintLines : f.chatLines;
                say(list[Math.floor(Math.random() * list.length)], 0, now);
            }
            // 先告知: 当たりの変動が始まった瞬間にボタンが虹色、「当たり確定！」
            // 一発告知: 当たりの変動の始めにボタンが虹色に光るだけ
            if (e.plan.notice === 'oneshot' && e.result.kind === 'hit') {
                MachineButton.trigger('rainbow', now);
                Sound.play('v');
            }
            if (Customize.get('notice') === 'pre' && e.fig === 1 && e.result.kind === 'hit') {
                MachineButton.trigger('rainbow', now);
                show('当たり確定！', 'rainbow', now, 1.5);
            }
        } else if (e.type === 'spinEnd') {
            // おにおにRASH の当たり: 違和感を覚えておき、ラウンドの始めにふるカワが教える
            anomalyTalk = e.plan.kind === 'onioni' && e.plan.win && e.plan.pattern ? CONFIG.show.onioniRash.patterns[e.plan.pattern].talk : null;
            if (spinView) shown = spinView.plan.digits.map(d => d === 'V' ? 'V' : d);
            spinView = null;
            MachineButton.prompt(false);
        } else if (e.type === 'bonusStart' && e.rush && e.rushHits - 1 === CONFIG.show.story.endingAt) {
            // RASH の 10回目の大当たり: ラウンド中にエンディング
            Story.play('ending', now);
        } else if (e.type === 'bonusStart') {
            bonusTalk(e.entry ? 'entry' : e.label >= CONFIG.show.bigLabel && !e.promote ? 'big' : 'small', now, CONFIG.machine.bonus.opening * 0.6);
            const head = e.yutime ? '遊タイムで RASH 突入！' : e.entry ? 'RASH 突入！' : e.fromV ? 'V入賞！' : '大当たり！';
            show(e.promote ? head : `${head} ${e.label}個`, '#ffe066', now, CONFIG.machine.bonus.opening);
            if (e.fromV) Sound.play('v');
        } else if (e.type === 'bonusEnd') {
            if (infoStart !== null) infoBase = infoIndex(now) + 1;
            infoStart = null;
        } else if (e.type === 'renchan') {
            renchan = { games: e.games, start: now };
            Sound.play('win');
            MachineButton.trigger('rainbow', now);
            bubble = null;
        } else if (e.type === 'stageChange') {
            stageFx = { stage: e.stage, start: now };
            Sound.play(e.stage.kind === 'hi' ? 'reach' : 'challenge');
        } else if (e.type === 'smallStart') {
            show('V を狙え！', '#ff6a8a', now, CONFIG.machine.small.open);
        } else if (e.type === 'roundStart') {
            Sound.play('round');
            // さっきの違和感をふるカワが教える (大当たりの始めのひとことのあと)
            if (e.round === 1 && anomalyTalk && Customize.get('furukawa') !== 'off') {
                const f = CONFIG.show.furukawa;
                bubble = { text: anomalyTalk, color: f.bonusColor, from: now + 1.5, until: now + 1.5 + f.talkTime };
            }
            if (e.round === 1) anomalyTalk = null;
            // 昇格: 1ラウンド目の途中で図柄が現れて奇数に変わる
            if (e.round === 1 && machineRef && machineRef.bonus && machineRef.bonus.promote) {
                const pr = machineRef.bonus.promote;
                promoteFx = { start: now + (pr.toV ? CONFIG.show.promote.vDelay : CONFIG.show.promote.delay), from: shown[0], to: pr.to, bonus: machineRef.bonus };
            }
            const f = CONFIG.show.furukawa;
            if (e.round === e.rounds && e.rounds > 1) bonusTalk('lastRound', now);
            else if (e.round > 1 && Math.random() < f.bonusRoundRate) bonusTalk('round', now);
        } else if (e.type === 'jitanStart') {
            if (e.challenge) show('突破チャレンジ！', '#7fd3f7', now, 2);
        } else if (e.type === 'yutimeStart') {
            // 遊タイム (天井): 虹色で出して、ボタンも虹色に
            show('遊タイム突入！', 'rainbow', now, 2.5);
            MachineButton.trigger('rainbow', now);
            Sound.play('win');
        } else if (e.type === 'yutimeEnd') {
            show('通常時へ', '#ffffff', now, 2);

        } else if (e.type === 'ending' && e.next === 'normal') {
            show('通常時へ', '#ffffff', now, CONFIG.machine.bonus.ending);
            bonusTalk('endNormal', now);
        } else if (e.type === 'ending' && e.rushHits > 1) {
            // RASH の大当たりの終わり: 「〇回目」→「〇〇RASH」
            rashCount = { count: e.rushHits - 1, start: now };
            bonusTalk('endRash', now);
        } else if (e.type === 'rushEnd') {
            summary = { hits: e.hits - 1, balls: e.balls, failed: e.challengeFailed, until: now + summaryTime };
        }
    }

    const summaryTime = 5;   // RASH が終わったときの結果を出しておく秒

    // RASH の残り回数 (ユーザー指定 2026-10-19): 右上に「あと〇回」。時短の残り、時短が終わったら残り保留の数。
    // おにおにRASH の違和感 count77 では「あと77回」(当たり)。大当たり中・ブラックアウト・復活の暗転・「右打ち →」の案内のあいだは出さない
    function rashLeft(m) {
        const jitan = m.jitanLeft + (m.spin && m.spin.jitan ? 1 : 0);
        return jitan > 0 ? jitan : m.holds[2].length + (m.spin && m.spin.fig === 2 ? 1 : 0);
    }
    function drawRashLeft(now, m, plan, phase) {
        if (!m.rush.active || m.rush.challenge || m.bonus) return;
        if (plan && plan.kind === 'blackout') return;
        if (phase && phase.name.startsWith('rv') && phase.name !== 'rvkill') return;
        if (aimNotice && now < aimNotice.until && aimNotice.aim === 'right') return;
        const fake = plan && plan.kind === 'onioni' && plan.pattern === 'count77' && phase && (phase.name === 'anomaly' || phase.name === 'open');
        const n = fake ? CONFIG.show.rashLeft.fake : rashLeft(m);
        ctx.fillStyle = 'rgba(0, 0, 0, 0.55)';
        ctx.fillRect(W - 62, 2, 60, 16);
        text(`あと${n}回`, W - 32, 10, 12, fake && phase.name === 'open' ? 'rainbow' : '#ffe066', 'center', now);
    }

    // ----- 設定示唆トロフィー (スロット版と同じ絵。左下に落ちてきて少し弾む) -----
    // k: 縁 / h: ハイライト / #: 本体 / d: 影 / b: 台座
    const TROPHY_ART = [
        '..kkkkkkkkkk..',
        'kkkhh#####dkkk',
        'k.kh######dk.k',
        'k.kh######dk.k',
        '.kkh######dkk.',
        '...kh####dk...',
        '....kh##dk....',
        '.....k##k.....',
        '.....k##k.....',
        '....kh##dk....',
        '..kkkkkkkkkk..',
        '..kbbbbbbbbk..',
        '..kbbbbbbbbk..',
        '..kkkkkkkkkk..'
    ];
    function drawTrophy(now) {
        if (!trophy) return;
        if (now > trophy.until) { trophy = null; return; }
        const color = CONFIG.show.settingHint.trophy.colors[trophy.level];
        const px = 2;
        const size = TROPHY_ART.length * px;
        const t = now - trophy.start;
        const drop = t < 0.3 ? (1 - t / 0.3) * -24 : t < 0.45 ? -Math.sin((t - 0.3) / 0.15 * Math.PI) * 4 : 0;
        const x = 4;
        const y = Math.round(H - size - 4 + drop);
        ctx.save();
        ctx.globalAlpha = Math.min(1, Math.max(0, (trophy.until - now) / 0.4));
        const glint = ((t % 1.6) / 1.6) * (size * 2.5) - size / 2;
        TROPHY_ART.forEach((row, r) => [...row].forEach((c, col) => {
            if (c === '.') return;
            let fill;
            if (c === 'k') fill = '#1a1208';
            else if (c === 'b') fill = '#5a3a1a';
            else if (color.rainbow) fill = `hsl(${(now * 200 + r * 25 + col * 12) % 360}, 100%, ${c === 'h' ? 85 : c === 'd' ? 38 : 60}%)`;
            else fill = c === 'h' ? color.light : c === 'd' ? color.dark : color.main;
            if (c !== 'k' && c !== 'b' && Math.abs((col + r) * px - glint) < 3) fill = '#ffffff';
            ctx.fillStyle = fill;
            ctx.fillRect(x + col * px, y + r * px, px, px);
        }));
        ctx.restore();
    }

    function aim(direction, now) {
        aimNotice = { aim: direction, until: now + (direction === 'left' ? 4 : 2.5) };
    }

    let rashMode = null;
    const rashName = () => CONFIG.show.rash.modes[rashMode || CONFIG.show.rash.defaultMode].name;

    // 台のボタンが押された (バトルの PUSH)
    function push(now) {
        if (spinView && currentPhase && currentPhase.pushing && spinView.pushedAt === null) {
            spinView.pushedAt = now;
            Sound.play('attack');
        }
    }

    // ----- 描く道具 -----
    function rainbow(now, offset = 0) {
        return `hsl(${Math.floor((now * 240 + offset) % 360)}, 90%, 62%)`;
    }

    let reverseText = false;   // おにおにRASH の違和感「文字が全部逆」(液晶の文字を後ろから並べる)
    function text(str, x, y, size, color, align = 'center', now = 0) {
        if (reverseText) str = [...String(str)].reverse().join('');
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
        const last = phase.index === plan.phases.length - 1;
        if (plan.kind === 'rashBattle' && plan.revival && n !== 'roll' && n !== 'battle') {
            // 復活: 負けて見せる result では中を止めず、暗転のあいだは隠す。撃破 (rvkill) で そろって大きく
            if (n === 'result') return { stop: [true, false, true], big: false };
            if (n !== 'rvkill') return { stop: [false, false, false], big: false, hidden: true };
            const done = local >= 0.6;
            return { stop: [true, done, true], big: done };
        }
        if (plan.kind === 'rashBattle') {
            // こおりRASH のバトル: いつも小さく。バトルで左右、結果で中が止まる
            big = n === 'result' && local >= 0.6;
            stop[0] = stop[2] = n !== 'roll';
            stop[1] = n === 'result' && local >= 0.6;
            return { stop, big };
        }
        if (plan.kind === 'blackout') return { stop: [false, false, false], big: false, hidden: n !== 'itadaki' || local < 1 };
        if (plan.kind === 'challenge' || (plan.kind === 'onioni' && plan.pattern)) {
            // 突破チャレンジ・おにおにRASH の当たり: 図柄は左上に小さく、最後に止まる
            const done = last && local >= phase.t - 0.5;
            return { stop: [done, done, done], big: false };
        }
        // 特図1 の予告・擬似連・全回転: 図柄は大きく回ったまま (全回転は drawReels で同じ図柄をそろえて回す)
        if (n === 'stepup' || n === 'gun' || n === 'next' || n === 'zroll') return { stop: [false, false, false], big: true };
        if (n === 'develop' || n === 'cutin') return { stop: [true, false, true], big: false };
        if (n === 'postnotice') return { stop: [true, true, true], big: true };
        if (n === 'zenkaiten') return { stop: [false, false, false], big: true, zenkaiten: true };
        if (n === 'zend') return { stop: [true, true, true], big: true };
        if (plan.type === undefined || plan.type === 'plain') {
            // 外れ・特図2: 左 45% → 右 70% → 中 100%
            const r = local / phase.t;
            stop[0] = r >= 0.45;
            stop[2] = r >= 0.7;
            stop[1] = r >= 0.999;
        } else if (n === 'challenge' || n === 'battle' || n === 'pursuit') {
            big = false;
            if (n !== 'challenge') stop[0] = stop[2] = true;
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
        // おにおにRASH の違和感: 図柄の中に 8 (ナイナイ)・9 (アルアル) が止まる
        if (plan && plan.oddFigure && phase && phase.name === 'anomaly' && phase.local >= 0.4) {
            drawRolling(SMALL, 0, now, 12);
            drawRolling(SMALL, 2, now, 12);
            Figures.draw(ctx, plan.oddFigure, SMALL.xs[1], SMALL.y, SMALL.w, SMALL.h, { glow: 0.5 + 0.5 * Math.sin(now * 10) });
            return { reach: false, aligned: false, big: false };
        }
        // 後告知の当たり: 図柄はいったん外れの目で止まり、告知のあと (postnotice の 0.8秒) にそろう
        const fake = plan && plan.type === 'post' && phase && (phase.name === 'roll' || phase.local < 0.8);
        const digits = plan ? (fake ? plan.fakeDigits : plan.digits) : shown;
        const state = plan ? reelState(plan, phase) : { stop: [true, true, true], big: true };
        if (state.hidden) return { reach: false, aligned: false, big: false };
        if (state.zenkaiten) return drawZenkaitenReels(now, digits[0], phase);
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

    // 全回転: 3つの図柄が同じキャラのまま、そろって回る。だんだんゆっくりになり、最後の ZEN_STOP 秒で止まる
    const ZEN_STOP = 0.8;
    function drawZenkaitenReels(now, figure, phase) {
        const left = phase.t - phase.local;
        const stopped = left <= ZEN_STOP;
        const speed = 3 + 9 * Math.max(0, left - ZEN_STOP) / (phase.t - ZEN_STOP);
        const frac = stopped ? 0 : (phase.local * speed) % 1;
        const glow = 0.5 + 0.5 * Math.sin(now * 10);
        for (let i = 0; i < 3; i++) {
            const x = BIG.xs[i];
            const { w, h, y } = BIG;
            if (stopped) {
                Figures.draw(ctx, figure, x, y, w, h, { glow });
                continue;
            }
            ctx.save();
            ctx.beginPath();
            ctx.rect(x - w / 2 - 1, y - h / 2 - 1, w + 2, h + 2);
            ctx.clip();
            Figures.draw(ctx, figure, x, y + frac * h, w, h);
            Figures.draw(ctx, figure, x, y + frac * h - h, w, h);
            ctx.restore();
        }
        return { reach: false, aligned: stopped, big: true };
    }

    // 文字が幅に収まるよう小さくして、真ん中にそろえて書く
    function fitCenter(str, x, y, size, color, maxW, now = 0) {
        let s = size;
        ctx.font = `${s}px ${FONT}`;
        while (s > 7 && ctx.measureText(str).width > maxW) {
            s--;
            ctx.font = `${s}px ${FONT}`;
        }
        text(str, x, y, s, color, 'center', now);
    }

    // ----- ステップアップ予告 (ユーザー指定 2026-10-20) -----
    // 1段ごとに枠が右から入ってくる (左から STEP 1・2・3)。3段目は文字を大きく、色 (白・赤・金) で期待度
    function drawStepUp(now, plan, phase) {
        const su = CONFIG.show.stepUp;
        const s = plan.stepUp;
        const kind = su.kinds[s.kind];
        const k = Math.min(s.step, Math.floor(phase.local / su.stepTime) + 1);
        const local = phase.local - (k - 1) * su.stepTime;
        const colorOf = j => j === 3 ? su.colors[s.color] : '#ffffff';
        for (let j = 1; j <= k; j++) {
            const step = kind.steps[j - 1];
            const slide = j === k ? Math.max(0, 1 - local / 0.25) : 0;
            const x = 6 + (j - 1) * 83 + slide * 80;
            ctx.save();
            ctx.globalAlpha = 1 - slide * 0.6;
            ctx.fillStyle = 'rgba(8, 16, 34, 0.9)';
            ctx.fillRect(x, 30, 78, 76);
            ctx.fillStyle = j === 3 ? colorOf(3) : '#7fd3f7';
            ctx.fillRect(x, 30, 78, 2);
            ctx.fillRect(x, 104, 78, 2);
            text(`STEP ${j}`, x + 39, 38, 8, j === 3 ? colorOf(3) : '#7fd3f7');
            drawInfoPortrait(step.who, x + 39, 88, 44, 44, now);
            fitCenter(step.text, x + 39, 97, 9, colorOf(j), 74);
            ctx.restore();
            once(`step${j}`, j < 3 ? 'challenge' : s.color === 'gold' ? 'win' : 'reach');
        }
        // 3段目: 文字を大きく。金はきらめく
        if (k === 3 && local >= 0.3) {
            band(110, 20, 0.7);
            const color = s.color === 'gold' && Math.floor(now * 8) % 2 ? '#fff6c0' : colorOf(3);
            fitCenter(kind.steps[2].text, W / 2, 120, 16, color, W - 16);
        }
    }

    // ----- 擬似連 (ユーザー指定 2026-10-20): 「NEXT」で図柄が回り直す -----
    function drawNext(now, plan, phase) {
        const count = plan.phases.slice(0, phase.index + 1).filter(ph => ph.name === 'next').length;
        if (phase.local < 0.3) {
            ctx.fillStyle = `rgba(255, 255, 255, ${0.8 - phase.local * 2.5})`;
            ctx.fillRect(0, 0, W, H);
        }
        band(48, 46, 0.6);
        text('NEXT', W / 2, 64, 26, Math.floor(now * 8) % 2 ? '#ffe066' : '#ff3a3a');
        text(`擬似${count + 1}連`, W / 2, 85, 12, count >= 3 ? 'rainbow' : count === 2 ? '#ff6a8a' : '#7fd3f7', 'center', now);
        once(`next${count}`, 'reach');
    }

    // ----- 全回転 (プレミア。ユーザー指定 2026-10-20) -----
    function drawZenkaiten(now, plan, phase) {
        if (phase.name !== 'zenkaiten' && phase.name !== 'zend') return;
        const kind = CONFIG.show.zenkaiten.kinds[plan.zenkaiten];
        // 虹色の枠
        ctx.fillStyle = rainbow(now);
        ctx.fillRect(0, 0, W, 3);
        ctx.fillRect(0, H - 3, W, 3);
        ctx.fillRect(0, 0, 3, H);
        ctx.fillRect(W - 3, 0, 3, H);
        if (phase.name === 'zenkaiten') {
            if (phase.local < 0.3) {
                ctx.fillStyle = `rgba(255, 255, 255, ${0.9 - phase.local * 3})`;
                ctx.fillRect(0, 0, W, H);
            }
            band(4, 22, 0.6);
            text('全回転！！', W / 2, 15, 18, 'rainbow', 'center', now);
            once('zenkaiten', 'win');
        }
        band(108, 18, 0.6);
        fitCenter(`${kind.name} 全回転`, W / 2, 117, 12, '#ffe066', W - 16);
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
        } else if (plan.challenge === 'music') {
            // おかがっぱの DJ に合わせてこおりくんが踊る。音符が流れる
            Characters.drawEnemy(ctx, 'okagappa', 196, 122, { scale: 1.6, frame });
            ctx.fillStyle = '#2a2a3a';
            ctx.fillRect(168, 104, 56, 18);
            ctx.fillStyle = '#4fe0ff';
            ctx.fillRect(174, 108, 12, 4);
            ctx.fillStyle = '#ff4fa0';
            ctx.fillRect(194, 108, 12, 4);
            const dance = Math.floor(now * 6) % 2;
            drawSprite(ctx, SPRITES.koori, dance ? 'walk1' : 'walk2', 60 + (dance ? 3 : -3), 92 - Math.abs(Math.sin(now * 6)) * 6, 2);
            for (let i = 0; i < 4; i++) {
                const x = (now * 50 + i * 60) % 200 + 20;
                text('♪', x, 70 + Math.sin(now * 4 + i) * 6, 12, reveal && !success ? '#5a5a6a' : ['#ffe066', '#4fe0ff', '#ff4fa0', '#7aff6a'][i]);
            }
        } else if (plan.challenge === 'wrestling') {
            // シバターとプロレス: リングのロープ、組み合う
            ctx.fillStyle = '#c8c0d8';
            ctx.fillRect(10, 128, W - 20, 6);
            ['#ff4a4a', '#ffffff', '#4a8aff'].forEach((c, i) => {
                ctx.fillStyle = c;
                ctx.fillRect(10, 96 + i * 9, W - 20, 2);
            });
            ctx.fillStyle = '#8a8a96';
            ctx.fillRect(8, 92, 4, 42);
            ctx.fillRect(W - 12, 92, 4, 42);
            const grapple = Math.sin(now * 5) * 6;
            Characters.drawEnemy(ctx, 'shibata', 150 - grapple, 128, { scale: 1.6, frame });
            drawSprite(ctx, SPRITES.koori, frame ? 'walk1' : 'walk2', 96 + grapple, 96, 2);
            if (reveal && success) text('1, 2, 3！', W / 2, 90, 12, '#ffe066');
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
        text(c.name, W / 2 + 24, 39, c.name.length > 14 ? 10 : 11, '#ffe066');
        ctx.fillStyle = '#10182a';
        ctx.fillRect(86, 54, 160, 8);
        ctx.fillStyle = success && reveal ? rainbow(now) : '#7fd3f7';
        ctx.fillRect(87, 55, Math.round(158 * gauge), 6);
        if (reveal) {
            const word = {
                treasure: ['お宝発見！', 'からっぽ…'], music: ['ノリノリ！', '音ズレ…'], wrestling: ['3カウント！', '場外負け…'],
                training: ['特訓成功！', 'ヘトヘト…'], bento: ['お弁当完成！', 'こげちゃった…']
            }[plan.challenge];
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
    // 復活 (plan.revival): result では負けて見せ、rv○○ の場面は RashView.drawRevival、最後の rvkill で撃破する
    function drawBattle(now, plan, phase) {
        if (plan.revival) {
            if (phase.name === 'rvkill') {
                plan = { ...plan, revival: false };
                phase = { ...phase, name: 'result' };
            } else if (phase.name.startsWith('rv')) {
                RashView.drawRevival(now, plan, phase);
                return;
            } else {
                plan = { ...plan, win: false };
            }
        }
        // リーチの発展: 発展するまでは SP の相手 (plan.develop.from) を見せる
        if (plan.develop && (phase.name === 'reach' || (phase.name === 'develop' && phase.local < DEVELOP_SWITCH))) {
            plan = { ...plan, enemy: plan.develop.from, sp: 'SP' };
        }
        const b = plan.enemyInfo || CONFIG.show.battles[plan.enemy];
        const frame = Math.floor(now * 4) % 2;
        const ground = 128;
        const scale = enemyScale(plan.enemy, 70);
        let ex = 196, kx = 50, enemyHurt = false, kooriHurt = false, enemyAlpha = 1, kooriDown = false;
        let enemyHp = 1, kooriHp = 1;

        if (phase.name === 'roll') {
            ex = 196 + Math.max(0, 1 - phase.local / 0.8) * 90;           // こおりRASH: 右から入ってくる
        } else if (phase.name === 'reach') {
            ex = 196 + Math.max(0, 1 - (phase.local - 1.4) / 0.8) * 90;   // リーチのあと、右から入ってくる
        } else if (phase.name === 'develop') {
            // 発展: SP の相手がぶるぶる震える → 「発展！！」で光る → SPSP の相手が右から入ってくる
            const l = phase.local;
            if (l < DEVELOP_SWITCH) {
                ex = 196 + Math.sin(now * 40) * 2;
                enemyHurt = l > 0.6 && Math.floor(now * 12) % 2 === 0;
            } else ex = 196 + Math.max(0, 1 - (l - DEVELOP_SWITCH) / 0.6) * 90;
            once('develop', 'reach');
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
                enemyHp = (plan.summon ? 0 : plan.pursuit ? PURSUIT_HP : 0.4) * (1 - k);
            } else {
                ex = 196 - Math.sin(Math.min(1, k * 1.5) * Math.PI) * 110;
                kooriHurt = k < 1;
                kooriDown = k >= 0.5;
                kooriHp = 0.6 * (1 - k);
                enemyHp = plan.pursuit ? PURSUIT_HP : 0.4;
            }
        } else if (phase.name === 'pursuit') {
            // 追撃チャンス: 「追撃チャンス！」のあと、こおりくんが2回攻撃して相手の体力を 0.4 → PURSUIT_HP に削る
            const l = phase.local;
            const hit = Math.floor((l - PURSUIT_START) / PURSUIT_TURN);   // 何回目の攻撃か (0, 1)
            const inTurn = ((l - PURSUIT_START) % PURSUIT_TURN) / PURSUIT_TURN;
            const done = Math.max(0, Math.min(2, hit + (inTurn > 0.5 ? 1 : 0)));
            enemyHp = 0.4 - (0.4 - PURSUIT_HP) * done / 2;
            kooriHp = 0.6;
            if (l >= PURSUIT_START && hit < 2) {
                kx += Math.sin(Math.min(1, inTurn * 2) * Math.PI) * 70;
                enemyHurt = inTurn > 0.35 && inTurn < 0.65;
                once(`pursuit${hit}`, 'attack');
            }
        } else if (phase.name === 'summon') {
            // お仲間召喚: 画面が光って仲間が上から降りてくる → 相手に体当たり → 体力が 0 に (撃破確定)
            const l = phase.local;
            enemyHp = l < SUMMON_STRIKE ? 0.4 : 0;
            kooriHp = 0.6;
            enemyHurt = l >= SUMMON_STRIKE && l < SUMMON_STRIKE + 0.6 && Math.floor(now * 12) % 2 === 0;
            if (l >= SUMMON_STRIKE) once('summonHit', 'attack');
        }

        if (enemyAlpha > 0) Characters.drawEnemy(ctx, plan.enemy, ex, ground, { scale, frame, hurt: enemyHurt, alpha: enemyAlpha, kai: plan.kai });
        if (plan.cheer && phase.name !== 'roll') drawCheer(now, plan, phase, ground);
        if (plan.summon && (phase.name === 'summon' || phase.name === 'result')) drawSummoned(now, plan, phase, ground, frame);
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
        // 名前の色: 確定の相手は虹、怪は紫、おにおには赤。長い名前は小さく
        const titleColor = b.win >= 1 ? 'rainbow' : plan.kai ? '#c070ff' : plan.enemy === 'onioni' ? '#ff3a3a' : '#ffffff';
        text(`VS ${b.name}`, W / 2 + 34, 40, b.name.length > 10 ? 10 : 12, titleColor, 'center', now);
        // 通常時のバトル: SPリーチ / SPSPリーチ (最終決戦)
        if (plan.fig === 1 && plan.sp) {
            const spsp = plan.sp === 'SPSP';
            text(spsp ? 'SPSPリーチ 最終決戦' : 'SPリーチ', W - 6, 9, 9, spsp ? '#ff6a3a' : '#7fd3f7', 'right');
        }
        if (phase.name === 'develop' && phase.local >= DEVELOP_SWITCH - 0.25) {
            const k = phase.local - (DEVELOP_SWITCH - 0.25);
            if (k < 0.35) {
                ctx.fillStyle = `rgba(255, 255, 255, ${0.9 - k * 2.5})`;
                ctx.fillRect(0, 0, W, H);
            }
            if (k < 1.2) {
                band(62, 30, 0.6);
                text('発展！！', W / 2, 77, 24, 'rainbow', 'center', now);
            }
        }
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
        if (phase.name === 'pursuit') {
            if (phase.local < PURSUIT_START + 0.2) {
                band(62, 30, 0.6);
                text('追撃チャンス！', W / 2, 77, 22, Math.floor(now * 8) % 2 ? '#ffe066' : '#ff3a3a');
            } else if (phase.local >= PURSUIT_START + PURSUIT_TURN * 2) {
                band(66, 26, 0.55);
                text('追加ダメージ！', W / 2, 79, 20, '#ff9a3a');
            }
        }
        if (phase.name === 'summon' && phase.local < 0.25) {
            // 召喚の光
            ctx.fillStyle = `rgba(255, 255, 255, ${0.9 - phase.local * 3})`;
            ctx.fillRect(0, 0, W, H);
        }
        if (phase.name === 'summon' && phase.local >= 0.2 && phase.local < SUMMON_STRIKE) {
            band(62, 30, 0.6);
            text(phase.local < 0.9 ? 'お仲間召喚！' : `${CONFIG.show.summon.members[plan.summon]} 参上！`, W / 2, 77, 20, 'rainbow', 'center', now);
        }
        if (phase.name === 'result' && phase.local >= 0.3 && phase.local < 0.9) {
            band(66, 26, 0.55);
            text(plan.win ? '撃破！！' : '敗北…', W / 2, 79, 22, plan.win ? '#ffe066' : '#8aa4c0');
        }
    }
    let lastTurn = -1;

    // 追撃チャンス: 「追撃チャンス！」の秒 (PURSUIT_START) のあと PURSUIT_TURN 秒ごとに2回攻撃。削ったあとの相手の体力が PURSUIT_HP
    const PURSUIT_START = 0.9, PURSUIT_TURN = 0.75, PURSUIT_HP = 0.1;
    // リーチの発展: この秒で SP の相手から SPSP の相手に変わる
    const DEVELOP_SWITCH = 1.1;

    // ----- 群予告 (ユーザー指定 2026-10-20): キャラの群れが右から左へ横切る -----
    function drawGun(now, plan, phase) {
        const g = CONFIG.show.gun.kinds[plan.gun];
        const p = phase.local / phase.t;
        for (let i = 0; i < 14; i++) {
            // 列ごとに少しずつずらして、画面の右の外から左の外へ
            const x = W + 40 - (p * (W + 120)) + (i % 5) * 26 + (i % 3) * 9;
            const foot = 52 + (i % 4) * 26 + (i % 2) * 6;
            drawInfoPortrait(g.who, x, foot, 24, 26, now + i * 0.2);
        }
        band(4, 22, 0.6);
        text(`${g.name}！`, W / 2, 15, 16, g.reliability >= 1 ? 'rainbow' : '#ffe066', 'center', now);
        once('gun', 'challenge');
    }

    // ----- こおりカットイン (ユーザー指定 2026-10-20): 色の帯の上に大きなこおりくんとセリフ。金はきらめく -----
    function drawCutin(now, plan, phase) {
        const c = CONFIG.show.cutin;
        const color = c.colors[plan.cutin].color;
        const slide = Math.max(0, 1 - phase.local / 0.25);
        ctx.save();
        ctx.translate(-slide * W, 0);
        ctx.fillStyle = color;
        ctx.globalAlpha = 0.85;
        ctx.beginPath();
        ctx.moveTo(0, 34);
        ctx.lineTo(W, 22);
        ctx.lineTo(W, 108);
        ctx.lineTo(0, 120);
        ctx.closePath();
        ctx.fill();
        ctx.globalAlpha = 1;
        if (plan.cutin === 'gold') {
            // 金: 光の筋が流れる
            ctx.fillStyle = 'rgba(255, 255, 255, 0.45)';
            const sx = ((now * 220) % (W + 60)) - 30;
            ctx.fillRect(sx, 22, 12, 98);
        }
        drawSprite(ctx, SPRITES.koori, 'walk1', 14, 40, 4.5);
        fitCenter(c.lines[plan.cutin], 172, 72, 22, plan.cutin === 'gold' && Math.floor(now * 8) % 2 ? '#fff6c0' : '#ffffff', 150);
        ctx.restore();
        once('cutin', plan.cutin === 'gold' ? 'win' : plan.cutin === 'red' ? 'reach' : 'success');
    }

    // ----- 盤面の役物 (ユーザー指定 2026-10-20) -----
    // 当たりの見込みが高いリーチで、バトルの始めに屋根のこおりくんが液晶の前へ落ちてくる。進み具合 (0〜1) を返す (盤面が描く。js/render.js)
    function gimmick() {
        const plan = spinView && spinView.plan;
        const phase = currentPhase;
        if (!plan || !plan.gimmick || !phase || phase.name !== 'battle') return null;
        const t = phase.local / CONFIG.show.gimmick.time;
        if (t >= 1) return null;
        once('gimmick', 'hurt');
        if (t > 0.25) once('gimmickWin', 'win');
        return t;
    }
    // お仲間召喚: 仲間が降りてくる (〜SUMMON_LAND 秒) → SUMMON_STRIKE 秒で相手に体当たり
    const SUMMON_LAND = 0.9, SUMMON_STRIKE = 1.8;

    // 変動の中で1回だけ鳴らす音 (key は変動ごと)
    function once(key, name) {
        if (!spinView) return;
        if (!spinView.played) spinView.played = new Set();
        if (spinView.played.has(key)) return;
        spinView.played.add(key);
        Sound.play(name);
    }

    // お仲間の応援 (こおりRASH のバトル。ユーザー指定 2026-10-20): こおりくんのうしろで 1〜3人 がぴょんぴょん跳ねる。
    // 召喚された仲間は、召喚のあとは応援の列から抜ける (drawSummoned が描く)
    const CHEER_ORDER = ['yasu', 'tamu', 'dake'];
    function drawCheer(now, plan, phase, ground) {
        const summoned = plan.summon && (phase.name === 'summon' || phase.name === 'result') ? plan.summon : null;
        CHEER_ORDER.slice(0, plan.cheer).forEach((id, i) => {
            if (id === summoned) return;
            const hop = Math.abs(Math.sin(now * 6 + i * 1.3)) * 4;
            Characters.drawCompanion(ctx, id, 10 + i * 14, ground - hop, { scale: 1, frame: Math.floor(now * 4 + i) % 2 });
        });
        if (phase.name === 'battle' && !phase.pushing) {
            const all = plan.cheer >= 3;
            text(all ? '全員で応援！' : 'がんばれー！', 4, 96, all ? 9 : 8, all ? 'rainbow' : '#ffe066', 'left', now);
        }
    }

    // お仲間召喚の仲間 (やすさん・たむさん・だけさん)。こおりくんと相手のあいだに降りてきて、相手に体当たりする
    function drawSummoned(now, plan, phase, ground, frame) {
        const l = phase.name === 'summon' ? phase.local : Infinity;
        const homeX = 116;
        let x = homeX, y = ground;
        if (l < SUMMON_LAND) y = ground - (1 - l / SUMMON_LAND) * 120;   // 上から降りてくる
        else if (l >= SUMMON_STRIKE - 0.4 && l < SUMMON_STRIKE + 0.5) {
            const k = (l - (SUMMON_STRIKE - 0.4)) / 0.9;
            x = homeX + Math.sin(k * Math.PI) * 50;
        }
        // 足もとの光 (降りてきたところ)
        if (l < SUMMON_STRIKE) {
            ctx.fillStyle = rainbow(now, x);
            ctx.globalAlpha = 0.5;
            ctx.fillRect(x - 18, ground - 2, 36, 3);
            ctx.globalAlpha = 1;
        }
        Characters.drawCompanion(ctx, plan.summon, x, y, { scale: 2, frame });
    }

    // ----- 保留 (こおりくんの体の形) -----
    // color: 保留の色 ('black' は RASH 中の黒い保留) / spin: 回る保留 (RASH 中)
    function holdIcon(x, y, size, color, now, active = false, spin = false) {
        if (spin) {
            ctx.save();
            ctx.translate(x, y);
            ctx.rotate(now * 6);
            ctx.translate(-x, -y);
            holdIcon(x, y, size, color, now, active, false);
            ctx.restore();
            return;
        }
        const fill = color === 'rainbow' ? rainbow(now, x * 3) : color === 'black' ? '#141418' : CONFIG.show.holdColors.colors[color] || '#e8f6ff';
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
        ctx.fillStyle = color === 'black' ? '#ff3a3a' : '#10162a';
        const eye = Math.max(1, Math.round(s / 8));
        ctx.fillRect(Math.round(x - s / 5), Math.round(y - s / 10), eye, eye * 2);
        ctx.fillRect(Math.round(x + s / 5 - eye), Math.round(y - s / 10), eye, eye * 2);
    }

    function drawHolds(now, m) {
        if (m.rush.challenge) {
            m.holds[1].forEach((h, i) => holdIcon(14 + i * 13, 136, 10, h.shownColor || h.holdColor, now));
        drawHoldFx(now, m);
            RashView.drawChallengeHolds(now, m);
            return;
        }
        m.holds[1].forEach((h, i) => holdIcon(14 + i * 13, 136, 10, h.shownColor || h.holdColor, now));
        drawHoldFx(now, m);
        for (let i = m.holds[1].length; i < CONFIG.machine.holdMax; i++) {
            ctx.fillStyle = 'rgba(255, 255, 255, 0.12)';
            ctx.fillRect(10 + i * 13, 132, 8, 8);
        }
        m.holds[2].forEach((h, i) => holdIcon(W - 14 - i * 13, 136, 10, h.rashHold === 'black' ? 'black' : 'white', now, false, h.rashHold === 'spin'));
        // 変動中の保留 (当該保留) は真ん中の下に大きく
        if (m.spin && m.spin.fig === 1 && !m.bonus) holdIcon(W / 2, 134, 12, m.spin.result.shownColor || m.spin.result.holdColor, now, true);
    }

    // ----- ふるカワ -----
    function drawFurukawa(now) {
        if (!bubble || now >= bubble.until || (bubble.from && now < bubble.from)) return;
        const talkFrame = Math.floor(now * 6) % 2 ? 'talk' : 'idle';
        drawSprite(ctx, SPRITES.furukawa, talkFrame, W - 34, H - 46, 1.6);
        const colors = CONFIG.show.furukawa.colors;
        const color = colors[bubble.color] || '#ffffff';
        // 長いセリフは文字を小さくして吹き出しに収める
        let size = 10;
        ctx.font = `${size}px ${FONT}`;
        while (size > 7 && ctx.measureText(bubble.text).width + 12 > W - 60) {
            size--;
            ctx.font = `${size}px ${FONT}`;
        }
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
        text(bubble.text, bx + width / 2, by + 9, size, color, 'center', now);
    }

    // ----- 大当たり中 -----
    function drawBonus(now, m) {
        const b = m.bonus;
        band(0, H, 0.45);
        Figures.draw(ctx, shown[0], 22, 30, 26, 30, { glow: 0.5 });
        const hidden = b.promote && !b.promote.done && !b.promote.toV;   // V への昇格は出玉を隠さない
        text(hidden ? '大当たり' : `${b.alloc.label}個 大当たり`, W / 2 + 14, 13, 14, '#ffe066');
        // ROUND と COUNT は1行に (下に紹介のカードを出すため)
        text(hidden ? `ROUND ${Math.max(1, b.round)}` : `ROUND ${Math.max(1, b.round)} / ${b.alloc.rounds}`, W / 2 - 6, 31, 15, '#ffffff');
        if (b.phase === 'open') text(`COUNT ${b.count} / ${b.alloc.count || CONFIG.machine.bonus.count}`, W - 38, 31, 10, '#7fd3f7');
        drawInfoCard(now, m);
        text('右打ち →', W / 2, 113, 12, Math.floor(now * 3) % 2 ? '#ff6a8a' : '#ffffff');
        // RASH の2回目からは、ラウンド中にボタンで切り替え
        if (!choosing && m.rush.active && !m.rush.challenge && m.rush.hits > 2) {
            band(118, 16, 0.6);
            text(`ボタンで切り替え: ${rashName()}`, W / 2, 126, 10, rashMode === 'onioni' ? '#ff6a6a' : '#7fd3f7');
        }
        if (choosing) {
            band(90, 36, 0.75);
            text('どっちの RASH にする？', W / 2, 99, 11, '#ffffff');
            const modes = CONFIG.show.rash.modes;
            text(modes.koori.name, W / 2 - 52, 116, 13, m.rashMode === 'koori' ? '#ffe066' : '#8aa4c0');
            text(modes.onioni.name, W / 2 + 52, 116, 13, m.rashMode === 'onioni' ? '#ff6a6a' : '#8aa4c0');
        }
    }

    // ----- ラウンド中の紹介 (ユーザー指定 2026-10-19。js/round-info.js) -----
    // キャラ紹介・ゲームの説明・舞台設定・ストーリーのカードを RoundInfo.SECONDS 秒ごとに順に出す。
    // 次の大当たりは続きのカードから (同じカードばかりにならないように)
    let infoCards = null;
    let infoBase = 0;        // これまでの大当たりで出したカードの数
    let infoStart = null;    // いまの大当たりでカードを出しはじめた時刻
    const INFO_KIND_COLORS = { 'キャラ紹介': '#ff9ec8', 'ゲームの説明': '#7fd3f7', '舞台設定': '#3fdf6f', 'ストーリー': '#ffe066' };

    function infoIndex(now) {
        return infoBase + (infoStart === null ? 0 : Math.max(0, Math.floor((now - infoStart) / RoundInfo.SECONDS)));
    }

    // 文字が幅に収まるよう、大きさを小さくする
    function fitText(str, x, y, size, color, maxW) {
        let s = size;
        ctx.font = `${s}px ${FONT}`;
        while (s > 7 && ctx.measureText(str).width > maxW) {
            s--;
            ctx.font = `${s}px ${FONT}`;
        }
        text(str, x, y, s, color, 'left');
    }

    // カードの絵: キャラクター (こおりくん・ともいし・ふるカワはドット絵、敵は Characters)。companions は3人並べる
    function drawInfoPortrait(who, cx, footY, maxW, maxH, now) {
        const frame = Math.floor(now * 3) % 2;
        if (who === 'companions') {
            ['yasu', 'tamu', 'dake'].forEach((id, i) => {
                const size = Characters.size(id);
                Characters.drawCompanion(ctx, id, cx - 12 + i * 12, footY, { scale: Math.min(12 / size.w, maxH / size.h), frame });
            });
            return;
        }
        const sprite = SPRITES[who];
        if (sprite) {
            const frameName = who === 'koori' ? (frame ? 'walk1' : 'walk2') : 'idle';
            const rows = sprite.frames[frameName] || sprite.frames[Object.keys(sprite.frames)[0]];
            const scale = Math.min(maxW / rows[0].length, maxH / rows.length);
            drawSprite(ctx, sprite, frameName, cx - rows[0].length * scale / 2, footY - rows.length * scale, scale);
            return;
        }
        const size = Characters.size(who);
        if (Characters.isCompanion(who)) Characters.drawCompanion(ctx, who, cx, footY, { scale: Math.min(maxW / size.w, maxH / size.h), frame });
        else if (size.w) Characters.drawEnemy(ctx, who, cx, footY, { scale: Math.min(maxW / size.w, maxH / size.h), frame });
    }

    function drawInfoCard(now, m) {
        if (!infoCards) infoCards = RoundInfo.cards(CONFIG, m.specId);
        if (infoStart === null) infoStart = now;   // 前回の続きで大当たりの途中から始めたとき
        if (now < infoStart) return;
        const index = infoIndex(now);
        const card = infoCards[index % infoCards.length];
        const local = (now - infoStart) % RoundInfo.SECONDS;
        const top = 42, bottom = 88;   // ふるカワの吹き出し (右下) と重ならない高さ
        ctx.save();
        ctx.globalAlpha = Math.min(1, local / 0.3);
        ctx.fillStyle = 'rgba(8, 16, 34, 0.85)';
        ctx.fillRect(4, top, W - 8, bottom - top);
        ctx.fillStyle = INFO_KIND_COLORS[card.kind] || '#ffffff';
        ctx.fillRect(4, top, W - 8, 1);
        const textX = card.who ? 58 : 12;
        if (card.who) drawInfoPortrait(card.who, 30, bottom - 3, 40, 38, now);
        text(`【${card.kind}】`, W - 8, top + 7, 8, INFO_KIND_COLORS[card.kind] || '#ffffff', 'right');
        fitText(card.title, textX, top + 8, 11, '#ffffff', W - textX - 62);
        card.lines.forEach((line, i) => fitText(line, textX, top + 19 + i * 9, 9, '#d8e8ff', W - textX - 8));
        ctx.restore();
    }

    // ----- 1フレーム -----
    function background(m, plan, phase) {
        if (m.bonus) return 'goldHall';
        if (plan && phase) {
            if (plan.kind === 'challenge') return CONFIG.show.challengeBattle.map;
            if (plan.kind === 'onioni') return plan.pattern === 'fullMoon' && (phase.name === 'anomaly' || phase.name === 'open') ? 'fullMoon' : 'castleHall';
            if (plan.kind === 'rashBattle') return plan.enemyInfo.map;
            if (phase.name === 'challenge') return CONFIG.show.challenges[plan.challenge].map;
            if (['reach', 'develop', 'cutin', 'battle', 'pursuit', 'result'].includes(phase.name)) return CONFIG.show.battles[plan.enemy].map;
        }
        if (m.rush.active && rashMode === 'onioni' && !m.rush.challenge) return 'castleHall';
        if (Machine.inJitan(m) || m.rush.active) return 'seCastle';
        return Scenario.stageMap(m.stage);
    }

    function phaseSounds(plan, phase) {
        const key = phase ? `${phase.index}` : null;
        if (key === lastPhase) return;
        lastPhase = key;
        if (!phase) return;
        if (phase.name === 'challenge') Sound.play('challenge');
        if (phase.name === 'fail') Sound.play('fail');
        if (phase.name === 'reach') Sound.play('reach');
        if (phase.name === 'result' || phase.name === 'cresult') Sound.play(plan.win && !plan.revival ? 'win' : 'lose');   // 復活は一度負けて見せる
        if (phase.name === 'pursuit' || phase.name === 'summon') Sound.play('success');
        if (phase.name === 'rvdark') Sound.play('fail');
        if (phase.name === 'rvsoredemo') Sound.play('reach');
        if (phase.name === 'rvflash') Sound.play('win');
        if (phase.name === 'rvkill') Sound.play('attack');
        if (phase.name === 'cintro' || phase.name === 'cfinal') Sound.play('reach');
        if (phase.name === 'cextra') Sound.play('success');
        if (phase.name === 'cround') Sound.play('attack');
        if (phase.name === 'anomaly') Sound.play('challenge');
        if (phase.name === 'dark') Sound.play('hurt');
        if (phase.name === 'bokoori' || phase.name === 'atari') Sound.play('reach');
        if (phase.name === 'itadaki') Sound.play('win');
        if (phase.name === 'open') Sound.play('win');
    }

    // おにおにRASH の違和感: 画面の上下反転・白黒
    let effectCanvas = null;
    function applyEffect(fx) {
        if (!fx) return;
        if (!effectCanvas) {
            effectCanvas = document.createElement('canvas');
            effectCanvas.width = W;
            effectCanvas.height = H;
        }
        const g = effectCanvas.getContext('2d');
        g.clearRect(0, 0, W, H);
        g.drawImage(canvas, 0, 0);
        ctx.save();
        ctx.clearRect(0, 0, W, H);
        if (fx === 'flip') {
            // 左右反転
            ctx.translate(W, 0);
            ctx.scale(-1, 1);
        } else if (fx === 'upsideDown') {
            // 上下逆
            ctx.translate(0, H);
            ctx.scale(1, -1);
        } else if (fx === 'mono') {
            ctx.filter = 'grayscale(1) contrast(1.2)';
        } else if (fx === 'shake') {
            // ゆれる
            ctx.translate(Math.round((Math.random() - 0.5) * 6), Math.round((Math.random() - 0.5) * 4));
        }
        ctx.drawImage(effectCanvas, 0, 0);
        ctx.restore();
    }

    function draw(now, m) {
        ctx.imageSmoothingEnabled = false;
        const plan = m && m.spin && spinView ? spinView.plan : null;
        const phase = plan ? phaseAt(plan, m.spin.elapsed) : null;
        if (phase && (phase.name === 'battle' || phase.name === 'cfinal')) phase.pushing = phase.local >= phase.t - CONFIG.show.pushTime;
        currentPhase = phase;
        reverseText = Boolean(plan && plan.kind === 'onioni' && plan.pattern === 'reverse' && phase && phase.name === 'anomaly');
        if (m) rashMode = m.rashMode;
        machineRef = m;
        // オープニング・エンディング中は、それだけを描く
        if (Story.draw(now)) {
            MachineButton.prompt(false);
            return canvas;
        }
        const rushing = m && (Machine.inJitan(m) || m.rush.active);
        Backgrounds.draw(ctx, m ? background(m, plan, phase) : 'tsugakuro', now * (rushing ? 40 : 18));
        if (!m) return canvas;
        phaseSounds(plan, phase);

        // バトル中は PUSH の案内を台のボタンにも出す
        MachineButton.prompt(Boolean(phase && phase.pushing && spinView.pushedAt === null));

        if (m.bonus) {
            drawBonus(now, m);
            drawPromote(now);
        }
        else {
            if (plan && plan.kind === 'blackout') RashView.drawBlackout(now, plan, phase);
            else if (plan && plan.kind === 'challenge' && phase.name !== 'roll') RashView.drawChallenge(now, plan, phase, m, spinView);
            else if (plan && plan.kind === 'onioni' && plan.pattern) RashView.drawOnioniRash(now, plan, phase);
            else if (m.rush.active && !m.rush.challenge && rashMode === 'onioni' && (!plan || (plan.kind !== 'rashBattle' && plan.kind !== 'blackout'))) {
                // おにおにRASH の外れ: 眠っているおにおに
                RashView.drawOnioniRash(now, { pattern: null }, { name: 'roll', local: 0, t: 1 });
            }
            if (phase && phase.name === 'challenge') drawChallenge(now, plan, phase);
            if (phase && (plan.kind === 'rashBattle' || (phase.name === 'reach' && phase.local >= 1.4) || ['develop', 'cutin', 'battle', 'pursuit'].includes(phase.name) || (phase.name === 'result' && phase.local < 0.6))) {
                // こおりRASH の結果は 0.6 秒から図柄を大きく出す (復活の負けの result はそのまま、撃破の rvkill も同じ)
                const bigReels = (phase.name === 'result' && !plan.revival) || phase.name === 'rvkill';
                if (plan.kind !== 'rashBattle' || !(bigReels && phase.local >= 0.6)) drawBattle(now, plan, phase);
            }
            // 突破チャレンジで保留をためているところ
            if (m.rush.challenge && !m.challengeRun && !m.spin && Machine.inJitan(m)) {
                band(60, 34, 0.55);
                text('突破チャレンジ！ 保留をためろ！', W / 2, 70, 13, '#ff6a6a');
                for (let i = 0; i < CONFIG.machine.holdMax; i++) {
                    ctx.fillStyle = i < m.holds[2].length ? '#ffe066' : 'rgba(255,255,255,0.25)';
                    ctx.fillRect(W / 2 - 30 + i * 16, 82, 10, 8);
                }
            }
            const state = drawReels(now, plan, phase);
            if (phase && phase.name === 'stepup') drawStepUp(now, plan, phase);
            if (phase && phase.name === 'gun') drawGun(now, plan, phase);
            if (phase && phase.name === 'cutin') drawCutin(now, plan, phase);
            // 後告知: 図柄が止まったあと、ボタンが虹色に光って図柄がそろう
            if (phase && phase.name === 'postnotice' && phase.local >= 0.4 && !(spinView.played && spinView.played.has('postnotice'))) {
                MachineButton.trigger('rainbow', now);
                once('postnotice', 'win');
            }
            if (phase && phase.name === 'next') drawNext(now, plan, phase);
            if (plan && plan.type === 'zenkaiten' && phase) drawZenkaiten(now, plan, phase);
            // 擬似連のあと (チャレンジのあいだ) は右上に「擬似〇連」
            if (plan && plan.gizi && phase && phase.name === 'challenge') text(`擬似${plan.gizi + 1}連`, W - 6, 9, 9, '#ffe066', 'right');
            if (phase && phase.name === 'reach' && phase.local >= 0.6 && phase.local < 1.4) {
                band(104, 20, 0.6);
                text('リーチ！', W / 2, 114, 18, Math.floor(now * 6) % 2 ? '#ff6a8a' : '#ffe066');
            }
            if (state.aligned && plan && plan.win) text('大当たり！', W / 2, 18, 14, 'rainbow', 'center', now);
            const left = m.jitanLeft + (m.spin && m.spin.jitan ? 1 : 0);
            const onioniSpin = plan && plan.kind === 'onioni' && !(phase && phase.name === 'open');
            if (m.rush.active && !m.rush.challenge && (onioniSpin || !(plan && plan.kind !== 'plain' && plan.fig === 2)) && !(plan && plan.kind === 'blackout')) {
                text(Machine.inJitan(m) ? `${rashName()} ${m.rush.hits - 1}連  時短 残り ${left}回` : `${rashName()} ${m.rush.hits - 1}連  残り保留`, W / 2, 112, 11, '#7fd3f7');
            }
            if (m.yutime) {
                band(98, 26, 0.5);
                text('遊タイム', W / 2, 105, 12, 'rainbow', 'center', now);
                text(Machine.inJitan(m) ? `時短 残り ${left}回  当たれば RASH 突入！` : '残り保留', W / 2, 117, 10, '#ffffff');
            }
        }

        // ふるカワのバトルの返事・撃破のひとこと
        if (plan && phase && ((phase.name === 'reach' && phase.local >= 1.6) || (plan.fig === 2 && phase.index === 0 && phase.local >= 0.5)) && plan.reply && (!bubble || bubble.key !== 'reply' + m.stats.spins1)) {
            say(plan.reply, 0, now);
            bubble.key = 'reply' + m.stats.spins1;
        }
        const reveal = plan && plan.reveal ? plan.reveal : { phase: 'result', at: 0.6 };
        const spinKey = 'defeat' + m.stats.spins1 + ':' + m.stats.spins2;
        if (plan && phase && phase.name === reveal.phase && plan.defeatLine && phase.local > reveal.at && (!bubble || bubble.key !== spinKey)) {
            say(plan.defeatLine, plan.defeatColor ?? 5, now);
            bubble.key = spinKey;
        }
        drawRashCount(now);
        if (renchan) {
            const t = now - renchan.start;
            if (t > RENCHAN_TIME) renchan = null;
            else {
                RashView.drawRenchan(now, t, renchan.games, rashMode);
                if (t > 1.4 && (!bubble || bubble.key !== 'renchan')) {
                    say(CONFIG.show.furukawa.congratsLine, 6, now);
                    if (bubble) bubble.key = 'renchan';
                }
            }
        }
        if (!m.bonus && !(plan && plan.fig === 1 && phase && phase.name !== 'roll')) drawStageFx(now);
        drawHolds(now, m);
        drawFurukawa(now);

        drawRashLeft(now, m, plan, phase);
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
                text(`${rashName()} 終了`, W / 2, 50, 14, '#ffffff');
                text(`${summary.hits}連  ${summary.balls >= 0 ? '+' : ''}${summary.balls}玉`, W / 2, 76, 18, '#ffe066');
            }
        }
        drawTrophy(now);
        if (flash && now < flash.until) {
            const t = 1 - (flash.until - now) / flash.length;
            band(44, 44, 0.45);
            text(flash.text, W / 2, 66, 20 + Math.round(Math.sin(Math.min(1, t * 4) * Math.PI / 2) * 4), flash.color);
        }
        applyEffect(RashView.postEffect(plan, phase));
        return canvas;
    }

    return { init, reset, draw, event, aim, show, push, setChoosing, gimmick, W, H,
        playStory: (name, now) => Story.play(name, now), skipStory: () => Story.skip(),
        storyPlaying: () => Story.active() ? Story.name : null };
})();
