// =====================================================================
// 盤面の形 (config.board から釘・レール・壁・入賞口・風車を組み立てる)
// ---------------------------------------------------------------------
// 当たり判定に使う形は2種類だけ:
//   circle  { x, y, r, surface }            釘・入賞口の柱
//   segment { x1, y1, x2, y2, surface }     レール・壁・ステージの床・入賞口のふた
// 入賞口・ゲート・ワープなどの「玉が入ったか」を見る場所は sensors にまとめる。
// 開け閉めする部品 (電チュー・アタッカー) のふたや羽根は parts に分け、開いているかで出し入れする。
// =====================================================================

const Board = (() => {
    const rad = deg => deg * Math.PI / 180;

    // 中心 c・半径 radius の円の上で、角度 deg の点 (画面の y は下向き)
    function arcPoint(c, radius, deg) {
        return [c.x + radius * Math.cos(rad(deg)), c.y - radius * Math.sin(rad(deg))];
    }

    // 円弧を短い線分に分ける
    function arcPolyline(c, radius, from, to, step = 2.5) {
        const count = Math.max(1, Math.ceil(Math.abs(to - from) / step));
        return Array.from({ length: count + 1 }, (_, i) => arcPoint(c, radius, from + (to - from) * i / count));
    }

    function polylineSegments(points, surface) {
        const segments = [];
        for (let i = 0; i < points.length - 1; i++) {
            const [x1, y1] = points[i];
            const [x2, y2] = points[i + 1];
            segments.push({ x1, y1, x2, y2, surface });
        }
        return segments;
    }

    // 釘の並び (grid / line / points) を点の一覧にする
    function nailPoints(group) {
        if (group.type === 'points') return group.points;
        if (group.type === 'line') {
            const [x0, y0] = group.from;
            const [x1, y1] = group.to;
            const count = Math.max(1, Math.round(Math.hypot(x1 - x0, y1 - y0) / group.spacing));
            return Array.from({ length: count + 1 }, (_, i) => [x0 + (x1 - x0) * i / count, y0 + (y1 - y0) * i / count]);
        }
        const points = [];
        let row = 0;
        for (let y = group.y0; y <= group.y1; y += group.dy, row++) {
            const shift = group.stagger && row % 2 ? group.dx / 2 : 0;
            for (let x = group.x0 + shift; x <= group.x1; x += group.dx) points.push([x, y]);
        }
        return points;
    }

    // 液晶の枠の形 (左下から時計回り。最後は閉じない)
    function framePolygon(f) {
        const mid = (f.left + f.right) / 2;
        return [[f.left, f.bottom], [f.left, f.shoulder], [mid, f.top], [f.right, f.shoulder], [f.right, f.bottom]];
    }

    // 枠の中か (屋根の線より下)
    function insideFrame(f, x, y) {
        if (x < f.left || x > f.right || y > f.bottom) return false;
        const mid = (f.left + f.right) / 2;
        const roofY = f.top + (f.shoulder - f.top) * Math.abs(x - mid) / (mid - f.left);
        return y > roofY;
    }

    function segmentDistance(x, y, s) {
        const ex = s.x2 - s.x1, ey = s.y2 - s.y1;
        const t = Math.max(0, Math.min(1, ((x - s.x1) * ex + (y - s.y1) * ey) / (ex * ex + ey * ey || 1)));
        return Math.hypot(x - (s.x1 + ex * t), y - (s.y1 + ey * t));
    }

    function inKeepout(x, y, area) {
        if (area.type === 'circle') return Math.hypot(x - area.x, y - area.y) < area.r;
        return x >= area.x0 && x <= area.x1 && y >= area.y0 && y <= area.y1;
    }

    // options: スペックごとの釘調整 (config.specs[...].board)。hesoWidth: ヘソの命釘のすき間 / warpMinVx: ワープに入る速さ。省略すると config.board の値
    function build(config, options = {}) {
        const b = config.board;
        const nailR = b.nailRadius;
        const circles = [];
        const segments = [];
        const sensors = [];
        const parts = {};   // 開け閉めする部品: id → { open, closed: [形], opened: [形] }

        // ----- レール -----
        const outer = arcPolyline(b.center, b.outerRadius, b.outerArc.from, b.outerArc.to);
        const inner = arcPolyline(b.center, b.innerRadius, b.innerArc.from, b.innerArc.to);
        const outerStart = outer[0];
        const outerEnd = outer[outer.length - 1];
        const innerStart = inner[0];
        segments.push(...polylineSegments([[outerStart[0], b.bottomY + 4], ...outer, [outerEnd[0], b.bottomY + 4]], 'rail'));
        segments.push(...polylineSegments([[innerStart[0], config.launch.foulY + 4], ...inner], 'rail'));
        // 内レールの上の端は丸めておく (玉が角に引っかからないように)
        const innerEnd = inner[inner.length - 1];
        circles.push({ x: innerEnd[0], y: innerEnd[1], r: 1, surface: 'rail' });

        // ----- 返しゴム (外レールから内側へ、少し下向きに伸びる) -----
        const rb = b.rubber;
        const [rx, ry] = arcPoint(b.center, b.outerRadius, rb.angle);
        const dir = rad(rb.angle + 180 + rb.tilt);   // 中心向きから tilt だけ下へ傾ける
        const rubber = { x1: rx, y1: ry, x2: rx + rb.length * Math.cos(dir), y2: ry - rb.length * Math.sin(dir), surface: 'rubber' };
        segments.push(rubber);

        // ----- 盤面の下 (アウト口へ向かう床) -----
        const outCenter = b.center.x;
        segments.push({ x1: innerStart[0], y1: b.bottomY - 40, x2: outCenter - 8, y2: b.bottomY + 2, surface: 'wall' });
        segments.push({ x1: outerEnd[0], y1: b.bottomY - 40, x2: outCenter + 8, y2: b.bottomY + 2, surface: 'wall' });

        // ----- 液晶の枠 -----
        const f = b.lcdFrame;
        segments.push(...polylineSegments([...framePolygon(f), [f.left, f.bottom]], 'wall'));

        // ----- ステージ (液晶の下の床) -----
        segments.push(...polylineSegments(b.stage.left, 'stage'));
        segments.push(...polylineSegments(b.stage.right, 'stage'));
        b.stage.spills.forEach((spill, i) => sensors.push({
            id: 'spill' + i, kind: 'spill', capture: false,
            x0: spill.x - b.stage.spillWidth / 2, x1: spill.x + b.stage.spillWidth / 2, y0: spill.y - 4, y1: spill.y + 4
        }));

        // ----- 右打ちの壁 -----
        segments.push(...polylineSegments(b.rightDivider, 'wall'));
        // 右打ちの通り道のガイド (ゲート・電チューへ玉を寄せる壁)
        b.guides.forEach(points => polylineSegments(points, 'wall').forEach(sg => segments.push({ ...sg, guide: true })));

        // ----- ワープ -----
        const w = b.warp;
        sensors.push({ id: 'warp', kind: 'warp', capture: false, x0: w.x, x1: w.x + w.w, y0: w.y, y1: w.y + w.h });

        // ----- 入賞口 -----
        Object.entries(b.pockets).forEach(([id, p]) => {
            const width = id === 'heso' && options.hesoWidth ? options.hesoWidth : p.width;
            const half = width / 2;
            const postX = half + nailR;
            circles.push({ x: p.x - postX, y: p.y, r: nailR, surface: 'nail', post: id });
            circles.push({ x: p.x + postX, y: p.y, r: nailR, surface: 'nail', post: id });
            sensors.push({ id, kind: 'pocket', capture: true, payout: p.payout, x0: p.x - half, x1: p.x + half, y0: p.y, y1: p.y + 5 });
            if (p.kind === 'denchu') {
                // 閉じている: 上にふた。開いている: 羽根が外へ開いて玉を拾う
                parts[id] = {
                    open: false,
                    closed: [{ x1: p.x - postX, y1: p.y - 1.5, x2: p.x + postX, y2: p.y - 1.5, surface: 'wall' }],
                    opened: [
                        { x1: p.x - postX, y1: p.y, x2: p.x - postX - 7, y2: p.y - 8, surface: 'wall' },
                        { x1: p.x + postX, y1: p.y, x2: p.x + postX + 7, y2: p.y - 8, surface: 'wall' }
                    ]
                };
            } else if (p.kind === 'attacker') {
                // 閉じている: 左に傾いたふた。柱より上を通し、左の端から玉が転がり落ちる
                parts[id] = {
                    open: false,
                    closed: [{ x1: p.x - postX - 3, y1: p.y - 2, x2: p.x + postX + 8, y2: p.y - 9, surface: 'wall' }],
                    opened: []
                };
            }
        });

        // ----- ゲート (通り抜ける) -----
        Object.entries(b.gates).forEach(([id, g]) => {
            const postX = g.width / 2 + nailR;
            circles.push({ x: g.x - postX, y: g.y, r: nailR, surface: 'nail', post: id });
            circles.push({ x: g.x + postX, y: g.y, r: nailR, surface: 'nail', post: id });
            sensors.push({ id, kind: 'gate', capture: false, x0: g.x - g.width / 2, x1: g.x + g.width / 2, y0: g.y - 2, y1: g.y + 2 });
        });

        // ----- 釘 -----
        const reserved = circles.slice();   // 柱のまわりには釘を打たない
        const frameSegments = polylineSegments(framePolygon(f), 'wall');
        const guideSegments = segments.filter(sg => sg.guide);
        const nails = [];
        // 釘とレール・枠・ほかの釘とのすき間が玉の直径より少しだけ狭いと、玉がはさまって止まる。
        // なので、すき間が玉より十分広くなる距離 (clear) より近い釘は打たない (道釘 line は同じ線の中だけ例外)
        const clear = config.ball.radius * 2 + nailR * 2 + 1;
        const playRadius = b.innerRadius - clear + nailR;
        b.nails.forEach((group, groupIndex) => nailPoints(group).forEach(([x, y]) => {
            if (Math.hypot(x - b.center.x, y - b.center.y) > playRadius) return;
            if (y > b.bottomY - 30) return;
            if (x > f.left - clear && x < f.right + clear && y > f.top - clear && y < f.bottom + 22) {
                if (y > f.bottom || frameSegments.some(sg => segmentDistance(x, y, sg) < clear - nailR) || insideFrame(f, x, y)) return;
            }
            if (b.keepout.some(area => inKeepout(x, y, area))) return;
            if (guideSegments.some(sg => segmentDistance(x, y, sg) < clear - nailR)) return;
            if (reserved.some(c => Math.hypot(x - c.x, y - c.y) < clear)) return;
            if (nails.some(n => Math.hypot(x - n.x, y - n.y) < (group.type === 'line' && n.group === groupIndex ? 2 * nailR + 0.5 : clear))) return;
            nails.push({ x, y, r: nailR, surface: 'nail', group: groupIndex });
        }));
        circles.push(...nails);

        const windmills = b.windmills.map(m => ({ ...m, angle: 0 }));

        return {
            config: b, circles, segments, sensors, parts, windmills, nails,
            rails: { outer, inner }, rubber,
            warpMinVx: options.warpMinVx || b.warp.minVx,
            grid: buildGrid(circles, segments, b.width, b.height)
        };
    }

    // ----- 当たり判定を速くするための格子 (動かない形だけ入れる) -----
    const CELL = 16;
    function buildGrid(circles, segments, width, height) {
        const cols = Math.ceil(width / CELL) + 1;
        const rows = Math.ceil(height / CELL) + 1;
        const cells = Array.from({ length: cols * rows }, () => ({ circles: [], segments: [] }));
        const add = (x0, y0, x1, y1, fn) => {
            const cx0 = Math.max(0, Math.floor(x0 / CELL)), cx1 = Math.min(cols - 1, Math.floor(x1 / CELL));
            const cy0 = Math.max(0, Math.floor(y0 / CELL)), cy1 = Math.min(rows - 1, Math.floor(y1 / CELL));
            for (let cy = cy0; cy <= cy1; cy++) for (let cx = cx0; cx <= cx1; cx++) fn(cells[cy * cols + cx]);
        };
        circles.forEach(c => add(c.x - c.r, c.y - c.r, c.x + c.r, c.y + c.r, cell => cell.circles.push(c)));
        segments.forEach(s => add(Math.min(s.x1, s.x2), Math.min(s.y1, s.y2), Math.max(s.x1, s.x2), Math.max(s.y1, s.y2),
            cell => cell.segments.push(s)));
        return {
            // (x, y) のまわり (半径 reach) にある形を fn に渡す。同じ形が何度か来ることがある
            near(x, y, reach, fn) {
                const cx0 = Math.max(0, Math.floor((x - reach) / CELL)), cx1 = Math.min(cols - 1, Math.floor((x + reach) / CELL));
                const cy0 = Math.max(0, Math.floor((y - reach) / CELL)), cy1 = Math.min(rows - 1, Math.floor((y + reach) / CELL));
                for (let cy = cy0; cy <= cy1; cy++) for (let cx = cx0; cx <= cx1; cx++) fn(cells[cy * cols + cx]);
            }
        };
    }

    function setOpen(board, id, open) {
        if (board.parts[id]) board.parts[id].open = open;
    }

    function isOpen(board, id) {
        return board.parts[id] ? board.parts[id].open : true;
    }

    // 開け閉めする部品のうち、いま当たり判定がある線分
    function partSegments(board) {
        return Object.values(board.parts).flatMap(p => p.open ? p.opened : p.closed);
    }

    // 風車の羽根の線分 (中心から先端まで)
    function windmillBlades(m) {
        return Array.from({ length: m.blades }, (_, i) => {
            const a = m.angle + i * 2 * Math.PI / m.blades;
            return { x1: m.x, y1: m.y, x2: m.x + m.radius * Math.cos(a), y2: m.y + m.radius * Math.sin(a) };
        });
    }

    return { build, setOpen, isOpen, partSegments, windmillBlades, arcPoint, framePolygon };
})();
