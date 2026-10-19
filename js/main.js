// =====================================================================
// ゲームの進行 (段階1: 玉を打って盤面で遊べるところまで)
// ---------------------------------------------------------------------
// 1/60 秒ごとに物理を進め、出てきたこと (入賞・ファール) で持ち玉を増減する。
// 操作: ハンドルを押している間 (または Space) 発射。ハンドルを回す・← → キー・ホイールで強さ。
// URL に ?auto=1&strength=45 を付けると、開いてすぐ自動で打ちはじめる (確認用)。
// さらに &skip=30 で、開いた直後に 30 秒ぶん早送りする (ヘッドレスChromeでの確認用。時間が進まないため)。
// =====================================================================

(() => {
    const params = new URLSearchParams(location.search);
    const board = Board.build(CONFIG);
    const world = { board, balls: [], rng: Math.random, events: [] };
    const view = BoardView.create(document.getElementById('board'), board, CONFIG);
    Lcd.init();

    const game = {
        balls: CONFIG.balls.start,
        strength: loadStrength(),
        firing: false,      // ハンドルを握っている / Space を押している
        auto: params.get('auto') === '1',
        nextShot: 0,
        stats: { launched: 0, foul: 0, heso: 0, gate: 0, denchu: 0, attacker: 0, general: 0, warp: 0, out: 0, paid: 0 }
    };
    if (params.has('strength')) game.strength = Number(params.get('strength'));

    function loadStrength() {
        try {
            const v = Number(localStorage.getItem('koori-pachinko-strength'));
            if (v >= 0 && v <= 100 && localStorage.getItem('koori-pachinko-strength') !== null) return v;
        } catch (e) { /* 保存できない環境では初期値 */ }
        return CONFIG.launch.defaultStrength;
    }

    function setStrength(v) {
        game.strength = Math.max(0, Math.min(100, Math.round(v)));
        try { localStorage.setItem('koori-pachinko-strength', String(game.strength)); } catch (e) { /* 無視 */ }
        updateHandle();
    }

    // ----- 1フレーム -----
    let time = 0;
    function tick(dt) {
        time += dt;
        if ((game.firing || game.auto) && time >= game.nextShot && game.balls > 0 && world.balls.length < CONFIG.ball.maxBalls) {
            Physics.launch(world, game.strength, CONFIG);
            game.balls--;
            game.stats.launched++;
            game.nextShot = time + CONFIG.launch.interval;
        }
        Physics.step(world, dt, CONFIG);
        world.events.splice(0).forEach(handleEvent);
    }

    function handleEvent(e) {
        const s = game.stats;
        if (e.type === 'foul') {
            s.foul++;
            game.balls++;   // ファールの玉は上皿に戻る
        } else if (e.type === 'pocket') {
            s[e.payout]++;
            const pay = CONFIG.payout[e.payout] || 0;
            game.balls += pay;
            s.paid += pay;
            if (e.id === 'heso') Lcd.show('START!', '#ffe066', time);
            if (e.id === 'attacker') Lcd.show('ATTACKER!', '#ff6680', time);
            if (e.id === 'denchu') Lcd.show('電チュー!', '#ff9ec0', time);
        } else if (e.type === 'gate') {
            s.gate++;
            Lcd.show('GATE', '#9cff8a', time, 0.5);
        } else if (e.type === 'warp') {
            s.warp++;
        } else if (e.type === 'out') {
            s.out++;
            if (e.stuck && CONFIG.debug) console.warn('玉が止まったのでアウトにした', e.x.toFixed(1), e.y.toFixed(1));
        }
    }

    // ----- 表示 -----
    const $ = id => document.getElementById(id);
    function updateStatus() {
        const s = game.stats;
        $('balls').textContent = game.balls;
        $('launched').textContent = s.launched;
        $('heso').textContent = s.heso;
        // 回転率: 250発 (1000円分) あたりのヘソ入賞。ファールで戻った玉は打っていないことにする
        const shot = s.launched - s.foul;
        $('rate').textContent = shot > 0 ? (s.heso / shot * 250).toFixed(1) : '-';
        if (CONFIG.debug) {
            $('debug-stats').textContent = `ファール ${s.foul} / ゲート ${s.gate} / 電チュー ${s.denchu} / アタッカー ${s.attacker}`
                + ` / 一般 ${s.general} / ワープ ${s.warp} / アウト ${s.out} / 払い出し ${s.paid} / 盤面の玉 ${world.balls.length}`;
        }
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
        while (acc >= 1 / 60) {
            tick(1 / 60);
            acc -= 1 / 60;
        }
        BoardView.draw(view, world, Lcd.draw(time));
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

    document.addEventListener('keydown', e => {
        if (e.code === 'Space') { game.firing = true; e.preventDefault(); }
        if (e.code === 'ArrowRight') setStrength(game.strength + (e.shiftKey ? 10 : 1));
        if (e.code === 'ArrowLeft') setStrength(game.strength - (e.shiftKey ? 10 : 1));
    });
    document.addEventListener('keyup', e => { if (e.code === 'Space') game.firing = false; });

    $('left-button').addEventListener('click', () => setStrength(CONFIG.launch.presets.left));
    $('right-button').addEventListener('click', () => setStrength(CONFIG.launch.presets.right));
    $('lend-button').addEventListener('click', () => { game.balls += CONFIG.balls.lend; });

    // ----- デバッグ -----
    if (CONFIG.debug) {
        $('debug-panel').hidden = false;
        const toggle = (id, buttonId, label) => $(buttonId).addEventListener('click', () => {
            Board.setOpen(board, id, !Board.isOpen(board, id));
            $(buttonId).textContent = `${label}: ${Board.isOpen(board, id) ? '開' : '閉'}`;
        });
        toggle('denchu', 'debug-denchu', '電チュー');
        toggle('attacker', 'debug-attacker', 'アタッカー');
        $('debug-auto').addEventListener('click', () => {
            game.auto = !game.auto;
            $('debug-auto').textContent = `オート発射: ${game.auto ? 'ON' : 'OFF'}`;
        });
        $('debug-auto').textContent = `オート発射: ${game.auto ? 'ON' : 'OFF'}`;
        $('debug-reset').addEventListener('click', () => Object.keys(game.stats).forEach(k => { game.stats[k] = 0; }));
    }

    updateHandle();
    for (let i = 0; i < Number(params.get('skip') || 0) * 60; i++) tick(1 / 60);
    requestAnimationFrame(frame);
})();
