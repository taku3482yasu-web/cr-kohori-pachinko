// =====================================================================
// 演出の筋書き (抽選の結果から、保留の色・ボタン・変動の流れ・ふるカワのセリフを決める)
// ---------------------------------------------------------------------
// 画面には触らない (台の Machine とシミュレーターからも使う)。決め方の数値は config.show。
//   Scenario.hold(config, spec, result, rng)   玉がヘソに入ったとき: { holdColor, button }
//   Scenario.hold2(config, result, ctx, rng)   玉が電チューに入ったとき: { holdColor, button, weapon }
//   Scenario.challengePlan(config, holds)      突破チャレンジのバトルが始まるとき: 保留ごとの武器・決着のラウンド・時間
//   Scenario.plan(config, spec, spin, rng)     変動が始まるとき: { kind, duration, phases, digits, enemy, win, talk, ... }
// phases は [{ name, t }] の並び。液晶はこれを時間どおりに描く。kind (特図2):
//   'challenge' 突破チャレンジのバトルの1ラウンド (cintro → cround / cfinal → cresult)。おまけのラウンドは cextra → cfinal → cresult
//   'rashBattle' こおりRASH のバトル (roll → battle → result。enemyKey: 相手 (怪は ○○Kai) / enemy: 描くキャラクター / kai: 怪の状態)
//     revival: 復活 (result で一度負けて見せ、rvdark → rvnaitei → rvcant → rvstill → rvsoredemo → rvflash → rvkill で撃破)
//   'onioni' おにおにRASH (wait → anomaly → open、外れは roll だけ)
// =====================================================================

const Scenario = (() => {
    function weighted(weights, rng) {
        const entries = Object.entries(weights).filter(([, w]) => w > 0);
        const total = entries.reduce((a, [, w]) => a + w, 0);
        let r = rng() * total;
        for (const [k, w] of entries) {
            if ((r -= w) < 0) return k;
        }
        return entries[entries.length - 1][0];
    }

    const pickFrom = (list, rng) => list[Math.floor(rng() * list.length)];

    // ----- 保留 (玉がヘソに入ったとき) -----
    // ボタンが起きる確率: 当たりは hitRate。外れは「起きたときに当たりの割合が reliability」になる値
    function buttonMissRate(show, spec) {
        const h = spec.hitRate;
        const b = show.button;
        return b.hitRate * h * (1 - b.reliability) / b.reliability / (1 - h);
    }

    // level: 先読みの量 (config.show.senyomi.levels のキー)。当たりは占有率 occ で先読みを出し、外れのガセは fake 倍にする
    function hold(config, spec, result, rng, level = 'recommend') {
        const show = config.show;
        const sy = show.senyomi;
        const lv = sy.levels[level] || sy.levels.recommend;
        if (lv.occ <= 0) return { holdColor: 'white', shownColor: 'white', button: null, hiStage: false, voice: false };
        const hit = result.kind === 'hit';
        const weights = show.holdColors[hit ? 'hit' : 'miss'];
        const colored = Object.fromEntries(Object.entries(weights).filter(([c]) => c !== 'white'));
        // 虹色は当たりのときだけ
        const kinds = hit ? { ...show.button.kinds, ...show.button.hitOnlyKinds } : show.button.kinds;
        const hi = show.stages.hi;
        const h = spec.hitRate;
        let holdColor = 'white', button = null, hiStage = false, voice = false;
        if (hit) {
            // 当たり: 占有率で「先読みを出すか」を1回だけ決める。出すなら必ず色が付き、ボタン・高確率ステージはその中で
            if (rng() < lv.occ) {
                holdColor = weighted(colored, rng);
                if (rng() < show.button.hitRate / sy.base) button = weighted(kinds, rng);
                hiStage = rng() < hi.hitRate / sy.base;
            }
            voice = rng() < show.voice.hitRate;
        } else {
            // 外れ (ガセ): それぞれの出る量を fake 倍
            const total = Object.values(weights).reduce((a, x) => a + x, 0);
            const coloredShare = Object.values(colored).reduce((a, x) => a + x, 0) / total;
            if (rng() < Math.min(1, coloredShare * lv.fake)) holdColor = weighted(colored, rng);
            if (rng() < buttonMissRate(show, spec) * lv.fake) button = weighted(kinds, rng);
            hiStage = rng() < hi.hitRate * h * (1 - hi.reliability) / hi.reliability / (1 - h) * lv.fake;
            const v = show.voice;
            voice = rng() < v.hitRate * h * (1 - v.reliability) / v.reliability / (1 - h) * lv.fake;
        }
        // 保留変化: 色が付く保留の一部は、最初は白で出して途中で変わる
        let shownColor = holdColor;
        let change = null;
        let changed = false;
        if (holdColor !== 'white' && rng() < (hit ? sy.change.hitRate : sy.change.missRate)) {
            shownColor = 'white';
            change = rng() < sy.change.self ? 'self' : 'next';
            changed = true;   // 保留変化した保留は、外れでも必ずチャレンジ演出に入る
        }
        return { holdColor, shownColor, change, changed, button, hiStage, voice };
    }

    // ----- 通常時のステージ (背景) -----
    // 特図1 の変動が始まるときに呼ぶ。state (m.stage) を書きかえて、変わったら { id, kind } を返す (kind: 'regular' / 'quick' / 'hi' / 'back')
    //   result: この変動の保留 / holds: 残りの保留
    function newStage() {
        return { id: 'tsugakuro', index: 0, since: 0, rolled: false, hi: null };
    }

    function stepStage(config, state, result, holds, rng) {
        const st = config.show.stages;
        const all = [result, ...holds];
        state.since++;
        const goNext = kind => {
            state.index = (state.index + 1) % st.cycle.length;
            state.id = st.cycle[state.index];
            state.since = 0;
            state.rolled = false;
            return { id: state.id, kind };
        };
        // 高確率ステージ中: きっかけの保留まではそのまま
        if (state.hi) return null;
        // 高確率ステージへ (外れの保留は、ステージが変わってすぐの間は移らない)
        const trigger = all.find(h => h.hiStage && (h.kind === 'hit' || state.since > st.quick.window));
        if (trigger) {
            state.hi = { target: trigger, id: st.hi.ids[Math.floor(rng() * st.hi.ids.length)] };
            return { id: state.hi.id, kind: 'hi' };
        }
        // すぐ変わる (当たり濃厚): ステージが変わってから window 回転以内に当たりの保留があれば、1回だけ抽選
        if (state.since <= st.quick.window && !state.rolled && all.some(h => h.kind === 'hit')) {
            state.rolled = true;
            if (rng() < st.quick.rate) return goNext('quick');
        }
        if (state.since >= st.interval) return goNext('regular');
        return null;
    }

    // 変動が終わったとき: 高確率ステージ (チャンスステージ) のきっかけの保留を消化したら、次の通常ステージへ
    // (前は元のステージに戻っていた。2026-10-20 ユーザー指定で、別の通常ステージに行くようにした)
    function endStage(config, state, result) {
        if (state.hi && state.hi.target === result) {
            const cycle = config.show.stages.cycle;
            state.hi = null;
            state.index = (state.index + 1) % cycle.length;
            state.id = cycle[state.index];
            state.since = 0;
            state.rolled = false;
            return { id: state.id, kind: 'back' };
        }
        return null;
    }

    // いまの背景
    const stageMap = state => state.hi ? state.hi.id : state.id;

    // ----- 保留 (玉が電チューに入ったとき) -----
    // RASH 中・突破チャレンジ中: 当たりの保留の rashButton.hitRate でボタン (外れでは起きない)。突破チャレンジ中は武器も決める
    function hold2(config, result, ctx, rng) {
        const show = config.show;
        const win = result.kind !== 'miss';
        const button = ctx.rash && win && rng() < show.rashButton.hitRate ? weighted(show.rashButton.kinds, rng) : null;
        // 入賞時の音 + 赤いボタン (ユーザー指定 2026-10-19): RASH 中・突破チャレンジ中も、当たりの保留の voice.hitRate (60%)。外れでは鳴らない
        const voice = ctx.rash && win && rng() < show.voice.hitRate;
        // RASH 中の当たりの保留は、黒い保留か回る保留になることがある (当たり確定)
        const rh = show.rashHolds;
        const rashHold = ctx.rash && !ctx.challenge && win && rng() < rh.rate ? weighted(rh.kinds, rng) : null;
        let weapon = null;
        if (ctx.challenge) {
            const weapons = show.challengeBattle.weapons;
            weapon = weighted(Object.fromEntries(Object.entries(weapons).map(([id, w]) => [id, win ? w.hit : w.miss])), rng);
        }
        // こおりRASH の怪 (ユーザー指定 2026-10-19): 怪の相手が出る保留は、入賞時の音 (先バレ音) が鳴ってボタンが紫に光る
        const kai = Boolean(ctx.koori && ctx.rash && !ctx.challenge && rng() < kaiRate(config, ctx.spec, win, ctx.streak));
        if (kai) return { holdColor: 'white', button: 'purple', weapon, voice: true, rashHold, kai };
        return { holdColor: 'white', button, weapon, voice, rashHold, kai };
    }

    // ----- 突破チャレンジのバトル -----
    // holds: たまった保留。最初に当たる保留のラウンドで勝ち、どれも外れなら最後のラウンドで負け
    function challengePlan(config, holds) {
        const t = config.show.challengeBattle.timing;
        const winIndex = holds.findIndex(h => h.kind !== 'miss');
        const final = winIndex >= 0 ? winIndex : holds.length - 1;
        return { weapons: holds.map(h => h.weapon || 'fist'), winIndex, final, count: holds.length, timing: t };
    }

    // ----- バトル: 外れのときの相手の重み -----
    // 相手 i の成功率 win_i を守るには、外れでその相手が出る量 = 当たりで出る量 × (1 - win_i) / win_i
    // battles: 相手の表 (show.battles / show.kooriRash.enemies)、hitRate: 1回の変動で当たる確率
    function missBattleMass(show, spec, battles = show.battles, hitRate = spec.hitRate) {
        const totalHit = Object.values(battles).reduce((a, b) => a + b.hit, 0);
        const mass = {};
        Object.entries(battles).forEach(([id, b]) => {
            mass[id] = b.win >= 1 ? 0 : hitRate * (b.hit / totalHit) * (1 - b.win) / b.win;
        });
        return mass;
    }

    // こおりRASH の相手の表: 怪の状態を別の相手として並べる ({ key: { name, base, kai, hit, win, map } })。
    //   key は相手の id (怪は 'okagappaKai' のように Kai を付ける)。base は描くキャラクター。
    //   streak: いまの RASH の連チャン数。minStreak に届かない相手 (アルアル) は入れない (null ならすべて)
    function kooriEnemies(config, streak = null) {
        const table = {};
        Object.entries(config.show.kooriRash.enemies).forEach(([id, e]) => {
            if (streak !== null && e.minStreak && streak < e.minStreak) return;
            table[id] = { name: e.name, base: id, kai: false, hit: e.hit, win: e.win, map: e.map };
            const kaiReady = e.kai && !(streak !== null && e.kai.minStreak && streak < e.kai.minStreak);
            if (kaiReady) table[`${id}Kai`] = { name: e.kai.name, base: id, kai: true, hit: e.kai.hit, win: e.kai.win, map: e.map };
        });
        return table;
    }

    // こおりRASH の保留が怪になる割合 (玉が入ったときに決める)。相手ごとの成功率を守る値:
    //   当たり: 当たりの重みのうち怪の分 / 外れ: 外れで怪の相手が出る量 (missBattleMass) の合計 ÷ 外れの確率
    function kaiRate(config, spec, win, streak) {
        const enemies = kooriEnemies(config, streak);
        const list = Object.values(enemies);
        if (win) return list.filter(e => e.kai).reduce((a, e) => a + e.hit, 0) / list.reduce((a, e) => a + e.hit, 0);
        const h2 = spec.hitRate + spec.smallRate;
        const mass = missBattleMass(config.show, spec, enemies, h2);
        const kaiMass = Object.entries(mass).filter(([id]) => enemies[id].kai).reduce((a, [, x]) => a + x, 0);
        return Math.min(1, kaiMass / (1 - h2));
    }

    // 復活になる割合: こおりRASH の当たりのうち share (20%) にするため、起きられる当たり
    // (ブラックアウトでない・確定の相手でない・出玉が合う) の中での割合
    function revivalRate(config, spec, specId, streak) {
        const rv = config.show.revival;
        const enemies = Object.values(kooriEnemies(config, streak));
        const totalHit = enemies.reduce((a, e) => a + e.hit, 0);
        const notSure = enemies.filter(e => e.win < 1).reduce((a, e) => a + e.hit, 0) / totalHit;
        const notBlackout = 1 - config.show.blackout.rate * (1 - kaiRate(config, spec, true, streak));
        const label = rv.labels[specId];
        const allocs = spec.rushHit;
        const labelShare = label
            ? allocs.filter(a => a.label === label).reduce((a, x) => a + x.weight, 0) / allocs.reduce((a, x) => a + x.weight, 0) : 1;
        return Math.min(1, rv.share / (notSure * notBlackout * labelShare));
    }

    // 外れのうちリーチ (チャレンジ成功 → バトル負け) になる割合
    function reachMissRate(show, spec) {
        const total = Object.values(missBattleMass(show, spec)).reduce((a, x) => a + x, 0);
        return Math.min(show.challengeRate, total / (1 - spec.hitRate));
    }

    // ----- 図柄 -----
    function hitDigit(show, result, fig, rng) {
        const a = result.alloc;
        const odd = a.label >= show.bigLabel || (fig === 1 && a.next === 'jitan');
        return pickFrom(show.hitFigures[odd ? 'odd' : 'even'], rng);
    }

    // 当たりの図柄 (そろって見せる図柄)。奇数のうち promote.rate は偶数で見せて、ラウンド中に昇格させる (p.promote に本当の図柄)
    function shownHitDigit(show, result, fig, rng, p) {
        const real = hitDigit(show, result, fig, rng);
        if (Figures_isOdd(real) && rng() < show.promote.rate) {
            p.promote = { to: real };
            return pickFrom(show.hitFigures.even, rng);
        }
        return real;
    }
    const Figures_isOdd = n => typeof n === 'number' && n % 2 === 1;

    const randomFigure = rng => 1 + Math.floor(rng() * 7);

    // reach: 左右だけそろえる (中は違う) / それ以外の外れ: 左右をそろえない
    function missDigits(reach, rng) {
        const l = randomFigure(rng);
        let r = reach ? l : randomFigure(rng);
        while (!reach && r === l) r = randomFigure(rng);
        let c = randomFigure(rng);
        while (c === l && c === r) c = randomFigure(rng);
        if (reach) while (c === l) c = randomFigure(rng);
        return [l, c, r];
    }

    // ----- 変動の筋書き -----
    // spin: { fig, result, holdsLeft (この変動のあとに残っている保留の数), rush (RUSH 中か), holdColor }
    function plan(config, spec, spin, rng) {
        const show = config.show;
        const t = show.timing;
        const { fig, result } = spin;

        if (fig === 2) return plan2(config, spec, spin, rng);

        const hit = result.kind === 'hit';
        let type;   // 'plain' / 'fail' / 'reach'
        if (hit || result.force === 'reach') type = 'reach';
        else if (result.force === 'fail') type = 'fail';
        else {
            const r = rng();
            const reach = reachMissRate(show, spec);
            type = r < reach ? 'reach' : r < show.challengeRate ? 'fail' : 'plain';
            // 保留変化した外れの保留は、必ずチャレンジ (失敗) に入る
            if (type === 'plain' && result.changed) type = 'fail';
        }

        const p = { fig, type, win: hit, talk: null };
        if (type === 'plain') {
            const duration = t.miss[Math.min(t.miss.length, spin.holdsLeft + 1) - 1];
            p.phases = [{ name: 'roll', t: duration }];
            p.digits = missDigits(false, rng);
        } else {
            const pick = id => show.challenges[id][hit ? 'hit' : 'miss'];
            p.challenge = result.forceChallenge || weighted(Object.fromEntries(Object.keys(show.challenges).map(id => [id, pick(id)])), rng);
            if (type === 'fail') {
                p.phases = [{ name: 'roll', t: t.roll }, { name: 'challenge', t: t.challenge }, { name: 'fail', t: t.fail }];
                p.digits = missDigits(false, rng);
            } else {
                const enemyWeights = hit
                    ? Object.fromEntries(Object.entries(show.battles).map(([id, b]) => [id, b.hit]))
                    : missBattleMass(show, spec);
                p.enemy = result.forceEnemy || weighted(enemyWeights, rng);
                p.phases = [{ name: 'roll', t: t.roll }, { name: 'challenge', t: t.challenge }, { name: 'reach', t: t.reach },
                    { name: 'battle', t: t.battle }, { name: 'result', t: t.result }];
                if (hit) p.digits = Array(3).fill(shownHitDigit(show, result, fig, rng, p));
                else p.digits = missDigits(true, rng);
                const f = show.furukawa;
                p.reply = f.replies[p.enemy] ? pickFrom(f.replies[p.enemy], rng) : null;
                p.defeatLine = hit && f.defeatLines[p.enemy] ? pickFrom(f.defeatLines[p.enemy], rng) : null;
            }
        }
        p.duration = p.phases.reduce((a, ph) => a + ph.t, 0);
        // 通常時だけ、ふるカワが変動の始まりにしゃべる
        if (!spin.rush) p.talk = talk(show, p, spin, rng);
        return p;
    }

    // ----- 特図2 の変動 (突破チャレンジ・RASH) -----
    function plan2(config, spec, spin, rng) {
        const show = config.show;
        const f2 = config.machine.spin.fig2;
        const { result } = spin;
        const kind = result.kind;
        const win = kind !== 'miss';
        const p = { fig: 2, win, talk: null };
        // 小当たりも V 以外の図柄でそろえることがある (ラウンドの始めに V に昇格。出玉の振り分けから奇数・偶数を選ぶ)
        const vPromote = kind === 'small' && result.alloc && rng() < show.promote.vRate;
        if (vPromote) p.promoteV = true;
        const digits = kind === 'hit' ? Array(3).fill(shownHitDigit(show, result, 2, rng, p))
            : kind === 'small' ? (vPromote ? Array(3).fill(hitDigit(show, result, 2, rng)) : ['V', 'V', 'V']) : missDigits(false, rng);
        p.digits = digits;
        const plain = kind === 'hit' ? f2.hit : kind === 'small' ? f2.small : f2.miss;

        const bo = show.blackout;
        // RASH に入ってから (突破チャレンジ中は出さない)
        const kaiHold = Boolean(result.kai) && spin.rashMode === 'koori';   // 怪の保留 (先バレしたので必ず怪のバトル)
        if (spin.rush && !spin.inChallenge && win && !kaiHold && result.force !== 'revival' && (result.force === 'blackout' || rng() < bo.rate)) {
            // ブラックアウト (突発当たり): モードに関係なく
            p.kind = 'blackout';
            p.phases = [{ name: 'dark', t: bo.timing.dark }, { name: 'bokoori', t: bo.timing.koori },
                { name: 'atari', t: bo.timing.atari }, { name: 'itadaki', t: bo.timing.itadaki }];
            p.reveal = { phase: 'itadaki', at: 0.1 };
        } else if (spin.challenge) {
            // 突破チャレンジ: 1ラウンド目の前に登場、決着のラウンドは長く
            const { run, index } = spin.challenge;
            const t = run.timing;
            p.kind = 'challenge';
            p.round = run.extra ? config.machine.holdMax : index;
            p.extra = Boolean(run.extra);   // おまけのラウンド (「もうひとつおまけに！」から)
            p.weapon = run.weapons[index] || 'fist';
            p.final = index === run.final;
            p.win = p.final && run.winIndex >= 0;
            p.phases = run.extra ? [{ name: 'cextra', t: t.extra }] : index === 0 ? [{ name: 'cintro', t: t.intro }] : [];
            if (index < run.final) p.phases.push({ name: 'cround', t: t.round });
            else if (p.final) p.phases.push({ name: 'cfinal', t: t.final }, { name: 'cresult', t: t.result });
            else p.phases.push({ name: 'roll', t: plain });
            if (index === 0 && !run.extra) p.reply = pickFrom(show.furukawa.challengeLines, rng);
            if (p.win) p.reveal = { phase: 'cresult', at: 0.4 };
        } else if (spin.rush && spin.rashMode === 'koori') {
            // こおりRASH: 当たり・最後の保留は必ずバトル。外れでもときどき (成功率を守る割合で) バトル
            // 怪の保留は怪の相手から、それ以外はふつうの相手から選ぶ
            const streak = spin.rushStreak == null ? null : spin.rushStreak;
            const available = kooriEnemies(config, streak);
            const enemies = Object.fromEntries(Object.entries(available).filter(([, e]) => e.kai === kaiHold));
            const h2 = spec.hitRate + spec.smallRate;
            const mass = missBattleMass(show, spec, enemies, h2);
            // ふつうの保留の外れ: 当たりのうちブラックアウトになる分はバトルにならず、最後の保留 (lastShare) は外れでも必ずバトルになるので、
            // そのぶんを差し引いて外れのバトルの割合を決める (相手の成功率を守るため)。怪の保留の外れは必ずバトル
            const fullMass = missBattleMass(show, spec, available, h2);
            const plainMass = Object.entries(fullMass).filter(([id]) => !available[id].kai).reduce((a, [, x]) => a + x, 0);
            const need = plainMass * (1 - show.blackout.rate) - show.kooriRash.lastShare;
            const plainMissShare = (1 - h2) * (1 - kaiRate(config, spec, false, streak));
            const fakeRate = Math.min(1, Math.max(0, need) / plainMissShare);
            if (win || kaiHold || spin.isLast || result.force === 'reach' || rng() < fakeRate) {
                const t = show.kooriRash.timing;
                p.kind = 'rashBattle';
                p.type = 'reach';
                p.smallReels = true;
                // バトルのときは必ずリーチの図柄 (外れも左右をそろえる。2026-10-20 ユーザー指定)。当たりは 3つそろう
                if (!win) p.digits = missDigits(true, rng);
                // 強制の相手 (確認用) は、出られない相手 (アルアル) でも出す
                const all = kooriEnemies(config);
                p.enemyKey = result.forceEnemy && all[result.forceEnemy] ? result.forceEnemy
                    : weighted(win ? Object.fromEntries(Object.entries(enemies).map(([id, e]) => [id, e.hit])) : mass, rng);
                p.enemyInfo = all[p.enemyKey];
                p.enemy = p.enemyInfo.base;   // 描くキャラクター
                p.kai = p.enemyInfo.kai;
                p.phases = [{ name: 'roll', t: t.roll }, { name: 'battle', t: t.battle }, { name: 'result', t: t.result }];
                const f = show.furukawa;
                const replies = p.kai ? f.replies.kai : f.replies[p.enemy];
                p.reply = replies ? pickFrom(replies, rng) : null;
                if (win) p.reveal = { phase: 'result', at: 0.6 };
                // 復活: 当たりのバトルを一度負けに見せる (確定の相手では起きない。1/99 は 900個 の当たりだけ)
                const rv = show.revival;
                const label = rv.labels[spin.specId];
                const canRevive = win && p.enemyInfo.win < 1 && (!label || (result.alloc && result.alloc.label === label));
                if (canRevive && (result.force === 'revival' || rng() < revivalRate(config, spec, spin.specId, streak))) {
                    const rt = rv.timing;
                    p.revival = true;
                    p.phases.push({ name: 'rvdark', t: rt.dark }, { name: 'rvnaitei', t: rt.naitei }, { name: 'rvcant', t: rt.cant },
                        { name: 'rvstill', t: rt.still }, { name: 'rvsoredemo', t: rt.soredemo }, { name: 'rvflash', t: rt.flash },
                        { name: 'rvkill', t: rt.kill });
                    p.reveal = { phase: 'rvflash', at: 0.3 };
                }
            } else {
                p.kind = 'plain';
                p.phases = [{ name: 'roll', t: plain }];
            }
        } else if (spin.rush && spin.rashMode === 'onioni') {
            // おにおにRASH: 当たりのときだけ違和感 → 開眼
            p.kind = 'onioni';
            if (win) {
                const t = show.onioniRash.timing;
                // labels のある違和感 (図柄 8・9) は、出玉が合う当たりでだけ選ぶ (1/99 は 900個)
                const fits = x => !x.labels || !x.labels[spin.specId] || (result.alloc && result.alloc.label === x.labels[spin.specId]);
                p.pattern = result.forcePattern || weighted(Object.fromEntries(Object.entries(show.onioniRash.patterns)
                    .map(([id, x]) => [id, fits(x) ? x.weight : 0])), rng);
                if (p.pattern === 'figure8' || p.pattern === 'figure9') p.oddFigure = p.pattern === 'figure8' ? 8 : 9;
                p.phases = [{ name: 'wait', t: t.wait }, { name: 'anomaly', t: t.anomaly }, { name: 'open', t: t.open }];
                p.reveal = { phase: 'open', at: 0.3 };
            } else {
                p.pattern = null;
                p.phases = [{ name: 'roll', t: plain }];
            }
        } else {
            p.kind = 'plain';
            p.phases = [{ name: 'roll', t: plain }];
        }
        p.duration = p.phases.reduce((a, ph) => a + ph.t, 0);
        // 当たりが決まった瞬間に、ふるカワが虹色で「おめでとう！」 (演出のない当たりは変動の終わり)
        if (win) {
            if (!p.reveal) p.reveal = { phase: p.phases[p.phases.length - 1].name, at: Math.max(0, p.phases[p.phases.length - 1].t - 0.3) };
            p.defeatLine = show.furukawa.congratsLine;
            p.defeatColor = 6;
        }
        // RASH 中・突破チャレンジ中: 当たりの見込みに応じてしゃべる (突破チャレンジの1ラウンド目は勝負のセリフ)
        // ブラックアウトは突発なので、しゃべらない
        if (spin.rush && !p.reply && p.kind !== 'blackout') p.talk = rashTalk(show, win, rng);
        return p;
    }

    function rashTalk(show, win, rng) {
        const f = show.furukawa;
        const heat = Number(weighted(f.rashHeat[win ? 'win' : 'miss'], rng));
        if (rng() >= f.rashAppearRates[heat]) return null;
        const color = Number(weighted(f.colorWeights[heat], rng));
        const list = color >= 4 ? f.rashHotLines : color >= 2 ? f.rashExpectLines : f.rashCalmLines;
        const candidates = list.length > 1 ? list.filter(line => line !== lastLine) : list;
        const text = pickFrom(candidates, rng);
        lastLine = text;
        return { text, color };
    }

    // ----- ふるカワ -----
    let lastLine = null;
    function talk(show, p, spin, rng) {
        const f = show.furukawa;
        const heat = spin.holdColor === 'rainbow' ? 6 : p.win ? 5 : p.type === 'reach' ? 3 : p.type === 'fail' ? 1 : 0;
        if (rng() >= f.appearRates[heat]) return null;
        const color = Number(weighted(f.colorWeights[heat], rng));
        let list;
        if (color >= 4) list = f.chanceLines[Math.min(color, 6)];
        else if (color >= 2 && rng() < 0.5) list = f.expectLines;
        else if (color < 2 && rng() < f.hintRate) list = f.hintLines;   // 豆知識
        else list = f.chatLines;
        const candidates = list.length > 1 ? list.filter(line => line !== lastLine) : list;
        const text = pickFrom(candidates, rng);
        lastLine = text;
        return { text, color };
    }

    return { hold, hold2, challengePlan, plan, buttonMissRate, reachMissRate, missBattleMass, kooriEnemies, kaiRate, revivalRate, newStage, stepStage, endStage, stageMap };
})();
