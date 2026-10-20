// =====================================================================
// 画面の窓: データカウンター・図鑑・アップデート情報・実績のお知らせ (2026-10-19 ユーザー指定)
// ---------------------------------------------------------------------
// 記録そのものは js/records.js。ここは表示だけ。
//   Panels.init({ context, pause })   context(): { counter, machine, balls, launched, setting (選んだ設定。おまかせは null) } / pause(on): 台を止める・動かす
//   Panels.toast(achievements)        実績を解除したお知らせ (順番に出す)
//   Panels.showUpdates(list)          アップデート情報を出す
// 窓を開いているあいだは台を止める (カスタマイズと同じ)。
// =====================================================================

const Panels = (() => {
    const $ = id => document.getElementById(id);
    let ctx = null;
    let pause = () => {};
    let tab = 'records';

    // 大当たりまでの回転数の棒・出玉の推移の線の色 (dataviz の検証スクリプトで、暗い背景で見分けられるか確かめた)
    const COLORS = { normal: '#3f8cff', rash: '#f04070', active: '#c08a10', line: '#7fd3f7', grid: '#1f3a5c', zero: '#8aa4c0', text: '#8aa4c0' };

    function init(options) {
        ctx = options.context;
        pause = options.pause;
        bindPanel('data-panel', 'data-button', 'data-close', renderData);
        bindPanel('collection-panel', 'collection-button', 'collection-close', renderCollection);
        document.querySelectorAll('.col-tabs button').forEach(b => b.addEventListener('click', () => {
            tab = b.dataset.tab;
            renderCollection();
        }));
        const graph = $('dc-graph');
        graph.addEventListener('pointermove', e => graphHover(e));
        graph.addEventListener('pointerleave', () => { hover = null; drawGraph(); });
    }

    function bindPanel(panelId, openId, closeId, render) {
        const panel = $(panelId);
        $(openId).addEventListener('click', () => {
            panel.hidden = false;
            pause(true);
            render();
        });
        $(closeId).addEventListener('click', () => {
            panel.hidden = true;
            pause(false);
        });
    }

    const fmt = n => n.toLocaleString();
    const signed = n => `${n > 0 ? '+' : n < 0 ? '−' : '±'}${fmt(Math.abs(n))}`;

    // ----- データカウンター -----
    function renderData() {
        const { counter: c, machine: m, balls } = ctx();
        const active = c.history.find(h => h.active);
        const now = m.bonus || active ? (m.rush.active && !m.rush.challenge ? 'RASH中' : '当たり中') : fmt(m.stats.spins1 - c.spinsAtHit);
        const stats = [
            ['総回転数', fmt(m.stats.spins1)],
            ['現在', now],
            ['大当たり', fmt(c.firstHits)],
            ['RASH', fmt(c.rashes)],
            ['初当たり', c.firstHits ? `1/${Math.round(m.stats.spins1 / c.firstHits)}` : '-'],
            ['差玉', signed(balls - c.invested)]
        ];
        $('dc-stats').innerHTML = stats.map(([label, value]) =>
            `<div class="dc-item"><span class="dc-label">${label}</span><span class="dc-value">${value}</span></div>`).join('');

        // 大当たりまでの回転数 (左が古い)
        const shown = [...c.history].reverse();
        const max = Math.max(100, ...shown.map(h => h.spins));
        $('dc-bars').innerHTML = shown.map(h => {
            const kind = h.active ? 'active' : h.kind === 'rash' ? 'rash' : 'normal';
            const height = Math.max(3, Math.round(h.spins / max * 100));
            return `<div class="dc-bar" title="${h.no}回目 ${h.spins}回転 ${resultText(h).replace(/<[^>]*>/g, '')}"><span>${h.spins}</span><i class="dc-key-${kind}" style="height:${height}%"></i></div>`;
        }).join('');

        $('dc-history').innerHTML = c.history.map(h => {
            const gained = DataCounter.liveBalls(h, balls);
            return `<tr><td>${h.no}</td><td>${h.spins}</td><td>${h.label}個</td><td>${resultText(h)}</td>`
                + `<td class="${gained >= 0 ? 'dc-plus' : ''}">${signed(gained)}</td><td>${h.trophy ? trophyChip(h.trophy) : '-'}</td></tr>`;
        }).join('');
        $('dc-empty').hidden = c.history.length > 0;

        const t = Object.entries(c.hints.trophy);
        const l = Object.entries(c.hints.line);
        $('dc-hints').innerHTML = t.length || l.length
            ? t.map(([level, n]) => `<span class="dc-hint">${trophyChip(level)} ×${n}</span>`).join('')
                + l.map(([short, n]) => `<span class="dc-hint">ふるカワ「${short}」 ×${n}</span>`).join('')
            : '<span class="picker-note">まだありません（RASH・突破チャレンジのあとのトロフィー、ふるカワのひとこと）</span>';
        renderEstimate();
        hover = null;
        drawGraph();
    }

    // 設定推測: 設定1〜6 の確率の横棒 (いちばん高い設定を目立たせる)
    function renderEstimate() {
        const { counter: c, setting } = ctx();
        const probs = SettingEstimate.probabilities(c, CONFIG);
        const best = Math.max(...Object.values(probs));
        $('dc-estimate').innerHTML = Object.entries(probs).map(([s, p]) => {
            const label = p >= 0.999 ? '99.9%+' : p < 0.001 ? '0.1%未満' : `${(p * 100).toFixed(1)}%`;
            return `<div class="dc-est-row${p === best ? ' dc-est-best' : ''}"><span class="dc-est-name">設定${s}</span>`
                + `<span class="dc-est-track"><i style="width:${Math.max(p > 0 ? 1 : 0, p * 100)}%"></i></span><span class="dc-est-value">${label}</span></div>`;
        }).join('');
        const rot = SettingEstimate.rotation(c);
        $('dc-estimate-note').textContent = (setting ? `この台は 設定${setting} を選んだ台です。` : '')
            + (rot === null ? 'まだ左打ちの玉がありません。' : `回転率 ${rot.toFixed(1)} /1k（左打ち ${fmt(c.shotsLeft)}発で ${fmt(c.spins || 0)}回転。保留がいっぱいのときの入賞は数えない）`)
            + '・トロフィー・ふるカワのセリフから計算。回転率は「← 左打ち」の強さで打ったときの目安と比べます';
    }

    function resultText(h) {
        if (h.active) return '<span class="dc-live">当たり中</span>';
        if (h.kind === 'rash') return `<span class="dc-rash">RASH ${h.streak}連</span>`;
        if (h.kind === 'failed') return '突破ならず';
        return '通常';
    }

    function trophyChip(level) {
        const c = CONFIG.show.settingHint.trophy.colors[level];
        const style = c.rainbow ? '' : ` style="background:${c.main}"`;
        return `<i class="trophy-chip${c.rainbow ? ' trophy-rainbow' : ''}"${style} title="${c.name}のトロフィー"></i>${c.name}`;
    }

    // 出玉の推移 (横: 打った玉 / 縦: 差玉)。いまの値を最後の点にする
    let hover = null;
    let layout = null;
    function drawGraph() {
        const canvas = $('dc-graph');
        if (!canvas.isConnected || canvas.closest('[hidden]')) return;
        const { counter: c, balls, launched } = ctx();
        const points = [...c.graph, [launched, balls - c.invested]];
        const ratio = window.devicePixelRatio || 1;
        const w = canvas.clientWidth || 300;
        const h = 150;
        canvas.width = Math.round(w * ratio);
        canvas.height = Math.round(h * ratio);
        canvas.style.height = `${h}px`;
        const g = canvas.getContext('2d');
        g.setTransform(ratio, 0, 0, ratio, 0, 0);
        g.clearRect(0, 0, w, h);
        const pad = { l: 46, r: 10, t: 10, b: 20 };
        const xMax = Math.max(100, points[points.length - 1][0]);
        const ys = points.map(p => p[1]);
        let yMin = Math.min(0, ...ys), yMax = Math.max(0, ...ys);
        const step = niceStep(Math.max(100, yMax - yMin));
        yMin = Math.floor(yMin / step) * step;
        yMax = Math.max(Math.ceil(yMax / step) * step, yMin + step);
        const X = x => pad.l + x / xMax * (w - pad.l - pad.r);
        const Y = y => pad.t + (yMax - y) / (yMax - yMin) * (h - pad.t - pad.b);
        layout = { points, X, Y, pad, w, h };

        // 目盛り (うすく)
        g.font = `10px ${getComputedStyle(document.body).fontFamily}`;
        g.fillStyle = COLORS.text;
        g.textAlign = 'right';
        g.textBaseline = 'middle';
        for (let y = yMin; y <= yMax; y += step) {
            g.strokeStyle = y === 0 ? COLORS.zero : COLORS.grid;
            g.lineWidth = 1;
            g.beginPath();
            g.moveTo(pad.l, Math.round(Y(y)) + 0.5);
            g.lineTo(w - pad.r, Math.round(Y(y)) + 0.5);
            g.stroke();
            g.fillText(y === 0 ? '0' : signed(y), pad.l - 6, Y(y));
        }
        g.textAlign = 'right';
        g.textBaseline = 'alphabetic';
        g.fillText(`${fmt(xMax)}発`, w - pad.r, h - 4);

        // 線
        g.strokeStyle = COLORS.line;
        g.lineWidth = 2;
        g.lineJoin = 'round';
        g.beginPath();
        points.forEach(([x, y], i) => (i ? g.lineTo(X(x), Y(y)) : g.moveTo(X(x), Y(y))));
        g.stroke();
        // いまの値 (最後の点)
        const last = points[points.length - 1];
        dot(g, X(last[0]), Y(last[1]));

        // なぞったところ: 縦の線と点、数字
        const tip = $('dc-tip');
        if (hover) {
            const [x, y] = hover;
            g.strokeStyle = COLORS.zero;
            g.lineWidth = 1;
            g.beginPath();
            g.moveTo(Math.round(X(x)) + 0.5, pad.t);
            g.lineTo(Math.round(X(x)) + 0.5, h - pad.b);
            g.stroke();
            dot(g, X(x), Y(y));
            tip.hidden = false;
            tip.textContent = `${fmt(x)}発目  差玉 ${signed(y)}`;
            const left = Math.min(Math.max(X(x) - tip.offsetWidth / 2, 0), w - tip.offsetWidth);
            tip.style.left = `${left}px`;
        } else tip.hidden = true;
    }

    function dot(g, x, y) {
        g.fillStyle = COLORS.line;
        g.strokeStyle = '#0d1a2e';
        g.lineWidth = 2;
        g.beginPath();
        g.arc(x, y, 4, 0, Math.PI * 2);
        g.fill();
        g.stroke();
    }

    function niceStep(range) {
        const raw = range / 4;
        const p = Math.pow(10, Math.floor(Math.log10(raw)));
        return [1, 2, 5, 10].map(k => k * p).find(s => s >= raw);
    }

    function graphHover(e) {
        if (!layout) return;
        const rect = e.currentTarget.getBoundingClientRect();
        const mx = e.clientX - rect.left;
        let best = null;
        layout.points.forEach(p => {
            const d = Math.abs(layout.X(p[0]) - mx);
            if (!best || d < best.d) best = { d, p };
        });
        hover = best ? best.p : null;
        drawGraph();
    }

    // ----- 図鑑 -----
    const RECORDS = [
        ['spins', '総回転数', '回'], ['hits', '大当たり', '回'], ['entries', 'RASH 突入', '回'], ['bestStreak', 'RASH の最高連チャン', '連'],
        ['bestBalls', '1回の RASH の最高出玉', '発'], ['endings', 'エンディング', '回'], ['blackouts', 'ブラックアウト', '回'],
        ['renchan', '〇G連確定', '回'], ['promotes', '昇格', '回'], ['holdChanges', '保留変化', '回'], ['kaiWins', '怪の相手に勝った', '回'], ['revivals', '復活', '回'], ['pursuitWins', '追撃チャンスから撃破', '回']
    ];

    function renderCollection() {
        document.querySelectorAll('.col-tabs button').forEach(b => {
            b.classList.toggle('selected', b.dataset.tab === tab);
            b.setAttribute('aria-selected', b.dataset.tab === tab);
        });
        const data = Collection.get();
        const body = $('col-body');
        const achievements = CONFIG.collection.achievements;
        const done = achievements.filter(a => data.achievements[a.id]).length;
        if (tab === 'records') {
            body.innerHTML = `<dl class="col-records">${RECORDS.map(([key, label, unit]) =>
                `<dt>${label}</dt><dd>${fmt(Collection.stat(key))}${unit}</dd>`).join('')}`
                + `<dt>実績</dt><dd>${done} / ${achievements.length}</dd></dl>`
                + '<p class="picker-note">図鑑は台を選び直しても、新しく始めても残ります</p>'
                + '<button id="col-reset" class="small-button col-reset">図鑑をリセット</button>';
            $('col-reset').addEventListener('click', () => {
                if (!confirm('図鑑の記録・見た演出・実績を、すべて消しますか？')) return;
                Collection.reset();
                renderCollection();
            });
        } else if (tab === 'shows') {
            body.innerHTML = Collection.groups(CONFIG).map(group => {
                const seen = data.seen[group.id] || {};
                const wins = data.wins[group.id] || {};
                const count = group.items.filter(i => seen[i.id] > 0).length;
                const rows = group.items.map(i => {
                    const n = seen[i.id] || 0;
                    if (!n) return '<li class="col-unseen"><span>？？？</span><span></span></li>';
                    const extra = group.battle ? `${group.winLabel} ${wins[i.id] || 0} / ${n}` : `${fmt(n)}回`;
                    return `<li><span>${i.name}</span><span class="col-count">${extra}</span></li>`;
                }).join('');
                return `<h3>${group.name} <span class="col-progress">${count} / ${group.items.length}</span></h3><ul class="col-list">${rows}</ul>`;
            }).join('');
        } else {
            body.innerHTML = `<p class="picker-note">${done} / ${achievements.length} 解除</p><ul class="col-achievements">${achievements.map(a => {
                const at = data.achievements[a.id];
                return `<li class="${at ? 'col-done' : ''}"><span class="col-mark">${at ? '★' : '☆'}</span>`
                    + `<span><b>${at ? a.name : '？？？'}</b><br><span class="col-desc">${a.desc}</span></span></li>`;
            }).join('')}</ul>`;
        }
    }

    // ----- 実績のお知らせ -----
    const queue = [];
    let showing = false;
    function toast(achievements) {
        queue.push(...achievements);
        if (!showing) next();
    }
    function next() {
        const a = queue.shift();
        const el = $('toast');
        if (!a) { showing = false; el.hidden = true; return; }
        showing = true;
        el.innerHTML = `<span class="toast-head">★ 実績解除！</span>${a.name}`;
        el.hidden = false;
        setTimeout(next, 3200);
    }

    // ----- アップデート情報 -----
    function updatesHtml(list) {
        return list.map(u => `<section class="update"><h3>${u.title} <span class="update-date">${u.date}</span></h3>`
            + `<ul>${u.items.map(t => `<li>${t}</li>`).join('')}</ul></section>`).join('');
    }

    function showUpdates(list) {
        if (!list.length) return;
        const panel = $('updates-panel');
        $('updates-list').innerHTML = updatesHtml(list);
        $('updates-off').checked = !UpdateNotes.isEnabled();
        panel.hidden = false;
        pause(true);
        $('updates-close').onclick = () => {
            UpdateNotes.setEnabled(!$('updates-off').checked);
            panel.hidden = true;
            pause(false);
        };
    }

    return { init, toast, showUpdates, updatesHtml };
})();
