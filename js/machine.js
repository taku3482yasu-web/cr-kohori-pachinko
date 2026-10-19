// =====================================================================
// 抽選と状態 (パチンコ台の中身。画面・物理には触らない)
// ---------------------------------------------------------------------
// 1種2種混合:
//   特図1 (ヘソ): 大当たり hitRate → firstHit の振り分け
//   特図2 (電チュー): 大当たり hitRate → rushHit / 小当たり smallRate → アタッカーが短く開き、V 入賞で大当たり (rushHit)
//   時短 (RUSH): jitan.spins 回まわすあいだ電サポ (普図が当たりやすく電チューがよく開く)。終われば通常時
//   保留は特図2 を先に消化する。結果は玉が入ったときに決める (先読みに使える)。
//   保留の色・ボタン・変動の流れと時間は Scenario (js/scenario.js) が決める。
//
// 使い方:
//   const m = Machine.create(config, 's199', rng)
//   Machine.enter(m, 'heso' | 'denchu' | 'attacker' | 'gate')   玉が入った・通った
//   Machine.update(m, dt)                                       時間をすすめる
//   m.parts.denchu / m.parts.attacker                           いま開いているか (盤面に反映する)
//   m.events                                                    起きたこと (液晶・表示用。読んだら空にする)
// =====================================================================

const Machine = (() => {
    function weightedPick(list, rng) {
        const total = list.reduce((a, x) => a + x.weight, 0);
        let r = rng() * total;
        for (const x of list) {
            if ((r -= x.weight) < 0) return x;
        }
        return list[list.length - 1];
    }

    function create(config, specId, rng = Math.random) {
        return {
            config, specId, spec: config.specs[specId], rng,
            time: 0,
            jitanLeft: 0,             // 時短の残り回数 (0 なら通常時)
            jitanActive: false,       // 時短に入っている (終わったときに jitanEnd を出すため)
            holds: { 1: [], 2: [] },  // 保留 (それぞれの結果)
            spin: null,               // 変動中の特図 { fig, result, duration, elapsed }
            small: null,              // 小当たりでアタッカーが開いている { timer, alloc }
            bonus: null,              // 大当たり中 { alloc, round, count, phase, timer, fromV }
            futsu: { holds: 0, spin: 0, opening: null },  // 普図 (電チュー)
            parts: { denchu: false, attacker: false },
            rush: { active: false, hits: 0, startTime: 0 },
            stats: { spins1: 0, spins2: 0, hits1: 0, hits2: 0, smalls: 0, vHits: 0, rushes: 0, rushHits: 0, bonusRounds: 0 },
            events: []
        };
    }

    const emit = (m, type, data = {}) => m.events.push({ type, time: m.time, ...data });
    // 時短中 (電サポあり) か。最後の1回は、その変動が止まるまで時短
    const inJitan = m => m.jitanLeft > 0 || Boolean(m.spin && m.spin.jitan);

    // ----- 抽選 -----
    function draw(m, fig) {
        const r = m.rng();
        if (r < m.spec.hitRate) {
            return { kind: 'hit', alloc: weightedPick(fig === 1 ? m.spec.firstHit : m.spec.rushHit, m.rng) };
        }
        if (fig === 2 && r < m.spec.hitRate + m.spec.smallRate) return { kind: 'small' };
        return { kind: 'miss' };
    }

    // ----- 玉が入った -----
    function enter(m, id) {
        const holdMax = m.config.machine.holdMax;
        if (id === 'heso' || id === 'denchu') {
            const fig = id === 'heso' ? 1 : 2;
            if (fig === 2 && m.futsu.opening) m.futsu.opening.count++;
            if (m.holds[fig].length >= holdMax) return;   // 保留がいっぱい (玉は入賞するが抽選しない)
            const result = draw(m, fig);
            addExtras(m, fig, result);
            m.holds[fig].push(result);
            emit(m, 'hold', { fig, result, count: m.holds[fig].length });
        } else if (id === 'attacker') {
            if (m.bonus && m.bonus.phase === 'open') {
                m.bonus.count++;
                emit(m, 'count', { count: m.bonus.count });
            } else if (m.small && !m.small.v) {
                // V 入賞 → 大当たり
                m.small.v = true;
                m.stats.vHits++;
                emit(m, 'v');
                startBonus(m, weightedPick(m.spec.rushHit, m.rng), true);
            }
        } else if (id === 'gate') {
            if (m.futsu.holds < m.config.machine.futsu.holdMax) m.futsu.holds++;
        }
    }

    // ----- 時間をすすめる -----
    function update(m, dt) {
        m.time += dt;
        updateFutsu(m, dt);
        if (m.bonus) updateBonus(m, dt);
        else if (m.small) updateSmall(m, dt);
        else updateSpin(m, dt);
        if (m.jitanActive && !inJitan(m) && !m.bonus) {
            m.jitanActive = false;
            emit(m, 'jitanEnd');
        }
        checkRushEnd(m);
        m.parts.attacker = Boolean((m.bonus && m.bonus.phase === 'open') || (m.small && !m.small.v));
        m.parts.denchu = Boolean(m.futsu.opening && m.futsu.opening.open);
    }

    function updateSpin(m, dt) {
        if (!m.spin) {
            const fig = m.holds[2].length ? 2 : m.holds[1].length ? 1 : 0;
            if (!fig) return;
            const result = m.holds[fig].shift();
            const plan = Scenario.plan(m.config, m.spec, {
                fig, result, holdsLeft: m.holds[fig].length, rush: m.rush.active || inJitan(m), holdColor: result.holdColor
            }, m.rng);
            m.spin = { fig, result, plan, duration: plan.duration, elapsed: 0, jitan: m.jitanLeft > 0 };
            m.stats[fig === 1 ? 'spins1' : 'spins2']++;
            if (m.spin.jitan) m.jitanLeft--;
            emit(m, 'spinStart', { fig, result, plan, duration: plan.duration, jitanLeft: m.jitanLeft });
            return;
        }
        m.spin.elapsed += dt;
        if (m.spin.elapsed < m.spin.duration) return;
        const { fig, result } = m.spin;
        m.spin = null;
        emit(m, 'spinEnd', { fig, result });
        if (result.kind === 'hit') {
            m.stats[fig === 1 ? 'hits1' : 'hits2']++;
            startBonus(m, result.alloc, false);
        } else if (result.kind === 'small') {
            m.stats.smalls++;
            m.small = { timer: m.config.machine.small.open, v: false };
            emit(m, 'smallStart');
        }
    }

    // 保留の色とボタン (特図1 だけ。特図2 の保留はいつも白)
    function addExtras(m, fig, result) {
        if (fig === 1) Object.assign(result, Scenario.hold(m.config, m.spec, result, m.rng));
        else Object.assign(result, { holdColor: 'white', button: null });
    }

    function updateSmall(m, dt) {
        m.small.timer -= dt;
        if (m.small.timer > 0) return;
        m.small = null;
        emit(m, 'smallEnd');
    }

    // ----- 大当たり -----
    function startBonus(m, alloc, fromV) {
        const cfg = m.config.machine.bonus;
        m.small = null;
        m.spin = null;
        m.jitanLeft = 0;
        m.jitanActive = false;
        m.bonus = { alloc, fromV, round: 0, count: 0, phase: 'opening', timer: cfg.opening };
        m.stats.bonusRounds += alloc.rounds;
        if (m.rush.active) {
            m.rush.hits++;
            m.stats.rushHits++;
        }
        emit(m, 'bonusStart', { rounds: alloc.rounds, next: alloc.next, fromV, rush: m.rush.active, rushHits: m.rush.hits });
    }

    function updateBonus(m, dt) {
        const cfg = m.config.machine.bonus;
        const b = m.bonus;
        b.timer -= dt;
        if (b.phase === 'open') {
            if (b.count < cfg.count && b.timer > 0) return;
            emit(m, 'roundEnd', { round: b.round, count: b.count });
            if (b.round >= b.alloc.rounds) {
                b.phase = 'ending';
                b.timer = cfg.ending;
                emit(m, 'ending', { next: b.alloc.next });
            } else {
                b.phase = 'interval';
                b.timer = cfg.interval;
            }
            return;
        }
        if (b.timer > 0) return;
        if (b.phase === 'opening' || b.phase === 'interval') {
            b.round++;
            b.count = 0;
            b.phase = 'open';
            b.timer = cfg.maxTime;
            emit(m, 'roundStart', { round: b.round, rounds: b.alloc.rounds });
        } else if (b.phase === 'ending') {
            m.bonus = null;
            if (b.alloc.next === 'jitan') {
                m.jitanLeft = m.spec.jitan.spins;
                m.jitanActive = true;
                if (!m.rush.active) {
                    m.rush = { active: true, hits: 1, startTime: m.time };
                    m.stats.rushes++;
                }
                emit(m, 'jitanStart', { spins: m.jitanLeft, rushHits: m.rush.hits });
            }
            emit(m, 'bonusEnd', { next: b.alloc.next });
        }
    }

    // RUSH の終わり: 時短が終わり、特図2 の保留も小当たりも残っていない
    function checkRushEnd(m) {
        if (!m.rush.active || inJitan(m) || m.bonus || m.small) return;
        if (m.holds[2].length || (m.spin && m.spin.fig === 2)) return;
        emit(m, 'rushEnd', { hits: m.rush.hits, time: m.time - m.rush.startTime });
        m.rush = { active: false, hits: 0, startTime: 0 };
    }

    // ----- 普図 (ゲート → 電チュー) -----
    function updateFutsu(m, dt) {
        const f = m.futsu;
        const cfg = m.config.machine.futsu;
        const mode = inJitan(m) ? cfg.support : cfg.normal;
        if (f.opening) {
            // 電チューが開いている: open 秒開いて gap 秒閉じるを opens 回。上限の個数入ったら終わり
            const o = f.opening;
            o.timer -= dt;
            if (o.count >= cfg.denchuCount) f.opening = null;
            else if (o.timer <= 0) {
                if (o.open) {
                    o.open = false;
                    o.left--;
                    o.timer = o.gap;
                    if (o.left <= 0) f.opening = null;
                } else {
                    o.open = true;
                    o.timer = o.openTime;
                }
            }
            return;
        }
        if (f.spin > 0) {
            f.spin -= dt;
            if (f.spin > 0) return;
            f.spin = 0;
            if (f.result) {
                f.opening = { open: true, timer: mode.open, openTime: mode.open, gap: mode.gap, left: mode.opens, count: 0 };
                emit(m, 'futsuHit');
            }
            return;
        }
        // 大当たり中は普図を止める (玉はアタッカーへ)
        if (f.holds > 0 && !m.bonus) {
            f.holds--;
            f.result = m.rng() < mode.rate;
            f.spin = mode.spin;
        }
    }

    // 盤面でどちらを狙うか ('left' / 'right')。時短・大当たり・小当たり・残り保留のあいだは右打ち
    function aim(m) {
        if (m.bonus || m.small || inJitan(m) || m.rush.active) return 'right';
        return 'left';
    }

    // ----- デバッグ用 -----
    // 保留を1つ足す (結果を決めて)。allocNext: 'jitan' / 'normal' でその振り分けを選ぶ (null ならふつうに抽選)
    // kind: 'hit' / 'small' / 'reach' (リーチ外れ) / 'fail' (チャレンジ失敗)。options.enemy でバトルの相手、options.holdColor で保留の色
    function debugHold(m, fig, kind, allocNext, options = {}) {
        const list = fig === 1 ? m.spec.firstHit : m.spec.rushHit;
        const pool = allocNext ? list.filter(a => a.next === allocNext) : list;
        const result = kind === 'hit' ? { kind, alloc: weightedPick(pool.length ? pool : list, m.rng) }
            : kind === 'reach' || kind === 'fail' ? { kind: 'miss', force: kind } : { kind };
        addExtras(m, fig, result);
        if (options.enemy) result.forceEnemy = options.enemy;
        if (options.holdColor) result.holdColor = options.holdColor;
        if (options.button) result.button = options.button;
        m.holds[fig].unshift(result);
        if (m.holds[fig].length > m.config.machine.holdMax) m.holds[fig].pop();
        emit(m, 'hold', { fig, result, count: m.holds[fig].length });
    }

    // いきなり時短 (RUSH) に入る
    function debugJitan(m) {
        if (m.bonus) return;
        m.jitanLeft = m.spec.jitan.spins;
        m.jitanActive = true;
        if (!m.rush.active) {
            m.rush = { active: true, hits: 1, startTime: m.time };
            m.stats.rushes++;
        }
        emit(m, 'jitanStart', { spins: m.jitanLeft, rushHits: m.rush.hits });
    }

    return { create, enter, update, aim, inJitan, debugHold, debugJitan };
})();
