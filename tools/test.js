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
const GAME_FILES = ['config.js', 'sprites.js', 'characters.js', 'rivals.js', 'battle-lines.js', 'scenario.js', 'machine.js', 'records.js', 'updates.js', 'bgm.js', 'round-info.js'];

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
    const game = vm.runInContext('({ CONFIG, BATTLE_LINES, SPRITES, Characters, Scenario, Machine, SettingHint, Collection, DataCounter, SettingEstimate, UpdateNotes, UPDATES, Bgm, BGM_TRACKS, RoundInfo })', context);
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
        onioni: { hits: 0, patterns: {}, wrongLabel: 0, missPattern: 0 },  // おにおにRASH の当たり・違和感ごとの回数・出玉が合わない・外れの違和感
        premium: { wins: 0, premiums: 0, wrongShow: 0, bonuses: 0, wrongBonus: 0 }   // RASH の当たり・プレミアボーナス・知らせ方が合わない・大当たり
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
            if ((e.type === 'jitanStart' && e.rushHits === 1) || (e.type === 'bonusStart' && e.yutime)) rushStartBalls = balls;
            if (e.type === 'rushEnd') e.balls = balls - rushStartBalls;
            record(e);
            if (e.type === 'bonusStart' && !e.rush) { log.firstHits++; if (e.next === 'jitan') log.firstToChallenge++; }
            if (e.type === 'bonusStart' && e.yutime) log.yutimeHits = (log.yutimeHits || 0) + 1;   // 遊タイムからの RASH 突入 (データカウンターでは初当たり)
            if (e.type === 'bonusStart' && e.entry && !e.yutime) log.challengeWins++;   // 遊タイムからの RASH 突入は突破に数えない
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
            // プレミアボーナス: RASH の当たりの約3%。こおりRASH は怪、おにおにRASH は金面犬がとなりに座る (どちらもプレミアボーナスのときだけ)
            if (e.type === 'spinStart' && e.fig === 2 && m.rush.active && !m.rush.challenge && e.plan.win) {
                const pr = log.premium;
                pr.wins++;
                if (e.plan.premium) pr.premiums++;
                const shown = m.rashMode === 'koori' ? Boolean(e.plan.kai) : m.rashMode === 'onioni' ? e.plan.pattern === 'goldDogSit' : e.plan.kind === 'blackout';
                if (shown !== Boolean(e.plan.premium) || (e.plan.premium && !e.plan.gimmickPhase && !e.plan.yaku)) pr.wrongShow++;   // プレミアは 前の 役物の 落下か 当たりの 役物 (2026-10-24)
            }
            if (e.type === 'bonusStart' && e.premium) {
                log.premium.bonuses++;
                const spec = CONFIG.specs[specId];
                if (e.premium !== spec.premium.name || !m.bonus || m.bonus.alloc.label !== spec.premium.label) log.premium.wrongBonus++;
            }
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
        // 許容幅: ±8% か、回数から 見た 偶然の ぶれ (標準誤差) の 3.5 倍の 大きいほう (1/159 は 突破チャレンジが 約350回で ぶれが 約2.7%。2026-10-23)
        const se = Math.sqrt(target.challenge * (1 - target.challenge) / log.challenges);
        const tol = Math.max(0.08, 3.5 * se);
        assertBetween(log.challengeWins / log.challenges, target.challenge - tol, target.challenge + tol, `${specId} の突破率`);
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
            // 許容幅は ±5% か、標準誤差の 3.5 倍の 大きいほう (当たりが 数百回 なので ぶれが 大きい)
            const w = a.weight / total, tol = Math.max(0.05, 3.5 * Math.sqrt(w * (1 - w) / counted));
            assertBetween((rv.labels[a.label] || 0) / counted, w - tol, w + tol, `${specId} の ${a.label}個 の割合`);
        }
    }
});

test('レバー・レバブル (2026-10-24): レバーを引け！が出たら 85% くらいで当たり (RASH 中は確定)、レバブルは出たら当たる割合が config に近い', () => {
    const show = CONFIG.show;
    for (const { specId, log } of runs) {
        const lever = [0, 0], spin = [0, 0], hold = [0, 0], rash = [0, 0], change = [0, 0];
        for (const e of log.events) {
            if (e.type === 'spinEnd' && e.plan.lever) { change[0]++; if (e.plan.leverChange) change[1]++; }
            if (e.type === 'spinEnd' && e.plan.kind === 'rashBattle') {
                if (e.plan.lever) { rash[0]++; if (e.plan.win && !e.plan.revival) rash[1]++; }   // 復活では 出さない
            }
            if (e.type === 'spinEnd' && e.fig === 1 && e.plan.type === 'reach') {
                if (e.plan.lever) { lever[0]++; if (e.plan.win) lever[1]++; }
                if (e.plan.leverBuru) { spin[0]++; if (e.plan.win) spin[1]++; }
            }
            if (e.type === 'hold' && e.fig === 1 && !e.result.extra && e.result.leverBuru) { hold[0]++; if (e.result.kind === 'hit') hold[1]++; }
        }
        assert(lever[0] > 30, `${specId} でレバーが少ない (${lever[0]})`);
        // 許容幅は ±7% か、標準誤差の 3.5 倍の 大きいほう (見た目の 演出は fxRandom なので 毎回 少し 変わる。1/159 は 数が 少ない)
        const lr = show.lever.reliability, ltol = Math.max(0.07, 3.5 * Math.sqrt(lr * (1 - lr) / lever[0]));
        assertBetween(lever[1] / lever[0], lr - ltol, lr + ltol, `${specId} のレバーを引け！が出たら当たる割合`);
        assert(rash[0] > 0 && rash[1] === rash[0], `${specId} の RASH 中のレバーを引け！ (${rash[1]} / ${rash[0]}。出たら確定・復活では出ないはず)`);
        assertBetween(change[1] / change[0], show.lever.change - 0.12, show.lever.change + 0.12, `${specId} の PUSH！ からレバーを引け！に変わる割合`);
        assert(spin[0] > 30 && hold[0] > 30, `${specId} でレバブルが少ない (変動中 ${spin[0]} / 保留 ${hold[0]})`);
        assertBetween(spin[1] / spin[0], show.leverBuru.spinReliability - 0.12, show.leverBuru.spinReliability + 0.12, `${specId} の変動中のレバブル`);
        assertBetween(hold[1] / hold[0], show.leverBuru.holdReliability - 0.15, show.leverBuru.holdReliability + 0.15, `${specId} の保留のレバブル`);
    }
});

test('レバーを引け！の色・保留・復活・ハンドルブル (2026-10-24): 色は 青 < 赤 < 金 < 虹 (確定)、復活は当たりだけで変動が長い、保留に引け！は保留変化だけ', () => {
    const show = CONFIG.show;
    for (const { specId, log } of runs) {
        const colors = {}, handle = [0, 0];
        let revivals = 0, revivalLoss = 0, leverHolds = 0, leverHoldNoChange = 0;
        for (const e of log.events) {
            if (e.type === 'spinEnd' && e.fig === 1 && e.plan.lever) {
                const c = colors[e.plan.leverColor] || (colors[e.plan.leverColor] = [0, 0]);
                c[0]++;
                if (e.plan.win) c[1]++;
            }
            if (e.type === 'spinEnd' && e.plan.leverRevival) {
                revivals++;
                const names = e.plan.phases.map(ph => ph.name);
                if (!e.plan.win || !e.plan.lever || !names.includes('rvagain') || names.indexOf('rvagain') < names.indexOf('result')) revivalLoss++;
            }
            if (e.type === 'hold' && e.fig === 1 && !e.result.extra) {
                if (e.result.leverHold) { leverHolds++; if (!e.result.changed) leverHoldNoChange++; }
                if (e.result.handleBuru) { handle[0]++; if (e.result.kind === 'hit') handle[1]++; }
            }
        }
        const rate = id => colors[id] ? colors[id][1] / colors[id][0] : null;
        assert(Object.keys(colors).every(id => id in show.lever.colors), `${specId} の引け！の色 (${Object.keys(colors)})`);
        // 色ごとの 数が 少ない (1/159 は 数十回) ので、差の 大きい 青 < 金 だけ 見る (色ごとの 割合は node tools/trust.js で はかる)
        assert(rate('blue') < rate('gold'), `${specId} の引け！の色の順 (青 ${rate('blue')} / 赤 ${rate('red')} / 金 ${rate('gold')})`);
        assert(!colors.rainbow || rate('rainbow') === 1, `${specId} の虹の引け！は確定のはず (${rate('rainbow')})`);
        assert(revivals > 0 && revivalLoss === 0, `${specId} の引け！の復活 (${revivals} 回。おかしいもの ${revivalLoss})`);
        assert(leverHolds > 10 && leverHoldNoChange === 0, `${specId} の保留に引け！ (${leverHolds} 回。保留変化でないもの ${leverHoldNoChange})`);
        assert(handle[0] > 30, `${specId} でハンドルブルが少ない (${handle[0]})`);
        assertBetween(handle[1] / handle[0], show.handleBuru.holdReliability - 0.15, show.handleBuru.holdReliability + 0.15, `${specId} のハンドルブル`);
    }
});

test('PUSH の押し方と色・保留の「?」(2026-10-24): 色は 白 < 青 < 赤 < 金 < 虹 (確定)、長押し・連打は 1 回押しより熱い、「?」は保留変化だけ', () => {
    for (const { specId, log } of runs) {
        const color = {}, mode = {};
        let noStyle = 0, questions = 0, badQuestion = 0;
        const add = (map, id, win) => { const c = map[id] || (map[id] = [0, 0]); c[0]++; if (win) c[1]++; };
        for (const e of log.events) {
            if (e.type === 'spinEnd' && e.fig === 1 && e.plan.type === 'reach') {
                if (e.plan.lever) continue;
                if (!e.plan.pushMode || !e.plan.pushColor) { noStyle++; continue; }
                add(color, e.plan.pushColor, e.plan.win);
                add(mode, e.plan.pushMode, e.plan.win);
            }
            if (e.type === 'spinEnd' && e.plan.kind === 'rashBattle' && !e.plan.lever && !e.plan.pushMode) noStyle++;
            if (e.type === 'hold' && e.fig === 1 && !e.result.extra && e.result.question) { questions++; if (!e.result.changed) badQuestion++; }   // change は 変わったあと 消えるので changed で 見る
        }
        const rate = (map, id) => map[id] ? map[id][1] / map[id][0] : null;
        assertEqual(noStyle, 0, `${specId} で押し方・色のない PUSH`);
        const order = ['white', 'blue', 'red', 'gold'].map(id => rate(color, id));
        for (let i = 1; i < order.length; i++) assert(order[i] > order[i - 1], `${specId} の PUSH の色の順 (${order.map(pct).join(' < ')})`);
        assert(!color.rainbow || rate(color, 'rainbow') === 1, `${specId} の虹の PUSH は確定のはず`);
        assert(rate(mode, 'long') > rate(mode, 'tap') && rate(mode, 'mash') > rate(mode, 'tap'), `${specId} の押し方 (1 回 ${pct(rate(mode, 'tap'))}・長押し ${pct(rate(mode, 'long'))}・連打 ${pct(rate(mode, 'mash'))})`);
        assert(questions > 10 && badQuestion === 0, `${specId} の「?」の保留 (${questions} 回。保留変化でないもの ${badQuestion})`);
    }
});

test('追撃チャンス: 通常時のバトルで出て、出たほうが勝ちやすい。相手ごとの成功率は変わらない', () => {
    const pu = CONFIG.show.pursuit;
    for (const { specId, log } of runs) {
        const n = { on: [0, 0], off: [0, 0] };
        for (const e of log.events) {
            if (e.type !== 'spinEnd' || e.fig !== 1 || e.plan.type !== 'reach') continue;
            const p = e.plan;
            // 予告 (ステップアップ・群)・擬似連・発展・カットインは除いて流れを見る
            const names = p.phases.map(ph => ph.name).filter(n => !['stepup', 'gun', 'next', 'develop', 'cutin', 'yaku'].includes(n) && !n.startsWith('rv')).join();   // rv○○: 引け！の 復活 / yaku: 当たりの 役物
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

// 特図1 の変動 (通常時) の筋書きだけを たくさん作って数える (台をまわすより早い)
function fig1Plans(specId, count, seed) {
    const game = loadGame(seed);
    const { CONFIG, Scenario } = game;
    const spec = CONFIG.specs[specId];
    const plans = [];
    for (let i = 0; i < count; i++) {
        const hit = game.rng() < spec.hitRate;
        const result = hit ? { kind: 'hit', alloc: spec.firstHit[Math.floor(game.rng() * spec.firstHit.length)] } : { kind: 'miss' };
        Object.assign(result, Scenario.hold(CONFIG, spec, result, game.rng, 'recommend'));
        plans.push(Scenario.plan(CONFIG, spec, { fig: 1, result, holdsLeft: 1, rush: false, holdColor: result.holdColor, specId }, game.rng));
    }
    return { CONFIG, Scenario, plans };
}

// ----- 1・3・5 の ひび割れ と 当たりの 役物 (2026-10-24 ユーザー指定) -----
test('1・3・5 の ひび割れ: 通常時の 当たりの 約1割、1・3・5 で 止まって 7・7・7 で そろう。バトルの 当たりは 図柄の 前に 役物', () => {
    for (const specId of ['s99', 's159']) {
        const { CONFIG, plans } = fig1Plans(specId, 400000, 21);
        const hits = plans.filter(p => p.win);
        const crack = hits.filter(p => p.crack);
        // 7 (奇数) の 当たりから 選び、本当の 振り分け (重み) で 当たり 全体の 1 割に なる。fig1Plans は 振り分けを 同じ 割合で 選ぶので、その分 なおして 見る
        const list = CONFIG.specs[specId].firstHit, isOdd = a => a.label >= CONFIG.show.bigLabel || a.next === 'jitan';
        const oddWeight = list.filter(isOdd).reduce((a, x) => a + x.weight, 0) / list.reduce((a, x) => a + x.weight, 0);
        const oddEven = list.filter(isOdd).length / list.length;
        const share = crack.length / hits.length / oddEven * oddWeight;
        assert(share > 0.08 && share < 0.12, `${specId}: ひび割れが 当たりの ${(share * 100).toFixed(1)}% (約10%の はず)`);
        assert(plans.every(p => !p.crack || p.win), 'ひび割れは 当たりだけ');
        for (const p of crack) {
            assert(p.fakeDigits.join() === '1,3,5' && p.digits.join() === '7,7,7', '1・3・5 → 7・7・7');
            const names = p.phases.map(ph => ph.name);
            assert(['xstop', 'xcrack', 'xemerge', 'xsmash', 'xroar', 'xalign'].every(n => names.includes(n)), `ひび割れの 場面が そろって いない: ${names}`);
            assert(p.reveal.phase === 'xalign', '当たりが 見えるのは 7・7・7');
        }
        assert(crack.every(p => p.type === 'plain' && !p.challenge), 'ひび割れに チャレンジ失敗は ない (そのまま 1・3・5 で 止まる)');
        // 当たりの 役物: バトルの 当たりは みんな、図柄が そろう (result / 復活は rvkill) 前に yaku
        for (const p of hits.filter(x => x.type === 'reach')) {
            const names = p.phases.map(ph => ph.name);
            const at = names.indexOf('yaku');
            assert(at >= 0 && names[at + 1] === (p.leverRevival ? 'rvkill' : 'result'), `役物の 場所が ちがう: ${names}`);
        }
        assert(plans.every(p => p.win || !p.yaku), '外れには 役物なし');
    }
});

test('ステップアップ予告: 3段目の金文字は約90%、赤文字はチャンス、3段目まで行くと白でも期待できる。3段目の外れはチャレンジに入る', () => {
    for (const specId of ['s99', 's159']) {
        const { CONFIG, plans } = fig1Plans(specId, 600000, 7);
        const n = {};
        let wrongType = 0;
        for (const p of plans) {
            if (!p.stepUp) continue;
            const c = n[p.stepUp.id] || (n[p.stepUp.id] = [0, 0]);
            c[0]++;
            if (p.win) c[1]++;
            if (p.stepUp.step === 3 && !p.win && p.type === 'plain') wrongType++;
            if (!CONFIG.show.stepUp.kinds[p.stepUp.kind]) wrongType++;
        }
        assertEqual(wrongType, 0, `${specId} で3段目なのにチャレンジに入らない外れ (または種類がない)`);
        const rate = id => n[id][1] / n[id][0];
        assert(n.s3gold[0] > 80, `${specId} で金文字が少ない (${n.s3gold[0]})`);
        assertBetween(rate('s3gold'), 0.82, 0.97, `${specId} の金文字の当たる割合`);
        assertBetween(rate('s3red'), 0.4, 0.6, `${specId} の赤文字の当たる割合`);
        assert(rate('s3white') > rate('s2') && rate('s2') > rate('s1'), `${specId} で段が進むほど当たりやすくなっていない`);
    }
});

test('擬似連: チャレンジに入る変動だけで出て、続くほど当たりやすい。全回転は当たりだけで、図柄の色が振り分けと合う', () => {
    const { CONFIG, plans } = fig1Plans('s99', 600000, 8);
    const n = [[0, 0], [0, 0], [0, 0], [0, 0]];
    let wrong = 0, zen = 0, hits = 0;
    const zenKinds = new Set();
    for (const p of plans) {
        if (p.win) hits++;
        if (p.type === 'zenkaiten') {
            zen++;
            zenKinds.add(p.zenkaiten);
            const k = CONFIG.show.zenkaiten.kinds[p.zenkaiten];
            if (!p.win || p.digits.some(d => d !== k.figure) || p.challenge) wrong++;
            continue;
        }
        if (p.type === 'plain' && p.gizi) wrong++;
        if (p.type === 'plain') continue;
        const g = p.gizi || 0;
        if (p.phases.filter(ph => ph.name === 'next').length !== g) wrong++;
        n[g][0]++;
        if (p.win) n[g][1]++;
    }
    assertEqual(wrong, 0, 'おかしな擬似連・全回転');
    for (let g = 1; g < 4; g++) assert(n[g][1] / n[g][0] > n[g - 1][1] / n[g - 1][0], `擬似${g + 1}連 が 擬似${g}連 より当たりにくい`);
    assertBetween(zen / hits, CONFIG.show.zenkaiten.rate - 0.012, CONFIG.show.zenkaiten.rate + 0.012, '全回転の割合');
    assertEqual(zenKinds.size, Object.keys(CONFIG.show.zenkaiten.kinds).length, '出てこない全回転がある');
    // 奇数の当たり (突破チャレンジへ) では偶数だけの全回転 (おかがっぱ) を選ばない
    const game = loadGame(9);
    const spec = game.CONFIG.specs.s99;
    for (let i = 0; i < 2000; i++) {
        const alloc = spec.firstHit.find(a => a.next === 'jitan');
        const p = game.Scenario.plan(game.CONFIG, spec, { fig: 1, result: { kind: 'hit', alloc, forceZenkaiten: null }, holdsLeft: 0, rush: false, specId: 's99' }, game.rng);
        if (p.type === 'zenkaiten' && !game.CONFIG.show.zenkaiten.kinds[p.zenkaiten].odd) throw new Error(`奇数の当たりで ${p.zenkaiten} の全回転`);
    }
});

test('群予告・こおりカットイン・役物・発展: こおり群・おにおに群は約90%、ひびきまくり群は確定、カットインの赤は80%越え・金は約95%', () => {
    for (const specId of ['s99', 's159']) {
        const { CONFIG, plans } = fig1Plans(specId, 1500000, 12);
        const count = {};
        const add = (key, win) => { const c = count[key] || (count[key] = [0, 0]); c[0]++; if (win) c[1]++; };
        let wrong = 0;
        for (const p of plans) {
            if (p.gun) { add('gun:' + p.gun, p.win); if (!p.win && p.type === 'plain') wrong++; }
            if (p.cutin) add('cutin:' + p.cutin, p.win);
            if (p.gimmick) add('gimmick', p.win);
            if (p.develop) {
                add('develop', p.win);
                if (CONFIG.show.develop.sp[p.enemy] !== 'SPSP' || !CONFIG.show.develop.from.includes(p.develop.from)) wrong++;
            }
            if ((p.cutin || p.gimmick || p.develop) && p.type !== 'reach') wrong++;
        }
        assertEqual(wrong, 0, `${specId} でおかしな群予告・カットイン・発展`);
        const rate = key => count[key][1] / count[key][0];
        assertBetween(rate('gun:koori'), 0.84, 0.95, `${specId} のこおり群`);
        assertBetween(rate('gun:onioni'), 0.84, 0.95, `${specId} のおにおに群`);
        assertEqual(rate('gun:hibiki'), 1, `${specId} のひびきまくり群`);
        assert(rate('cutin:red') > 0.8, `${specId} のカットインの赤が 80% 以下 (${pct(rate('cutin:red'))})`);
        assertBetween(rate('cutin:gold'), 0.92, 0.98, `${specId} のカットインの金`);
        assert(rate('cutin:blue') < rate('cutin:green') && rate('cutin:green') < rate('cutin:red'), `${specId} のカットインの色の順`);
        assertEqual(rate('gimmick'), 1, `${specId} の役物 (当たり確定)`);
    }
});

test('先読み: 出たら当たる割合が 熱 で約90%、量が多いほど高い。ガセが減るので外れで出る回数も減る', () => {
    const game = loadGame(31);
    const { CONFIG, Scenario } = game;
    const kinds = ['color', 'change', 'button', 'voice', 'hiStage'];
    const names = { color: '色が付いた保留', change: '保留変化', button: 'ボタン', voice: '入賞時の音', hiStage: '高確率ステージ' };
    for (const specId of ['s99', 's159']) {
        const spec = CONFIG.specs[specId];
        const rel = {}, missShown = {};
        for (const level of ['chance', 'recommend', 'hot']) {
            const c = Object.fromEntries(kinds.map(k => [k, [0, 0]]));
            let misses = 0, shownOnMiss = 0;
            for (let i = 0; i < 600000; i++) {
                const hit = game.rng() < spec.hitRate;
                const r = Scenario.hold(CONFIG, spec, { kind: hit ? 'hit' : 'miss' }, game.rng, level);
                const shown = { color: r.holdColor !== 'white', change: r.changed, button: Boolean(r.button), voice: r.voice, hiStage: r.hiStage };
                kinds.forEach(k => { if (shown[k]) { c[k][0]++; if (hit) c[k][1]++; } });
                if (!hit) { misses++; if (kinds.some(k => shown[k])) shownOnMiss++; }
            }
            rel[level] = Object.fromEntries(kinds.map(k => [k, c[k][1] / c[k][0]]));
            missShown[level] = shownOnMiss / misses;
            const target = CONFIG.show.senyomi.levels[level].rel;
            kinds.forEach(k => assertBetween(rel[level][k], target - 0.06, target + 0.06, `${specId} ${level} の${names[k]}`));
        }
        kinds.forEach(k => assert(rel.chance[k] < rel.recommend[k] && rel.recommend[k] < rel.hot[k], `${specId} の${names[k]}が先読みの量の順に上がらない`));
        assert(missShown.chance > missShown.recommend && missShown.recommend > missShown.hot, `${specId} の外れで出る先読みが量の順に減らない`);
        assertBetween(rel.hot.color, 0.85, 0.95, `${specId} 熱の色が付いた保留`);
    }
});

test('7 のリーチは当たり確定: 通常時のリーチ・こおりRASH のバトルの外れは 7 でそろえない', () => {
    for (const specId of ['s99', 's159']) {
        const { CONFIG, Scenario, plans } = fig1Plans(specId, 150000, 41);
        let reachMiss = 0, wrong = 0, sevenHit = 0;
        for (const p of plans) {
            if (p.type !== 'reach') continue;
            if (!p.win) { reachMiss++; if (p.digits[0] === 7 || p.digits[2] === 7) wrong++; }
            else if (p.digits[0] === 7) sevenHit++;
        }
        assert(reachMiss > 300, `${specId} の外れのリーチが少ない`);
        assert(sevenHit > 0, `${specId} で 7 の当たりのリーチが出ない`);
        assertEqual(wrong, 0, `${specId} の通常時の 7 の外れのリーチ`);
        const game = loadGame(42);
        const spec = CONFIG.specs[specId];
        for (let i = 0; i < 20000; i++) {
            const p = game.Scenario.plan(game.CONFIG, spec, { fig: 2, result: { kind: 'miss', force: 'reach' }, holdsLeft: 1, rush: true, rashMode: 'koori', specId, rushStreak: 3 }, game.rng);
            if (p.kind === 'rashBattle' && (p.digits[0] === 7 || p.digits[2] === 7)) wrong++;
        }
        assertEqual(wrong, 0, `${specId} のこおりRASH の 7 の外れのリーチ`);
    }
});

test('おかピポRASH: 5連目から選べて、当たりだけ一発告知 → 大量発生。入ったときの先読みは出さず、RASH が終わると元のモードに戻る', () => {
    const game = loadGame(14);
    const { CONFIG, Machine, Scenario, Bgm } = game;
    const m = Machine.create(CONFIG, 's99', game.rng);
    m.rush = { active: true, hits: 5, startTime: 0, challenge: false };   // 4連
    assert(!Machine.rashModes(m).includes('okapipo'), '4連でおかピポRASH が選べる');
    m.rush.hits = 6;   // 5連
    assert(Machine.rashModes(m).includes('okapipo'), '5連でおかピポRASH が選べない');
    let mode = m.rashMode;
    const seen = new Set();
    for (let i = 0; i < 3; i++) { mode = Machine.nextRashMode({ ...m, rashMode: mode }); seen.add(mode); }
    assertEqual(seen.size, 3, 'ボタンの切り替えで3つのモードを順に選べない');
    Machine.setRashMode(m, 'okapipo');
    assertEqual(Bgm.trackFor(m, null), 'okapipoRash', 'おかピポRASH の曲');
    const spec = CONFIG.specs.s99;
    const notices = {};
    const flows = { gold: 'roll,pgold,pface', gun: 'roll,pgun,palign' };
    for (let i = 0; i < 20000; i++) {
        const kind = i % 4 === 0 ? 'hit' : i % 4 === 1 ? 'small' : 'miss';
        const result = { kind, alloc: kind === 'miss' ? undefined : spec.rushHit[0] };
        Object.assign(result, Scenario.hold2(CONFIG, result, { rash: true, challenge: false, koori: false, okapipo: true, streak: 5, spec }, game.rng));
        if (result.button || result.voice || result.rashHold || result.kai) throw new Error('おかピポRASH で入ったときの先読みが出た');
        const p = Scenario.plan(CONFIG, spec, { fig: 2, result, holdsLeft: 0, rush: true, rashMode: 'okapipo', specId: 's99', rushStreak: 5 }, game.rng);
        assertEqual(p.kind, 'okapipo', 'おかピポRASH の変動');
        if (kind === 'miss' && (p.okaNotice || p.phases.length !== 1)) throw new Error('おかピポRASH の外れで一発告知');
        if (kind !== 'miss') {
            const flow = CONFIG.show.okapipoRash.notices[p.okaNotice].flow;
            if (p.phases.map(ph => ph.name).join() !== (flows[flow] || 'roll,pnotice,pipo')) throw new Error(`おかピポRASH の当たりの流れ (${p.okaNotice})`);
            notices[p.okaNotice] = (notices[p.okaNotice] || 0) + 1;
        }
        if (p.talk) throw new Error('おかピポRASH でふるカワがしゃべった');
    }
    assertEqual(Object.keys(notices).length, Object.keys(CONFIG.show.okapipoRash.notices).length, '出てこない一発告知がある');
    const wins = Object.values(notices).reduce((a, x) => a + x, 0);
    assertBetween(notices.gold / wins, 0.37, 0.43, '金色のおかがっぱの割合 (約40%)');
    assertBetween(notices.gun / wins, 0.08, 0.12, '告知なしのおかがっぱ群の割合 (約10%)');
    // RASH が終わると元のモードに戻る
    m.rush = { active: true, hits: 6, startTime: 0, challenge: false };
    m.jitanLeft = 0;
    Machine.update(m, 0.1);
    assert(!m.rush.active && m.rashMode === CONFIG.show.rash.defaultMode, 'RASH が終わってもおかピポRASH のまま');
});

test('告知のタイプ: 後告知・一発告知は通常時の演出なしで、後告知の当たりは図柄が外れの目で止まってからそろう', () => {
    const game = loadGame(13);
    const { CONFIG, Scenario } = game;
    const spec = CONFIG.specs.s99;
    for (const notice of ['post', 'oneshot']) {
        for (let i = 0; i < 3000; i++) {
            const hit = i % 3 === 0;
            const result = hit ? { kind: 'hit', alloc: spec.firstHit[1] } : { kind: 'miss' };
            const p = Scenario.plan(CONFIG, spec, { fig: 1, result, holdsLeft: 1, rush: false, notice, specId: 's99' }, game.rng);
            if (p.challenge || p.stepUp || p.gun || p.gizi || p.zenkaiten) throw new Error(`${notice} で演出が出た`);
            const names = p.phases.map(ph => ph.name).join();
            const expected = hit && notice === 'post' ? 'roll,postnotice' : 'roll';
            if (names !== expected) throw new Error(`${notice} の流れ: ${names}`);
            if (hit && notice === 'post' && p.fakeDigits[0] === p.fakeDigits[1] && p.fakeDigits[1] === p.fakeDigits[2]) throw new Error('後告知の外れの目がそろっている');
        }
    }
});

test('早送り: 飛ばす先は当たりが見える場面かリーチの結果の始めで、変動の長さより前', () => {
    const { Scenario, plans } = fig1Plans('s99', 20000, 10);
    for (const p of plans) {
        const at = Scenario.skipPoint(p);
        assert(at >= 0 && at < p.duration, '早送りの先が変動の外');
        if (p.type === 'reach' || p.type === 'fail') {
            const names = p.phases.map(ph => ph.name);
            const target = p.reveal ? p.reveal.phase : p.type === 'reach' ? 'result' : 'fail';
            const start = p.phases.slice(0, names.indexOf(target)).reduce((a, ph) => a + ph.t, 0);
            assertEqual(at, start, `早送りの先 (${p.type})`);
        }
    }
});

test('遊タイム: 通常時に天井の回数まわすと時短に入り、特図2 で当たれば RASH 突入。当たれば数え直す', () => {
    for (const [specId, at] of [['s99', 300], ['s159', 500]]) {
        assertEqual(CONFIG.specs[specId].yutime.at, at, `${specId} の天井`);
        const game = loadGame(11);
        const { Machine } = game;
        const m = Machine.create(game.CONFIG, specId, game.rng);
        for (let i = 0; i < at; i++) {
            Machine.debugHold(m, 1, 'miss', null);   // ずっと外れ
            for (let k = 0; k < 200 && (m.spin || m.holds[1].length); k++) Machine.update(m, 0.5);
        }
        assert(m.yutime && Machine.inJitan(m), `${specId}: ${at}回 まわしても遊タイムに入らない`);
        assertEqual(m.jitanLeft, game.CONFIG.specs[specId].yutime.spins, `${specId} の遊タイムの時短の回数`);
        assertEqual(m.events.filter(e => e.type === 'yutimeStart').length, 1, `${specId} の遊タイム突入のイベント`);
        // 特図2 の小当たり → V → RASH 突入
        Machine.debugHold(m, 2, 'small', null);
        for (let k = 0; k < 100 && !m.small; k++) Machine.update(m, 0.5);
        Machine.enter(m, 'attacker');
        const start = m.events.find(e => e.type === 'bonusStart');
        assert(start && start.entry && start.yutime && m.rush.active, `${specId}: 遊タイムの当たりで RASH に入らない`);
        assertEqual(m.normalSpins, 0, `${specId}: 当たったのに遊タイムの回数が残っている`);
        assert(!m.yutime, `${specId}: 当たったのに遊タイムのまま`);
    }
    // 長くまわした台: 遊タイムに入っても突破率・継続率のテストは変わらない (遊タイムからの突入は突破に数えない)
    for (const { specId, m } of runs) assert((m.stats.yutimes || 0) > 0, `${specId} で遊タイムに1回も入らない`);
});

test('お仲間の応援: こおりRASH のバトルで、人数が多いほど勝ちやすい', () => {
    for (const { specId, log } of runs) {
        const n = [[0, 0], [0, 0], [0, 0], [0, 0]];
        for (const e of log.events) {
            if (e.type !== 'spinEnd' || e.plan.kind !== 'rashBattle') continue;
            const c = n[e.plan.cheer];
            c[0]++;
            if (e.plan.win) c[1]++;
        }
        for (let i = 1; i < 4; i++) assert(n[i][1] / n[i][0] > n[i - 1][1] / n[i - 1][0], `${specId}: 応援 ${i}人 が ${i - 1}人 より勝ちにくい`);
    }
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

test('プレミアボーナス: RASH の当たりの約3%で、出玉は 1/99 1800個・1/159 2600個。怪・金面犬がとなりに座る・おかピポRASH のブラックアウトで知らせる', () => {
    for (const { specId, log } of runs) {
        const pr = log.premium;
        assert(pr.wins > 500, `${specId} の RASH の当たりが少ない (${pr.wins})`);
        // 許容幅: ±1% か、回数から 見た 偶然の ぶれ (標準誤差) の 3.5 倍の 大きいほう (RASH の 当たりは 150 時間で 500〜800 回。2026-10-23)
        const prTol = Math.max(0.01, 3.5 * Math.sqrt(0.03 * 0.97 / pr.wins));
        assertBetween(pr.premiums / pr.wins, 0.03 - prTol, 0.03 + prTol, `${specId} のプレミアボーナスの割合`);
        assertEqual(pr.wrongShow, 0, `${specId} でプレミアボーナスと怪が合わない`);
        assert(pr.bonuses > 0, `${specId} でプレミアボーナスの大当たりがない`);
        assertEqual(pr.wrongBonus, 0, `${specId} でプレミアボーナスの名前・出玉が違う`);
    }
    // 出玉: ラウンド x カウント x 賞球 が表示の個数に近い (少し多い)
    for (const [specId, want] of [['s99', 1800], ['s159', 2600]]) {
        const pr = CONFIG.specs[specId].premium;
        const balls = pr.rounds * (pr.count || CONFIG.machine.bonus.count) * CONFIG.payout.attacker;
        assertEqual(pr.label, want, `${specId} のプレミアボーナスの個数`);
        assertBetween(balls, want, want * 1.05, `${specId} のプレミアボーナスの出玉`);
        assertEqual(pr.next, 'jitan', `${specId} のプレミアボーナスのあとは時短`);
    }
    // 知らせ方 (モードごと)。突破チャレンジ・遊タイムではプレミアボーナスにならない
    const game = loadGame(SEED + 40);
    const { Scenario, Machine } = game;
    for (const specId of ['s99', 's159']) {
        const spec = CONFIG.specs[specId];
        for (const kind of ['hit', 'small']) {
            const ctx = { rash: true, challenge: false, okapipo: false, streak: 3, spec };
            const result = { kind, alloc: spec.premium };
            Object.assign(result, Scenario.hold2(CONFIG, result, { ...ctx, koori: true }, game.rng));
            assert(result.kai && result.voice && result.button === 'purple', `${specId} のこおりRASH のプレミアボーナスで怪の先バレがない`);
            const spin = mode => ({ fig: 2, result, holdsLeft: 0, rush: true, rashMode: mode, specId, rushStreak: 3 });
            const koori = Scenario.plan(CONFIG, spec, spin('koori'), game.rng);
            assert(koori.kind === 'rashBattle' && koori.kai && koori.premium === spec.premium.name && !koori.revival && !koori.summon, `${specId} のこおりRASH`);
            const onioni = Scenario.plan(CONFIG, spec, spin('onioni'), game.rng);
            // プレミアボーナスは 当たりが 見える 場面の 前に 当たりの 役物 (2026-10-24。前の 役物の 落下の かわり)
            const yakuBefore = (p, name) => { const n = p.phases.map(ph => ph.name); return p.yaku && n[n.indexOf('yaku') + 1] === name; };
            assert(onioni.pattern === 'goldDogSit' && yakuBefore(onioni, 'open'), `${specId} のおにおにRASH`);
            const oka = Scenario.plan(CONFIG, spec, spin('okapipo'), game.rng);
            assert(oka.kind === 'blackout' && yakuBefore(oka, 'itadaki'), `${specId} のおかピポRASH`);
            // ふつうの当たりでは怪・金面犬がとなりに座る・おかピポRASH のブラックアウトは出ない
            for (let i = 0; i < 300; i++) {
                const plain = { kind, alloc: spec.rushHit[0] };
                Object.assign(plain, Scenario.hold2(CONFIG, plain, { ...ctx, koori: true }, game.rng));
                if (plain.kai) throw new Error('ふつうの当たりで怪の先バレ');
                if (Scenario.plan(CONFIG, spec, { ...spin('koori'), result: plain }, game.rng).kai) throw new Error('ふつうの当たりで怪');
                if (Scenario.plan(CONFIG, spec, { ...spin('onioni'), result: plain }, game.rng).pattern === 'goldDogSit') throw new Error('ふつうの当たりで金面犬がとなりに座る');
                if (Scenario.plan(CONFIG, spec, { ...spin('okapipo'), result: plain }, game.rng).kind !== 'okapipo') throw new Error('おかピポRASH のふつうの当たりでブラックアウト');
            }
        }
        // 突破チャレンジ中は抽選しない
        const m = Machine.create(CONFIG, specId, () => 0);
        m.rush = { active: true, hits: 1, startTime: 0, challenge: true };
        Machine.enter(m, 'denchu');
        assert(!(m.holds[2][0].alloc && m.holds[2][0].alloc.premium), `${specId} の突破チャレンジでプレミアボーナス`);
    }
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
        assert(p.weight > 0 || p.premium, `「${p.name}」の重み`);
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
        assertEqual(counter.firstHits, log.firstHits + (log.yutimeHits || 0), `${specId} の大当たり (初当たり。遊タイムの当たりも)`);
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

// ----- ASO の 演出 (2026-10-23 アップグレード P3) -----
test('ライバルバトル・必殺技・こおりいきていける！: チームの 絵と セリフが そろい、こおりいきていける！ は 当たりだけ', () => {
    const { CONFIG, BATTLE_LINES, Characters, Scenario } = loadGame(5);
    const show = CONFIG.show;
    for (const [id, b] of Object.entries(show.battles)) {
        (b.team || [id]).forEach(who => assert(Characters.has(who), `${b.name} の ${who} の 絵が ない`));
        // セリフと 必殺技: 最新の スロットから 読みこんだ もの (js/battle-lines.js) か config。チームは 3 人 全員 (2026-10-23 ユーザー指定)
        for (const who of b.team || [id]) {
            const line = BATTLE_LINES.lines[who] || show.battleTalk.lines[who];
            assert(BATTLE_LINES.specials[who] || show.battleTalk.specials[who], `${b.name} の ${who} の 必殺技が ない`);
            assert(line && line.intro && line.special && line.win && line.lose, `${b.name} の ${who} の セリフ (intro・special・win・lose) が そろって いない`);
            assert(show.battleTalk.names[who], `${who} の 名前 (battleTalk.names) が ない`);
        }
        assert(show.develop.sp[id], `${b.name} の SP / SPSP (develop.sp) が ない`);
    }
    const spec = CONFIG.specs.s99, rng = seededRandom(3);
    let ik = 0, kaiSeen = 0;
    for (let i = 0; i < 4000; i++) {
        const hit = i % 2 === 0;
        const p = Scenario.plan(CONFIG, spec, { fig: 1, rush: false, holdsLeft: 1, notice: 'normal', result: { kind: hit ? 'hit' : 'miss', alloc: {} } }, rng);
        // ライバルチームの 怪は 当たりだけ (確定。2026-10-23 ユーザー指定)
        if (p.kai && show.battles[p.enemy] && show.battles[p.enemy].team) { kaiSeen++; assert(hit, 'チームの 怪は 当たりだけ'); }
        if (p.type === 'ikiteru') {
            ik++;
            assert(hit && p.win, 'こおりいきていける！ は 当たりだけ');
            assert(p.digits.every(d => d === p.digits[0]), '図柄が そろう');
        }
    }
    assert(ik > 10, `こおりいきていける！ が 出る (${ik})`);
    assert(kaiSeen > 0, 'チームの 怪が 出る');
    for (const id of ['yamamou', 'kotani', 'asahara', 'ueno', 'ikekimu']) assert(Characters.hasKai(id), `${id} の 怪の 目が ない`);
});

// ----- 期待度の表 (2026-10-23 アップグレード P2。tools/trust.js) -----
test('期待度の表: 色・段・相手の 順に 出たら 当たる 割合が 上がる', () => {
    const { measure } = require('./trust.js');
    const table = measure(3e5, 11);
    for (const t of Object.values(table)) {
        const order = (group, label) => {
            const v = t.rows.filter(r => r.group === group).map(r => r.trust).filter(x => x !== null);
            for (let k = 1; k < v.length; k++) assert(v[k] >= v[k - 1] - 0.03, `${t.label} ${label}: ${v.map(x => (x * 100).toFixed(1)).join(' < ')}`);
        };
        order('ステップアップ予告', 'ステップアップ');
        order('擬似連', '擬似連');
        order('チャレンジ', 'チャレンジ');
        order('バトルの相手', 'バトルの相手');
        order('こおりカットイン', 'カットイン');
    }
    // 書き出した 表が ある
    assert(fs.existsSync(path.join(JS_DIR, 'trust-table.js')), 'js/trust-table.js が ない (node tools/trust.js)');
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
