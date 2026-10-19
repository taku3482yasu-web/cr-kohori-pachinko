// =====================================================================
// 演出の筋書き (抽選の結果から、保留の色・ボタン・変動の流れ・ふるカワのセリフを決める)
// ---------------------------------------------------------------------
// 画面には触らない (台の Machine とシミュレーターからも使う)。決め方の数値は config.show。
//   Scenario.hold(config, spec, result, rng)   玉がヘソに入ったとき: { holdColor, button }
//   Scenario.plan(config, spec, spin, rng)     変動が始まるとき: { duration, phases, digits, challenge, enemy, win, talk, ... }
// phases は [{ name, t }] の並び (roll → challenge → fail / reach → battle → result)。液晶はこれを時間どおりに描く。
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

    function hold(config, spec, result, rng) {
        const show = config.show;
        const hit = result.kind === 'hit';
        const holdColor = weighted(show.holdColors[hit ? 'hit' : 'miss'], rng);
        const rate = hit ? show.button.hitRate : buttonMissRate(show, spec);
        const button = rng() < rate ? weighted(show.button.kinds, rng) : null;
        return { holdColor, button };
    }

    // ----- バトル: 外れのときの相手の重み -----
    // 相手 i の成功率 win_i を守るには、外れでその相手が出る量 = 当たりで出る量 × (1 - win_i) / win_i
    function missBattleMass(show, spec) {
        const battles = show.battles;
        const totalHit = Object.values(battles).reduce((a, b) => a + b.hit, 0);
        const mass = {};
        Object.entries(battles).forEach(([id, b]) => {
            mass[id] = b.win >= 1 ? 0 : spec.hitRate * (b.hit / totalHit) * (1 - b.win) / b.win;
        });
        return mass;
    }

    // 外れのうちリーチ (チャレンジ成功 → バトル負け) になる割合
    function reachMissRate(show, spec) {
        const total = Object.values(missBattleMass(show, spec)).reduce((a, x) => a + x, 0);
        return Math.min(show.challengeRate, total / (1 - spec.hitRate));
    }

    // ----- 図柄 -----
    function hitDigit(show, result, fig, rng) {
        const a = result.alloc;
        const odd = a.rounds >= 10 || (fig === 1 && a.next === 'jitan');
        return pickFrom(show.hitFigures[odd ? 'odd' : 'even'], rng);
    }

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

        if (fig === 2) {
            const f2 = config.machine.spin.fig2;
            const kind = result.kind;
            const digits = kind === 'hit' ? Array(3).fill(hitDigit(show, result, fig, rng)) : kind === 'small' ? ['V', 'V', 'V'] : missDigits(false, rng);
            const duration = kind === 'hit' ? f2.hit : kind === 'small' ? f2.small : f2.miss;
            return { fig, duration, phases: [{ name: 'roll', t: duration }], digits, talk: null };
        }

        const hit = result.kind === 'hit';
        let type;   // 'plain' / 'fail' / 'reach'
        if (hit || result.force === 'reach') type = 'reach';
        else if (result.force === 'fail') type = 'fail';
        else {
            const r = rng();
            const reach = reachMissRate(show, spec);
            type = r < reach ? 'reach' : r < show.challengeRate ? 'fail' : 'plain';
        }

        const p = { fig, type, win: hit, talk: null };
        if (type === 'plain') {
            const duration = spin.holdsLeft + 1 >= t.shortenAt ? t.missShort : t.miss;
            p.phases = [{ name: 'roll', t: duration }];
            p.digits = missDigits(false, rng);
        } else {
            const pick = id => show.challenges[id][hit ? 'hit' : 'miss'];
            p.challenge = weighted(Object.fromEntries(Object.keys(show.challenges).map(id => [id, pick(id)])), rng);
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
                if (hit) p.digits = Array(3).fill(hitDigit(show, result, fig, rng));
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
        else list = f.chatLines;
        const candidates = list.length > 1 ? list.filter(line => line !== lastLine) : list;
        const text = pickFrom(candidates, rng);
        lastLine = text;
        return { text, color };
    }

    return { hold, plan, buttonMissRate, reachMissRate, missBattleMass };
})();
