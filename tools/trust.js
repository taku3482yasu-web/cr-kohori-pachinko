// =====================================================================
// 期待度の表 (2026-10-23 アップグレード P2。最新のスロット koori-slot の「出たら当たる割合」の考え方)
// ---------------------------------------------------------------------
// 通常時 (特図1) の変動の 筋書き (Scenario.plan) を、当たり・外れを スペックの 確率どおりに まぜて たくさん 作り、
// 演出ごとに「出たら当たる割合 (信頼度)」と「当たりのうち出る割合」を 数える。演出の 決まり方は 変えない (はかるだけ)。
// 結果は js/trust-table.js (window.TRUST_TABLE) に 書き出し、遊び方 (howto.html) の「期待度の表」に 出す。
//
// 使い方 (koori-pachinko フォルダで):
//   node tools/trust.js              はかって js/trust-table.js を 書きなおす (1 スペック 100 万変動。約 10 秒)
//   node tools/trust.js --spins 2e5  変動の 数
//   node tools/trust.js --print      書き出さずに 表を 出すだけ
// 演出の 数字 (config.show) を 変えたら 動かす。自動テスト (tools/test.js) も 同じ 数え方で 順番を 確かめる。
// =====================================================================

const fs = require('fs');
const path = require('path');
const vm = require('vm');

const ROOT = path.join(__dirname, '..');
const FILES = ['config.js', 'sprites.js', 'characters.js', 'rivals.js', 'scenario.js'];

function seededRandom(seed) {
    let t = seed >>> 0;
    return () => {
        t = (t + 0x6D2B79F5) >>> 0;
        let r = Math.imul(t ^ (t >>> 15), 1 | t);
        r = (r + Math.imul(r ^ (r >>> 7), 61 | r)) ^ r;
        return ((r ^ (r >>> 14)) >>> 0) / 4294967296;
    };
}

function load(seed = 7) {
    const m = Object.create(Math);
    m.random = seededRandom(seed);
    const ctx = { console, Math: m, localStorage: { getItem: () => null, setItem() {}, removeItem() {} }, setInterval: () => 0, Date };
    ctx.window = ctx;
    vm.createContext(ctx);
    for (const f of FILES) vm.runInContext(fs.readFileSync(path.join(ROOT, 'js', f), 'utf8'), ctx, { filename: f });
    return { CONFIG: vm.runInContext('CONFIG', ctx), Scenario: vm.runInContext('Scenario', ctx), rng: m.random };
}

// 演出の 一覧 (グループ・名前・その変動に 出たか)。表の 並びも この 順
function features(config) {
    const show = config.show;
    const list = [];
    const add = (group, name, test) => list.push({ group, name, test });
    Object.entries(show.stepUp.outcomes).forEach(([id, o]) =>
        add('ステップアップ予告', `${o.step}段目まで${o.step === 3 ? `（文字 ${{ white: '白', red: '赤', gold: '金' }[o.color]}）` : ''}`, p => p.stepUp && p.stepUp.id === id));
    Object.entries(show.gun.kinds).forEach(([id, k]) => add('群予告', k.name, p => p.gun === id));
    [1, 2, 3].forEach(n => add('擬似連', `擬似${n + 1}連`, p => (p.gizi || 0) === n));
    Object.entries(show.challenges).forEach(([id, c]) => add('チャレンジ', c.name, p => p.challenge === id));
    add('リーチ', 'リーチ（チャレンジ成功）', p => p.type === 'reach');
    Object.entries(show.battles).forEach(([id, b]) => add('バトルの相手', `${b.name}（${show.develop.sp[id] || 'SP'}）`, p => p.enemy === id));
    add('バトル', 'SP → SPSP の発展', p => Boolean(p.develop));
    Object.entries(show.cutin.colors).forEach(([id, c]) => add('こおりカットイン', `${c.name}`, p => p.cutin === id));
    add('バトル', '盤面の役物が落ちる', p => p.gimmick);
    add('バトル', '追撃チャンス', p => p.pursuit);
    add('バトル', 'レバーを押せ！', p => p.lever);
    add('バトル', 'レバブル（リーチ）', p => p.leverBuru);
    add('プレミア', '全回転', p => p.type === 'zenkaiten');
    add('プレミア', 'こおりいきていける！', p => p.type === 'ikiteru');
    return list;
}

// 1 スペックぶん はかる: [{ group, name, appear (1 変動あたり), share (当たりのうち), trust (出たら当たる) }]
function measure(spins = 1e6, seed = 7) {
    const { CONFIG, Scenario, rng } = load(seed);
    const out = {};
    for (const [key, spec] of Object.entries(CONFIG.specs)) {
        const list = features(CONFIG).map(f => ({ ...f, n: 0, hits: 0 }));
        let hits = 0;
        for (let i = 0; i < spins; i++) {
            const hit = rng() < spec.hitRate;
            if (hit) hits++;
            const spin = { fig: 1, rush: false, holdsLeft: 1, notice: 'normal', result: { kind: hit ? 'hit' : 'miss', alloc: {} } };
            let p;
            try {
                p = Scenario.plan(CONFIG, spec, spin, rng);
            } catch (e) {
                continue;
            }
            for (const f of list) {
                if (!f.test(p)) continue;
                f.n++;
                if (hit) f.hits++;
            }
        }
        out[key] = {
            label: spec.label, spins, hits,
            rows: list.map(f => ({ group: f.group, name: f.name, appear: f.n / spins, share: hits ? f.hits / hits : 0, trust: f.n ? f.hits / f.n : null }))
        };
    }
    return out;
}

if (require.main === module) {
    const args = process.argv.slice(2);
    const i = args.indexOf('--spins');
    const spins = i >= 0 ? Number(args[i + 1]) : 1e6;
    const table = measure(spins);
    const pct = v => (v === null ? '-' : `${(v * 100).toFixed(1)}%`);
    for (const t of Object.values(table)) {
        console.log(`\n${t.label}（${t.spins.toLocaleString()} 変動・当たり ${t.hits}）`);
        for (const r of t.rows) console.log(`  ${r.group.padEnd(10, '　')} ${r.name.padEnd(22, '　')} 出たら当たる ${pct(r.trust).padStart(6)}  当たりのうち ${pct(r.share).padStart(6)}`);
    }
    if (!args.includes('--print')) {
        const body = `// 期待度の表 (node tools/trust.js が 書き出す。手で 直さない)。${new Date().toISOString().slice(0, 10)}\n`
            + `// 通常時の 変動の 演出ごとの 出たら当たる割合 (trust)・当たりのうち出る割合 (share)・1 変動あたり 出る割合 (appear)\n`
            + `window.TRUST_TABLE = ${JSON.stringify(table, null, 1)};\n`;
        fs.writeFileSync(path.join(ROOT, 'js', 'trust-table.js'), body);
        console.log('\njs/trust-table.js を 書きなおしました');
    }
}

module.exports = { measure, features };
