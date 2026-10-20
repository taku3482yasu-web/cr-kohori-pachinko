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
const GAME_FILES = ['config.js', 'sprites.js', 'characters.js', 'scenario.js', 'machine.js', 'records.js', 'updates.js', 'bgm.js', 'round-info.js'];

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
    const game = vm.runInContext('({ CONFIG, SPRITES, Characters, Scenario, Machine, SettingHint, Collection, DataCounter, SettingEstimate, UpdateNotes, UPDATES, Bgm, BGM_TRACKS, RoundInfo })', context);
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

// specId のスペック・設定 setting の台を hours 時間まわし、イベントを図鑑とデータカウンターにも記録する (mode: RASH のモード)
function run(game, specId, setting, hours, mode = 'koori') {
    const { CONFIG, Machine, Collection, DataCounter, SettingHint } = game;
    const rng = game.rng;
    const m = Machine.create(CONFIG, specId, rng);
    Machine.setRashMode(m, mode);
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
        renchan: 0, renchanWrong: 0,                    // 「〇G連確定」と、〇 が残り保留の当たりの数と違った回数
        kooriBattles: {}, earlyStreak: 0,               // こおりRASH の相手ごとの [バトル, 勝ち] と、連チャン数が足りないのに出た相手
        kai: { holds: 0, battles: 0, mismatch: 0 },     // 怪の保留・怪のバトル・保留とバトルが合わない (先バレしたのに怪でない など)
        revival: { hits: 0, revivals: 0, wrongLabel: 0, sure: 0, lose: 0, labels: {} },  // こおりRASH の当たり・復活・出玉の振り分け
        onioni: { hits: 0, patterns: {}, wrongLabel: 0, missPattern: 0 }   // おにおにRASH の当たり・違和感ごとの回数・出玉が合わない・外れの違和感
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
            if (e.type === 'spinStart' && e.plan.kind === 'rashBattle') {
                if (e.plan.digits[0] !== e.plan.digits[2]) log.notReach = (log.notReach || 0) + 1;
                const key = e.plan.enemyKey;
                const b = log.kooriBattles[key] || (log.kooriBattles[key] = [0, 0]);
                b[0]++;
                if (e.plan.win) b[1]++;
                const base = CONFIG.show.kooriRash.enemies[e.plan.enemy];
                const need = (e.plan.kai ? base.kai.minStreak : base.minStreak) || 0;
                if (m.rush.hits - 1 < need) log.earlyStreak++;
                if (e.plan.kai) log.kai.battles++;
            }
            // 怪の保留 (こおりRASH): その変動は必ず怪のバトル。怪でない保留は怪にならない
            if (e.type === 'spinStart' && e.fig === 2 && m.rush.active && !m.rush.challenge && m.rashMode === 'koori') {
                const kaiPlan = e.plan.kind === 'rashBattle' && e.plan.kai;
                if (Boolean(e.result.kai) !== kaiPlan) log.kai.mismatch++;
                // 復活: こおりRASH の当たりのうちの割合、出玉 (1/99 は 900個)、確定の相手では起きない
                const rv = log.revival;
                if (e.plan.win) {
                    rv.hits++;
                    const label = e.result.alloc ? e.result.alloc.label : null;
                    rv.labels[label] = (rv.labels[label] || 0) + 1;
                }
                if (e.plan.revival) {
                    rv.revivals++;
                    const want = CONFIG.show.revival.labels[specId];
                    if (want && (!e.result.alloc || e.result.alloc.label !== want)) rv.wrongLabel++;
                    if (e.plan.enemyInfo.win >= 1) rv.sure++;
                    if (!e.plan.win) rv.lose++;
                }
            }
            if (e.type === 'hold' && e.fig === 2 && e.result.kai) log.kai.holds++;
            // おにおにRASH: 違和感は当たりだけ。図柄 8・9 は出玉が合う当たりだけ (1/99 は 900個)
            if (e.type === 'spinStart' && e.plan.kind === 'onioni') {
                const o = log.onioni;
                if (e.plan.win) o.hits++;
                if (e.plan.pattern) {
                    o.patterns[e.plan.pattern] = (o.patterns[e.plan.pattern] || 0) + 1;
                    if (!e.plan.win) o.missPattern++;
                    const want = (CONFIG.show.onioniRash.patterns[e.plan.pattern].labels || {})[specId];
                    if (want && (!e.result.alloc || e.result.alloc.label !== want)) o.wrongLabel++;
                }
            }
            // V への昇格: 小当たりの V入賞の大当たりのうち、V 以外の図柄でそろえたもの
            if (e.type === 'spinStart' && e.result.kind === 'small') {
                const v = log.vPromote || (log.vPromote = { smalls: 0, promoted: 0, wrongDigits: 0, bonuses: 0, bonusPromoted: 0, hidden: 0 });
                v.smalls++;
                const allV = e.plan.digits.every(d => d === 'V');
                if (e.plan.promoteV) { v.promoted++; if (allV || e.plan.digits.some(d => d !== e.plan.digits[0])) v.wrongDigits++; }
                else if (!allV) v.wrongDigits++;
            }
            if (e.type === 'bonusStart' && e.fromV && log.vPromote) {
                log.vPromote.bonuses++;
                if (e.promoteV) log.vPromote.bonusPromoted++;
                if (e.promoteV && e.promote) log.vPromote.hidden++;
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
            // 怪の保留は外れでも先バレする (紫のボタン・入賞時の音)。それ以外の RASH のボタン・音・黒/回る保留は当たりだけ
            if (e.type === 'hold' && e.fig === 2 && r.kind === 'miss' && (r.rashHold || (!r.kai && (r.button || r.voice)))) wrong.push('RASH の保留・ボタン');
            if (e.type === 'hold' && e.fig === 2 && r.kai && !(r.button === 'purple' && r.voice) && r.button !== null) wrong.push('怪の先バレ');
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

test('こおりRASH: 相手と怪の状態がすべて出て、勝つ割合が config の成功率に近い。アルアルは連チャンしてから。バトルは必ずリーチの図柄', () => {
    const { Scenario, Characters } = base;
    const table = Scenario.kooriEnemies(CONFIG);
    const total = {};
    for (const { log } of runs) {
        for (const [key, [n, w]] of Object.entries(log.kooriBattles)) {
            const t = total[key] || (total[key] = [0, 0]);
            t[0] += n;
            t[1] += w;
        }
        assertEqual(log.earlyStreak, 0, '連チャン数が足りないのに出た相手 (アルアル)');
        assertEqual(log.notReach || 0, 0, 'リーチの図柄でないバトル');
    }
    for (const [key, e] of Object.entries(table)) {
        const [n, w] = total[key] || [0, 0];
        assert(n > 0, `${e.name} が1回も出ない`);
        if (e.win >= 1) assertEqual(w, n, `${e.name} (確定) で負けた`);
        else if (n >= 150) assertBetween(w / n, e.win - 0.1, e.win + 0.1, `${e.name} に勝つ割合 (${w}/${n})`);
    }
    // 怪は成功率が上がる (期待度アップ)。目の位置があって描ける
    for (const [id, e] of Object.entries(CONFIG.show.kooriRash.enemies)) {
        if (!e.kai) continue;
        assert(e.kai.win >= e.win, `${e.kai.name} の成功率が ${e.name} より低い`);
        assert(Characters.hasKai(id), `${e.kai.name} の目の位置がない (characters.js の KAI_EYES)`);
    }
    assert(!CONFIG.show.kooriRash.enemies.aruaru.kai, 'アルアルに怪の状態がある');
    // 連チャン数でアルアルが入るかどうか
    assert(!Scenario.kooriEnemies(CONFIG, 1).aruaru, '1連でアルアルが候補に入る');
    assert(Scenario.kooriEnemies(CONFIG, 2).aruaru, '2連でアルアルが候補に入らない');
});

test('こおりRASH の怪: 先バレした保留は必ず怪のバトルになり、ゴールド金面犬・怪は連チャンしてから', () => {
    for (const { specId, log } of runs) {
        assert(log.kai.holds > 0 && log.kai.battles > 0, `${specId} で怪の保留・バトルがない`);
        assertEqual(log.kai.mismatch, 0, `${specId} で怪の保留と怪のバトルが合わない`);
    }
    const { Scenario } = base;
    assert(!Scenario.kooriEnemies(CONFIG, 1).goldDogKai, '1連でゴールド金面犬・怪が候補に入る');
    assert(Scenario.kooriEnemies(CONFIG, 2).goldDogKai, '2連でゴールド金面犬・怪が候補に入らない');
    assert(Scenario.kooriEnemies(CONFIG, 1).goldDog, '1連でゴールド金面犬 (怪でない) が候補に入らない');
});

test('復活: こおりRASH の当たりの約20%、1/99 は 900個 確定、確定の相手では起きず、出玉の振り分けは変わらない', () => {
    for (const { specId, log } of runs) {
        const rv = log.revival;
        assert(rv.hits > 300, `${specId} のこおりRASH の当たりが少ない (${rv.hits})`);
        assertBetween(rv.revivals / rv.hits, CONFIG.show.revival.share - 0.05, CONFIG.show.revival.share + 0.05, `${specId} の復活の占有率`);
        assertEqual(rv.wrongLabel, 0, `${specId} で出玉が合わない復活`);
        assertEqual(rv.sure, 0, `${specId} で確定の相手の復活`);
        assertEqual(rv.lose, 0, `${specId} で外れの復活`);
        // 出玉の振り分け (RASH 中の当たり) は config の重みのまま
        const spec = CONFIG.specs[specId];
        const total = spec.rushHit.reduce((a, x) => a + x.weight, 0);
        const counted = Object.values(rv.labels).reduce((a, x) => a + x, 0);
        for (const a of spec.rushHit) {
            assertBetween((rv.labels[a.label] || 0) / counted, a.weight / total - 0.05, a.weight / total + 0.05, `${specId} の ${a.label}個 の割合`);
        }
    }
});

test('追撃チャンス: 通常時のバトルで出て、出たほうが勝ちやすい。相手ごとの成功率は変わらない', () => {
    const pu = CONFIG.show.pursuit;
    for (const { specId, log } of runs) {
        const n = { on: [0, 0], off: [0, 0] };
        for (const e of log.events) {
            if (e.type !== 'spinEnd' || e.fig !== 1 || e.plan.type !== 'reach') continue;
            const p = e.plan;
            const names = p.phases.map(ph => ph.name).join();
            assertEqual(names, p.pursuit ? 'roll,challenge,reach,battle,pursuit,result' : 'roll,challenge,reach,battle,result', `${specId} の追撃の流れ`);
            const c = n[p.pursuit ? 'on' : 'off'];
            c[0]++;
            if (p.win) c[1]++;
        }
        assert(n.on[0] > 50, `${specId} で追撃チャンスが少ない (${n.on[0]})`);
        assert(n.on[1] / n.on[0] > n.off[1] / n.off[0] + 0.2, `${specId} で追撃チャンスが出ても勝ちやすくない`);
    }
    // 相手ごと: 出たときの成功率 = w×hitRate ÷ (w×hitRate + (1−w)×missRate) が、出ないときより高い
    for (const b of Object.values(CONFIG.show.battles)) {
        if (b.win >= 1) continue;
        const on = b.win * pu.hitRate / (b.win * pu.hitRate + (1 - b.win) * pu.missRate);
        const off = b.win * (1 - pu.hitRate) / (b.win * (1 - pu.hitRate) + (1 - b.win) * (1 - pu.missRate));
        assert(on > b.win && b.win > off, `${b.name} の追撃チャンスで成功率が上がらない`);
    }
});

test('お仲間召喚: こおりRASH の当たりのバトルだけで、確定の相手・復活では起きず、3人とも出る', () => {
    const sm = CONFIG.show.summon;
    for (const { specId, log } of runs) {
        let summons = 0, chances = 0, wrong = 0;
        const members = new Set();
        for (const e of log.events) {
            if (e.type !== 'spinEnd' || e.plan.kind !== 'rashBattle') continue;
            const p = e.plan;
            if (p.win && !p.revival && p.enemyInfo.win < 1) chances++;
            if (!p.summon) continue;
            summons++;
            members.add(p.summon);
            if (!p.win || p.revival || p.enemyInfo.win >= 1 || !sm.members[p.summon]) wrong++;
            if (p.phases.map(ph => ph.name).join() !== 'roll,battle,summon,result') wrong++;
        }
        assertEqual(wrong, 0, `${specId} でおかしなお仲間召喚`);
        assert(chances > 200, `${specId} のこおりRASH の当たりのバトルが少ない (${chances})`);
        assertBetween(summons / chances, sm.rate - 0.06, sm.rate + 0.06, `${specId} のお仲間召喚の割合`);
        assertEqual(members.size, Object.keys(sm.members).length, `${specId} で出てこない仲間がいる`);
    }
    const { Characters } = base;
    for (const id of Object.keys(sm.members)) assert(Characters.isCompanion(id), `${id} の絵がない`);
});

test('おにおにRASH: 違和感は当たりだけで全種類出て、図柄 8・9 は 1/99 で 900個 の当たりだけ', () => {
    const game = loadGame(SEED + 30);
    const { log } = run(game, 's99', 4, Math.min(HOURS, 120), 'onioni');
    const o = log.onioni;
    assert(o.hits > 200, `おにおにRASH の当たりが少ない (${o.hits})`);
    assertEqual(o.missPattern, 0, '外れの違和感');
    assertEqual(o.wrongLabel, 0, '900個 でない当たりで図柄 8・9');
    for (const [id, p] of Object.entries(CONFIG.show.onioniRash.patterns)) assert(o.patterns[id] > 0, `違和感「${p.name}」が1回も出ない`);
    const shown = Object.values(o.patterns).reduce((a, x) => a + x, 0);
    assertEqual(shown, o.hits, '違和感の数と当たりの数');
    // 図柄 8・9 は config の図柄にあり、ふだんの変動 (1〜7) には出ない
    assert(CONFIG.show.figures[8] && CONFIG.show.figures[9], '図柄 8・9 がない');
    assert([...CONFIG.show.hitFigures.odd, ...CONFIG.show.hitFigures.even].every(n => n <= 7), '当たりの図柄に 8・9');
});

test('チャンスステージ: きっかけの保留を消化したら、元とは別の通常ステージへ', () => {
    const { Scenario } = base;
    const cycle = CONFIG.show.stages.cycle;
    for (let i = 0; i < cycle.length; i++) {
        const state = Scenario.newStage();
        state.index = i;
        state.id = cycle[i];
        const target = { kind: 'hit' };
        state.hi = { target, id: 'fullMoon' };
        assertEqual(Scenario.endStage(CONFIG, state, { kind: 'miss' }), null, 'きっかけでない保留で戻った');
        const back = Scenario.endStage(CONFIG, state, target);
        assert(back && back.kind === 'back', 'きっかけの保留で戻らない');
        assert(back.id !== cycle[i] && cycle.includes(back.id), `${cycle[i]} のあとが ${back.id}`);
        assert(!state.hi && state.since === 0, 'チャンスステージが残っている');
    }
});

test('おにおにRASH の違和感: ラウンドの始めにふるカワが教えるひとことが、どの違和感にもある', () => {
    for (const [id, p] of Object.entries(CONFIG.show.onioniRash.patterns)) {
        assert(p.talk && p.talk.length > 0, `「${p.name}」のひとことがない`);
        assert(p.talk.length <= 18, `「${p.name}」のひとことが長い (${p.talk.length}文字)`);
        assert(p.weight > 0, `「${p.name}」の重み`);
        void id;
    }
    assert(Object.keys(CONFIG.show.onioniRash.patterns).length >= 24, '違和感の数');
});

test('ラウンド中の紹介: キャラ紹介・ゲームの説明・舞台設定・ストーリーがあり、絵が描けて、文章がある', () => {
    const { RoundInfo, SPRITES, Characters } = base;
    for (const specId of Object.keys(CONFIG.specs)) {
        const cards = RoundInfo.cards(CONFIG, specId);
        const kinds = new Set(cards.map(c => c.kind));
        assertEqual([...kinds].sort().join(), ['キャラ紹介', 'ゲームの説明', '舞台設定', 'ストーリー'].sort().join(), '紹介の種類');
        for (const c of cards) {
            assert(c.title && c.lines.length > 0 && c.lines.every(l => l.length > 0), `${c.title} の文章`);
            assert(c.lines.every(l => !/undefined|NaN/.test(l)), `${c.title} に数値が入っていない`);
            assert(c.who === null || c.who === 'companions' || SPRITES[c.who] || Characters.has(c.who), `${c.title} の絵 (${c.who})`);
        }
    }
    assert(RoundInfo.SECONDS >= 3, 'カードを出す秒が短すぎる');
});

test('V への昇格: 小当たりの約半分は V 以外の図柄でそろい、その大当たりは V に昇格する (出玉は隠さない)', () => {
    for (const { specId, log } of runs) {
        const v = log.vPromote;
        assert(v && v.smalls > 300, `${specId} の小当たりが少ない`);
        const rate = CONFIG.show.promote.vRate;
        assertBetween(v.promoted / v.smalls, rate - 0.06, rate + 0.06, `${specId} の V 以外でそろう割合`);
        assertEqual(v.wrongDigits, 0, `${specId} の小当たりの図柄 (V 以外は3つ同じ図柄、それ以外は V V V)`);
        assert(v.bonusPromoted > 0, `${specId} で V に昇格する大当たりがない`);
        assertEqual(v.hidden, 0, `${specId} で V への昇格なのに出玉を隠した`);
    }
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
    assertEqual(Bgm.trackFor(m, null), 'seCastle', 'チャンスステージ (SE城前)');
    m.stage.hi = { id: 'fullMoon' };
    assertEqual(Bgm.trackFor(m, null), 'fullMoon', 'チャンスステージ (満月)');
    m.rush = { active: true, hits: 1, challenge: true };
    assertEqual(Bgm.trackFor(m, null), 'challenge', '突破チャレンジ');
    m.rush.challenge = false;
    assertEqual(Bgm.trackFor(m, null), 'kooriRash', 'こおりRASH');
    Machine.setRashMode(m, 'onioni');
    assertEqual(Bgm.trackFor(m, null), 'onioniRash', 'おにおにRASH');
    // 怪: こおりRASH の怪のバトルは変動の始めから、おにおに・怪 は違和感が始まってから
    m.spin = { plan: { kind: 'rashBattle', kai: true, phases: [] }, elapsed: 0 };
    assertEqual(Bgm.trackFor(m, null), 'kai', 'こおりRASH の怪のバトル');
    m.spin = { plan: { kind: 'onioni', pattern: 'kai', phases: [{ name: 'wait', t: 1.5 }, { name: 'anomaly', t: 3 }] }, elapsed: 1 };
    assertEqual(Bgm.trackFor(m, null), 'onioniRash', 'おにおに・怪 の違和感の前');
    m.spin.elapsed = 2;
    assertEqual(Bgm.trackFor(m, null), 'kai', 'おにおに・怪 の違和感');
    m.spin = null;
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
