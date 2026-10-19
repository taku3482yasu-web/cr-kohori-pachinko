// =====================================================================
// 自動テスト (Node.js。2026-10-19 ユーザー指定)
// ---------------------------------------------------------------------
// 台の抽選 (js/machine.js)・演出の筋書き (js/scenario.js)・記録 (js/records.js) などを、ブラウザなしで読み込んで確かめる。
// 盤面の物理は使わず、玉の行き先を決まった割合 (RATES) で決めて台を長い時間まわす (tools/simulate.html と同じやり方)。
// 乱数は種 (seed) を固定しているので、同じコードなら毎回同じ結果になる。
//
// 使い方 (koori-pachinko フォルダで):
//   node tools/test.js                すべてのテスト
//   node tools/test.js --hours 400    台をまわす時間 (1スペックあたり。初期値 150)
//   node tools/test.js --seed 42      乱数の種を変える
//
// 失敗したテストがあると、終了コード 1 で終わる。コミットのたびに .githooks/pre-commit が走らせる。
// =====================================================================

const fs = require('fs');
const path = require('path');
const vm = require('vm');

const ROOT = path.join(__dirname, '..');
const JS_DIR = path.join(ROOT, 'js');
// 画面に触らないファイルだけ読み込む
const GAME_FILES = ['config.js', 'scenario.js', 'machine.js', 'records.js', 'updates.js', 'bgm.js'];

const args = process.argv.slice(2);
const argOf = (name, fallback) => {
    const i = args.indexOf(`--${name}`);
    return i >= 0 ? Number(args[i + 1]) : fallback;
};
const HOURS = argOf('hours', 150);
const SEED = argOf('seed', 20261019);

function seededRandom(seed) {
    let t = seed >>> 0;
    return () => {
        t = (t + 0x6D2B79F5) >>> 0;
        let r = Math.imul(t ^ (t >>> 15), 1 | t);
        r = (r + Math.imul(r ^ (r >>> 7), 61 | r)) ^ r;
        return ((r ^ (r >>> 14)) >>> 0) / 4294967296;
    };
}

function memoryStorage() {
    const data = new Map();
    return {
        getItem: k => (data.has(k) ? data.get(k) : null),
        setItem: (k, v) => data.set(k, String(v)),
        removeItem: k => data.delete(k)
    };
}

// ゲームのスクリプトを1つのグローバル環境に読み込む (Math.random は種を固定したものに差し替える)
function loadGame(seed) {
    const seededMath = Object.create(Math);
    seededMath.random = seededRandom(seed);
    const context = { console, Math: seededMath, localStorage: memoryStorage(), setInterval: () => 0 };
    context.window = context;
    vm.createContext(context);
    for (const file of GAME_FILES) {
        vm.runInContext(fs.readFileSync(path.join(JS_DIR, file), 'utf8'), context, { filename: file });
    }
    const game = vm.runInContext('({ CONFIG, Scenario, Machine, SettingHint, Collection, DataCounter, SettingEstimate, UpdateNotes, UPDATES, Bgm, BGM_TRACKS })', context);
    game.rng = seededMath.random;
    return game;
}

// ----- テストの道具 -----
const results = [];
function test(name, fn) {
    try {
        fn();
        results.push({ name, ok: true });
    } catch (e) {
        results.push({ name, ok: false, message: e.message });
    }
}
function assert(cond, message) { if (!cond) throw new Error(message); }
function assertEqual(actual, expected, label) {
    if (actual !== expected) throw new Error(`${label}: ${actual} (期待値 ${expected})`);
}
function assertBetween(value, lo, hi, label) {
    if (!(value >= lo && value <= hi)) throw new Error(`${label}: ${typeof value === 'number' ? value.toFixed(4) : value} (範囲 ${lo}〜${hi})`);
}
const pct = x => `${(x * 100).toFixed(1)}%`;

// ----- 台をまわす -----
// 玉の行き先の割合 (盤面の物理で測った値に近いもの。tools/simulate.html の 1 で測れる)
//   left: 左打ち (heso は設定ごとの回転率から) / right: 右打ち、電チュー・アタッカーの開き方ごと
const RATES = {
    left: rotation => ({ heso: rotation / 250, general: 0.03 }),
    right: {
        '00': { gate: 1, rates: {} },
        '10': { gate: 1, rates: { denchu: 0.85 } },
        '01': { gate: 1, rates: { attacker: 0.9 } },
        '11': { gate: 1, rates: { denchu: 0.85, attacker: 0.1 } }
    },
    flight: 2   // 打ってから入るまでの秒
};

function pick(rates, rng) {
    let r = rng();
    for (const [k, v] of Object.entries(rates)) {
        if ((r -= v) < 0) return k;
    }
    return 'none';
}

// specId のスペック・設定 setting の台を hours 時間まわし、イベントを図鑑とデータカウンターにも記録する
function run(game, specId, setting, hours) {
    const { CONFIG, Machine, Collection, DataCounter, SettingHint } = game;
    const rng = game.rng;
    const m = Machine.create(CONFIG, specId, rng);
    Machine.setRashMode(m, 'koori');
    const DT = 0.2;
    const left = RATES.left(CONFIG.settings[setting - 1].rotation);
    const payouts = { ...CONFIG.payout, ...m.spec.payout };
    let balls = 100000;
    const counter = DataCounter.create(CONFIG, balls);
    let launched = 0, nextShot = 0, rushStartBalls = 0;
    const flying = [];
    const log = {
        events: [], firstHits: 0, firstToChallenge: 0, challengeWins: 0, challenges: 0, rushHits: 0, rushContinues: 0,
        rashModes: 0, unlocked: [], trophies: [], ctx: null,
        challengeKinds: {},   // 突破チャレンジ中の特図2 の変動の種類 (おまけのラウンドは 'challenge:extra')
        extraHolds: 0, extraShown: 0, extraRounds: 0,  // おまけの保留・入ったことを見せてしまった数・おまけのラウンド
        renchan: 0, renchanWrong: 0                     // 「〇G連確定」と、〇 が残り保留の当たりの数と違った回数
    };
    const ctx = () => ({ balls, launched, spins1: m.stats.spins1 });
    const record = e => {
        log.events.push(e);
        DataCounter.note(counter, e, ctx(), CONFIG);
        log.unlocked.push(...Collection.note(e, CONFIG));
    };
    for (let t = 0; t < hours * 3600; t += DT) {
        while (nextShot <= t) {
            const aim = Machine.aim(m);
            flying.push({ at: nextShot + RATES.flight, aim });
            nextShot += CONFIG.launch.interval;
            balls--;
            launched++;
            if (aim === 'left') DataCounter.shot(counter);
        }
        while (flying.length && flying[0].at <= t) {
            const ball = flying.shift();
            let where;
            if (ball.aim === 'left') where = pick(left, rng);
            else {
                const r = RATES.right[`${m.parts.denchu ? 1 : 0}${m.parts.attacker ? 1 : 0}`];
                if (rng() < r.gate) Machine.enter(m, 'gate');
                where = pick(r.rates, rng);
            }
            if (where === 'none') continue;
            balls += payouts[where] || 0;
            if (where !== 'general') Machine.enter(m, where);
        }
        Machine.update(m, DT);
        DataCounter.tick(counter, DT, ctx(), CONFIG);
        for (const e of m.events.splice(0)) {
            // main.js と同じ: RASH が終わったら出玉を付けてから記録し、ときどきトロフィー
            if (e.type === 'jitanStart' && e.rushHits === 1) rushStartBalls = balls;
            if (e.type === 'rushEnd') e.balls = balls - rushStartBalls;
            record(e);
            if (e.type === 'bonusStart' && !e.rush) { log.firstHits++; if (e.next === 'jitan') log.firstToChallenge++; }
            if (e.type === 'bonusStart' && e.entry) log.challengeWins++;
            if (e.type === 'jitanStart' && e.challenge) log.challenges++;
            if (e.type === 'bonusStart' && e.rush && !e.entry) log.rushContinues++;
            if (e.type === 'spinStart' && e.fig === 2 && m.rush.challenge) {
                const key = e.plan.kind + (e.plan.extra ? ':extra' : '');
                log.challengeKinds[key] = (log.challengeKinds[key] || 0) + 1;
                if (e.plan.extra) log.extraRounds++;
            }
            if (e.type === 'renchan') {
                log.renchan++;
                if (e.games !== m.holds[2].filter(h => h.kind !== 'miss').length) log.renchanWrong++;
            }
            if (e.type === 'hold' && e.result.extra) {
                log.extraHolds++;
                if (e.result.button || e.result.voice) log.extraShown++;
            }
            if (e.type === 'rushEnd') {
                const level = SettingHint.trophy(CONFIG, setting, rng);
                if (level) { log.trophies.push(level); record({ type: 'trophy', level }); }
            }
        }
    }
    return { m, counter, log, balls };
}

// ===== テスト =====
const started = Date.now();
console.log(`自動テスト (1スペック ${HOURS} 時間, seed ${SEED})\n`);

const base = loadGame(SEED);
const { CONFIG } = base;

test('config.js: スペックの振り分け・ラウンド・確率がそろっている', () => {
    for (const [id, spec] of Object.entries(CONFIG.specs)) {
        assert(spec.hitRate > 0 && spec.hitRate < 1, `${id} の hitRate`);
        assert(spec.smallRate > 0 && spec.challengeSmallRate > 0, `${id} の小当たり`);
        for (const list of [spec.firstHit, spec.rushHit]) {
            assert(list.length && list.every(a => a.weight > 0 && a.rounds > 0 && a.label > 0), `${id} の振り分け`);
            assert(list.every(a => a.next === 'jitan' || a.next === 'normal'), `${id} の振り分けの next`);
        }
        assert(spec.rushHit.every(a => a.next === 'jitan'), `${id}: RASH 中の大当たりは時短へ`);
        assert(spec.target.challenge > 0 && spec.target.continuation > 0, `${id} の目標`);
    }
});

test('config.js: 設定1〜6 は回転率の目安と命釘が設定の順に上がる', () => {
    const s = CONFIG.settings;
    assertEqual(s.length, 6, '設定の数');
    for (let i = 1; i < s.length; i++) {
        assert(s[i].rotation > s[i - 1].rotation, `設定${i + 1} の回転率`);
        assert(s[i].hesoWidth > s[i - 1].hesoWidth, `設定${i + 1} の命釘`);
    }
});

test('config.js: 設定示唆のトロフィーは「設定○以上」より上の色を出さず、どの設定でもセリフを言える', () => {
    const t = CONFIG.show.settingHint.trophy;
    for (let s = 1; s <= 6; s++) {
        const keys = Object.entries(t.weights[s]).filter(([, w]) => w > 0).map(([k]) => Number(k));
        assert(keys.length > 0, `設定${s} のトロフィー`);
        assert(keys.every(k => k <= s && t.colors[k]), `設定${s} で設定${Math.max(...keys)}以上のトロフィー`);
        assert(CONFIG.show.settingHint.lines.some(l => l.weights[s] > 0), `設定${s} のセリフ`);
    }
});

// スペックごとに設定4 の台をまわす (突破率・継続率は設定に関係ない)
const runs = Object.keys(CONFIG.specs).map((specId, i) => {
    const game = loadGame(SEED + i);
    game.Collection.load();
    return { specId, game, ...run(game, specId, 4, HOURS) };
});

test('台をまわす: 初当たりの振り分け (突破チャレンジへ行く割合) が config どおり', () => {
    for (const { specId, log } of runs) {
        const spec = CONFIG.specs[specId];
        const total = spec.firstHit.reduce((a, x) => a + x.weight, 0);
        const expected = spec.firstHit.filter(a => a.next === 'jitan').reduce((a, x) => a + x.weight, 0) / total;
        assert(log.firstHits > 300, `${specId} の初当たりが少ない (${log.firstHits})`);
        assertBetween(log.firstToChallenge / log.firstHits, expected - 0.06, expected + 0.06, `${specId} の突破チャレンジへ行く割合`);
    }
});

test('台をまわす: 突破率・継続率が目標に近い', () => {
    for (const { specId, m, log } of runs) {
        const target = CONFIG.specs[specId].target;
        assert(log.challenges > 150, `${specId} の突破チャレンジが少ない (${log.challenges})`);
        assertBetween(log.challengeWins / log.challenges, target.challenge - 0.08, target.challenge + 0.08, `${specId} の突破率`);
        const s = m.stats;
        const continuation = (s.rushHits - s.rushEntries) / s.rushHits;
        assertBetween(continuation, target.continuation - 0.05, target.continuation + 0.05, `${specId} の継続率`);
    }
});

test('演出: 当たりでしか出ないもの (虹の保留・虹のボタン・RASH の黒/回る保留・ボタン・違和感・ブラックアウト・確定の武器と相手) が外れで出ない', () => {
    for (const { specId, log } of runs) {
        let wrong = [];
        for (const e of log.events) {
            const r = e.result;
            if (e.type === 'hold' && e.fig === 1 && r.kind !== 'hit' && (r.holdColor === 'rainbow' || r.button === 'rainbow')) wrong.push('虹 (通常時)');
            if (e.type === 'hold' && e.fig === 2 && r.kind === 'miss' && (r.rashHold || r.button || r.voice)) wrong.push('RASH の保留・ボタン');
            if (e.type === 'hold' && e.fig === 2 && r.kind === 'miss' && r.weapon === 'oniKiller') wrong.push('絶対殺す剣');
            if (e.type === 'spinEnd') {
                const p = e.plan;
                if (p.kind === 'onioni' && p.pattern && !p.win) wrong.push('違和感');
                if (p.kind === 'blackout' && !p.win) wrong.push('ブラックアウト');
                if (p.enemy === 'naitei' && p.type === 'reach' && !p.win) wrong.push('ナイナイの負け');
                if (p.kind === 'rashBattle' && p.enemy === 'goldDog' && !p.win) wrong.push('金面犬の負け');
            }
        }
        assertEqual(wrong.length, 0, `${specId} で外れに出た (${[...new Set(wrong)].join('・')})`);
    }
});

test('突破チャレンジ: 変動はすべて突破チャレンジの演出で、バトル中に入った保留は見せずに「おまけ」のラウンドになる', () => {
    for (const { specId, log } of runs) {
        const other = Object.keys(log.challengeKinds).filter(k => k !== 'challenge' && k !== 'challenge:extra');
        assertEqual(other.join(), '', `${specId} の突破チャレンジ中に RASH などの演出`);
        assert(log.extraHolds > 0, `${specId} でおまけの保留が1回もない (確かめられない)`);
        assert(log.extraRounds > 0 && log.extraRounds <= log.extraHolds, `${specId} のおまけのラウンド (${log.extraRounds} / 保留 ${log.extraHolds})`);
        assertEqual(log.extraShown, 0, `${specId} でおまけの保留のボタン・入賞時の音`);
    }
    // おまけのラウンドの流れ: 「もうひとつおまけに！」→ 最後の一撃 → 結果
    const { Machine, Scenario } = base;
    const m = Machine.create(CONFIG, 's99', base.rng);
    Machine.debugChallenge(m, 0);
    m.jitanLeft = 0;   // バトルが始まったあと (電サポは終わり)
    Machine.enter(m, 'denchu');
    const hold = m.holds[2][0];
    assert(hold && hold.extra, 'バトル中に入った保留がおまけにならない');
    Machine.update(m, 0.01);
    const start = m.events.find(e => e.type === 'spinStart');
    assert(start && start.plan.kind === 'challenge' && start.plan.extra, 'おまけの保留が突破チャレンジのラウンドにならない');
    assertEqual(start.plan.phases.map(p => p.name).join(), 'cextra,cfinal,cresult', 'おまけのラウンドの流れ');
    void Scenario;
});

test('〇G連確定: 〇 は残り保留の当たりの数 (このあと確定している連チャンの数)', () => {
    for (const { specId, log } of runs) {
        assert(log.renchan > 0, `${specId} で〇G連確定が1回もない (確かめられない)`);
        assertEqual(log.renchanWrong, 0, `${specId} で〇が残り保留の当たりの数と違う`);
    }
    // 3つ目だけが当たり → 「1G連確定」(前は位置で「3G連確定」と出ていた)
    const { Machine } = base;
    const m = Machine.create(CONFIG, 's99', base.rng);
    Machine.debugJitan(m);
    m.holds[2] = [{ kind: 'miss' }, { kind: 'miss' }, { kind: 'small' }];
    m.bonus = null;
    Machine.debugHold(m, 2, 'hit', null);
    m.holds[2] = [m.holds[2][0], { kind: 'miss' }, { kind: 'miss' }, { kind: 'small' }];
    for (let t = 0; t < 60 && !m.events.some(e => e.type === 'renchan'); t += 0.1) Machine.update(m, 0.1);
    const e = m.events.find(x => x.type === 'renchan');
    assert(e, '〇G連確定が出ない');
    assertEqual(e.games, 1, '3つ目だけが当たりのときの〇');
});

test('図鑑: 記録が台の集計と合い、実績は値が条件を満たしたときだけ解除される', () => {
    for (const { specId, game, m, log } of runs) {
        const { Collection } = game;
        const s = m.stats;
        assertEqual(Collection.stat('spins'), s.spins1, `${specId} の総回転数`);
        assertEqual(Collection.stat('hits'), s.hits1 + s.hits2 + s.vHits, `${specId} の大当たり`);
        assertEqual(Collection.stat('entries'), s.rushEntries, `${specId} の RASH 突入`);
        for (const a of CONFIG.collection.achievements) {
            const done = Boolean(Collection.get().achievements[a.id]);
            assertEqual(done, Collection.stat(a.stat) >= Collection.target(a, CONFIG), `${specId} の実績「${a.name}」`);
        }
        assertEqual(log.unlocked.length, new Set(log.unlocked.map(a => a.id)).size, `${specId} で同じ実績を2回解除`);
        assert(Collection.stat('seen:hold') > 0 && Collection.stat('seen:challenge') > 0, `${specId} で演出を記録していない`);
    }
});

test('データカウンター: 大当たり履歴・RASH の回数・出玉の推移が台の集計と合う', () => {
    for (const { specId, m, counter, log, balls } of runs) {
        assertEqual(counter.firstHits, log.firstHits, `${specId} の大当たり (初当たり)`);
        assertEqual(counter.rashes, m.stats.rushEntries, `${specId} の RASH`);
        assert(counter.history.length <= CONFIG.dataCounter.historyShown, `${specId} の履歴が多すぎる`);
        assert(counter.history.filter(h => h.active).length <= 1, `${specId} で当たり中の履歴が2つ以上`);
        assert(counter.history.every(h => h.active || h.kind !== 'rash' || h.streak >= 1), `${specId} の RASH の連チャン数`);
        assert(counter.graph.length <= CONFIG.dataCounter.graphPoints + 1, `${specId} の出玉の推移の点が多すぎる`);
        assert(counter.graph.every((p, i) => i === 0 || p[0] >= counter.graph[i - 1][0]), `${specId} の出玉の推移の横軸が戻った`);
        const trophies = Object.values(counter.hints.trophy).reduce((a, x) => a + x, 0);
        assertEqual(trophies, log.trophies.length, `${specId} のトロフィーの数`);
        assert(balls - counter.invested === balls - 100000, `${specId} の差玉`);
    }
});

test('設定示唆: トロフィーは台の設定より上の色を出さず、約50%で出る', () => {
    const g = loadGame(SEED + 10);
    for (let s = 1; s <= 6; s++) {
        let shown = 0;
        for (let i = 0; i < 4000; i++) {
            const level = g.SettingHint.trophy(CONFIG, s, g.rng);
            if (level === null) continue;
            shown++;
            assert(level >= 1 && level <= s, `設定${s} で ${level} のトロフィー`);
        }
        assertBetween(shown / 4000, CONFIG.show.settingHint.trophy.rate - 0.03, CONFIG.show.settingHint.trophy.rate + 0.03, `設定${s} のトロフィーの出る割合`);
        for (let i = 0; i < 500; i++) {
            const line = g.SettingHint.line(CONFIG, s, g.rng);
            assert(line.weights[s] > 0, `設定${s} で「${line.short}」を言った`);
        }
    }
});

test('設定推測: 確率の合計は 1。長く打つと台の設定がいちばん高く、ありえない設定は 0', () => {
    const g = loadGame(SEED + 20);
    const empty = g.DataCounter.create(CONFIG, 250);
    const p0 = g.SettingEstimate.probabilities(empty, CONFIG);
    assertBetween(Object.values(p0).reduce((a, x) => a + x, 0), 0.9999, 1.0001, '何も見ていないときの合計');
    assert(Object.values(p0).every(p => Math.abs(p - 1 / 6) < 1e-9), '何も見ていないときは同じ確率');
    for (let s = 1; s <= 6; s++) {
        // 左打ち 5000発 (約20000円) とトロフィー・セリフ数回
        const c = g.DataCounter.create(CONFIG, 250);
        const shots = 5000;
        let spins = 0;
        const rate = CONFIG.settings[s - 1].rotation / 250;
        for (let i = 0; i < shots; i++) if (g.rng() < rate) spins++;
        c.shotsLeft = shots;
        c.spins = spins;
        for (let i = 0; i < 8; i++) {
            const level = g.SettingHint.trophy(CONFIG, s, g.rng);
            if (level) c.hints.trophy[level] = (c.hints.trophy[level] || 0) + 1;
            const line = g.SettingHint.line(CONFIG, s, g.rng);
            c.hints.line[line.short] = (c.hints.line[line.short] || 0) + 1;
        }
        const p = g.SettingEstimate.probabilities(c, CONFIG);
        assertBetween(Object.values(p).reduce((a, x) => a + x, 0), 0.9999, 1.0001, `設定${s} の合計`);
        const best = Number(Object.entries(p).sort((a, b) => b[1] - a[1])[0][0]);
        assertEqual(best, s, `設定${s} の台でいちばん高い設定`);
        // 設定 s で出たトロフィー (設定○以上) より下の設定はありえない
        const top = Math.max(0, ...Object.keys(c.hints.trophy).map(Number));
        for (let k = 1; k < top; k++) assertEqual(p[k], 0, `設定${top}以上のトロフィーを見たのに 設定${k} の確率`);
    }
});

test('BGM: 台の状態で曲が決まり、曲はすべて同じ長さのメロディとベースを持つ', () => {
    const { Bgm, BGM_TRACKS, Machine } = base;
    const m = Machine.create(CONFIG, Object.keys(CONFIG.specs)[0], base.rng);
    assertEqual(Bgm.trackFor(m, null), 'normal', '通常時');
    assertEqual(Bgm.trackFor(m, 'opening'), 'normal', 'オープニング');
    m.stage.hi = { id: 'seCastle' };
    assertEqual(Bgm.trackFor(m, null), 'hiStage', '高確率ステージ');
    m.rush = { active: true, hits: 1, challenge: true };
    assertEqual(Bgm.trackFor(m, null), 'challenge', '突破チャレンジ');
    m.rush.challenge = false;
    assertEqual(Bgm.trackFor(m, null), 'kooriRash', 'こおりRASH');
    Machine.setRashMode(m, 'onioni');
    assertEqual(Bgm.trackFor(m, null), 'onioniRash', 'おにおにRASH');
    m.bonus = { round: 1 };
    assertEqual(Bgm.trackFor(m, null), 'bonus', '大当たり中');
    assertEqual(Bgm.trackFor(m, 'ending'), 'bonus', 'エンディング');
    const note = /^([A-G]#?\d|\.)$/;
    for (const [name, t] of Object.entries(BGM_TRACKS)) {
        assert(t.bpm > 0 && t.melody.length === t.bass.length && t.melody.length > 0, `${name} の長さ`);
        assert([...t.melody, ...t.bass].every(n => note.test(n)), `${name} に読めない音名`);
    }
});

test('アップデート情報: id が重ならず、はじめて遊ぶときは出さない', () => {
    const g = loadGame(SEED);
    const ids = g.UPDATES.map(u => u.id);
    assertEqual(new Set(ids).size, ids.length, '重なった id');
    assert(g.UPDATES.every(u => u.title && u.items.length), 'タイトルか項目がない');
    assertEqual(g.UpdateNotes.takePending(true).length, 0, 'はじめて遊ぶときに出した');
    assertEqual(g.UpdateNotes.takePending(false).length, 0, '見たあとにまた出した');
    const g2 = loadGame(SEED);
    assertEqual(g2.UpdateNotes.takePending(false).length, 1, '前から遊んでいる人に最新の1件を出していない');
});

test('ページ: index.html と tools/fast.html が js/ のファイルをすべて読み込み、howto.html も同じ config.js を使う', () => {
    const index = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
    const fast = fs.readFileSync(path.join(ROOT, 'tools', 'fast.html'), 'utf8');
    const howto = fs.readFileSync(path.join(ROOT, 'howto.html'), 'utf8');
    const scripts = html => [...html.matchAll(/src="(?:\.\.\/)?(js\/[^"?]+)/g)].map(x => x[1]);
    const files = fs.readdirSync(JS_DIR).filter(f => f.endsWith('.js')).map(f => `js/${f}`);
    for (const f of files) assert(scripts(index).includes(f), `index.html が ${f} を読み込んでいない`);
    assertEqual(scripts(fast).join(), scripts(index).join(), 'tools/fast.html の読み込みが index.html と違う (python tools/make-fast.py で作り直す)');
    assert(scripts(howto).includes('js/config.js'), 'howto.html が config.js を読み込んでいない');
});

// ----- 結果 -----
for (const r of results) console.log(`${r.ok ? '  ✔' : '  ✘'} ${r.name}${r.ok ? '' : `\n      → ${r.message}`}`);
const failed = results.filter(r => !r.ok).length;
const summary = runs.map(r => {
    const s = r.m.stats;
    return `${CONFIG.specs[r.specId].label}: 初当たり ${r.log.firstHits}回 / 突破率 ${pct(r.log.challengeWins / Math.max(1, r.log.challenges))} / 継続率 ${pct((s.rushHits - s.rushEntries) / Math.max(1, s.rushHits))} / 実績 ${Object.keys(r.game.Collection.get().achievements).length}個`;
}).join('  ');
console.log(`\n${summary}`);
console.log(`\n${results.length - failed} / ${results.length} 成功 (${((Date.now() - started) / 1000).toFixed(1)} 秒)`);
process.exit(failed ? 1 : 0);
