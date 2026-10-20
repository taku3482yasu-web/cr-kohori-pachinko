// =====================================================================
// 記録 (図鑑・実績・データカウンター・設定示唆。2026-10-19 ユーザー指定)
// ---------------------------------------------------------------------
// 画面には触らない。台のイベント (Machine の m.events) を見て記録する。表示は js/panels.js。
//   SettingHint   設定示唆: RASH が終わったときのトロフィーの色・ふるカワの設定示唆のセリフを、台の設定から選ぶ
//   Collection    図鑑と実績。台を選び直しても、新しく始めても残る (このブラウザに保存する)
//   DataCounter   データカウンター (台ごと)。大当たり履歴・出玉の推移・設定示唆。前回の続きと一緒に保存する (js/save.js)
//   SettingEstimate 設定推測: データカウンターの回転率・トロフィー・ふるカワのセリフから、設定1〜6 の確率を出す
// 数値と実績の一覧は config.show.settingHint / config.dataCounter / config.collection。
// =====================================================================

const SettingHint = (() => {
    function weighted(weights, rng) {
        const entries = Object.entries(weights).filter(([, w]) => w > 0);
        const total = entries.reduce((a, [, w]) => a + w, 0);
        let r = rng() * total;
        for (const [k, w] of entries) {
            if ((r -= w) < 0) return k;
        }
        return entries[entries.length - 1][0];
    }

    // RASH・突破チャレンジが終わったとき: トロフィーの色 (示す設定 1〜6)。出ないときは null
    function trophy(config, setting, rng = Math.random) {
        const t = config.show.settingHint.trophy;
        if (rng() >= t.rate) return null;
        return Number(weighted(t.weights[setting], rng));
    }

    // 設定示唆のセリフ (config.show.settingHint.lines の1つ)
    function line(config, setting, rng = Math.random) {
        const lines = config.show.settingHint.lines;
        const index = Number(weighted(Object.fromEntries(lines.map((l, i) => [i, l.weights[setting]])), rng));
        return lines[index];
    }

    return { trophy, line };
})();

const Collection = (() => {
    const KEY = 'koori-pachinko-collection';
    let data = empty();
    let saving = true;
    let pendingPromote = false;   // 昇格する大当たり (昇格が見えるまで数えない)

    function empty() {
        return { records: {}, seen: {}, wins: {}, achievements: {} };
    }

    function load() {
        try {
            const raw = JSON.parse(localStorage.getItem(KEY) || 'null');
            data = raw && raw.records ? { ...empty(), ...raw } : empty();
        } catch (e) {
            data = empty();
        }
    }

    function save() {
        if (!saving) return;
        try { localStorage.setItem(KEY, JSON.stringify(data)); } catch (e) { /* 保存できない環境 */ }
    }

    // URL で台を決めたとき (確認用) は保存しない
    function setSaving(on) { saving = on; }

    // 図鑑の演出のグループ: { id, name, items: [{ id, name }], battle (勝ち負けを数える) }
    function groups(config) {
        const s = config.show;
        const list = (obj, name = o => o.name) => Object.entries(obj).map(([id, o]) => ({ id, name: name(o, id) }));
        const colorNames = { white: '白', blue: '青', green: '緑', purple: '紫', red: '赤', rainbow: '虹' };
        return [
            { id: 'challenge', name: 'チャレンジ (通常時)', items: list(s.challenges), battle: true, winLabel: '成功' },
            { id: 'battle', name: 'バトルの相手 (通常時)', items: list(s.battles), battle: true, winLabel: '勝ち' },
            { id: 'weapon', name: '突破チャレンジの武器', items: list(s.challengeBattle.weapons) },
            { id: 'kooriRash', name: 'こおりRASH の相手', items: list(Scenario.kooriEnemies(config)), battle: true, winLabel: '勝ち' },
            { id: 'anomaly', name: 'おにおにRASH の違和感', items: list(s.onioniRash.patterns) },
            { id: 'stage', name: 'ステージ', items: Object.entries(s.stages.names).map(([id, name]) => ({ id, name })) },
            { id: 'hold', name: '保留の色', items: s.holdColors.order.map(id => ({ id, name: colorNames[id] })) },
            { id: 'stepUp', name: 'ステップアップ予告 (3段目の文字)', items: [{ id: 'white', name: '白' }, { id: 'red', name: '赤' }, { id: 'gold', name: '金' }] },
            { id: 'zenkaiten', name: '全回転', items: list(s.zenkaiten.kinds) },
            { id: 'summon', name: 'お仲間召喚 (こおりRASH)', items: list(s.summon.members, name => name) },
            { id: 'rashHold', name: 'RASH 中の保留', items: [{ id: 'black', name: '黒い保留' }, { id: 'spin', name: '回る保留' }] },
            { id: 'button', name: '台のボタン', items: [
                { id: 'red', name: '赤く光る' }, { id: 'shake', name: '震える' }, { id: 'beep', name: '高い音' },
                { id: 'rainbow', name: '虹色' }, { id: 'voice', name: '入賞時の音' }] },
            { id: 'trophy', name: '設定示唆トロフィー', items: Object.entries(s.settingHint.trophy.colors)
                .map(([id, c]) => ({ id, name: `${c.name} (${Number(id) === 6 ? '設定6確定' : `設定${id}以上`})` })) }
        ];
    }

    const add = (map, key, n = 1) => { map[key] = (map[key] || 0) + n; };
    const groupOf = (map, id) => map[id] || (map[id] = {});
    function see(group, id) { if (id != null) add(groupOf(data.seen, group), id); }
    function win(group, id) { add(groupOf(data.wins, group), id); }
    function best(key, value) { data.records[key] = Math.max(data.records[key] || 0, value); }

    // 台のイベントを記録する。解除した実績を返す
    //   (結果がわかる前に解除の知らせが出ないよう、演出の結果は変動の終わり (spinEnd) で数える)
    function note(e, config) {
        const r = data.records;
        if (e.type === 'spinStart' && e.fig === 1) add(r, 'spins');
        else if (e.type === 'spinEnd') noteSpin(e, config);
        else if (e.type === 'hold') {
            if (e.result.button) see('button', e.result.button);
            if (e.result.voice) see('button', 'voice');
        } else if (e.type === 'holdChange') add(r, 'holdChanges');
        else if (e.type === 'stageChange') see('stage', e.stage.id);
        else if (e.type === 'yutimeStart') add(r, 'yutimes');
        else if (e.type === 'bonusStart') {
            add(r, 'hits');
            if (e.entry) add(r, 'entries');
            if (e.rush) best('bestStreak', e.rushHits - 1);   // RASH の連チャンは当たるたびに (終わるのを待たない)
            if (e.rush && e.rushHits - 1 === config.show.story.endingAt) add(r, 'endings');
            pendingPromote = e.promote;
        } else if (e.type === 'ending') {
            if (pendingPromote) add(r, 'promotes');
            pendingPromote = false;
        } else if (e.type === 'renchan') add(r, 'renchan');
        else if (e.type === 'rushEnd' && !e.challengeFailed) {
            best('bestStreak', e.hits - 1);
            if (e.balls != null) best('bestBalls', e.balls);
        } else if (e.type === 'trophy') see('trophy', String(e.level));
        else return [];
        save();
        return unlock(config);
    }

    function noteSpin(e, config) {
        const p = e.plan;
        if (e.fig === 1) {
            see('hold', e.result.holdColor || 'white');
            if (p.zenkaiten) see('zenkaiten', p.zenkaiten);
            if (p.stepUp && p.stepUp.step === 3) see('stepUp', p.stepUp.color);
            if (p.gizi) best('bestGizi', p.gizi + 1);
            if (p.challenge && p.type !== 'plain') {
                see('challenge', p.challenge);
                if (p.type === 'reach') win('challenge', p.challenge);
            }
            if (p.type === 'reach' && p.enemy) {
                see('battle', p.enemy);
                if (p.win) win('battle', p.enemy);
                if (p.win && p.pursuit) add(data.records, 'pursuitWins');
            }
            return;
        }
        if (e.result.rashHold) see('rashHold', e.result.rashHold);
        if (p.kind === 'challenge') see('weapon', p.weapon);
        else if (p.kind === 'rashBattle') {
            const key = p.enemyKey || p.enemy;   // 怪は ○○Kai
            see('kooriRash', key);
            if (p.win) win('kooriRash', key);
            if (p.win && p.kai) add(data.records, 'kaiWins');
            if (p.revival) add(data.records, 'revivals');
            if (p.summon) see('summon', p.summon);
        } else if (p.kind === 'onioni' && p.pattern) see('anomaly', p.pattern);
        else if (p.kind === 'blackout') add(data.records, 'blackouts');
    }

    // 実績の値: 記録 / 'seen:グループ' (見た種類の数) / 'seen:グループ:id' / 'win:グループ:id'
    function stat(key) {
        const [kind, group, id] = key.split(':');
        if (kind === 'seen' && id == null) return Object.values(data.seen[group] || {}).filter(n => n > 0).length;
        if (kind === 'seen') return (data.seen[group] || {})[id] || 0;
        if (kind === 'win') return (data.wins[group] || {})[id] || 0;
        return data.records[kind] || 0;
    }

    function target(a, config) {
        if (a.value !== 'all') return a.value;
        const group = groups(config).find(g => g.id === a.stat.split(':')[1]);
        return group ? group.items.length : Infinity;
    }

    function unlock(config) {
        const unlocked = [];
        for (const a of config.collection.achievements) {
            if (data.achievements[a.id] || stat(a.stat) < target(a, config)) continue;
            data.achievements[a.id] = Date.now();
            unlocked.push(a);
        }
        if (unlocked.length) save();
        return unlocked;
    }

    function reset() {
        data = empty();
        save();
    }

    return { load, setSaving, groups, note, see: (g, id) => { see(g, id); save(); }, stat, target, reset, get: () => data };
})();

const DataCounter = (() => {
    // invested: 持ち玉のうち、はじめの持ち玉と玉貸しの分 (差玉 = 持ち玉 - invested)
    function create(config, balls) {
        return {
            invested: balls, lent: 0,
            spinsAtHit: 0,         // 最後の大当たりのときの特図1 の回転数 (「現在」の回転数はここから数える)
            firstHits: 0, rashes: 0,
            history: [],           // 大当たり履歴 (新しい順) { no, spins, label, kind, streak, startBalls, balls, trophy, active }
            graph: [[0, 0]],       // 出玉の推移 [打った玉, 差玉]
            graphTime: 0,
            hints: { trophy: {}, line: {} },  // この台で見た設定示唆 (トロフィーの色・ふるカワのセリフの short)
            // 設定推測の回転率: 左打ちの玉 (ファールを除く) と特図1 の回転数 (表示の回転率と違って数え直さない)。
            // config.settings の rotation は回転数で測った値なので、ヘソ入賞ではなく回転数で数える (保留がいっぱいのときの入賞は回らない)
            shotsLeft: 0, spins: 0
        };
    }

    // 左打ちの玉 (ファールで戻った玉は shot(c, -1) で取り消す)
    function shot(c, n = 1) { c.shotsLeft = (c.shotsLeft || 0) + n; }

    // 玉貸し
    function lend(c, amount) {
        c.invested += amount;
        c.lent += amount;
    }

    // ctx: { balls (いまの持ち玉), launched (打った玉), spins1 (特図1 の回転数) }
    function note(c, e, ctx, config) {
        const active = c.history.find(h => h.active);
        if (e.type === 'spinStart' && e.fig === 1) c.spins = (c.spins || 0) + 1;
        if (e.type === 'bonusStart' && (!e.rush || e.yutime)) {
            // 初当たり (遊タイムの当たりも。そのまま RASH)
            if (active) finish(active, ctx);
            c.firstHits++;
            c.history.unshift({
                no: c.firstHits, spins: ctx.spins1 - c.spinsAtHit, label: e.label, kind: e.next === 'jitan' ? 'challenge' : 'normal',
                streak: 0, startBalls: ctx.balls, balls: 0, trophy: null, active: true, yutime: Boolean(e.yutime)
            });
            if (e.yutime) {
                c.history[0].kind = 'rash';
                c.history[0].streak = e.rushHits - 1;
                c.rashes++;
            }
            c.spinsAtHit = ctx.spins1;
            c.history.length = Math.min(c.history.length, config.dataCounter.historyShown);
        } else if (e.type === 'bonusStart' && active) {
            if (e.entry) { active.kind = 'rash'; c.rashes++; }
            if (active.kind === 'rash') active.streak = e.rushHits - 1;
        } else if (e.type === 'bonusEnd' && e.next === 'normal' && active) finish(active, ctx);
        else if (e.type === 'rushEnd' && active) {
            if (e.challengeFailed) active.kind = 'failed';
            finish(active, ctx);
        } else if (e.type === 'trophy') {
            const last = c.history.find(h => h.kind !== 'normal');
            if (last) last.trophy = e.level;
            c.hints.trophy[e.level] = (c.hints.trophy[e.level] || 0) + 1;
        } else if (e.type === 'settingLine') {
            c.hints.line[e.short] = (c.hints.line[e.short] || 0) + 1;
        }
        // 大当たりが終わったところは、出玉の推移にすぐ点を打つ
        if (e.type === 'bonusEnd' || e.type === 'rushEnd') addPoint(c, ctx, config);
    }

    function finish(h, ctx) {
        h.balls = ctx.balls - h.startBalls;
        h.active = false;
    }

    // 大当たり中の履歴は、いまの持ち玉で出玉を出す
    const liveBalls = (h, balls) => h.active ? balls - h.startBalls : h.balls;

    // 出玉の推移: graphEvery 秒ごとに点を打つ。graphPoints を超えたら1つおきに間引く (最初と最後は残す)
    function tick(c, dt, ctx, config) {
        c.graphTime += dt;
        if (c.graphTime < config.dataCounter.graphEvery) return;
        c.graphTime = 0;
        addPoint(c, ctx, config);
    }

    function addPoint(c, ctx, config) {
        const point = [ctx.launched, ctx.balls - c.invested];
        const last = c.graph[c.graph.length - 1];
        if (last && last[0] === point[0] && last[1] === point[1]) return;
        c.graph.push(point);
        if (c.graph.length > config.dataCounter.graphPoints) {
            c.graph = c.graph.filter((p, i) => i % 2 === 0 || i === c.graph.length - 1);
        }
    }

    return { create, lend, note, tick, liveBalls, shot };
})();

const SettingEstimate = (() => {
    // 設定ごとの対数尤度を足して、確率 { 1: p, ..., 6: p } にする (はじめはどの設定も同じ。おまかせは 1〜6 から同じ確率で選ぶため)
    //   回転率: 左打ち n 発で k 回転。設定 s の回転率の目安 r_s (config.settings) から、k はおよそポアソン分布 (平均 n × r_s / 250)
    //   トロフィー: 出た色ごとに、設定 s のときにその色が出る割合 (出なかった回数はどの設定も同じなので数えない)
    //   ふるカワのセリフ: 言ったセリフごとに、設定 s のときにそのセリフを選ぶ割合 (重み 0 の設定はありえない)
    function logLikelihoods(c, config) {
        const settings = config.settings.map((st, i) => i + 1);
        const t = config.show.settingHint.trophy;
        const lines = config.show.settingHint.lines;
        const share = (weights, key) => {
            const total = Object.values(weights).reduce((a, w) => a + w, 0);
            return (weights[key] || 0) / total;
        };
        return settings.map(s => {
            let ll = 0;
            const n = c.shotsLeft || 0;
            if (n > 0) {
                const lambda = n * config.settings[s - 1].rotation / 250;
                ll += (c.spins || 0) * Math.log(lambda) - lambda;
            }
            Object.entries(c.hints.trophy).forEach(([level, k]) => { ll += k * Math.log(share(t.weights[s], level)); });
            Object.entries(c.hints.line).forEach(([short, k]) => {
                const line = lines.find(l => l.short === short);
                if (line) ll += k * Math.log(share(line.weights, s));
            });
            return ll;
        });
    }

    function probabilities(c, config) {
        const ll = logLikelihoods(c, config);
        const max = Math.max(...ll.filter(Number.isFinite));
        const w = ll.map(x => (Number.isFinite(x) ? Math.exp(x - max) : 0));
        const total = w.reduce((a, x) => a + x, 0);
        return Object.fromEntries(w.map((x, i) => [i + 1, x / total]));
    }

    // いまの回転率 (1000円 = 250発あたり)。左打ちの玉がなければ null
    function rotation(c) {
        return c.shotsLeft > 0 ? (c.spins || 0) / c.shotsLeft * 250 : null;
    }

    return { probabilities, rotation };
})();
