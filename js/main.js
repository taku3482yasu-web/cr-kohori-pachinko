// =====================================================================
// ゲームの進行
// ---------------------------------------------------------------------
// はじめに「台選び」でスペック (1/199・1/319) を選ぶ。スペックごとに釘 (命釘・ワープ) の調整が違う。
// 1/60 秒ごとに 物理 → 入賞を台 (Machine) に伝える → 台の時間をすすめる → 電チュー・アタッカーの開け閉めを盤面に反映。
// 操作: ハンドルを押している間 (または Space) 発射。ハンドルを回す・← → キー・ホイールで強さ。
// URL で (確認用):
//   ?spec=s99              台選びを飛ばしてその台で始める
//   ?auto=1&strength=45    開いてすぐ自動で打ちはじめる (&aim=1 で台の状態に合わせて左打ち・右打ちを切り替える)
//   &skip=30               開いた直後に 30 秒ぶん早送りする (ヘッドレスChromeでは時間が進まないため)
//   &balls=99999           はじめの持ち玉
//   &force=rush            はじめの保留を決める (hit: 大当たり / rush: RUSH へ行く大当たり / small: 小当たり / jitan: 時短から
//                          / reach: リーチ外れ / fail: チャレンジ失敗)。&enemy=onioni でバトルの相手
// =====================================================================

(() => {
    const params = new URLSearchParams(location.search);
    const $ = id => document.getElementById(id);
    const canvas = $('board');
    Lcd.init();

    const game = {
        balls: CONFIG.balls.start,
        strength: loadNumber('koori-pachinko-strength', CONFIG.launch.defaultStrength),
        firing: false,      // ハンドルを握っている / Space を押している
        auto: params.get('auto') === '1',
        autoAim: params.get('aim') === '1',
        nextShot: 0,
        stats: null,
        machine: null,
        board: null,
        world: null,
        view: null,
        lastAim: 'left',
        rushStartBalls: 0
    };
    if (params.has('strength')) game.strength = Number(params.get('strength'));

    function loadNumber(key, fallback) {
        try {
            const raw = localStorage.getItem(key);
            if (raw !== null && !isNaN(Number(raw))) return Number(raw);
        } catch (e) { /* 保存できない環境では初期値 */ }
        return fallback;
    }

    function save(key, value) {
        try { localStorage.setItem(key, String(value)); } catch (e) { /* 無視 */ }
    }

    function setStrength(v) {
        game.strength = Math.max(0, Math.min(100, Math.round(v)));
        save('koori-pachinko-strength', game.strength);
        updateHandle();
    }

    // ----- 台を用意する -----
    function startMachine(specId) {
        const spec = CONFIG.specs[specId];
        game.machine = Machine.create(CONFIG, specId);
        game.board = Board.build(CONFIG, spec.board);
        game.world = { board: game.board, balls: [], rng: Math.random, events: [] };
        game.view = BoardView.create(canvas, game.board, CONFIG);
        game.stats = { launched: 0, launchedLeft: 0, foul: 0, heso: 0, gate: 0, denchu: 0, attacker: 0, general: 0, warp: 0, out: 0, paid: 0, firstHits: 0 };
        Lcd.reset(game.machine);
        MachineButton.prompt(false);
        $('spec-display').textContent = spec.label;
        $('debug-board').textContent = `命釘 ${spec.board.hesoWidth} / ワープ ${spec.board.warpMinVx}`;
    }

    // ----- 1フレーム -----
    let time = 0;
    function tick(dt) {
        time += dt;
        const m = game.machine;
        const aim = Machine.aim(m);
        if (game.auto && game.autoAim) game.strength = CONFIG.launch.presets[aim];
        if ((game.firing || game.auto) && time >= game.nextShot && game.balls > 0 && game.world.balls.length < CONFIG.ball.maxBalls) {
            Physics.launch(game.world, game.strength, CONFIG);
            game.balls--;
            game.stats.launched++;
            if (aim === 'left') game.stats.launchedLeft++;
            game.nextShot = time + CONFIG.launch.interval;
        }
        Physics.step(game.world, dt, CONFIG);
        game.world.events.splice(0).forEach(handleBallEvent);
        Machine.update(m, dt);
        Board.setOpen(game.board, 'denchu', m.parts.denchu);
        Board.setOpen(game.board, 'attacker', m.parts.attacker);
        m.events.splice(0).forEach(handleMachineEvent);
        if (aim !== game.lastAim) {
            game.lastAim = aim;
            Lcd.aim(aim, time);
        }
    }

    function handleBallEvent(e) {
        const s = game.stats;
        if (e.type === 'foul') {
            s.foul++;
            game.balls++;   // ファールの玉は上皿に戻る
        } else if (e.type === 'pocket') {
            s[e.payout]++;
            const pay = { ...CONFIG.payout, ...game.machine.spec.payout }[e.payout] || 0;
            game.balls += pay;
            s.paid += pay;
            if (e.id === 'heso' || e.id === 'denchu' || e.id === 'attacker') Machine.enter(game.machine, e.id);
        } else if (e.type === 'gate') {
            s.gate++;
            Machine.enter(game.machine, 'gate');
        } else if (e.type === 'warp') {
            s.warp++;
        } else if (e.type === 'out') {
            s.out++;
            if (e.stuck && CONFIG.debug) console.warn('玉が止まったのでアウトにした', e.x.toFixed(1), e.y.toFixed(1));
        }
    }

    function handleMachineEvent(e) {
        if (e.type === 'bonusStart' && !e.rush) game.stats.firstHits++;
        if (e.type === 'jitanStart' && e.rushHits === 1) game.rushStartBalls = game.balls;
        if (e.type === 'rushEnd') e.balls = game.balls - game.rushStartBalls;
        Lcd.event(e, time);
    }

    // ----- 表示 -----
    function updateStatus() {
        const s = game.stats;
        const m = game.machine;
        $('balls').textContent = game.balls;
        $('launched').textContent = s.launched;
        $('spins').textContent = m.stats.spins1;
        // 回転率: 左打ちの 250発 (1000円分) あたりのヘソ入賞 (特図1 の抽選の回数)。ファールで戻った玉は打っていないことにする
        const shot = s.launchedLeft - s.foul;
        $('rate').textContent = shot > 0 ? (s.heso / shot * 250).toFixed(1) : '-';
        $('mode-display').textContent = modeText(m);
        $('mode-display').className = 'mode-display mode-' + modeClass(m);
        $('aim-display').hidden = Machine.aim(m) !== 'right';
        if (CONFIG.debug) {
            $('debug-stats').textContent = `ファール ${s.foul} / ゲート ${s.gate} / 電チュー ${s.denchu} / アタッカー ${s.attacker}`
                + ` / 一般 ${s.general} / ワープ ${s.warp} / アウト ${s.out} / 払い出し ${s.paid} / 盤面の玉 ${game.world.balls.length}`
                + ` / 初当たり ${s.firstHits} / 小当たり ${m.stats.smalls} (V ${m.stats.vHits}) / RUSH ${m.stats.rushes} 回`
                + ` / 保留 ${m.holds[1].length}+${m.holds[2].length} / 普図保留 ${m.futsu.holds}`;
        }
    }

    function modeClass(m) {
        if (m.bonus) return 'bonus';
        if (m.small) return 'small';
        if (Machine.inJitan(m)) return 'rush';
        if (m.rush.active) return 'rush';
        return 'normal';
    }

    function modeText(m) {
        if (m.bonus) {
            const b = m.bonus;
            return `大当たり ${b.alloc.label}個  ${b.round}/${b.alloc.rounds}R`;
        }
        if (m.small) return '小当たり  V を狙え！';
        const left = m.jitanLeft + (m.spin && m.spin.jitan ? 1 : 0);
        if (m.rush.active && m.rush.challenge) return Machine.inJitan(m) ? `突破チャレンジ  残り ${left} 回` : '突破チャレンジ  残り保留';
        if (Machine.inJitan(m)) return `RUSH ${m.rush.hits - 1}連  時短 残り ${left} 回`;
        if (m.rush.active) return `RUSH ${m.rush.hits - 1}連  残り保留`;
        return '通常時';
    }

    function updateHandle() {
        $('handle-knob').style.transform = `rotate(${-120 + game.strength * 2.4}deg)`;
        $('strength').textContent = game.strength;
    }

    let last = null;
    let acc = 0;
    function frame(ts) {
        const now = ts / 1000;
        if (last === null) last = now;
        acc = Math.min(acc + now - last, 0.25);
        last = now;
        if (!game.paused) {
            while (acc >= 1 / 60) {
                tick(1 / 60);
                acc -= 1 / 60;
            }
        } else acc = 0;
        BoardView.draw(game.view, game.world, Lcd.draw(time, game.machine));
        MachineButton.update(time);
        updateStatus();
        requestAnimationFrame(frame);
    }

    // ----- 操作 -----
    const handle = $('handle');
    function strengthFromPointer(e) {
        const r = handle.getBoundingClientRect();
        const deg = Math.atan2(e.clientX - (r.left + r.width / 2), -(e.clientY - (r.top + r.height / 2))) * 180 / Math.PI;
        if (deg >= -130 && deg <= 130) setStrength((deg + 120) / 2.4);
    }
    handle.addEventListener('pointerdown', e => {
        handle.setPointerCapture(e.pointerId);
        game.firing = true;
        strengthFromPointer(e);
    });
    handle.addEventListener('pointermove', e => { if (game.firing) strengthFromPointer(e); });
    ['pointerup', 'pointercancel'].forEach(t => handle.addEventListener(t, () => { game.firing = false; }));
    handle.addEventListener('wheel', e => {
        e.preventDefault();
        setStrength(game.strength + (e.deltaY < 0 ? 1 : -1));
    }, { passive: false });

    // 音は画面をさわる・キーを押すまで出せない
    ['pointerdown', 'keydown'].forEach(t => document.addEventListener(t, () => Sound.unlock()));
    MachineButton.init($('koori-button'), () => Lcd.push(time));
    const updateSoundButton = () => { $('sound-button').textContent = `音: ${Sound.muted ? 'OFF' : 'ON'}`; };
    $('sound-button').addEventListener('click', () => { Sound.setMuted(!Sound.muted); updateSoundButton(); });
    updateSoundButton();

    document.addEventListener('keydown', e => {
        if (game.paused) return;
        if (e.code === 'KeyB' && !e.repeat) Lcd.push(time);
        if (e.code === 'Space') { game.firing = true; e.preventDefault(); }
        if (e.code === 'ArrowRight') setStrength(game.strength + (e.shiftKey ? 10 : 1));
        if (e.code === 'ArrowLeft') setStrength(game.strength - (e.shiftKey ? 10 : 1));
    });
    document.addEventListener('keyup', e => { if (e.code === 'Space') game.firing = false; });

    $('left-button').addEventListener('click', () => setStrength(CONFIG.launch.presets.left));
    $('right-button').addEventListener('click', () => setStrength(CONFIG.launch.presets.right));
    $('lend-button').addEventListener('click', () => { game.balls += CONFIG.balls.lend; });

    // ----- 台選び -----
    // スペックをボタンで選ぶ
    const picker = $('machine-picker');
    let chosenSpec = null;
    function openPicker(canClose) {
        game.paused = true;
        game.firing = false;
        picker.hidden = false;
        $('picker-close').hidden = !canClose;
        try { chosenSpec = localStorage.getItem('koori-pachinko-spec'); } catch (e) { chosenSpec = null; }
        if (!CONFIG.specs[chosenSpec]) chosenSpec = Object.keys(CONFIG.specs)[0];
        renderPicker();
    }
    function renderPicker() {
        $('spec-options').innerHTML = '';
        Object.entries(CONFIG.specs).forEach(([id, spec]) => {
            const button = document.createElement('button');
            button.className = 'spec-option' + (id === chosenSpec ? ' selected' : '');
            button.innerHTML = `<span class="spec-label">${spec.label}</span><span class="spec-note">${spec.note}</span>`;
            button.addEventListener('click', () => { chosenSpec = id; renderPicker(); });
            $('spec-options').appendChild(button);
        });
    }
    $('picker-start').addEventListener('click', () => {
        save('koori-pachinko-spec', chosenSpec);
        startMachine(chosenSpec);
        game.balls = CONFIG.balls.start;
        picker.hidden = true;
        game.paused = false;
    });
    $('picker-close').addEventListener('click', () => { picker.hidden = true; game.paused = false; });
    $('machine-button').addEventListener('click', () => openPicker(true));

    // ----- デバッグ -----
    if (CONFIG.debug) {
        $('debug-panel').hidden = false;
        // 次に入る保留の結果を決める
        const force = (buttonId, fig, kind, allocIndex) => $(buttonId).addEventListener('click', () => {
            Machine.debugHold(game.machine, fig, kind, allocIndex);
        });
        force('debug-hit', 1, 'hit', null);
        force('debug-hit-rush', 1, 'hit', 'jitan');
        force('debug-small', 2, 'small', null);
        const enemy = () => $('debug-enemy').value || undefined;
        ['debug-hit', 'debug-hit-rush'].forEach(id => $(id).addEventListener('click', () => {
            if (enemy()) game.machine.holds[1][0].forceEnemy = enemy();
        }));
        $('debug-reach').addEventListener('click', () => Machine.debugHold(game.machine, 1, 'reach', null, { enemy: enemy() === 'naitei' ? undefined : enemy() }));
        $('debug-fail').addEventListener('click', () => Machine.debugHold(game.machine, 1, 'fail', null));
        $('debug-button').addEventListener('click', () => MachineButton.trigger(['red', 'shake', 'beep'][Math.floor(Math.random() * 3)], time));
        $('debug-rainbow').addEventListener('click', () => Machine.debugHold(game.machine, 1, 'hit', null, { holdColor: 'rainbow', enemy: enemy() }));
        $('debug-jitan').addEventListener('click', () => Machine.debugJitan(game.machine));
        $('debug-auto').addEventListener('click', () => {
            game.auto = !game.auto;
            $('debug-auto').textContent = `オート発射: ${game.auto ? 'ON' : 'OFF'}`;
        });
        $('debug-auto').textContent = `オート発射: ${game.auto ? 'ON' : 'OFF'}`;
        $('debug-aim').addEventListener('click', () => {
            game.autoAim = !game.autoAim;
            $('debug-aim').textContent = `オートで打ち分け: ${game.autoAim ? 'ON' : 'OFF'}`;
        });
        $('debug-aim').textContent = `オートで打ち分け: ${game.autoAim ? 'ON' : 'OFF'}`;
        $('debug-reset').addEventListener('click', () => Object.keys(game.stats).forEach(k => { game.stats[k] = 0; }));
    }

    // はじめの台: URL で決まっていればそれ、なければ台選びを開く
    const firstSpec = CONFIG.specs[params.get('spec')] ? params.get('spec') : Object.keys(CONFIG.specs)[0];
    startMachine(firstSpec);
    if (!params.has('spec')) openPicker(false);
    if (params.has('balls')) game.balls = Number(params.get('balls'));
    const force = params.get('force');
    const forceEnemy = params.get('enemy') || undefined;
    if (force === 'hit' || force === 'rush') Machine.debugHold(game.machine, 1, 'hit', force === 'rush' ? 'jitan' : null, { enemy: forceEnemy });
    if (force === 'reach' || force === 'fail') Machine.debugHold(game.machine, 1, force, null, { enemy: forceEnemy });
    if (force === 'small') Machine.debugHold(game.machine, 2, 'small', null);
    if (force === 'jitan') Machine.debugJitan(game.machine);
    updateHandle();
    for (let i = 0; i < Number(params.get('skip') || 0) * 60; i++) tick(1 / 60);
    requestAnimationFrame(frame);
})();
