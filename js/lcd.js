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
    // 2026-10-23 アップグレード P1: 中を 2 倍の 細かさ (512x288) で 描く。座標は 256x144 の まま (文字・丸・光が なめらかに)
    const RES = 2;
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
        canvas.width = W * RES;
        canvas.height = H * RES;
        ctx = canvas.getContext('2d');
        ctx.setTransform(RES, 0, 0, RES, 0, 0);
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
    let leverHold = null;   // 保留を レバーで 変える (2026-10-24): 引くのを 待って いる 保留 { result, current, start }
    let holdStepFx = null;  // 保留が 1 段ずつ 上がる (2026-10-24) { result, current, steps, start, shown }
    let bonusLever = null;  // 大当たり中の レバー (2026-10-24) { start, promote (昇格の 中身。ガセは null), bonus }
    let bonusLabel = 0;     // いまの 大当たりの 出玉 (ガセの レバーを 出す 大当たりか 見る)
    let drawNow = 0;        // いま 描いて いる 時刻 (保留の 段階の 色を 決める)
    let promoteFx = null;   // 図柄の昇格 { start, from, to, bonus }
    let machineRef = null;  // いまの台 (イベントのときに大当たりの中身を見るため)

    // 大当たり中の レバー (2026-10-24 ユーザー指定): 「レバーを引け！ 上乗せチャンス」。引くか time 秒で 結果 (昇格 / 残念…)
    function drawBonusLever(now) {
        if (!bonusLever || now < bonusLever.start) return;
        if (now - bonusLever.start >= CONFIG.show.bonusLever.time) { resolveBonusLever(now); return; }
        band(56, 40, 0.6);
        text('上乗せチャンス！', W / 2, 68, 14, '#ffe066', 'center', now);
        text('レバーを引け！', W / 2, 88, 20, Math.floor(now * 6) % 2 ? '#ffd23a' : '#ff9a3a', 'center', now);
    }
    function resolveBonusLever(now) {
        if (!bonusLever) return;
        const { promote, bonus } = bonusLever;
        bonusLever = null;
        if (promote) promoteFx = { start: now, from: shown[0], to: promote.to, bonus };
        else {
            show('残念…', '#8aa4c0', now, 1.4);
            Sound.play('lose');
        }
    }

    // 図柄の昇格: 偶数の図柄が大きく現れて震え、光って奇数の図柄に変わる →「昇格！」
    function drawPromote(now) {
        drawBonusLever(now);
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

    // 保留の 見せる 色 (レバーを 待って いる 保留は 白の まま)
    const shownHold = h => {
        if (leverHold && leverHold.result === h) return h.question ? 'question' : 'white';
        if (holdStepFx && holdStepFx.result === h) return holdStepFx.steps[Math.min(holdStepFx.steps.length - 1, stepIndex(drawNow))];
        const c = h.shownColor || h.holdColor;
        return c === 'white' && h.question && h.change ? 'question' : c;   // まだ 変わって いない「?」の 保留
    };
    // 保留が 1 段ずつ 上がる: 白 → 青 → … → 本当の 色 (order の 順。いちばん 上の 色だけ なら 1 段)
    const stepIndex = now => holdStepFx ? Math.floor((now - holdStepFx.start) / CONFIG.show.holdStep.stepTime) : 0;
    function startHoldStep(result, current, now) {
        const order = CONFIG.show.holdColors.order;
        const to = order.indexOf(result.holdColor);
        const steps = to > 1 ? order.slice(1, to + 1) : [result.holdColor];
        if (holdStepFx) holdStepFx.steps.length = 0;   // 前の 保留は すぐ 本当の 色に
        holdStepFx = { result, current, steps, start: now, shown: -1 };
    }
    function drawHoldStep(now, m) {
        if (!holdStepFx) return;
        const k = stepIndex(now);
        if (k >= holdStepFx.steps.length) { holdStepFx = null; return; }
        if (k !== holdStepFx.shown) {
            holdStepFx.shown = k;
            holdFx = { result: holdStepFx.result, current: holdStepFx.current, start: now };
            Sound.play(k === holdStepFx.steps.length - 1 ? 'success' : 'hold');
        }
    }
    // 保留の 位置 (変動中の 保留は 真ん中)。いなければ null
    function holdPos(m, result, current) {
        if (current) return { x: W / 2, y: 134 };
        const i = m.holds[1].indexOf(result);
        return i < 0 ? null : { x: 14 + i * 13, y: 136 };
    }
    // 保留を レバーで 変える: 保留の 上に ▼ と、帯に「保留に レバーを引け！」。引くか holdTime 秒で 変わる
    function drawLeverHold(now, m) {
        if (!leverHold) return;
        if (now - leverHold.start >= CONFIG.show.lever.holdTime) { resolveLeverHold(now); return; }
        const pos = holdPos(m, leverHold.result, leverHold.current);
        if (!pos) { leverHold = null; return; }
        band(112, 14, 0.55);
        text('保留に レバーを引け！', W / 2, 119, 10, CONFIG.show.lever.colors.red.color);
        if (Math.floor(now * 6) % 2) text('▼', Math.min(W - 8, Math.max(8, pos.x)), pos.y - 12, 9, '#ffe066', 'center', now);
    }
    function resolveLeverHold(now) {
        if (!leverHold) return;
        startHoldStep(leverHold.result, leverHold.current, now);
        leverHold = null;
    }

    // 保留変化: 変わった保留のまわりに光の輪と「ピキーン！」
    function drawHoldFx(now, m) {
        drawLeverHold(now, m);
        drawHoldStep(now, m);
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
            text(`${rashName()}`, W / 2, 62, 24, rashColor());
            text('継続！', W / 2, 92, 16, '#ffffff');
        }
    }

    function reset() {
        flash = summary = aimNotice = bubble = spinView = stageFx = renchan = holdFx = leverHold = holdStepFx = bonusLever = promoteFx = trophy = null;
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
        if (e.type === 'bonusStart') {
            infoStart = now + CONFIG.machine.bonus.opening;
            bonusLabel = e.label || 0;
            bonusLever = null;
        }
        if (e.type === 'hold' && e.result.extra) {
            // おまけの保留 (突破チャレンジのバトル中に入った): 入ったことを見せない・鳴らさない
        } else if (e.type === 'hold') {
            Sound.play('hold');
            if (e.result.voice) {
                // 入賞時の音 (録音) が鳴って、ボタンが赤く光る
                Sound.playVoice(Boolean(e.result.kai));   // 怪の先バレは おどろおどろしい音
                // こおりRASH の怪の先バレは紫。先バレの 赤・紫は 長めに 光らせる (2026-10-23 ユーザー指定)
                MachineButton.trigger(e.result.kai ? 'purple' : 'red', now, CONFIG.show.voiceButtonTime);
            } else if (e.result.button) MachineButton.trigger(e.result.button, now);
            // レバブル (保留が 入ったとき。カスタマイズで あり のとき)
            const buruOn = Customize.get('leverBuru') !== 'off' && Customize.get('fx') !== 'quiet';   // 演出の 強さ 控えめ でも 出さない
            if (e.result.leverBuru && buruOn) MachineButton.buru(now);
            if (e.result.handleBuru && buruOn) MachineButton.handleBuru(now);   // ハンドルブル (2026-10-24)
        } else if (e.type === 'holdChange' && e.result.leverHold) {
            // 保留を レバーで 変える: 引くまで 白の まま (前の 保留が 待って いたら 先に 変える)
            resolveLeverHold(now);
            leverHold = { result: e.result, current: e.current, start: now };
            Sound.play('lever');
        } else if (e.type === 'holdChange') {
            // 保留変化: ピキーン！ (2026-10-24: 1 段ずつ 上がる)
            startHoldStep(e.result, e.current, now);
        } else if (e.type === 'trophy') {
            trophy = { level: e.level, start: now, until: Infinity };
            Sound.play(e.level === 6 ? 'win' : 'success');
        } else if (e.type === 'spinStart') {
            if (trophy) trophy.until = Math.max(now, trophy.start + summaryTime) + CONFIG.show.settingHint.trophy.minShow;
            spinView = { plan: e.plan, gaugeStop: 0.55 + Math.random() * 0.35, pushedAt: null, pullAt: null };
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
            if (e.premium) {
                // プレミアボーナス (ユーザー指定 2026-10-22): 虹色で「〇〇ボーナス！」
                show(`${e.premium}！ ${e.label}個`, 'rainbow', now, CONFIG.machine.bonus.opening);
                MachineButton.trigger('rainbow', now);
                Sound.play('win');
            } else {
                show(e.promote ? head : `${head} ${e.label}個`, '#ffe066', now, CONFIG.machine.bonus.opening);
                MachineButton.trigger('rainbow', now);   // 当たったら ボタンが 虹色 (2026-10-23 ユーザー指定)
            }
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
            const bl = CONFIG.show.bonusLever;
            if (e.round === 1 && machineRef && machineRef.bonus && machineRef.bonus.promote) {
                const pr = machineRef.bonus.promote;
                // 大当たり中の レバー (2026-10-24): 昇格を「レバーを引け！ 上乗せチャンス」で 見せる ことが ある (V への 昇格は そのまま)
                if (!pr.toV && Math.random() < bl.promote) bonusLever = { start: now + bl.delay, promote: pr, bonus: machineRef.bonus };
                else promoteFx = { start: now + (pr.toV ? CONFIG.show.promote.vDelay : CONFIG.show.promote.delay), from: shown[0], to: pr.to, bonus: machineRef.bonus };
            } else if (e.round === 1 && machineRef && machineRef.bonus && bonusLabel < CONFIG.show.bigLabel && Math.random() < bl.gasa) {
                bonusLever = { start: now + bl.delay, promote: null, bonus: machineRef.bonus };   // ガセ (昇格しない)
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
            // 天国の カットイン (P3): 残りの 保留に 当たりが あれば ときどき (結果の 表示の あと)
            const left = machineRef ? [...machineRef.holds[1], ...machineRef.holds[2]] : [];
            if (CONFIG.show.heavenCutin && left.some(h => h && h.kind === 'hit') && Math.random() < CONFIG.show.heavenCutin.rate) {
                heavenFx = { who: Math.random() < 0.5 ? 'naitei' : 'aruaru', start: now + summaryTime * 0.6 };
            }
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
    const rashColor = () => CONFIG.show.rash.modes[rashMode || CONFIG.show.rash.defaultMode].color;

    // 台のボタンが押された (バトルの PUSH)。how: 'button' 台の ボタン / 'pull' 筐体の レバーを 引いた / 'any' どちらでも (レバーが 出ていないとき)
    //   レバーを引け！ (2026-10-24 ユーザー指定) は レバーを 引いたときだけ。はじめ PUSH！ の ときは、ボタンを 押すと レバーを引け！ に 変わる
    function push(now, how = 'any') {
        if (!(spinView && currentPhase && currentPhase.pushing && spinView.pushedAt === null)) {
            if (how === 'button') return;
            if (leverHold) resolveLeverHold(now);   // 保留を レバーで 変える
            else if (bonusLever && now >= bonusLever.start) resolveBonusLever(now);   // 大当たり中の レバー
            return;
        }
        if (spinView.plan.lever && spinView.pullAt === null && how !== 'pull') { leverOn(now); return; }
        if (spinView.pullAt !== null && how === 'button') return;
        if (spinView.plan.lever && spinView.pullAt === null) spinView.pullAt = now;
        // 長押し (ため) / 連打 (連撃) (2026-10-24 ユーザー指定)。もう一回 引け！ と レバーの ときは 使わない
        const mode = pushModeOf(spinView.plan, currentPhase);
        if (mode === 'long') {
            if (spinView.holdStart == null) spinView.holdStart = now;
            Sound.play('push');
            return;
        }
        if (mode === 'mash') {
            spinView.mash = (spinView.mash || 0) + 1;
            spinView.mashAt = now;
            Sound.play(spinView.mash % 2 ? 'attack' : 'hurt');
            if (spinView.mash < CONFIG.show.pushStyle.mashCount) return;
        }
        spinView.pushedAt = now;
        Sound.play(spinView.pullAt !== null || mode !== 'tap' ? 'pull' : 'attack');
    }
    // ボタンを 離した (長押しの ため を 止める。たまった ぶんは 残る)
    function release(now) {
        if (!spinView || spinView.holdStart == null) return;
        spinView.chargeBase = chargeOf(now);
        spinView.holdStart = null;
    }
    // ため (0〜1)
    function chargeOf(now) {
        if (!spinView) return 0;
        const run = spinView.holdStart != null ? (now - spinView.holdStart) / CONFIG.show.pushStyle.longTime : 0;
        return Math.min(1, (spinView.chargeBase || 0) + run);
    }
    // この 場面の 押し方 (tap / long / mash)。レバーを引け！・もう一回 引け！ は null
    const pushModeOf = (plan, phase) => !plan || plan.lever || !phase || phase.name !== 'battle' ? null : plan.pushMode || 'tap';
    // 長押しの ため の 最中と、ためきって すぐ (押したままの 長押しを 早送りと まちがえない)
    const busy = () => Boolean(currentPhase && currentPhase.pushing && spinView && pushModeOf(spinView.plan, currentPhase) === 'long'
        && (spinView.pushedAt === null || drawNow - spinView.pushedAt < 1.5));
    // 「レバーを引け！」を 出す (PUSH！ から 変わるときは ガコッと 音を 鳴らして レバーを 震わせる)
    function leverOn(now) {
        spinView.pullAt = now;
        if (spinView.plan.leverChange) {
            Sound.play('lever');
            if (Customize.get('fx') !== 'quiet') MachineButton.buru(now);
        }
    }
    // PUSH を 待つ 秒 (レバーを 引くときは 長く)
    const pushTimeOf = plan => plan && plan.lever ? CONFIG.show.lever.time
        : plan && (plan.pushMode === 'long' || plan.pushMode === 'mash') ? CONFIG.show.pushStyle.time : CONFIG.show.pushTime;
    const pushColorOf = plan => (plan && plan.pushColor) || 'white';
    const pushText = id => (CONFIG.show.pushStyle.colors[id] || {}).color || '#ffe066';
    // 引け！の 色 (液晶の 文字・筐体の レバー・台の ボタン)。もう一回 引け！ は 虹
    const leverColorOf = (plan, phase) => phase && phase.name === 'rvagain' ? 'rainbow' : (plan && plan.leverColor) || 'rainbow';
    const leverText = id => (CONFIG.show.lever.colors[id] || {}).color || 'rainbow';

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
        if (n === 'yaku') return { hidden: true };   // 当たりの 役物 (2026-10-24): 液晶は 役物の 背景
        if (plan.crack && CRACK_PHASES.includes(n)) {
            // 1・3・5 の ひび割れ: 止まった 1・3・5 が 割れて、粉砕と 咆哮の あいだは 隠し、7・7・7 で そろう
            if (n === 'xsmash' || n === 'xroar') return { hidden: true };
            return { stop: [true, true, true], big: true };
        }
        if (plan.revival && (n === 'result' || n.startsWith('rv'))) {   // こおりRASH・通常時の 引け！の 復活 (2026-10-24)
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
        if (plan.kind === 'okapipo' && !plan.okaNotice) {
            // おかピポRASH の外れ: DJ が見えるよう、図柄は左上に小さく (左 45% → 右 70% → 中 100%)
            const r = local / phase.t;
            return { stop: [r >= 0.45, r >= 0.999, r >= 0.7], big: false };
        }
        if (plan.kind === 'okapipo' && plan.okaNotice) {
            // おかピポRASH の当たり: 図柄は左上に小さく回り、おかピポ (顔) 大量発生の途中か、おかがっぱ群のあと (palign) でそろって大きく
            const done = ((n === 'pipo' || n === 'pface') && local >= PIPO_ALIGN) || n === 'palign';
            return { stop: [done, done, done], big: done };
        }
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
        if (n === 'kroll' || n === 'knoise') return { stop: [false, false, false], big: true };
        if (n === 'kdark' || n === 'klive') return { hidden: true };
        if (n === 'kend') return { stop: [true, true, true], big: true };
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
    // 違和感 (P4): 図柄の 回り方を かえる 時計 (null なら ふつう。reverse は 逆回り、stop は 止まる)
    let rollClock = null;
    let iwakanNow = null;   // この フレームの 違和感 { kind, t, start }
    function drawRolling(layout, i, now, speed) {
        const x = layout.xs[i];
        const { w, h, y } = layout;
        if (rollClock) now = rollClock(now);
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
        const fake = plan && phase && ((plan.type === 'post' && (phase.name === 'roll' || phase.local < 0.8)) || (plan.crack && phase.name !== 'xalign'));
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
    // ライバルチーム (2026-10-23 アップグレード P3): 3 人 並べる (まんなかが リーダーで 少し 大きい)
    function drawTeam(team, ex, ground, frame, hurt, alpha, kai = false, speaking = -1) {
        team.forEach((id, i) => {
            const lead = i === 1;
            const sc = Math.min(lead ? 1.6 : 1.3, (lead ? 60 : 50) / Characters.size(id).h);
            const x = ex + (i - 1) * 30;
            const hop = i === speaking ? Math.abs(Math.sin(performance.now() / 120)) * 4 : 0;
            Characters.drawEnemy(ctx, id, x, ground - (lead ? 0 : 2) - hop, { scale: sc, frame: (frame + i) % 2, hurt, alpha, kai });
        });
    }

    // 必殺技と 敵の セリフ (2026-10-23 ユーザー指定: 最新の スロット koori-slot の データを 読みこむ)
    //   js/battle-lines.js (node tools/import-battle-lines.mjs で 書き出す) を 先に、なければ config.show.battleTalk を 使う。
    //   チームは 3 人 全員の セリフ: はじめに 1 人ずつ 名乗る → 敵の 攻撃の たびに 攻撃した 人の 必殺技と ひとこと →
    //   決着で 勝てば こおりくんの 必殺技と 3 人の 負けゼリフ、負ければ リーダーの 必殺技と 3 人の 勝ちゼリフ (順に)
    const BL = () => window.BATTLE_LINES || { specials: {}, lines: {} };
    const talkOf = id => BL().lines[id] || CONFIG.show.battleTalk.lines[id] || {};
    const specialOf = id => BL().specials[id] || CONFIG.show.battleTalk.specials[id] || '必殺技';
    const nameOf = id => CONFIG.show.battleTalk.names[id] || id;
    const INTRO_STEP = 1.0;   // チームが 1 人ずつ 名乗る 秒
    const INTRO_AT = 2.4;     // 名乗りを 始める バトルの 秒 (ふるカワの 返事が 消えてから)
    // いま しゃべっている 人 { id, idx, kind: 'intro' / 'special' / 'end', line }。いなければ null
    function battleSpeaker(plan, phase) {
        const b = CONFIG.show.battles[plan.enemy];
        if (!b || plan.fig !== 1 || !phase) return null;
        const members = b.team || [plan.enemy];
        if (phase.name === 'battle') {
            const l = phase.local;
            if (l < INTRO_AT) return null;
            if (l < INTRO_AT + INTRO_STEP * members.length) {
                const idx = Math.floor((l - INTRO_AT) / INTRO_STEP);
                return { id: members[idx], idx, kind: 'intro', line: talkOf(members[idx]).intro };
            }
            // 敵の 攻撃 (奇数の ターン。drawBattle と 同じ 1.2 秒ごと): 攻撃した 人の 必殺技
            const pushStart = phase.t - pushTimeOf(plan);
            const turn = Math.floor(Math.min(l, pushStart) / 1.2);
            if (l < pushStart && turn % 2 === 1 && l >= INTRO_AT + INTRO_STEP * members.length) {
                const idx = Math.floor(turn / 2) % members.length;
                return { id: members[idx], idx, kind: 'special', line: talkOf(members[idx]).special };
            }
            return null;
        }
        if (phase.name === 'result' && phase.local >= 1.1) {
            const step = (phase.t - 1.1) / members.length;
            const idx = Math.min(members.length - 1, Math.floor((phase.local - 1.1) / step));
            return { id: members[idx], idx, kind: 'end', line: plan.win ? talkOf(members[idx]).lose : talkOf(members[idx]).win };
        }
        return null;
    }
    function drawBattleTalk(now, plan, phase) {
        const bt = CONFIG.show.battleTalk;
        if (!bt || plan.fig !== 1) return;
        const b = CONFIG.show.battles[plan.enemy];
        if (!b) return;
        const sp = battleSpeaker(plan, phase);
        const y = phase.name === 'result' ? 100 : 88;   // 決着は 大きい 図柄の 下
        const cx = phase.name === 'result' ? W / 2 : W / 2 + 30;
        if (sp && sp.line) {
            const head = sp.kind === 'special' ? `${nameOf(sp.id)} の ${specialOf(sp.id)}！` : nameOf(sp.id);
            band(y, 24, 0.6);
            text(head, cx, y + 6, head.length > 16 ? 8 : 9, sp.kind === 'special' ? '#ff9a6a' : '#ffe066', 'center');
            text(`「${sp.line}」`, cx, y + 18, sp.line.length > 14 ? 8 : 9, '#ffffff', 'center');
            if (sp.kind === 'special') once(`sp${sp.idx}${Math.floor(phase.local / 2.4)}`, 'hurt');
        }
        if (phase.name === 'result' && phase.local < 1.1) {
            const who = b.leader || plan.enemy;
            const name = plan.win ? specialOf('koori') : specialOf(who);
            band(y + 1, 22, 0.65);
            text(plan.win ? `こおりくんの ${name}!!` : `${nameOf(who)} の ${name}!!`, W / 2, y + 12, name.length > 9 ? 10 : 12, plan.win ? 'rainbow' : '#ff6a6a', 'center', now);
            once('special', plan.win ? 'win' : 'hurt');
        }
    }

    // ----- 違和感演出 (2026-10-23 アップグレード P4) -----
    // ノイズは 液晶に すじ、無音は しばらく 音を 止める、ランプは 筐体の 先バレの ランプが チカチカ (変動ごとに 1 回)
    function drawIwakan(now, iw) {
        if (iw.kind === 'noise') {
            for (let i = 0; i < 26; i++) {
                const v = Math.floor(Math.random() * 255);
                ctx.fillStyle = `rgba(${v},${v},${v},${0.25 + Math.random() * 0.45})`;
                ctx.fillRect(0, Math.floor(Math.random() * H), W, 1 + Math.floor(Math.random() * 3));
            }
            if (Math.random() < 0.3) {
                ctx.fillStyle = 'rgba(255,255,255,0.12)';
                ctx.fillRect(0, 0, W, H);
            }
        }
        if (!spinView || spinView.iwakanDone) return;
        spinView.iwakanDone = true;
        if (iw.kind === 'silent') Sound.hush(2600);
        if (iw.kind === 'lamp' && typeof Cabinet !== 'undefined') Cabinet.lamp('glitch', now);
        if (iw.kind === 'noise') Sound.play('hurt');
    }

    // ----- こおりいきていける！ (P3): ノイズ → 暗転 → 虹色の こおりくん -----
    function drawIkiteru(now, plan, phase) {
        const n = phase.name, l = phase.local;
        if (n === 'knoise') {
            for (let i = 0; i < 30; i++) {
                const v = Math.floor(Math.random() * 255);
                ctx.fillStyle = `rgba(${v},${v},${v},${0.3 + Math.random() * 0.5})`;
                ctx.fillRect(0, Math.floor(Math.random() * H), W, 1 + Math.floor(Math.random() * 3));
            }
            once('knoise', 'hurt');
        } else if (n === 'kdark' || n === 'klive') {
            ctx.fillStyle = '#000';
            ctx.fillRect(0, 0, W, H);
            if (n === 'klive') {
                if (l < 0.3) {
                    ctx.fillStyle = `rgba(255, 255, 255, ${0.9 - l * 3})`;
                    ctx.fillRect(0, 0, W, H);
                }
                const g = ctx.createRadialGradient(W / 2, 66, 4, W / 2, 66, 70);
                g.addColorStop(0, rainbow(now));
                g.addColorStop(1, 'rgba(0,0,0,0)');
                ctx.fillStyle = g;
                ctx.fillRect(0, 0, W, H);
                drawSprite(ctx, SPRITES.koori, Math.floor(now * 4) % 2 ? 'walk1' : 'walk2', W / 2 - 24, 30 + Math.sin(now * 3) * 2, 3);
                text('こおりいきていける！', W / 2, 118, 16, 'rainbow', 'center', now);
                once('klive', 'win');
            }
        }
    }

    // ----- 1・3・5 の ひび割れ (2026-10-24 ユーザー指定) -----
    // 止まった 1・3・5 の 画面が まっぷたつに ひび割れ (xcrack) → すき間が 開いて おにおに・怪が 出てくる (xemerge) →
    // 画面が 粉々に 砕けて 飛ぶ (xsmash) → 赤い 画面で 咆哮 (xroar) → 7・7・7 で そろって「おめでとう!!」(xalign)
    const CRACK_PHASES = ['xstop', 'xcrack', 'xemerge', 'xsmash', 'xroar', 'xalign'];
    // ひびの 形 (上から 下への ジグザグ。x は 真ん中からの ずれ) と 枝 ([ひびの 点, 枝の のび])
    const CRACK_PATH = [[0, 0], [-6, 14], [5, 27], [-4, 41], [8, 55], [-3, 70], [6, 84], [-5, 98], [3, 113], [-2, 128], [0, 144]];
    const CRACK_BRANCH = [[2, [-18, 8]], [4, [20, 6]], [6, [-16, 10]], [7, [18, 12]], [8, [-14, 6]]];
    let crackSnap = null;   // 割れる 前の 画面 (止まった 1・3・5 と ひび) の 写し (RES 倍)
    function snapCrack() {
        if (!crackSnap) {
            crackSnap = document.createElement('canvas');
            crackSnap.width = canvas.width;
            crackSnap.height = canvas.height;
        }
        const g = crackSnap.getContext('2d');
        g.clearRect(0, 0, crackSnap.width, crackSnap.height);
        g.drawImage(canvas, 0, 0);
    }
    const jolt = mag => [Math.round((Math.random() * 2 - 1) * mag), Math.round((Math.random() * 2 - 1) * mag)];
    // ひび (k: 0〜1 で 上から のびる)
    function crackLine(k, width, color) {
        const n = CRACK_PATH.length - 1, upto = k * n;
        ctx.strokeStyle = color;
        ctx.lineWidth = width;
        ctx.beginPath();
        ctx.moveTo(W / 2 + CRACK_PATH[0][0], CRACK_PATH[0][1]);
        for (let i = 1; i <= n; i++) {
            const [x0, y0] = CRACK_PATH[i - 1], [x1, y1] = CRACK_PATH[i];
            const f = Math.min(1, Math.max(0, upto - (i - 1)));
            if (f <= 0) break;
            ctx.lineTo(W / 2 + x0 + (x1 - x0) * f, y0 + (y1 - y0) * f);
        }
        ctx.stroke();
        for (const [i, [bx, by]] of CRACK_BRANCH) {
            if (upto < i) continue;
            const [x, y] = CRACK_PATH[i];
            const f = Math.min(1, upto - i);
            ctx.beginPath();
            ctx.moveTo(W / 2 + x, y);
            ctx.lineTo(W / 2 + x + bx * f, y + by * f);
            ctx.stroke();
        }
    }
    // 割れた 画面の 半分 (side -1 左 / 1 右) を すき間 gap だけ ずらして 描く。ひびに 沿って 切る
    function halfScreen(side, gap) {
        if (!crackSnap) return;
        ctx.save();
        ctx.translate(side * gap, 0);
        ctx.beginPath();
        const edge = side < 0 ? -2 : W + 2;
        ctx.moveTo(edge, 0);
        for (const [x, y] of CRACK_PATH) ctx.lineTo(W / 2 + x, y);
        ctx.lineTo(edge, H);
        ctx.closePath();
        ctx.save();
        ctx.clip();
        ctx.drawImage(crackSnap, 0, 0, W, H);
        ctx.restore();
        ctx.strokeStyle = '#ffb0a0';
        ctx.lineWidth = 1;
        ctx.stroke();
        ctx.restore();
    }
    function drawCrack(now, plan, phase) {
        const n = phase.name, k = phase.local / phase.t;
        if (n === 'xstop') {
            // 1・3・5 … 外れ? 画面が だんだん 暗くなり、赤い ノイズが まじる
            ctx.fillStyle = `rgba(0,0,0,${0.45 * k})`;
            ctx.fillRect(0, 0, W, H);
            if (k > 0.6 && Math.random() < 0.4) {
                ctx.fillStyle = 'rgba(255,40,40,0.3)';
                ctx.fillRect(0, Math.floor(Math.random() * H), W, 2);
            }
        } else if (n === 'xcrack') {
            ctx.fillStyle = 'rgba(0,0,0,0.45)';
            ctx.fillRect(0, 0, W, H);
            const g = Math.min(1, k / 0.55);
            ctx.save();
            const [dx, dy] = jolt(g >= 1 ? 2 : 1);
            ctx.translate(dx, dy);
            crackLine(g, 5, 'rgba(255,40,40,0.75)');
            crackLine(g, 1.5, '#ffffff');
            ctx.restore();
            if (g >= 1 && Math.floor(now * 8) % 2) {
                ctx.fillStyle = 'rgba(255,0,0,0.14)';
                ctx.fillRect(0, 0, W, H);
            }
            snapCrack();   // 割れる 画面は ここで 写した ものを 使う
        } else if (n === 'xemerge') {
            // 画面の 左右が すき間を あけて ずれ、赤い 光の 中から おにおに・怪が せり上がる
            const gap = Math.round(Math.min(1, k / 0.35) * 30);
            const rise = Math.min(1, Math.max(0, (k - 0.2) / 0.6));
            ctx.fillStyle = '#100000';
            ctx.fillRect(0, 0, W, H);
            const glow = ctx.createLinearGradient(W / 2 - gap - 10, 0, W / 2 + gap + 10, 0);
            glow.addColorStop(0, 'rgba(255,0,0,0)');
            glow.addColorStop(0.5, `rgba(255,${90 + Math.floor(60 * Math.sin(now * 20))},40,0.95)`);
            glow.addColorStop(1, 'rgba(255,0,0,0)');
            ctx.fillStyle = glow;
            ctx.fillRect(W / 2 - gap - 10, 0, gap * 2 + 20, H);
            const sz = Characters.size('onioni');
            const scale = Math.min(3, 100 / sz.h);
            Characters.drawEnemy(ctx, 'onioni', W / 2, H + 6 + (1 - rise) * sz.h * scale, { scale, kai: true, frame: Math.floor(now * 4) % 2 });
            ctx.save();
            const [dx, dy] = jolt(1 + rise * 2);
            ctx.translate(dx, dy);
            halfScreen(-1, gap + rise * 40);
            halfScreen(1, gap + rise * 40);
            ctx.restore();
            if (rise > 0.5) text('グ……', W / 2, 14, 12, '#ff6060');
        } else if (n === 'xsmash') {
            // 割れた 画面が 粉々に なって 飛び散る
            ctx.fillStyle = '#200000';
            ctx.fillRect(0, 0, W, H);
            if (crackSnap) {
                const cols = 6, rows = 4, cw = W / cols, ch = H / rows, e = k * k;
                for (let r = 0; r < rows; r++) {
                    for (let c = 0; c < cols; c++) {
                        const cx = (c + 0.5) * cw, cy = (r + 0.5) * ch;
                        const vx = (cx - W / 2) * 3.2 + ((r * 7 + c * 13) % 9 - 4) * 12, vy = (cy - H / 2) * 3.2 - 40 + ((r * 5 + c * 3) % 7) * 6;
                        ctx.save();
                        ctx.globalAlpha = Math.max(0, 1 - k * 1.1);
                        ctx.translate(cx + vx * e, cy + vy * e + 160 * e * e);
                        ctx.rotate(((r + c) % 2 ? 1 : -1) * k * 4);
                        ctx.beginPath();
                        // かけらは 三角と 四角を まぜる
                        if ((r + c) % 3 === 0) { ctx.moveTo(-cw / 2, -ch / 2); ctx.lineTo(cw / 2, -ch / 2); ctx.lineTo(0, ch / 2); ctx.closePath(); }
                        else ctx.rect(-cw / 2, -ch / 2, cw, ch);
                        ctx.clip();
                        ctx.drawImage(crackSnap, (cx - cw / 2) * RES, (cy - ch / 2) * RES, cw * RES, ch * RES, -cw / 2, -ch / 2, cw, ch);
                        ctx.restore();
                    }
                }
            }
            if (k < 0.25) {
                ctx.fillStyle = `rgba(255,255,255,${0.9 * (1 - k / 0.25)})`;
                ctx.fillRect(0, 0, W, H);
            }
            const [tx, ty] = jolt(3);
            text('バリィィン!!', W / 2 + tx, 72 + ty, 22, '#ffffff');
        } else if (n === 'xroar') {
            // 赤い 画面で おにおに・怪が 咆哮
            const bg = ctx.createRadialGradient(W / 2, 80, 6, W / 2, 80, 160);
            bg.addColorStop(0, '#ff4020');
            bg.addColorStop(0.5, '#801010');
            bg.addColorStop(1, '#100000');
            ctx.fillStyle = bg;
            ctx.fillRect(0, 0, W, H);
            ctx.fillStyle = 'rgba(255,220,180,0.3)';
            for (let i = 0; i < 20; i++) {
                const a = i / 20 * Math.PI * 2 + now * 0.8;
                ctx.beginPath();
                ctx.moveTo(W / 2, 70);
                ctx.lineTo(W / 2 + Math.cos(a) * 300, 70 + Math.sin(a) * 300);
                ctx.lineTo(W / 2 + Math.cos(a + 0.08) * 300, 70 + Math.sin(a + 0.08) * 300);
                ctx.fill();
            }
            // 咆哮の 輪
            for (let j = 0; j < 3; j++) {
                const r = ((now * 1.6 + j / 3) % 1) * 170;
                ctx.strokeStyle = `rgba(255,255,255,${0.6 * (1 - r / 170)})`;
                ctx.lineWidth = 3;
                ctx.beginPath();
                ctx.arc(W / 2, 62, r, 0, Math.PI * 2);
                ctx.stroke();
            }
            const sz = Characters.size('onioni');
            const scale = Math.min(3.4, 118 / sz.h) * (1 + 0.04 * Math.sin(now * 30));
            ctx.save();
            const [dx, dy] = jolt(3);
            ctx.translate(dx, dy);
            Characters.drawEnemy(ctx, 'onioni', W / 2, H - 2, { scale, kai: true, frame: 1 });
            ctx.restore();
            const [tx, ty] = jolt(2);
            text('グオオオオオ!!', W / 2 + tx, 18 + ty, 22, Math.floor(now * 10) % 2 ? '#ffe066' : '#ffffff');
        } else if (n === 'xalign') {
            // 7・7・7 (図柄は drawReels が 描く) に 白い 光と「おめでとう!!」
            if (k < 0.2) {
                ctx.fillStyle = `rgba(255,255,255,${0.9 * (1 - k / 0.2)})`;
                ctx.fillRect(0, 0, W, H);
            }
            band(118, 24, 0.55);
            text('おめでとう!!', W / 2, 130, 18 + Math.round(Math.max(0, 0.3 - k) * 20), 'rainbow', 'center', now);
        }
    }

    // ----- 当たりの 役物の 背景 (2026-10-24 ユーザー指定) -----
    // 役物 (筐体が 液晶の 前に 描く) が 落ちて → 回って → 変形して → 立体の こおりくん。液晶は 暗くして 光で もり上げる
    function drawYakuScreen(now, plan, phase) {
        const k = phase.local / phase.t;
        ctx.fillStyle = '#04060c';
        ctx.fillRect(0, 0, W, H);
        if (k < 0.12) {
            text('!?', W / 2, 72, 30, '#ffffff');
            return;
        }
        const open = k >= 0.4;
        for (let i = 0; i < 18; i++) {
            const a = i / 18 * Math.PI * 2 + now * (open ? 0.6 : 2.4);
            ctx.fillStyle = open ? `hsla(${(i * 20 + now * 200) % 360}, 95%, 60%, 0.35)` : 'rgba(127,211,247,0.25)';
            ctx.beginPath();
            ctx.moveTo(W / 2, H / 2);
            ctx.lineTo(W / 2 + Math.cos(a) * 300, H / 2 + Math.sin(a) * 300);
            ctx.lineTo(W / 2 + Math.cos(a + 0.12) * 300, H / 2 + Math.sin(a + 0.12) * 300);
            ctx.fill();
        }
        if (k >= 0.4 && k < 0.46) {
            ctx.fillStyle = `rgba(255,255,255,${0.8 * (1 - (k - 0.4) / 0.06)})`;
            ctx.fillRect(0, 0, W, H);
        }
        if (k >= 0.4 && k < 0.64) {
            band(120, 22, 0.55);
            text('変形!!', W / 2, 131, 16, Math.floor(now * 8) % 2 ? '#ffe066' : '#ffffff');
        }
        if (k >= 0.64) {
            band(120, 22, 0.55);
            text('こおりくん 降臨!!', W / 2, 131, 16, 'rainbow', 'center', now);
        }
    }

    // ----- 熱いときに 震える 枠 (2026-10-24 ユーザー指定: 映像の 中の 外枠が 震える) -----
    // 1 赤 / 2 金 / 3 虹 (確定級)。演出の 強さ 控えめ では 出さない
    const HOT_OF = { red: 1, gold: 2, rainbow: 3 };
    function hotLevel(plan, phase) {
        if (!plan || !phase || Customize.get('fx') === 'quiet') return 0;
        const n = phase.name;
        if (plan.crack && ['xcrack', 'xemerge', 'xsmash', 'xroar'].includes(n)) return 3;
        if (n === 'stepup' && plan.stepUp && plan.stepUp.step === 3) return HOT_OF[plan.stepUp.color] || 0;
        const late = (n === 'reach' && phase.local >= 1.4) || ['develop', 'cutin', 'battle', 'pursuit', 'cfinal'].includes(n);
        if (!late) return 0;
        let lv = Math.max(HOT_OF[plan.cutin] || 0, HOT_OF[plan.leverColor] || 0, HOT_OF[plan.pushColor] || 0);
        if (plan.lever || plan.develop) lv = Math.max(lv, 1);
        if (plan.kai || plan.gimmick || plan.premium) lv = 3;
        return lv;
    }
    function drawHotFrame(now, lv) {
        if (!lv) return;
        const mag = lv + 1;
        const [dx, dy] = jolt(mag);
        const th = 4 + lv;
        const color = lv >= 3 ? rainbow(now) : lv === 2 ? '#ffd23a' : '#ff3040';
        ctx.save();
        ctx.translate(dx, dy);
        ctx.globalAlpha = 0.75 + 0.25 * Math.sin(now * 16);
        ctx.fillStyle = '#000000';
        ctx.fillRect(-4, -4, W + 8, th + 5);
        ctx.fillRect(-4, H - th - 1, W + 8, th + 5);
        ctx.fillRect(-4, -4, th + 5, H + 8);
        ctx.fillRect(W - th - 1, -4, th + 5, H + 8);
        ctx.fillStyle = color;
        ctx.fillRect(0, 0, W, th);
        ctx.fillRect(0, H - th, W, th);
        ctx.fillRect(0, 0, th, H);
        ctx.fillRect(W - th, 0, th, H);
        // 内側の 光る すじ
        ctx.fillStyle = 'rgba(255,255,255,0.7)';
        ctx.fillRect(th, th, W - th * 2, 1);
        ctx.fillRect(th, H - th - 1, W - th * 2, 1);
        ctx.fillRect(th, th, 1, H - th * 2);
        ctx.fillRect(W - th - 1, th, 1, H - th * 2);
        ctx.restore();
    }

    // 天国の カットイン (P3): RUSH が 終わったとき、残りの 保留に 当たりが あれば ときどき シーシャ・ナイテイ
    let heavenFx = null;   // { who, start }
    function drawHeaven(now) {
        if (!heavenFx) return;
        const t = now - heavenFx.start, total = CONFIG.show.heavenCutin.time;
        if (t > total) return void (heavenFx = null);
        const slide = t < 0.25 ? 1 - t / 0.25 : t > total - 0.25 ? -(t - total + 0.25) / 0.25 : 0;
        ctx.save();
        ctx.translate(Math.round(slide * W), 0);
        ctx.fillStyle = heavenFx.who === 'aruaru' ? rainbow(now) : '#3a1450';
        ctx.fillRect(0, 40, W, 64);
        ctx.fillStyle = 'rgba(255,255,255,0.25)';
        for (let i = 0; i < 10; i++) ctx.fillRect(0, 40 + ((i * 17 + Math.floor(now * 30) * 5) % 64), W, 1);
        Characters.drawEnemy(ctx, heavenFx.who, 50, 102, { scale: Math.min(2, 60 / Characters.size(heavenFx.who).h) });
        text(heavenFx.who === 'aruaru' ? 'また すぐに 会おう…' : 'まだ 終わらせないぞ…', W / 2 + 30, 66, 13, '#ffffff', 'center');
        ctx.restore();
    }

    function enemyScale(id, maxH) {
        return Math.min(2, maxH / Characters.size(id).h);
    }

    function hpBar(x, y, w, ratio, color) {
        ctx.fillStyle = '#000';
        ctx.fillRect(x, y, w, 5);
        ctx.fillStyle = color;
        ctx.fillRect(x + 1, y + 1, Math.round((w - 2) * Math.max(0, ratio)), 3);
    }

    // PUSH の 案内 (2026-10-24): 押し方 (PUSH！ / 長押し！ / 連打！) と 色 (白 < 青 < 赤 < 金 < 虹)。長押しは ため の ゲージ、連打は 〇連撃 と 残り
    function drawPushPrompt(now, plan, phase) {
        const color = pushText(pushColorOf(plan));
        const blink = Math.floor(now * 8) % 2;
        const mode = pushModeOf(plan, phase) || 'tap';
        if (mode === 'tap') {
            text('PUSH！', W / 2, 79, 22, color === '#ffffff' ? (blink ? '#ffe066' : '#ff3a3a') : color, 'center', now);
            return;
        }
        if (mode === 'long') {
            const c = chargeOf(now);
            text(spinView.holdStart != null ? 'ためろ！！' : '長押し！', W / 2, 75, 18, color, 'center', now);
            ctx.fillStyle = '#000';
            ctx.fillRect(W / 2 - 50, 84, 100, 6);
            ctx.fillStyle = color === 'rainbow' ? rainbow(now) : color;
            ctx.fillRect(W / 2 - 49, 85, Math.round(98 * c), 4);
            return;
        }
        const n = spinView.mash || 0, need = CONFIG.show.pushStyle.mashCount;
        text(n ? `${n}連撃！` : '連打！', W / 2, 75, Math.round(18 + Math.max(0, 0.12 - (now - (spinView.mashAt || -9))) * 40), color, 'center', now);
        for (let i = 0; i < need; i++) {
            ctx.fillStyle = i < n ? (color === 'rainbow' ? rainbow(now, i * 30) : color) : 'rgba(255,255,255,0.25)';
            ctx.fillRect(W / 2 - need * 5 + i * 10 + 1, 85, 8, 4);
        }
    }
    // ため の 光: こおりくんの まわりに 輪と 光の 粒が 集まる (たまるほど 大きく 明るく)
    function drawCharge(now, x, y, k, colorId) {
        const c = pushText(colorId);
        const col = a => c === 'rainbow' ? `hsla(${(now * 300) % 360}, 95%, 65%, ${a})` : c === '#ffffff' ? `rgba(160, 220, 255, ${a})` : hexA(c, a);
        ctx.save();
        ctx.fillStyle = col(0.18 + k * 0.3);
        ctx.beginPath();
        ctx.arc(x, y, 10 + k * 16 + Math.sin(now * 20) * 1.5, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = col(0.9);
        for (let i = 0; i < 8; i++) {
            const a = i / 8 * Math.PI * 2 + now * 3;
            const r = (1 - ((now * 2 + i / 8) % 1)) * 34;
            ctx.fillRect(Math.round(x + Math.cos(a) * r), Math.round(y + Math.sin(a) * r), 2, 2);
        }
        ctx.restore();
    }
    const hexA = (hex, a) => `rgba(${parseInt(hex.slice(1, 3), 16)}, ${parseInt(hex.slice(3, 5), 16)}, ${parseInt(hex.slice(5, 7), 16)}, ${a})`;

    // もう一回 引け！ (引いても 負けたあとの 復活。2026-10-24): 暗い 中に「まだだ…！」と 虹の「もう一回 レバーを引け！」。引いたら 白く 光る
    function drawLeverAgain(now, plan, phase) {
        ctx.fillStyle = '#000000';
        ctx.fillRect(0, 0, W, H);
        const pulled = spinView && spinView.pushedAt !== null;
        text('まだだ…！', W / 2, 44, 14, `rgba(255, 255, 255, ${Math.min(1, phase.local / 0.4)})`);
        if (!pulled) {
            if (phase.local > 0.4) text('もう一回 レバーを引け！', W / 2, 84, 18, 'rainbow', 'center', now);
        } else {
            ctx.fillStyle = `rgba(255, 255, 255, ${Math.max(0, 1 - (now - spinView.pushedAt) * 2)})`;
            ctx.fillRect(0, 0, W, H);
        }
    }

    // phase.name が 'reach' (相手が出てくる) / 'battle' / 'result'
    // 復活 (plan.revival): result では負けて見せ、rv○○ の場面は RashView.drawRevival、最後の rvkill で撃破する
    function drawBattle(now, plan, phase) {
        if (plan.revival) {
            if (phase.name === 'rvkill') {
                plan = { ...plan, revival: false };
                phase = { ...phase, name: 'result' };
            } else if (phase.name === 'rvagain') {
                drawLeverAgain(now, plan, phase);
                return;
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
        const scale = b.team ? 0 : enemyScale(plan.enemy, 70);
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
            const pushStart = phase.t - pushTimeOf(plan);
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

        // 長押しの ため / 連打の 連撃 (2026-10-24 ユーザー指定)
        const pmode = phase.name === 'battle' && phase.pushing && spinView ? pushModeOf(plan, phase) : null;
        let charge = 0;
        if (pmode === 'long') {
            charge = spinView.pushedAt !== null ? 1 : chargeOf(now);
            kx += Math.sin(now * 70) * charge * 1.5;   // ためて ふるえる
        }
        if (pmode === 'mash' && spinView.mash) {
            const since = now - (spinView.mashAt || -9);
            if (since < 0.16) { kx += 60 * Math.sin(since / 0.16 * Math.PI); enemyHurt = true; }
            enemyHp = Math.max(0.1, enemyHp - spinView.mash * 0.025);
        }
        if (charge > 0) drawCharge(now, kx + 16, ground - 16, charge, pushColorOf(plan));

        const speaking = battleSpeaker(plan, phase);   // しゃべっている 人は 少し 跳ねる
        if (enemyAlpha > 0 && b.team) drawTeam(b.team, ex, ground, frame, enemyHurt, enemyAlpha, plan.kai, speaking ? speaking.idx : -1);   // ライバルチーム (P3。怪は 確定)
        else if (enemyAlpha > 0) Characters.drawEnemy(ctx, plan.enemy, ex, ground, { scale, frame, hurt: enemyHurt, alpha: enemyAlpha, kai: plan.kai });
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
        const titleColor = b.win >= 1 ? 'rainbow' : plan.kai ? '#c070ff' : plan.enemy === 'onioni' ? '#ff3a3a' : b.color || '#ffffff';
        const vsName = plan.kai && b.team ? `${b.name}・怪` : b.name;   // ライバルチームの 怪 (確定)
        text(`VS ${vsName}`, W / 2 + 34, 40, vsName.length > 10 ? 10 : 12, titleColor, 'center', now);
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
        if (phase.name !== 'result') drawBattleTalk(now, plan, phase);   // 必殺技と 敵の セリフ (決着は 図柄の 上に 出すので 外で)

        if (phase.name === 'battle' && phase.pushing) {
            const pushed = spinView.pushedAt !== null;
            if (!pushed) {
                band(66, 26, 0.5);
                if (spinView.pullAt !== null) {
                    // レバーを引け！ (85%。RASH 中は 確定): 変わった 瞬間は 白く 光って 文字が 大きく 出てくる
                    const since = now - spinView.pullAt;
                    if (spinView.plan.leverChange && since < 0.3) {
                        ctx.fillStyle = `rgba(255, 255, 255, ${0.7 * (1 - since / 0.3)})`;
                        ctx.fillRect(0, 0, W, H);
                    }
                    text('レバーを引け！', W / 2, 79, Math.round(18 + Math.max(0, 0.25 - since) * 24), leverText(spinView.plan.leverColor), 'center', now);
                } else drawPushPrompt(now, plan, phase);   // PUSH！ / 長押し (ため) / 連打 (連撃)。色の 段階 (2026-10-24)
            } else {
                const mode = pushModeOf(plan, phase);
                const since = now - spinView.pushedAt;
                ctx.fillStyle = `rgba(255, 255, 255, ${Math.max(0, 0.8 - since * 2)})`;
                ctx.fillRect(0, 0, W, H);
                // とどめの 文字: フルチャージ！ / 〇連撃！
                if (mode === 'long' && since < 0.9) text('フルチャージ！！', W / 2, 79, 22, pushText(pushColorOf(plan)), 'center', now);
                if (mode === 'mash' && since < 0.9) text(`${spinView.mash}連撃！！`, W / 2, 79, 24, pushText(pushColorOf(plan)), 'center', now);
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

    // ----- おかピポRASH (ユーザー指定 2026-10-20) -----
    // おかピポ (おかがっぱ) が DJ をしている。当たりは一発告知 (pnotice) → おかピポが大量発生して虹色に光る (pipo)
    // 金色のおかがっぱ (pgold) → おかがっぱの顔が大量発生 (pface) / 告知なしで おかがっぱ群 (pgun) → 図柄がそろう (palign)
    const PIPO_ALIGN = 1.6;   // pipo のこの秒で図柄がそろう
    function drawOkapipoRash(now, plan, phase) {
        const frame = Math.floor(now * 4) % 2;
        const beat = Math.floor(now * 128 / 60) % 2;   // 128BPM で光る
        const name = plan && phase ? phase.name : null;
        const pipo = name === 'pipo' || name === 'pface' || name === 'palign';
        // ミラーボールの光
        for (let i = 0; i < 6; i++) {
            ctx.fillStyle = `hsla(${(i * 60 + now * 90) % 360}, 90%, 60%, ${pipo ? 0.35 : 0.18})`;
            const x = (Math.sin(now * 1.3 + i) * 0.5 + 0.5) * W;
            ctx.fillRect(x - 10, 0, 20, H);
        }
        // DJ ブース
        ctx.fillStyle = '#2a2a3a';
        ctx.fillRect(W / 2 - 40, 104, 80, 22);
        ctx.fillStyle = beat ? '#ff4fa0' : '#4fe0ff';
        ctx.fillRect(W / 2 - 34, 108, 16, 6);
        ctx.fillRect(W / 2 + 18, 108, 16, 6);
        Characters.drawEnemy(ctx, 'okagappa', W / 2, 106 + (beat ? -2 : 0), { scale: 1.8, frame });
        ['♪', '♫'].forEach((n, i) => text(n, W / 2 - 60 + i * 120, 64 + Math.sin(now * 4 + i) * 6, 12, ['#ffe066', '#4fe0ff'][i]));
        if (name === 'pgold') return drawOkaGold(now, phase);
        if (name === 'pgun') return drawOkaGun(now, phase);
        if (name === 'palign') {
            ctx.fillStyle = `hsla(${(now * 400) % 360}, 90%, 60%, ${0.45 * (1 - phase.local / phase.t)})`;
            ctx.fillRect(0, 0, W, H);
            once('okaAlign', 'win');
            return;
        }
        if (name === 'pface') return drawOkaFaces(now, phase);
        if (!pipo) return;
        // おかピポ大量発生: 少しずつ増えて画面を埋め、虹色に光る
        const l = phase.local;
        const count = Math.min(40, Math.floor(l * 30));
        for (let i = 0; i < count; i++) {
            const x = ((i * 53) % 260) - 2;
            const y = 40 + ((i * 37) % 100) + Math.sin(now * 8 + i) * 2;
            Characters.drawEnemy(ctx, 'okagappa', x, y, { scale: 0.9, frame: (i + frame) % 2 });
        }
        ctx.fillStyle = `hsla(${(now * 400) % 360}, 90%, 60%, 0.3)`;
        ctx.fillRect(0, 0, W, H);
        if (l < PIPO_ALIGN) {
            band(58, 26, 0.6);
            text('おかピポ大量発生！！', W / 2, 71, 18, 'rainbow', 'center', now);
        }
        once('pipo', 'win');
    }

    // おかがっぱの顔だけを描く ((x, cy) は顔の真ん中。体は切り取る)
    function drawOkaFace(x, cy, scale, frame, gold) {
        const top = cy - 10 * scale;
        ctx.save();
        ctx.beginPath();
        ctx.rect(x - 16 * scale, top, 32 * scale, 19 * scale);
        ctx.clip();
        Characters.drawEnemy(ctx, 'okagappa', x, top + 40 * scale, { scale, frame, gold });
        ctx.restore();
    }

    // 金色のおかがっぱ (一発告知。ユーザー指定 2026-10-20): 下から出てきて「あ～らあらあら / き～んいろだわ / very nice おかピポ」
    const OKA_GOLD_RISE = 0.5, OKA_GOLD_LINE = 0.9;
    function drawOkaGold(now, phase) {
        const l = phase.local;
        ctx.fillStyle = 'rgba(40, 24, 0, 0.88)';   // 後ろの DJ が透けないように
        ctx.fillRect(0, 0, W, H);
        // 金の光の筋
        for (let i = 0; i < 10; i++) {
            const a = now * 0.8 + i * Math.PI / 5;
            ctx.fillStyle = `rgba(255, 214, 64, ${0.12 + 0.08 * Math.sin(now * 6 + i)})`;
            ctx.beginPath();
            ctx.moveTo(W / 2, 96);
            ctx.lineTo(W / 2 + Math.cos(a) * 220, 96 + Math.sin(a) * 220);
            ctx.lineTo(W / 2 + Math.cos(a + 0.18) * 220, 96 + Math.sin(a + 0.18) * 220);
            ctx.fill();
        }
        const rise = Math.min(1, l / OKA_GOLD_RISE);
        // 左の小さい図柄の下に出す (セリフは右側)
        Characters.drawEnemy(ctx, 'okagappa', 60, 166 - 26 * rise + (Math.floor(now * 4) % 2 ? -1 : 0), { scale: 2.2, frame: Math.floor(now * 4) % 2, gold: true });
        // きらきら
        for (let i = 0; i < 8; i++) {
            if ((Math.floor(now * 10) + i) % 3) continue;
            text('✦', 20 + ((i * 37) % 90), 50 + ((i * 23) % 70), 8, '#fff6c0');
        }
        const lines = CONFIG.show.okapipoRash.goldLines;
        lines.forEach((line, i) => {
            if (l < OKA_GOLD_RISE + i * OKA_GOLD_LINE) return;
            const y = 52 + i * 26;
            ctx.fillStyle = 'rgba(0, 0, 0, 0.55)';
            ctx.fillRect(112, y - 11, W - 116, 22);
            fitCenter(line, 112 + (W - 116) / 2, y, i === 2 ? 16 : 15, Math.floor(now * 8) % 2 ? '#ffe066' : '#fff6c0', W - 124, now);
        });
        once('okaGold', 'reach');
        if (l >= OKA_GOLD_RISE + (lines.length - 1) * OKA_GOLD_LINE) once('okaGoldNice', 'success');
    }

    // おかがっぱの顔が大量発生: 少しずつ増えて画面を埋め、虹色に光る (金の顔も混ざる)
    function drawOkaFaces(now, phase) {
        const l = phase.local;
        const frame = Math.floor(now * 4) % 2;
        const count = Math.min(60, Math.floor(l * 45));
        for (let i = 0; i < count; i++) {
            const x = ((i * 47) % 270) - 6;
            const y = 14 + ((i * 29) % 124) + Math.sin(now * 8 + i) * 2;
            drawOkaFace(x, y, 0.9 + (i % 3) * 0.25, (i + frame) % 2, i % 4 === 0);
        }
        ctx.fillStyle = `hsla(${(now * 400) % 360}, 90%, 60%, 0.28)`;
        ctx.fillRect(0, 0, W, H);
        if (l < PIPO_ALIGN) {
            band(58, 26, 0.6);
            text('おかピポ大量発生！！', W / 2, 71, 18, 'rainbow', 'center', now);
        }
        once('pipo', 'win');
    }

    // おかがっぱ群 (告知なし。ユーザー指定 2026-10-20): 文字も出さずに、おかがっぱの群れが右から左へ横切る
    function drawOkaGun(now, phase) {
        const p = phase.local / phase.t;
        const frame = Math.floor(now * 6) % 2;
        for (let i = 0; i < 18; i++) {
            const x = W + 40 - p * (W + 140) + (i % 6) * 24 + (i % 3) * 8;
            const foot = 50 + (i % 4) * 26 + (i % 2) * 6;
            Characters.drawEnemy(ctx, 'okagappa', x, foot, { scale: 0.85, frame: (i + frame) % 2 });
        }
        once('okaGun', 'challenge');
    }

    // おかピポRASH の一発告知: notice の 0.2秒で、ボタンが震える・先バレ音・ボタンが虹色 (役物は gimmick() が盤面に描く)
    function okapipoNotice(now, plan, phase) {
        if (phase.name !== 'pnotice' || phase.local < 0.2 || (spinView.played && spinView.played.has('okaNotice'))) return;
        spinView.played = spinView.played || new Set();
        spinView.played.add('okaNotice');
        if (plan.okaNotice === 'shake') MachineButton.trigger('shake', now);
        else if (plan.okaNotice === 'voice') Sound.playVoice();
        else if (plan.okaNotice === 'rainbow') { MachineButton.trigger('rainbow', now); Sound.play('v'); }
    }

    // ----- 盤面の役物 (ユーザー指定 2026-10-20) -----
    // 当たりの見込みが高いリーチで、バトルの始めに屋根のこおりくんが液晶の前へ落ちてくる。進み具合 (0〜1) を返す (盤面が描く。js/render.js)
    // おかピポRASH の一発告知 (役物) では、一発告知の場面 (pnotice) で落ちてくる
    // RASH 中のプレミアボーナス (2026-10-22) では、plan.gimmickPhase の場面の始めから (次の場面にまたがってもよい)
    function gimmick() {
        const plan = spinView && spinView.plan;
        const phase = currentPhase;
        if (plan && plan.okaNotice === 'gimmick' && phase && phase.name === 'pnotice') {
            once('gimmick', 'hurt');
            return Math.min(0.99, phase.local / phase.t);
        }
        if (!plan || !phase) return null;
        let elapsed;
        if (plan.gimmickPhase) {
            const from = plan.phases.findIndex(ph => ph.name === plan.gimmickPhase);
            if (from < 0 || phase.index < from) return null;
            elapsed = plan.phases.slice(from, phase.index).reduce((a, ph) => a + ph.t, 0) + phase.local;
        } else if (plan.gimmick && phase.name === 'battle') elapsed = phase.local;
        else return null;
        const t = elapsed / CONFIG.show.gimmick.time;
        if (t >= 1) return null;
        once('gimmick', 'hurt');
        if (t > 0.25) once('gimmickWin', 'win');
        return t;
    }
    // 当たりの 役物 (2026-10-24 ユーザー指定): yaku の 場面の 進み具合 (0〜1)。筐体 (js/cabinet.js の yakuMedal) が 描く
    function yaku() {
        const phase = currentPhase;
        if (!spinView || !phase || phase.name !== 'yaku') return null;
        const t = Math.min(0.999, phase.local / phase.t);
        once('yaku', 'hurt');
        // 変形の 音: 六角 → 四角 で ガシャッ、奥へ のびる 3 段で ガコッ、立方体に なったら ファンファーレ
        if (t > 0.4) once('yakuMorph', 'lever');
        [0.5, 0.547, 0.594].forEach((at, i) => { if (t > at) once('yakuStep' + i, 'lever'); });
        if (t > 0.64) once('yakuDone', 'win');
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
        if (color === 'question') {
            // 「?」の 保留 (2026-10-24): 白い 四角に 黒い「?」が ゆらゆら
            const s = size;
            ctx.fillStyle = '#1b3a6b';
            ctx.fillRect(x - s / 2, y - s / 2, s, s);
            ctx.fillStyle = '#e8f6ff';
            ctx.fillRect(x - s / 2 + 1, y - s / 2 + 1, s - 2, s - 2);
            text('?', x, y + s * 0.35 + Math.sin(now * 6 + x) * 0.6, Math.round(s * 0.95), '#10162a');
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
            m.holds[1].forEach((h, i) => holdIcon(14 + i * 13, 136, 10, shownHold(h), now));
        drawHoldFx(now, m);
            RashView.drawChallengeHolds(now, m);
            return;
        }
        m.holds[1].forEach((h, i) => holdIcon(14 + i * 13, 136, 10, shownHold(h), now));
        drawHoldFx(now, m);
        for (let i = m.holds[1].length; i < CONFIG.machine.holdMax; i++) {
            ctx.fillStyle = 'rgba(255, 255, 255, 0.12)';
            ctx.fillRect(10 + i * 13, 132, 8, 8);
        }
        m.holds[2].forEach((h, i) => holdIcon(W - 14 - i * 13, 136, 10, h.rashHold === 'black' ? 'black' : 'white', now, false, h.rashHold === 'spin'));
        // 変動中の保留 (当該保留) は真ん中の下に大きく
        if (m.spin && m.spin.fig === 1 && !m.bonus) holdIcon(W / 2, 134, 12, shownHold(m.spin.result), now, true);
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
        if (b.alloc.premium && !hidden) text(b.alloc.name, W / 2 + 14, 13, 14, 'rainbow', 'center', now);   // プレミアボーナス
        else text(hidden ? '大当たり' : `${b.alloc.label}個 大当たり`, W / 2 + 14, 13, 14, '#ffe066');
        // ROUND と COUNT は1行に (下に紹介のカードを出すため)
        text(hidden ? `ROUND ${Math.max(1, b.round)}` : `ROUND ${Math.max(1, b.round)} / ${b.alloc.rounds}`, W / 2 - 6, 31, 15, '#ffffff');
        if (b.phase === 'open') text(`COUNT ${b.count} / ${b.alloc.count || CONFIG.machine.bonus.count}`, W - 38, 31, 10, '#7fd3f7');
        drawInfoCard(now, m);
        text('右打ち →', W / 2, 113, 12, Math.floor(now * 3) % 2 ? '#ff6a8a' : '#ffffff');
        // RASH の2回目からは、ラウンド中にボタンで切り替え
        if (!choosing && m.rush.active && !m.rush.challenge && m.rush.hits > 2) {
            band(118, 16, 0.6);
            text(`ボタンで切り替え: ${rashName()}`, W / 2, 126, 10, rashColor());
            // おかピポRASH が選べるようになった (5連目から)
            const okapipo = CONFIG.show.rash.modes.okapipo;
            if (m.rush.hits - 1 >= okapipo.minStreak && rashMode !== 'okapipo') text(`${okapipo.name} 解禁！`, W - 6, 112, 9, 'rainbow', 'right', now);
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
        if (m.rush.active && rashMode === 'okapipo' && !m.rush.challenge) return CONFIG.show.okapipoRash.map;
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
        // 1・3・5 の ひび割れ・当たりの 役物 (2026-10-24)
        if (phase.name === 'xcrack') Sound.play('crack');
        if (phase.name === 'xemerge') Sound.play('fail');
        if (phase.name === 'xsmash') Sound.play('smash');
        if (phase.name === 'xroar') Sound.play('roar');
        if (phase.name === 'xalign') { Sound.play('win'); Sound.play('v'); }
        if (phase.name === 'yaku') Sound.play('reach');
    }

    // 可動液晶 (2026-10-23 アップグレード P1): 見せ場の 場面で 液晶が 前に せり出す (js/render.js が 描く)。0〜1 で なめらかに
    const ZOOM_PHASES = ['battle', 'pursuit', 'result', 'zenkaiten', 'zend', 'cfinal', 'cresult', 'klive', 'kend', 'xroar', 'xalign'];
    let zoomNow = 0, zoomAt = 0;
    function zoom(now) {
        // 演出の 強さ (2026-10-24): 控えめ は 出さない、派手 は 可動液晶の 設定に かかわらず 出す
        const fx = Customize.get('fx');
        const on = fx !== 'quiet' && (fx === 'flashy' || Customize.get('lcdZoom') !== 'off') && !Story.active() && currentPhase && ZOOM_PHASES.includes(currentPhase.name);
        const dt = Math.min(0.1, Math.max(0, now - zoomAt));
        zoomAt = now;
        const want = on ? 1 : 0;
        zoomNow += Math.sign(want - zoomNow) * Math.min(Math.abs(want - zoomNow), dt * 3.5);
        return zoomNow;
    }

    // 筐体の 光 (2026-10-23 ユーザー指定: 当たったら 周りの ライトが 虹色。演出に 合わせて 光り方を かえて 盛り上げる)
    //   js/cabinet.js に わたす { kind, color, speed }。kind: hit 虹色 (当たりが 見えた 瞬間から) / color その色で 流れる /
    //   strobe 白く 点滅 (PUSH・NEXT) / dim 暗く (外れが 決まった) / glitch ちらつく (違和感)。null は ふだんの 光り方
    let lightSpin = null;
    // 演出の 強さ (2026-10-24): 控えめ は 当たりの 虹色 だけ、派手 は 速く 流す
    function light() {
        const l = lightRaw();
        const fx = Customize.get('fx');
        if (fx === 'quiet') return l && l.kind === 'hit' ? l : null;
        if (fx === 'flashy' && l && l.speed) return { ...l, speed: l.speed * 1.6 };
        return l;
    }
    function lightRaw() {
        if (Story.active() || !lightSpin || !currentPhase) return null;
        const { plan, elapsed } = lightSpin;
        const ph = currentPhase, n = ph.name;
        if (plan.win) {
            // 当たりが 見える 秒: reveal が なければ 図柄が そろう ところ (result の 0.6 秒。全回転は zend)、それも なければ 変動の 終わり
            const names = plan.phases.map(p => p.name);
            let idx = plan.reveal ? names.indexOf(plan.reveal.phase) : names.indexOf('result');
            let off = plan.reveal ? plan.reveal.at : 0.6;
            if (idx < 0) { idx = names.indexOf('zend'); off = 0; }
            if (idx < 0) { idx = names.length - 1; off = Math.max(0, plan.phases[idx].t - 0.3); }
            const at = plan.phases.slice(0, idx).reduce((a, p) => a + p.t, 0) + off;
            if (elapsed >= at) return { kind: 'hit' };
        }
        const show = CONFIG.show;
        if (plan.iwakan && show.iwakan && elapsed < show.iwakan.time) return { kind: 'glitch' };
        const b = plan.enemy && show.battles[plan.enemy];
        const foe = plan.kai ? '#c040ff' : (b && b.color) || '#ff3a4a';
        if (ph.pushing) return { kind: 'strobe' };
        if (n === 'stepup' && plan.stepUp) return { kind: 'color', color: show.stepUp.colors[plan.stepUp.color] || '#ffffff', speed: 10 + plan.stepUp.step * 6 };
        if (n === 'next') return ph.local < 0.5 ? { kind: 'strobe' } : { kind: 'color', color: '#7fd3f7', speed: 18 };
        if (n === 'challenge' || n === 'cround') return { kind: 'color', color: '#ffe066', speed: 16 };
        if (n === 'reach' || n === 'develop') return { kind: 'color', color: foe, speed: 20 };
        if (n === 'cutin' && plan.cutin) return { kind: 'color', color: show.cutin.colors[plan.cutin].color, speed: 34 };
        if (n === 'battle' || n === 'cfinal') return { kind: 'color', color: plan.cutin ? show.cutin.colors[plan.cutin].color : foe, speed: 28 };
        if (n === 'pursuit') return { kind: 'color', color: '#ff3a4a', speed: 36 };
        if (n === 'zenkaiten' || n === 'yaku') return { kind: 'hit' };
        if (plan.crack && ['xcrack', 'xemerge', 'xsmash', 'xroar'].includes(n)) return { kind: 'color', color: '#ff2a2a', speed: 44 };
        if ((n === 'result' || n === 'fail' || n === 'cresult' || n === 'rvdark') && !plan.win) return { kind: 'dim' };
        return null;
    }

    // おにおにRASH の違和感: 画面の上下反転・白黒
    let effectCanvas = null;
    function applyEffect(fx) {
        if (!fx) return;
        if (!effectCanvas) {
            effectCanvas = document.createElement('canvas');
            effectCanvas.width = canvas.width;
            effectCanvas.height = canvas.height;
        }
        const g = effectCanvas.getContext('2d');
        g.clearRect(0, 0, canvas.width, canvas.height);
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
        ctx.drawImage(effectCanvas, 0, 0, W, H);   // 2 倍で 写したので 256x144 に 戻して 描く
        ctx.restore();
    }

    function draw(now, m) {
        drawNow = now;
        ctx.setTransform(RES, 0, 0, RES, 0, 0);
        ctx.imageSmoothingEnabled = false;
        const plan = m && m.spin && spinView ? spinView.plan : null;
        const phase = plan ? phaseAt(plan, m.spin.elapsed) : null;
        if (phase && (phase.name === 'battle' || phase.name === 'cfinal')) phase.pushing = phase.local >= phase.t - (phase.name === 'battle' ? pushTimeOf(plan) : CONFIG.show.pushTime);
        if (phase && phase.name === 'rvagain') phase.pushing = true;   // もう一回 引け！ (引いても 負けたあとの 復活)
        // PUSH を 待つ 場面が 変わったら、押した・引いたを 数え直す (バトルの PUSH と もう一回 引け！)
        if (phase && phase.pushing && spinView && spinView.pushPhase !== phase.index) {
            if (spinView.pushPhase != null) spinView.pushedAt = spinView.pullAt = null;
            spinView.holdStart = null;
            spinView.chargeBase = 0;
            spinView.mash = 0;
            spinView.pushPhase = phase.index;
            if (phase.name === 'rvagain') spinView.pullAt = now;
        }
        // 長押しの ため が いっぱいに なったら 一撃 (2026-10-24)
        if (phase && phase.pushing && spinView && spinView.pushedAt === null && pushModeOf(plan, phase) === 'long' && chargeOf(now) >= 1) {
            spinView.pushedAt = now;
            spinView.holdStart = null;
            Sound.play('pull');
        }
        // レバーを引け！: はじめから 出るか、PUSH！ から changeAt 秒で 変わる (その前に ボタンを 押しても 変わる。push)
        if (plan && plan.lever && phase && phase.name === 'battle' && phase.pushing && spinView.pushedAt === null && spinView.pullAt === null
            && (!plan.leverChange || phase.local >= phase.t - pushTimeOf(plan) + CONFIG.show.lever.changeAt)) leverOn(now);
        currentPhase = phase;
        lightSpin = plan ? { plan, elapsed: m.spin.elapsed } : null;
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

        // バトル中は PUSH の案内を台のボタンにも出す (レバーの ときは「レバーを引け！」。筐体の レバーが 光る)
        //   保留を レバーで 変える ときも (2026-10-24)
        //   大当たり中の レバーも (2026-10-24)。PUSH の 色と 押し方 (長押し・連打) も 台の ボタンに 出す
        const battleLever = Boolean(plan && plan.lever && phase && phase.pushing && spinView.pushedAt === null && spinView.pullAt !== null);
        const bonusLeverOn = Boolean(bonusLever && now >= bonusLever.start);
        const pushing = Boolean(phase && phase.pushing && spinView.pushedAt === null);
        MachineButton.prompt(pushing || Boolean(leverHold) || bonusLeverOn, battleLever || Boolean(leverHold) || bonusLeverOn,
            battleLever ? leverColorOf(plan, phase) : bonusLeverOn ? 'gold' : 'red',
            pushing && !battleLever && !leverHold ? { color: pushColorOf(plan), mode: pushModeOf(plan, phase) || 'tap', charge: chargeOf(now) } : null);
        // レバブル (変動中: リーチに なったとき 1 回)
        if (plan && plan.leverBuru && phase && phase.name === 'reach' && !spinView.buru) {
            spinView.buru = true;
            if (Customize.get('leverBuru') !== 'off' && Customize.get('fx') !== 'quiet') MachineButton.buru(now);
        }

        if (m.bonus) {
            drawBonus(now, m);
            drawPromote(now);
        }
        else {
            if (plan && plan.kind === 'blackout') RashView.drawBlackout(now, plan, phase);
            else if (plan && plan.kind === 'challenge' && phase.name !== 'roll') RashView.drawChallenge(now, plan, phase, m, spinView);
            else if (plan && plan.kind === 'onioni' && plan.pattern) RashView.drawOnioniRash(now, plan, phase);
            else if (m.rush.active && !m.rush.challenge && rashMode === 'okapipo' && (!plan || plan.kind === 'okapipo' || plan.kind === 'plain')) {
                drawOkapipoRash(now, plan, phase);
                if (plan && plan.okaNotice && phase) okapipoNotice(now, plan, phase);
            }
            else if (m.rush.active && !m.rush.challenge && rashMode === 'onioni' && (!plan || (plan.kind !== 'rashBattle' && plan.kind !== 'blackout'))) {
                // おにおにRASH の外れ: 眠っているおにおに
                RashView.drawOnioniRash(now, { pattern: null }, { name: 'roll', local: 0, t: 1 });
            }
            if (phase && phase.name === 'challenge') drawChallenge(now, plan, phase);
            const talkResult = phase && phase.name === 'result' && plan && plan.fig === 1 && plan.enemy && !plan.revival;   // 決着の 必殺技と セリフ
            // 通常時の 引け！の 復活 (2026-10-24): 負けて 見せる result は ずっと、暗転〜フラッシュも、撃破 (rvkill) は 0.6 秒まで バトルを 描く
            const leverRv = plan && plan.fig === 1 && plan.revival && phase && (phase.name === 'result' || (phase.name.startsWith('rv') && (phase.name !== 'rvkill' || phase.local < 0.6)));
            if (phase && (plan.kind === 'rashBattle' || leverRv || (phase.name === 'reach' && phase.local >= 1.4) || ['develop', 'cutin', 'battle', 'pursuit'].includes(phase.name) || (phase.name === 'result' && phase.local < 0.6 && !plan.revival))) {
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
            // 違和感演出 (P4): 変動の はじめに 図柄が 逆に 回る / 一瞬 止まる
            const iw = plan && plan.iwakan && m.spin ? { kind: plan.iwakan, t: m.spin.elapsed, start: now - m.spin.elapsed } : null;
            const iwOn = iw && iw.t < CONFIG.show.iwakan.time;
            rollClock = iwOn && iw.kind === 'reverse' ? n => 2 * iw.start - n + 50 : iwOn && iw.kind === 'stop' && iw.t > 0.2 ? () => iw.start + 0.2 : null;
            const state = drawReels(now, plan, phase);
            rollClock = null;
            iwakanNow = iwOn ? iw : null;   // ノイズなどは いちばん 上に 描く (drawHeaven の まえ)
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
            if (plan && plan.type === 'ikiteru' && phase) drawIkiteru(now, plan, phase);   // こおりいきていける！ (P3)
            if (plan && plan.crack && phase && CRACK_PHASES.includes(phase.name)) drawCrack(now, plan, phase);   // 1・3・5 の ひび割れ
            if (talkResult) drawBattleTalk(now, plan, phase);   // 決着の 必殺技と セリフ (大きい 図柄の 下に)
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
            if (phase && phase.name === 'yaku') drawYakuScreen(now, plan, phase);   // 当たりの 役物の 背景 (いちばん 上に)
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
        drawHeaven(now);   // 天国の カットイン (P3)
        if (iwakanNow) drawIwakan(now, iwakanNow);   // 違和感 (P4)
        iwakanNow = null;
        if (flash && now < flash.until) {
            const t = 1 - (flash.until - now) / flash.length;
            band(44, 44, 0.45);
            text(flash.text, W / 2, 66, 20 + Math.round(Math.sin(Math.min(1, t * 4) * Math.PI / 2) * 4), flash.color);
        }
        applyEffect(RashView.postEffect(plan, phase));
        drawHotFrame(now, m && !m.bonus ? hotLevel(plan, phase) : 0);   // 熱いときに 震える 枠 (2026-10-24)
        return canvas;
    }

    return { init, reset, draw, event, aim, show, push, release, busy, setChoosing, gimmick, yaku, zoom, light, W, H,
        __phase: () => (currentPhase ? currentPhase.name : null),   // 確認用 (いまの 場面の 名前)
        playStory: (name, now) => Story.play(name, now), skipStory: () => Story.skip(),
        storyPlaying: () => Story.active() ? Story.name : null };
})();
