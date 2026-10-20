// =====================================================================
// 抽選と状態 (パチンコ台の中身。画面・物理には触らない)
// ---------------------------------------------------------------------
// 1種2種混合:
//   特図1 (ヘソ): 大当たり hitRate → firstHit の振り分け
//   特図2 (電チュー): 大当たり hitRate → rushHit / 小当たり smallRate → アタッカーが短く開き、V 入賞で大当たり (rushHit)
//   時短: まわすあいだ電サポ (普図が当たりやすく電チューがよく開く)。終われば通常時
//     初当たりのあとの時短は突破チャレンジ: 電チューの保留がたまったら (challengeBattle.gatherTimeout 秒でも) おにおにとのバトル。
//     その保留のどれかで当たれば RASH 突入。RASH 中は大当たりのたびに時短 jitan.spins 回
//   遊タイム (天井。ユーザー指定 2026-10-20): 通常時に spec.yutime.at 回まわしても当たらなければ、時短 spec.yutime.spins 回 (m.yutime)。
//     遊タイム中に特図2 で当たれば (小当たり → V も) RASH 突入。特図1 の当たりはふつうの初当たり。外れたまま終われば通常時に戻る
//     数えるのは通常時 (RASH・時短でない) の特図1 の回転数 (m.normalSpins)。大当たりで 0 に戻る
//   RASH のモード (こおりRASH / おにおにRASH) は m.rashMode。Machine.setRashMode で変える (演出だけが変わる)
//   保留は特図2 を先に消化する。結果は玉が入ったときに決める (先読みに使える)。
//   保留の色・ボタン・変動の流れと時間は Scenario (js/scenario.js) が決める。
//
// 使い方:
//   const m = Machine.create(config, 's99', rng)
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
            challengeRun: null,       // 突破チャレンジのバトル中 (Scenario.challengePlan の結果 + 何ラウンド目か index)
            gatherTime: 0,            // 突破チャレンジで保留がたまるのを待っている秒
            rashMode: config.show.rash.defaultMode,
            senyomi: 'recommend',          // 先読みの量 (カスタマイズ。Machine.setSenyomi)
            stage: Scenario.newStage(),   // 通常時のステージ (背景)
            holds: { 1: [], 2: [] },  // 保留 (それぞれの結果)
            spin: null,               // 変動中の特図 { fig, result, duration, elapsed }
            small: null,              // 小当たりでアタッカーが開いている { timer, alloc }
            bonus: null,              // 大当たり中 { alloc, round, count, phase, timer, fromV }
            futsu: { holds: 0, spin: 0, opening: null },  // 普図 (電チュー)
            parts: { denchu: false, attacker: false },
            rush: { active: false, hits: 0, startTime: 0, challenge: false },   // challenge: 突破チャレンジ中 (まだ RUSH に入っていない)
            normalSpins: 0,           // 遊タイムまでに数える回転数 (通常時の特図1。大当たりで 0 に戻る)
            yutime: false,            // 遊タイム中
            stats: { spins1: 0, spins2: 0, hits1: 0, hits2: 0, smalls: 0, vHits: 0, rushes: 0, rushEntries: 0, rushHits: 0, bonusRounds: 0 },
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
        const smallRate = m.rush.challenge && m.spec.challengeSmallRate ? m.spec.challengeSmallRate : m.spec.smallRate;
        if (fig === 2 && r < m.spec.hitRate + smallRate) return { kind: 'small' };
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
            // 突破チャレンジのバトルが始まってから入った保留 (電チューの開き残り・飛んでいた玉) は「おまけ」 (ユーザー指定 2026-10-19):
            // 見た目では保留を増やさず、バトルの決着のあとに「もうひとつおまけに！」で1ラウンドとして結果を見せる
            if (fig === 2 && m.rush.challenge && !inJitan(m)) result.extra = true;
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
                startBonus(m, m.small.alloc || weightedPick(m.spec.rushHit, m.rng), true, m.small.promote, 2);
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
        checkYutimeEnd(m);
        m.parts.attacker = Boolean((m.bonus && m.bonus.phase === 'open') || (m.small && !m.small.v));
        m.parts.denchu = Boolean(m.futsu.opening && m.futsu.opening.open);
    }

    // 突破チャレンジ: 保留がたまるのを待つ (待っているあいだは変動しない)。たまったらバトルを始める
    function gatherChallenge(m, dt) {
        if (!m.rush.challenge || m.challengeRun || m.jitanLeft <= 0) return false;
        const cfg = m.config.show.challengeBattle;
        m.gatherTime += dt;
        const holds = m.holds[2].filter(h => !h.extra);   // おまけの保留はバトルのあと
        if (holds.length < m.config.machine.holdMax && !(m.gatherTime >= cfg.gatherTimeout && holds.length > 0)) return true;
        m.challengeRun = { ...Scenario.challengePlan(m.config, holds), index: 0 };
        m.jitanLeft = 0;   // バトルが始まったら電サポは終わり (たまった保留で勝負)
        emit(m, 'challengeStart', { run: m.challengeRun });
        return false;
    }

    function updateSpin(m, dt) {
        if (!m.spin) {
            if (gatherChallenge(m, dt)) return;
            const fig = m.holds[2].length ? 2 : m.holds[1].length ? 1 : 0;
            if (!fig) return;
            const result = m.holds[fig].shift();
            let run = fig === 2 ? m.challengeRun : null;
            // おまけの保留: バトルの決着のあと、その保留だけで1ラウンド (突破チャレンジのまま。RASH の演出にはしない)
            if (fig === 2 && !run && result.extra && m.rush.challenge) run = { ...Scenario.challengePlan(m.config, [result]), index: 0, extra: true };
            const jitanSpin = m.jitanLeft > 0;
            // 小当たりの出玉 (V に入ったときの大当たりの振り分け) は変動の始まりに決める。
            // 復活 (1/99 は 900個 確定) を出玉の割合を変えずに選べるように (振り分けの割合は V で決めるときと同じ)
            if (result.kind === 'small' && !result.alloc) result.alloc = weightedPick(m.spec.rushHit, m.rng);
            const plan = Scenario.plan(m.config, m.spec, {
                fig, result, holdsLeft: m.holds[fig].length, rush: m.rush.active || inJitan(m), holdColor: result.holdColor,
                inChallenge: m.rush.challenge,
                challenge: run ? { run, index: run.index } : null,
                rashMode: m.rashMode,
                specId: m.specId,
                rushStreak: m.rush.active && !m.rush.challenge ? m.rush.hits - 1 : 0,   // いまの RASH の連チャン数 (表示の「〇連」)
                yutime: m.yutime,
                // RASH の最後の変動 (このあと時短も保留もない)
                isLast: fig === 2 && m.rush.active && !m.rush.challenge && m.jitanLeft - (jitanSpin ? 1 : 0) <= 0 && m.holds[2].length === 0
            }, m.rng);
            if (run) run.index++;
            // 通常時の特図1: ステージを進める (変わったら plan.stage)
            if (fig === 1 && !m.rush.active && !inJitan(m)) plan.stage = Scenario.stepStage(m.config, m.stage, result, m.holds[1], m.rng);
            m.spin = { fig, result, plan, duration: plan.duration, elapsed: 0, jitan: jitanSpin };
            m.stats[fig === 1 ? 'spins1' : 'spins2']++;
            if (fig === 1 && !m.rush.active && !inJitan(m)) m.normalSpins++;
            if (m.spin.jitan) m.jitanLeft--;
            if (fig === 1) changeHolds(m, result);
            emit(m, 'spinStart', { fig, result, plan, duration: plan.duration, jitanLeft: m.jitanLeft });
            if (plan.stage) emit(m, 'stageChange', { stage: plan.stage });
            return;
        }
        m.spin.elapsed += dt;
        if (m.spin.elapsed < m.spin.duration) return;
        const { fig, result, plan } = m.spin;
        m.spin = null;
        if (fig === 1) {
            const back = Scenario.endStage(m.config, m.stage, result);
            if (back) emit(m, 'stageChange', { stage: back });
        }
        // 突破チャレンジのバトルは、決着のラウンドで終わり
        if (plan.kind === 'challenge' && plan.final) m.challengeRun = null;
        emit(m, 'spinEnd', { fig, result, plan });
        if (result.kind === 'hit') {
            m.stats[fig === 1 ? 'hits1' : 'hits2']++;
            startBonus(m, result.alloc, false, plan.promote, fig);
        } else if (result.kind === 'small') {
            m.stats.smalls++;
            // V に入ったらすぐ大当たり (startBonus が閉じる)。V 以外の図柄でそろえた小当たりは、ラウンドの始めに V に昇格する
            m.small = { timer: m.config.machine.small.open, v: false, alloc: result.alloc, promote: plan.promoteV ? { to: 'V', toV: true } : null };
            emit(m, 'smallStart');
        } else if (fig === 1) startYutime(m);
    }

    // 遊タイム: 通常時の回転数が天井に届いたら (外れの変動が止まったとき) 時短に入る
    function startYutime(m) {
        const yt = m.spec.yutime;
        if (!yt || m.yutime || m.rush.active || inJitan(m) || m.normalSpins < yt.at) return;
        m.yutime = true;
        m.jitanLeft = yt.spins;
        m.jitanActive = true;
        m.stats.yutimes = (m.stats.yutimes || 0) + 1;
        emit(m, 'yutimeStart', { spins: yt.spins, at: yt.at });
    }

    // 遊タイムの終わり (当たらなかった): 時短が終わり、特図2 の保留も小当たりも残っていない
    function checkYutimeEnd(m) {
        if (!m.yutime || inJitan(m) || m.bonus || m.small) return;
        if (m.holds[2].length || (m.spin && m.spin.fig === 2)) return;
        m.yutime = false;
        m.normalSpins = 0;
        emit(m, 'yutimeEnd');
    }

    // 保留の色・ボタン・突破チャレンジの武器 (特図2 の保留の色はいつも白)
    function addExtras(m, fig, result) {
        if (fig === 1) Object.assign(result, Scenario.hold(m.config, m.spec, result, m.rng, m.senyomi));
        else {
            Object.assign(result, Scenario.hold2(m.config, result, {
                challenge: m.rush.challenge, rash: m.rush.active, koori: m.rashMode === 'koori',
                streak: m.rush.active && !m.rush.challenge ? m.rush.hits - 1 : 0, spec: m.spec
            }, m.rng));
            if (m.senyomi === 'none') { result.button = null; result.voice = false; result.rashHold = null; }
            if (result.extra) { result.button = null; result.voice = false; }   // おまけの保留は入ったことを見せない
        }
    }

    function setSenyomi(m, level) {
        if (level in m.config.show.senyomi.levels) m.senyomi = level;
    }

    // 保留変化: 変動が始まるとき、その保留 (self) と、1つ進んだ残りの保留 (next) の色を変える
    function changeHolds(m, current) {
        const changed = [];
        if (current.change === 'self') changed.push(current);
        m.holds[1].forEach(h => { if (h.change === 'next') changed.push(h); });
        changed.forEach(h => {
            h.shownColor = h.holdColor;
            h.change = null;
            emit(m, 'holdChange', { result: h, current: h === current, color: h.holdColor });
        });
    }

    function setRashMode(m, mode) {
        if (m.config.show.rash.modes[mode]) m.rashMode = mode;
    }

    function updateSmall(m, dt) {
        m.small.timer -= dt;
        if (m.small.timer > 0) return;
        m.small = null;
        emit(m, 'smallEnd');
    }

    // ----- 大当たり -----
    // promote: 昇格する当たり ({ to: 本当の図柄 }。Scenario が決める)。昇格するまで液晶は中身を隠す (promote.done で出す)
    // fig: 当たった特図 (遊タイム中の特図2 の当たりは RASH 突入)
    function startBonus(m, alloc, fromV, promote = null, fig = 1) {
        const cfg = m.config.machine.bonus;
        m.small = null;
        m.spin = null;
        m.challengeRun = null;
        m.jitanLeft = 0;
        m.jitanActive = false;
        m.bonus = { alloc, fromV, round: 0, count: 0, phase: 'opening', timer: cfg.opening, promote: promote ? { ...promote, done: false } : null };
        m.stats.bonusRounds += alloc.rounds;
        m.normalSpins = 0;
        let entry = false, yutime = false;
        if (m.yutime) {
            m.yutime = false;
            // 遊タイム中の特図2 の当たり → RASH 突入 (突破チャレンジを突破したときと同じ)
            if (fig === 2) {
                m.rush = { active: true, hits: 1, startTime: m.time, challenge: true };
                m.stats.rushes++;
                yutime = true;
            }
        }
        if (m.rush.active) {
            m.rush.hits++;
            m.stats.rushHits++;
            // 突破チャレンジで当たった → RUSH 突入
            if (m.rush.challenge) {
                m.rush.challenge = false;
                m.stats.rushEntries++;
                entry = true;
            }
        }
        // promote: 出玉を隠す昇格 (奇数への昇格)。V への昇格 (toV) は出玉が変わらないので隠さない
        emit(m, 'bonusStart', { rounds: alloc.rounds, label: alloc.label, next: alloc.next, fromV, rush: m.rush.active, rushHits: m.rush.hits, entry, yutime,
            promote: Boolean(promote && !promote.toV), promoteV: Boolean(promote && promote.toV) });
    }

    function updateBonus(m, dt) {
        const cfg = m.config.machine.bonus;
        const b = m.bonus;
        b.timer -= dt;
        if (b.phase === 'open') {
            if (b.count < (b.alloc.count || cfg.count) && b.timer > 0) return;
            emit(m, 'roundEnd', { round: b.round, count: b.count });
            if (b.round >= b.alloc.rounds) {
                b.phase = 'ending';
                b.timer = cfg.ending;
                emit(m, 'ending', { next: b.alloc.next, rushHits: m.rush.active ? m.rush.hits : 0 });
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
            // RASH 中の大当たりの1ラウンド目: 残り保留に当たりがあれば「〇G連確定！」(ユーザー指定)
            //   〇 は残り保留の当たりの数 = このあと確定している連チャンの数 (2026-10-19 ユーザー指定。前は当たりの保留の位置だった)
            if (b.round === 1 && m.rush.active && !m.rush.challenge) {
                const wins = m.holds[2].filter(h => h.kind !== 'miss').length;
                if (wins > 0) emit(m, 'renchan', { games: wins });
            }
        } else if (b.phase === 'ending') {
            m.bonus = null;
            if (b.alloc.next === 'jitan') {
                // 初当たりのあと = 突破チャレンジ。RUSH 中 = 次の大当たりまでの時短
                if (!m.rush.active) {
                    m.rush = { active: true, hits: 1, startTime: m.time, challenge: true };
                    m.stats.rushes++;
                }
                m.jitanLeft = m.rush.challenge ? m.spec.jitan.challengeSpins : m.spec.jitan.spins;
                m.jitanActive = true;
                m.gatherTime = 0;
                m.challengeRun = null;
                emit(m, 'jitanStart', { spins: m.jitanLeft, rushHits: m.rush.hits, challenge: m.rush.challenge });
            }
            emit(m, 'bonusEnd', { next: b.alloc.next });
        }
    }

    // RUSH の終わり: 時短が終わり、特図2 の保留も小当たりも残っていない
    function checkRushEnd(m) {
        if (!m.rush.active || inJitan(m) || m.bonus || m.small) return;
        if (m.holds[2].length || (m.spin && m.spin.fig === 2)) return;
        emit(m, 'rushEnd', { hits: m.rush.hits, time: m.time - m.rush.startTime, challengeFailed: m.rush.challenge });
        m.challengeRun = null;
        m.rush = { active: false, hits: 0, startTime: 0, challenge: false };
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

    // 遊タイムまであと何回 (遊タイムのないスペック・RASH 中・遊タイム中は null)
    function yutimeLeft(m) {
        const yt = m.spec.yutime;
        if (!yt || m.yutime || m.rush.active || inJitan(m)) return null;
        return Math.max(0, yt.at - m.normalSpins);
    }

    // 盤面でどちらを狙うか ('left' / 'right')。時短・大当たり・小当たり・残り保留のあいだは右打ち
    function aim(m) {
        if (m.bonus || m.small || inJitan(m) || m.rush.active) return 'right';
        return 'left';
    }

    // ----- 前回の続き (js/save.js) -----
    // JSON にできる形で台の中身を取り出す (config・spec・乱数・イベントは除く)
    function snapshot(m) {
        const { config, spec, rng, events, ...rest } = m;
        const data = JSON.parse(JSON.stringify(rest));
        // 高確率ステージのきっかけの保留は「同じもの」で比べるので、何番目かを覚えておく
        if (m.stage.hi) {
            const list = [m.spin && m.spin.fig === 1 ? m.spin.result : null, ...m.holds[1]];
            data.stage.hiIndex = list.indexOf(m.stage.hi.target);
            delete data.stage.hi.target;
        }
        return data;
    }

    function restore(config, data, rng = Math.random) {
        const m = create(config, data.specId, rng);
        Object.assign(m, data, { config, spec: config.specs[data.specId], rng, events: [] });
        if (m.stage.hi) {
            const list = [m.spin && m.spin.fig === 1 ? m.spin.result : null, ...m.holds[1]];
            m.stage.hi.target = list[m.stage.hiIndex] || null;
            if (!m.stage.hi.target) m.stage.hi = null;
            delete m.stage.hiIndex;
        }
        return m;
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
        if (options.holdColor) { result.holdColor = result.shownColor = options.holdColor; result.change = null; }
        if (options.button) result.button = options.button;
        if (options.pattern) result.forcePattern = options.pattern;
        if (options.challenge) result.forceChallenge = options.challenge;
        m.holds[fig].unshift(result);
        if (m.holds[fig].length > m.config.machine.holdMax) m.holds[fig].pop();
        emit(m, 'hold', { fig, result, count: m.holds[fig].length });
    }

    // いきなり時短 (突破チャレンジを飛ばして RUSH) に入る
    function debugJitan(m) {
        if (m.bonus) return;
        m.jitanLeft = m.spec.jitan.spins;
        m.jitanActive = true;
        if (!m.rush.active) {
            m.rush = { active: true, hits: 2, startTime: m.time, challenge: false };   // 突破したあとと同じ (1連目)
            m.stats.rushes++;
        }
        emit(m, 'jitanStart', { spins: m.jitanLeft, rushHits: m.rush.hits, challenge: false });
    }

    // いきなり突破チャレンジにして、保留を count 個入れる (winIndex 番目だけ小当たり。-1 ならぜんぶ外れ)
    //   extra: 'hit' / 'miss' でおまけの保留 (バトル中に入った保留) を1つ足す
    function debugChallenge(m, count = 4, winIndex = -1, extra = null) {
        if (m.bonus) return;
        m.rush = { active: true, hits: 1, startTime: m.time, challenge: true };
        m.stats.rushes++;
        m.jitanLeft = m.spec.jitan.challengeSpins;
        m.jitanActive = true;
        m.gatherTime = 0;
        m.challengeRun = null;
        emit(m, 'jitanStart', { spins: m.jitanLeft, rushHits: 1, challenge: true });
        for (let i = 0; i < count; i++) {
            const result = { kind: i === winIndex ? 'small' : 'miss' };
            addExtras(m, 2, result);
            m.holds[2].push(result);
            emit(m, 'hold', { fig: 2, result, count: m.holds[2].length });
        }
        if (extra) {
            const result = { kind: extra === 'hit' ? 'small' : 'miss', extra: true };
            addExtras(m, 2, result);
            m.holds[2].push(result);
        }
    }

    return { create, enter, update, aim, inJitan, yutimeLeft, setRashMode, setSenyomi, snapshot, restore, debugHold, debugJitan, debugChallenge };
})();
