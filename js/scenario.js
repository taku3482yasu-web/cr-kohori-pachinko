// =====================================================================
// 演出の筋書き (抽選の結果から、保留の色・ボタン・変動の流れ・ふるカワのセリフを決める)
// ---------------------------------------------------------------------
// 画面には触らない (台の Machine とシミュレーターからも使う)。決め方の数値は config.show。
//   Scenario.hold(config, spec, result, rng)   玉がヘソに入ったとき: { holdColor, button }
//   Scenario.hold2(config, result, ctx, rng)   玉が電チューに入ったとき: { holdColor, button, weapon }
//   Scenario.challengePlan(config, holds)      突破チャレンジのバトルが始まるとき: 保留ごとの武器・決着のラウンド・時間
//   Scenario.plan(config, spec, spin, rng)     変動が始まるとき: { kind, duration, phases, digits, enemy, win, talk, ... }
// phases は [{ name, t }] の並び。液晶はこれを時間どおりに描く。
//   特図1 のリーチは (stepup: ステップアップ予告) → (gun: 群予告) → roll → (next: 擬似連 × p.gizi) → challenge → reach
//     → (develop: SP → SPSP の発展) → (cutin: こおりカットイン) → battle (p.gimmick なら始めに盤面の役物) → (pursuit: 追撃チャンス) → result。
//   全回転 (p.type 'zenkaiten'。p.zenkaiten は種類): zroll → zenkaiten → zend。
//   告知のタイプ (p.notice。カスタマイズの後告知・一発告知): roll だけ。後告知の当たり (p.type 'post') は roll → postnotice。kind (特図2):
//   'challenge' 突破チャレンジのバトルの1ラウンド (cintro → cround / cfinal → cresult)。おまけのラウンドは cextra → cfinal → cresult
//   'rashBattle' こおりRASH のバトル (roll → battle → result。enemyKey: 相手 (怪は ○○Kai) / enemy: 描くキャラクター / kai: 怪の状態)
//     revival: 復活 (result で一度負けて見せ、rvdark → rvnaitei → rvcant → rvstill → rvsoredemo → rvflash → rvkill で撃破)
//     summon: お仲間召喚 (battle → summon → result。値は出てくる仲間の id。撃破確定)
//   'onioni' おにおにRASH (wait → anomaly → open、外れは roll だけ)
//   'okapipo' おかピポRASH (外れは roll だけ。当たりは p.okaNotice ごとに roll → pnotice (一発告知) → pipo (おかピポ大量発生)、
//     金色のおかがっぱは roll → pgold → pface (顔が大量発生)、告知なしは roll → pgun (おかがっぱ群) → palign)
//   プレミアボーナス (result.alloc.premium。ユーザー指定 2026-10-22): p.premium にボーナスの名前。こおりRASH は怪のバトル、
//     おにおにRASH は違和感 goldDogSit、おかピポRASH はブラックアウトで知らせ、どれも p.gimmickPhase の場面の始めに盤面の役物が落ちてくる
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
    // 見た目だけの 演出 (レバー・レバブル) の 乱数。台の 抽選の 乱数 (rng) とも Math.random とも 別 (テストの 種を 決めた 乱数の 並びを かえない。2026-10-23)
    const fxRandom = (() => {
        let x = (Date.now() ^ 0x9e3779b9) >>> 0 || 1;
        return () => {
            x ^= x << 13; x >>>= 0;
            x ^= x >>> 17;
            x ^= x << 5; x >>>= 0;
            return x / 4294967296;
        };
    })();

    // ----- 保留 (玉がヘソに入ったとき) -----
    // level: 先読みの量 (config.show.senyomi.levels のキー)。当たりは占有率 occ で先読みを出す。
    // 外れ (ガセ) は、先読み演出 (保留の色・保留変化・ボタン・入賞時の音・高確率ステージ) が出たときに当たる割合が rel になる量だけ出す
    // (2026-10-20 ユーザー指定: 占有率が高いほど当たる割合が上がり、熱で約90%。ガセが減るぶん演出も出にくくなる)
    function hold(config, spec, result, rng, level = 'recommend') {
        const show = config.show;
        const sy = show.senyomi;
        const lv = sy.levels[level] || sy.levels.recommend;
        const hit = result.kind === 'hit';
        // レバブル (保留が 入ったとき。カスタマイズで 見せるかを 決める): 出たら 当たる 割合が leverBuru.holdReliability
        const lb = show.leverBuru;
        const hh = spec.hitRate;
        //   見た目だけの 演出なので、台の 抽選の 乱数 (rng) は 使わない (使うと ほかの 演出・振り分けの 乱数の 並びが かわる。fxRandom)
        const leverBuru = Boolean(lb) && fxRandom() < (hit ? lb.holdHit : Math.min(1, lb.holdHit * hh * (1 - lb.holdReliability) / lb.holdReliability / (1 - hh)));
        // ハンドルブル (2026-10-24): レバブルと 同じ 考え方で、ハンドルが 震える
        const hb = show.handleBuru;
        const handleBuru = Boolean(hb) && fxRandom() < (hit ? hb.holdHit : Math.min(1, hb.holdHit * hh * (1 - hb.holdReliability) / hb.holdReliability / (1 - hh)));
        if (lv.occ <= 0) return { holdColor: 'white', shownColor: 'white', button: null, hiStage: false, voice: false, leverBuru, handleBuru };
        const weights = show.holdColors[hit ? 'hit' : 'miss'];
        const colored = Object.fromEntries(Object.entries(weights).filter(([c]) => c !== 'white'));
        // 虹色は当たりのときだけ
        const kinds = hit ? { ...show.button.kinds, ...show.button.hitOnlyKinds } : show.button.kinds;
        const hi = show.stages.hi;
        const h = spec.hitRate;
        // 当たりで出る割合 → 外れで出る割合 (出たら当たる割合が lv.rel になる値)
        const missRate = hitShare => Math.min(1, hitShare * h * (1 - lv.rel) / lv.rel / (1 - h));
        const rates = {
            color: lv.occ,
            button: lv.occ * show.button.hitRate / sy.base,
            hiStage: lv.occ * hi.hitRate / sy.base,
            voice: show.voice.hitRate
        };
        let holdColor = 'white', button = null, hiStage = false, voice = false;
        if (hit) {
            // 当たり: 占有率で「先読みを出すか」を1回だけ決める。出すなら必ず色が付き、ボタン・高確率ステージはその中で
            if (rng() < lv.occ) {
                holdColor = weighted(colored, rng);
                if (rng() < show.button.hitRate / sy.base) button = weighted(kinds, rng);
                hiStage = rng() < hi.hitRate / sy.base;
            }
            voice = rng() < rates.voice;
        } else {
            if (rng() < missRate(rates.color)) holdColor = weighted(colored, rng);
            if (rng() < missRate(rates.button)) button = weighted(kinds, rng);
            hiStage = rng() < missRate(rates.hiStage);
            voice = rng() < missRate(rates.voice);
        }
        // 保留変化: 色が付く保留の一部は、最初は白で出して途中で変わる。
        // 外れで変わる割合は、保留変化したら当たる割合が lv.rel になる値 (色が付いた外れのうち)
        let shownColor = holdColor;
        let change = null;
        let changed = false;
        const changeMiss = Math.min(1, missRate(rates.color * sy.change.hitRate) / missRate(rates.color));
        if (holdColor !== 'white' && rng() < (hit ? sy.change.hitRate : changeMiss)) {
            shownColor = 'white';
            change = rng() < sy.change.self ? 'self' : 'next';
            changed = true;   // 保留変化した保留は、外れでも必ずチャレンジ演出に入る
        }
        // 保留を レバーで 変える (2026-10-24): 変わる ときに「レバーを引け！」(見た目だけ。fxRandom)
        const leverHold = Boolean(change && show.lever && fxRandom() < show.lever.hold);
        // 保留の「?」(2026-10-24): 変わるまで「?」で 出す (見た目だけ)
        const question = Boolean(change && show.holdStep && fxRandom() < show.holdStep.question);
        return { holdColor, shownColor, change, changed, button, hiStage, voice, leverBuru, handleBuru, leverHold, question };
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
        // おかピポRASH: 一発告知だけにするので、入ったときは何も出さない
        if (ctx.okapipo && ctx.rash && !ctx.challenge) return { holdColor: 'white', button: null, weapon: null, voice: false, rashHold: null, kai: false };
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
        // 2026-10-22 ユーザー指定で、怪はプレミアボーナスの保留だけ (Machine が alloc を決めてから呼ぶ)
        const kai = Boolean(ctx.koori && ctx.rash && !ctx.challenge && win && result.alloc && result.alloc.premium);
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
            // 怪に なる 当たり (通常時の ライバルチームの kai.rate) は 別に 数える (怪で ない ときの 成功率が win に なるように)
            const share = b.kai && b.kai.rate ? 1 - b.kai.rate : 1;
            mass[id] = b.win >= 1 ? 0 : hitRate * (b.hit * share / totalHit) * (1 - b.win) / b.win;
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

    // こおりRASH の保留が怪になる割合 (玉が入ったときに決める)。2026-10-22 から怪はプレミアボーナス確定:
    //   当たり: プレミアボーナスの割合 / 外れ: 0
    function kaiRate(config, spec, win) {
        return win && spec.premium ? spec.premium.rate : 0;
    }

    // 復活になる割合: こおりRASH の当たりのうち share (20%) にするため、起きられる当たり
    // (プレミアボーナス (怪) でない・ブラックアウトでない・確定の相手でない・出玉が合う) の中での割合
    function revivalRate(config, spec, specId, streak) {
        const rv = config.show.revival;
        const enemies = Object.values(kooriEnemies(config, streak)).filter(e => !e.kai);
        const totalHit = enemies.reduce((a, e) => a + e.hit, 0);
        const notSure = enemies.filter(e => e.win < 1).reduce((a, e) => a + e.hit, 0) / totalHit * (1 - kaiRate(config, spec, true));
        const notBlackout = 1 - config.show.blackout.rate;
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
        // プレミアボーナスは知らせ方で中身がわかるので昇格しない
        if (Figures_isOdd(real) && !(result.alloc && result.alloc.premium) && rng() < show.promote.rate) {
            p.promote = { to: real };
            return pickFrom(show.hitFigures.even, rng);
        }
        return real;
    }
    const Figures_isOdd = n => typeof n === 'number' && n % 2 === 1;

    const randomFigure = rng => 1 + Math.floor(rng() * 7);

    // reach: 左右だけそろえる (中は違う) / それ以外の外れ: 左右をそろえない
    // 7 (こおりくん) のリーチは当たり確定 (ユーザー指定 2026-10-20) なので、外れのリーチは 7 以外でそろえる
    const SURE_REACH = 7;
    function missDigits(reach, rng) {
        let l = randomFigure(rng);
        while (reach && l === SURE_REACH) l = randomFigure(rng);
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
        // 告知のタイプ (カスタマイズ。後告知・一発告知) は演出なし
        if (!spin.rush && (spin.notice === 'post' || spin.notice === 'oneshot')) return noticePlan(config, spin, rng);
        // 全回転 (プレミア): 通常時の当たりの変動の rate
        if (hit && !spin.rush && (result.forceZenkaiten || rng() < show.zenkaiten.rate)) return zenkaitenPlan(config, spin, rng);
        // こおりいきていける！ (P3): ノイズ → 暗転 → 虹色の こおりくん → そろう。
        //   変動の 長さが 変わるので 全回転と 同じく 台の 乱数 (rng) で 決める (fxRandom に すると テストの 結果が 毎回 変わる)
        if (hit && !spin.rush && show.ikiteru && (result.forceIkiteru || rng() < show.ikiteru.rate)) return ikiteruPlan(config, spin, rng);

        // ステップアップ予告・群予告 (通常時だけ)
        const step = spin.rush ? null : stepUp(show, spec, hit, result, rng);
        const gun = spin.rush ? null : result.forceGun || pickReveal(show.gun.kinds, spec.hitRate, hit, rng);
        let type;   // 'plain' / 'fail' / 'reach'
        if (hit || result.force === 'reach') type = 'reach';
        else if (result.force === 'fail') type = 'fail';
        else {
            const r = rng();
            const reach = reachMissRate(show, spec);
            type = r < reach ? 'reach' : r < show.challengeRate ? 'fail' : 'plain';
            // 保留変化した外れの保留・ステップアップが3段目まで行った外れ・群予告の外れは、必ずチャレンジ (失敗) に入る
            if (type === 'plain' && (result.changed || (step && step.step === 3) || gun)) type = 'fail';
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
                // ライバルチームの 怪 (2026-10-23 ユーザー指定: 怪に なったら 確定): 当たりだけ。見た目だけなので fxRandom
                const kb = show.battles[p.enemy];
                if (hit && kb && kb.kai && (result.forceKai || fxRandom() < kb.kai.rate)) p.kai = true;
                p.phases = [{ name: 'roll', t: t.roll }, { name: 'challenge', t: t.challenge }, { name: 'reach', t: t.reach },
                    { name: 'battle', t: t.battle }, { name: 'result', t: t.result }];
                // 追撃チャンス: PUSH のあとに追加ダメージ。当たりのバトルで出やすい (出たら成功率が上がる)
                const pu = show.pursuit;
                if (rng() < (hit ? pu.hitRate : pu.missRate)) {
                    p.pursuit = true;
                    p.phases.splice(p.phases.length - 1, 0, { name: 'pursuit', t: pu.time });
                }
                // リーチの発展: SPSP の相手は、はじめ SP の相手で出てきて「発展！！」することがある
                const dv = show.develop;
                p.sp = dv.sp[p.enemy] || 'SP';
                const battleAt = () => p.phases.findIndex(ph => ph.name === 'battle');
                if (p.sp === 'SPSP' && (result.forceDevelop || rng() < dv.rate)) {
                    p.develop = { from: pickFrom(dv.from, rng) };
                    p.phases.splice(battleAt(), 0, { name: 'develop', t: dv.time });
                }
                // こおりカットイン (バトルの前) と 盤面の役物 (バトルの始め): リーチの変動の中で、出たら当たる割合が決まっている
                const hReach = reachHitShare(show, spec);
                p.cutin = result.forceCutin || pickReveal(show.cutin.colors, hReach, hit, rng);
                if (p.cutin) p.phases.splice(battleAt(), 0, { name: 'cutin', t: show.cutin.time });
                const gm = show.gimmick;
                p.gimmick = Boolean(result.forceGimmick || rng() < (hit ? gm.hit : revealRate(gm.hit, gm.reliability, hReach)));
                // レバーを引け！ (2026-10-24 ユーザー指定): PUSH の かわりに レバーを 引く。出たら 当たる 割合が lever.reliability (85%)
                const lvr = show.lever;
                // 引いても 負けたあとの 復活 (当たりだけ)。変動が 長く なるので 台の 乱数 (rng) で 決め、復活なら 必ず 引け！ (虹)
                const leverRevival = Boolean(lvr && hit && (result.forceLeverRevival || rng() < lvr.revival));
                //   (レバー・レバブルは 見た目だけの 演出なので fxRandom。台の 抽選の 乱数の 並びを かえない)
                //   当たりで 出る 割合は 復活の ぶんを 引いて、全体で lever.hit に する
                const leverHit = lvr ? (lvr.hit - lvr.revival) / (1 - lvr.revival) : 0;
                p.lever = leverRevival || Boolean(result.forceLever || (lvr && fxRandom() < (hit ? leverHit : revealRate(lvr.hit, lvr.reliability, hReach))));
                if (p.lever) {
                    p.leverChange = result.forceLeverChange ?? fxRandom() < lvr.change;   // はじめは PUSH！ で、とちゅうから レバーを引け！ に 変わる
                    p.leverColor = result.forceLeverColor || weighted(leverWeights(lvr, hit), fxRandom);   // 色の 段階 (青 < 赤 < 金 < 虹)
                }
                if (!p.lever) Object.assign(p, pushStyle(show, hit, result));   // PUSH の 押し方と 色 (2026-10-24)
                if (leverRevival) {
                    // 決着で 一度 負けて 見せ → 暗転 →「もう一回 引け！」(rvagain) → 虹色の フラッシュ → 撃破
                    const rt = lvr.timing;
                    p.revival = true;
                    p.leverRevival = true;
                    p.phases.push({ name: 'rvdark', t: rt.dark }, { name: 'rvagain', t: lvr.againTime }, { name: 'rvflash', t: rt.flash }, { name: 'rvkill', t: rt.kill });
                    p.reveal = { phase: 'rvflash', at: 0.3 };
                }
                // レバブル (変動中: リーチに なったとき)
                const lbs = show.leverBuru;
                p.leverBuru = Boolean(lbs && fxRandom() < (hit ? lbs.spinHit : revealRate(lbs.spinHit, lbs.spinReliability, hReach)));
                if (hit) p.digits = Array(3).fill(shownHitDigit(show, result, fig, rng, p));
                else p.digits = missDigits(true, rng);
                const f = show.furukawa;
                p.reply = f.replies[p.enemy] ? pickFrom(f.replies[p.enemy], rng) : null;
                p.defeatLine = hit && f.defeatLines[p.enemy] ? pickFrom(f.defeatLines[p.enemy], rng) : null;
            }
        }
        // 違和感演出 (P4): 見た目だけ (長さは 変えない) なので fxRandom。出たら 当たる 割合は config.show.iwakan
        if (show.iwakan && !spin.rush) p.iwakan = result.forceIwakan || pickReveal(show.iwakan.kinds, spec.hitRate, hit, fxRandom);
        // 擬似連: チャレンジに入る変動だけ、回り始めのあとに「NEXT」を gizi 回
        if (type !== 'plain') {
            const g = show.gizi;
            const n = result.forceGizi ?? Number(weighted(g.weights[hit ? 'hit' : type], rng));
            if (n > 0) {
                p.gizi = n;
                p.phases.splice(1, 0, ...Array.from({ length: n }, () => ({ name: 'next', t: g.time })));
            }
        }
        // 群予告: 変動の始め (ステップアップ予告のあと)
        if (gun) {
            p.gun = gun;
            p.phases.unshift({ name: 'gun', t: show.gun.time });
        }
        // ステップアップ予告: 変動のいちばん始め
        if (step) {
            p.stepUp = step;
            p.phases.unshift({ name: 'stepup', t: step.step * show.stepUp.stepTime + show.stepUp.tail });
        }
        p.duration = p.phases.reduce((a, ph) => a + ph.t, 0);
        // 通常時だけ、ふるカワが変動の始まりにしゃべる
        if (!spin.rush) p.talk = talk(show, p, spin, rng);
        return p;
    }

    // PUSH の 押し方 (tap / long ため / mash 連撃) と 色 (白 < 青 < 赤 < 金 < 虹)。見た目だけなので fxRandom
    function pushStyle(show, hit, result) {
        const ps = show.pushStyle;
        if (!ps) return {};
        const w = obj => Object.fromEntries(Object.entries(obj).map(([id, x]) => [id, hit ? x.hit : x.miss]));
        return { pushMode: result.forcePushMode || weighted(w(ps.modes), fxRandom), pushColor: result.forcePushColor || weighted(w(ps.colors), fxRandom) };
    }

    // レバーを引け！の 色の 重み (当たり / 外れ)
    const leverWeights = (lvr, hit) => Object.fromEntries(Object.entries(lvr.colors).map(([id, c]) => [id, hit ? c.hit : c.miss]));

    // 出たら当たる割合 (reliability) が決まっている演出の、外れの変動で出る割合。
    //   hitShare: 当たりの変動で出る割合 / base: 出るかもしれない変動のうち当たりの割合
    function revealRate(hitShare, reliability, base) {
        return reliability >= 1 ? 0 : hitShare * base / (1 - base) * (1 - reliability) / reliability;
    }

    // kinds ({ id: { hit, reliability } }) から、この変動で出るものを1つ選ぶ (出ないときは null)
    function pickReveal(kinds, base, hit, rng) {
        let r = rng();
        for (const [id, k] of Object.entries(kinds)) {
            if ((r -= hit ? k.hit : revealRate(k.hit, k.reliability, base)) < 0) return id;
        }
        return null;
    }

    // リーチ (バトル) の変動のうち当たりの割合
    function reachHitShare(show, spec) {
        const h = spec.hitRate;
        return h / (h + (1 - h) * reachMissRate(show, spec));
    }

    // 告知のタイプ (ユーザー指定 2026-10-20。カスタマイズ): 通常時の特図1 は演出なし
    //   oneshot (一発告知): 当たりは変動の始めにボタンが虹色に光り、図柄がそろって止まる
    //   post (後告知): 当たりは図柄がばらばらに止まったあと (postnotice)、ボタンが虹色に光って図柄がそろう
    function noticePlan(config, spin, rng) {
        const show = config.show;
        const { result } = spin;
        const hit = result.kind === 'hit';
        const roll = show.timing.miss[Math.min(show.timing.miss.length, spin.holdsLeft + 1) - 1];
        const p = { fig: 1, type: 'plain', win: hit, talk: null, notice: spin.notice };
        p.phases = [{ name: 'roll', t: Math.max(roll, hit ? 3 : 0) }];
        p.digits = hit ? Array(3).fill(hitDigit(show, result, 1, rng)) : missDigits(false, rng);
        if (hit && spin.notice === 'post') {
            p.type = 'post';
            p.fakeDigits = missDigits(false, rng);
            p.phases.push({ name: 'postnotice', t: 2.5 });
            p.reveal = { phase: 'postnotice', at: 0.8 };
        }
        if (hit) { p.defeatLine = show.furukawa.congratsLine; p.defeatColor = 6; }
        p.duration = p.phases.reduce((a, ph) => a + ph.t, 0);
        return p;
    }

    // 早送り (ユーザー指定 2026-10-20): 台のボタンの長押しで、変動のこの秒まで飛ばす。
    //   当たりが見える場面 (reveal。復活は虹色のフラッシュ、お仲間召喚は召喚) か、リーチの結果・チャレンジ失敗の始めまで。
    //   それ以外 (外れ・特図2 のふつうの変動) は止まる SKIP_TAIL 秒前まで
    const SKIP_TAIL = 0.6;
    function skipPoint(plan) {
        const names = plan.phases.map(ph => ph.name);
        let index = plan.reveal ? names.indexOf(plan.reveal.phase) : -1;
        if (index < 0) index = names.findIndex(n => n === 'result' || n === 'fail');
        if (index < 0) return Math.max(0, plan.duration - SKIP_TAIL);
        return plan.phases.slice(0, index).reduce((a, ph) => a + ph.t, 0);
    }

    // ステップアップ予告の出る割合 ({ id: 当たりで出る割合, 外れで出る割合 })。外れは「出たら当たる割合」が reliability になるように
    function stepUpRates(show, spec) {
        const h = spec.hitRate;
        return Object.fromEntries(Object.entries(show.stepUp.outcomes).map(([id, o]) =>
            [id, { hit: o.hit, miss: o.hit * h / (1 - h) * (1 - o.reliability) / o.reliability }]));
    }

    // この変動のステップアップ予告: { id, step, color, kind } (出ないときは null)
    function stepUp(show, spec, hit, result, rng) {
        const su = show.stepUp;
        if (result.forceStepUp === 'none') return null;   // 確認用 (tools/lcd.html の stepup=none)
        let id = result.forceStepUp || null;
        if (!id) {
            const rates = stepUpRates(show, spec);
            let r = rng();
            for (const [key, x] of Object.entries(rates)) {
                if ((r -= hit ? x.hit : x.miss) < 0) { id = key; break; }
            }
        }
        if (!id) return null;
        const o = su.outcomes[id];
        const kinds = Object.keys(su.kinds);
        return { id, step: o.step, color: o.color, kind: kinds[Math.floor(rng() * kinds.length)] };
    }

    // 全回転: 図柄の色 (奇数・偶数) が当たりの振り分けに合う種類から選ぶ。図柄は3つとも その種類の図柄
    function zenkaitenPlan(config, spin, rng) {
        const show = config.show;
        const z = show.zenkaiten;
        const odd = Figures_isOdd(hitDigit(show, spin.result, 1, rng));
        const kinds = Object.fromEntries(Object.entries(z.kinds).map(([id, k]) => [id, (odd ? k.odd : k.even) ? k.weight : 0]));
        const kind = spin.result.forceZenkaiten && z.kinds[spin.result.forceZenkaiten] ? spin.result.forceZenkaiten : weighted(kinds, rng);
        const figure = z.kinds[kind].figure;
        const t = z.timing;
        const p = { fig: 1, type: 'zenkaiten', win: true, talk: null, zenkaiten: kind, digits: [figure, figure, figure],
            phases: [{ name: 'zroll', t: t.zroll }, { name: 'zenkaiten', t: t.zenkaiten }, { name: 'zend', t: t.zend }],
            reveal: { phase: 'zenkaiten', at: 0.8 }, defeatLine: show.furukawa.congratsLine, defeatColor: 6 };
        p.duration = p.phases.reduce((a, ph) => a + ph.t, 0);
        if (!spin.rush) p.talk = talk(show, p, spin, rng);
        return p;
    }

    // こおりいきていける！ (2026-10-23 アップグレード P3): kroll → knoise (ノイズ) → kdark (暗転) → klive (虹色の こおりくん) → kend (そろう)
    function ikiteruPlan(config, spin, rng) {
        const show = config.show;
        const t = show.ikiteru.timing;
        const d = hitDigit(show, spin.result, 1, rng);
        const p = { fig: 1, type: 'ikiteru', win: true, talk: null, digits: [d, d, d],
            phases: ['kroll', 'knoise', 'kdark', 'klive', 'kend'].map(name => ({ name, t: t[name] })),
            reveal: { phase: 'klive', at: 0.5 }, defeatLine: show.furukawa.congratsLine, defeatColor: 6 };
        p.duration = p.phases.reduce((a, ph) => a + ph.t, 0);
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
        // プレミアボーナス (RASH に入ってから。Machine が決める)
        const premium = win && spin.rush && !spin.inChallenge && !spin.yutime && result.alloc && result.alloc.premium ? result.alloc.name : null;
        if (premium) p.premium = premium;
        // RASH に入ってから (突破チャレンジ中は出さない)
        // 怪の保留 (先バレしたので必ず怪のバトル)。プレミアボーナスはこおりRASH ならいつも怪 (おにおにRASH で入ってから切り替えたときも)
        const kaiHold = (Boolean(result.kai) || Boolean(premium)) && spin.rashMode === 'koori';
        const blackout = () => {
            p.kind = 'blackout';
            p.phases = [{ name: 'dark', t: bo.timing.dark }, { name: 'bokoori', t: bo.timing.koori },
                { name: 'atari', t: bo.timing.atari }, { name: 'itadaki', t: bo.timing.itadaki }];
            p.reveal = { phase: 'itadaki', at: 0.1 };
        };
        if (spin.yutime) {
            // 遊タイム: 演出なし (当たれば RASH 突入。液晶は遊タイムの表示)
            p.kind = 'plain';
            p.phases = [{ name: 'roll', t: plain }];
        } else if (premium && spin.rashMode === 'okapipo') {
            // おかピポRASH のプレミアボーナス: ブラックアウト (おかピポRASH ではふだんブラックアウトは起きない)
            blackout();
            p.gimmickPhase = 'bokoori';
        } else if (spin.rush && !spin.inChallenge && spin.rashMode === 'okapipo') {
            // おかピポRASH: 当たりだけ演出 (ブラックアウトもなし)。外れは何も起きない
            //   金色のおかがっぱ (一発告知) / 告知なしのおかがっぱ群 / 一発告知 → おかピポ大量発生
            p.kind = 'okapipo';
            if (win) {
                const op = show.okapipoRash;
                const t = op.timing;
                p.okaNotice = result.forceOkaNotice || weighted(Object.fromEntries(Object.entries(op.notices).map(([id, n]) => [id, n.weight])), rng);
                const flow = (op.notices[p.okaNotice] || {}).flow;
                if (flow === 'gold') {
                    p.phases = [{ name: 'roll', t: t.roll }, { name: 'pgold', t: t.gold }, { name: 'pface', t: t.face }];
                    p.reveal = { phase: 'pface', at: 0.4 };
                } else if (flow === 'gun') {
                    p.phases = [{ name: 'roll', t: t.roll }, { name: 'pgun', t: t.gun }, { name: 'palign', t: t.align }];
                    p.reveal = { phase: 'palign', at: 0 };
                } else {
                    p.phases = [{ name: 'roll', t: t.roll }, { name: 'pnotice', t: t.notice }, { name: 'pipo', t: t.pipo }];
                    p.reveal = { phase: 'pipo', at: 0.4 };
                }
            } else p.phases = [{ name: 'roll', t: plain }];
        } else if (spin.rush && !spin.inChallenge && win && !kaiHold && !premium && result.force !== 'revival' && (result.force === 'blackout' || rng() < bo.rate)) {
            // ブラックアウト (突発当たり): こおりRASH・おにおにRASH (プレミアボーナスは それぞれの知らせ方にする)
            blackout();
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
            // ふつうの保留の外れ: 当たりのうちプレミアボーナス (怪) とブラックアウトになる分はふつうの相手のバトルにならず、
            // 最後の保留 (lastShare) は外れでも必ずバトルになるので、そのぶんを差し引いて外れのバトルの割合を決める (相手の成功率を守るため)
            const plainEnemies = Object.fromEntries(Object.entries(available).filter(([, e]) => !e.kai));
            const plainHit = h2 * (1 - kaiRate(config, spec, true));
            const plainMass = Object.values(missBattleMass(show, spec, plainEnemies, plainHit)).reduce((a, x) => a + x, 0);
            const need = plainMass * (1 - show.blackout.rate) - show.kooriRash.lastShare;
            const plainMissShare = 1 - h2;
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
                if (premium) p.gimmickPhase = 'battle';   // プレミアボーナス (怪): バトルの始めに盤面の役物
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
                // レバーを引け！ (2026-10-24 ユーザー指定: RASH 中に 出たら 当たり確定): 当たりの バトルだけ (復活は 負けに 見せるので 出さない)
                const lvr = show.lever;
                if (win && !p.revival && lvr && (result.forceLever || fxRandom() < lvr.rashHit)) {
                    p.lever = true;
                    p.leverChange = result.forceLeverChange ?? fxRandom() < lvr.change;
                    p.leverColor = result.forceLeverColor || weighted(leverWeights(lvr, true), fxRandom);
                } else Object.assign(p, pushStyle(show, win, result));   // PUSH の 押し方と 色 (2026-10-24)
                // お仲間の応援 (0〜3人): 人数が多いほど勝ちやすい
                p.cheer = Number(weighted(show.cheer[win ? 'win' : 'miss'], rng));
                // お仲間召喚: 当たりのバトルだけ。仲間が現れて撃破 (確定の相手・復活では起きない)
                const sm = show.summon;
                if (win && !p.revival && p.enemyInfo.win < 1 && rng() < sm.rate) {
                    p.summon = pickFrom(Object.keys(sm.members), rng);
                    p.phases.splice(2, 0, { name: 'summon', t: sm.time });
                    p.reveal = { phase: 'summon', at: 1.2 };
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
                // premium のある違和感 (ゴールド金面犬がとなりに座る) は、プレミアボーナスのときだけ (そのときは必ず)
                const fits = x => !x.labels || !x.labels[spin.specId] || (result.alloc && result.alloc.label === x.labels[spin.specId]);
                const patterns = Object.entries(show.onioniRash.patterns);
                p.pattern = result.forcePattern || (premium ? patterns.find(([, x]) => x.premium)[0]
                    : weighted(Object.fromEntries(patterns.map(([id, x]) => [id, fits(x) && !x.premium ? x.weight : 0])), rng));
                if (premium) p.gimmickPhase = 'anomaly';   // 違和感の始めに盤面の役物
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
        // おかピポRASH は一発告知だけなので、しゃべらない
        if (spin.rush && !p.reply && p.kind !== 'blackout' && p.kind !== 'okapipo') p.talk = rashTalk(show, win, rng);
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

    return { hold, hold2, challengePlan, plan, skipPoint, stepUpRates, revealRate, reachHitShare, reachMissRate, missBattleMass, kooriEnemies, kaiRate, revivalRate, newStage, stepStage, endStage, stageMap };
})();
