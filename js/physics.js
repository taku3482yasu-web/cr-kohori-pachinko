// =====================================================================
// 玉の物理 (重力・釘やレールとの衝突・入賞口などの判定)
// ---------------------------------------------------------------------
// Physics.step(world, dt) で dt 秒すすめる。中では config.ball.substeps 回に分けて計算する。
// world = { board, balls, rng, events }。起きたこと (入賞・ファール・アウト) は events に積む:
//   { type: 'pocket', id, payout } / { type: 'gate', id } / { type: 'warp' } / { type: 'spill' }
//   { type: 'foul' } / { type: 'out' }
// 玉どうしはぶつからない (盤面の上で玉が混み合うことが少ないので省いている)。
// =====================================================================

const Physics = (() => {
    let nextId = 1;

    function createBall(x, y, vx, vy, config) {
        return { id: nextId++, x, y, vx, vy, r: config.ball.radius, alive: true, sensor: null, still: 0 };
    }

    // 玉 b を、点 (px, py) から押し出す (その点との距離が b.r + radius 未満なら)。
    // (svx, svy) はぶつかった面の速さ (風車の羽根など。止まっている面は 0)
    function resolve(b, px, py, radius, surface, svx, svy, world) {
        const dx = b.x - px;
        const dy = b.y - py;
        const min = b.r + radius;
        const d2 = dx * dx + dy * dy;
        if (d2 >= min * min) return false;
        const d = Math.sqrt(d2) || 1e-6;
        const nx = dx / d;
        const ny = dy / d;
        b.x = px + nx * min;
        b.y = py + ny * min;
        const rvx = b.vx - svx;
        const rvy = b.vy - svy;
        const vn = rvx * nx + rvy * ny;
        if (vn >= 0) return true;
        const tx = -ny;
        const ty = nx;
        let vt = (rvx * tx + rvy * ty) * surface.friction;
        if (surface.jitter && -vn > 20) vt += (world.rng() - 0.5) * surface.jitter;
        const vn2 = -vn * surface.restitution;
        b.vx = svx + nx * vn2 + tx * vt;
        b.vy = svy + ny * vn2 + ty * vt;
        return true;
    }

    function collideSegment(b, s, surface, world, svFn) {
        const ex = s.x2 - s.x1;
        const ey = s.y2 - s.y1;
        const len2 = ex * ex + ey * ey || 1e-6;
        let t = ((b.x - s.x1) * ex + (b.y - s.y1) * ey) / len2;
        t = t < 0 ? 0 : t > 1 ? 1 : t;
        const px = s.x1 + ex * t;
        const py = s.y1 + ey * t;
        const [svx, svy] = svFn ? svFn(px, py) : [0, 0];
        return resolve(b, px, py, 0.5, surface, svx, svy, world);
    }

    function surfaces(config) {
        const s = config.ball.surfaces;
        return {
            nail: { ...s.nail, jitter: config.ball.jitter },
            rail: s.rail, wall: s.wall, stage: s.stage, rubber: s.rubber,
            windmill: { ...s.windmill, jitter: config.ball.jitter }
        };
    }

    function step(world, dt, config) {
        const n = config.ball.substeps;
        const h = dt / n;
        for (let i = 0; i < n; i++) substep(world, h, config);
        world.balls = world.balls.filter(b => b.alive);
    }

    function substep(world, h, config) {
        const board = world.board;
        const surf = world.surfaces || (world.surfaces = surfaces(config));
        const g = config.ball.gravity;
        const parts = Board.partSegments(board);
        board.windmills.forEach(m => { m.angle += m.omega * Math.PI / 180 * h; });
        const blades = board.windmills.map(m => ({ m, blades: Board.windmillBlades(m) }));
        const visited = new Set();

        world.balls.forEach(b => {
            if (!b.alive) return;
            b.vy += g * h;
            b.x += b.vx * h;
            b.y += b.vy * h;

            visited.clear();
            board.grid.near(b.x, b.y, b.r + 2, cell => {
                cell.circles.forEach(c => {
                    if (visited.has(c)) return;
                    visited.add(c);
                    resolve(b, c.x, c.y, c.r, surf[c.surface], 0, 0, world);
                });
                cell.segments.forEach(s => {
                    if (visited.has(s)) return;
                    visited.add(s);
                    collideSegment(b, s, surf[s.surface], world);
                });
            });
            parts.forEach(s => collideSegment(b, s, surf[s.surface], world));
            blades.forEach(({ m, blades: list }) => {
                if (Math.hypot(b.x - m.x, b.y - m.y) > m.radius + b.r + 1) return;
                const w = m.omega * Math.PI / 180;
                const sv = (px, py) => [-w * (py - m.y), w * (px - m.x)];
                list.forEach(s => collideSegment(b, s, surf.windmill, world, sv));
                resolve(b, m.x, m.y, 2, surf.windmill, 0, 0, world);
            });

            checkSensors(b, world, config);
            checkLimits(b, world, config, h);
        });
    }

    function checkSensors(b, world, config) {
        const board = world.board;
        let inside = null;
        for (const s of board.sensors) {
            if (b.x >= s.x0 && b.x <= s.x1 && b.y >= s.y0 && b.y <= s.y1) { inside = s; break; }
        }
        const entered = inside && b.sensor !== inside.id;
        b.sensor = inside ? inside.id : null;
        if (!inside) return;

        if (inside.kind === 'pocket') {
            if (!Board.isOpen(board, inside.id)) return;
            b.alive = false;
            world.events.push({ type: 'pocket', id: inside.id, payout: inside.payout });
        } else if (inside.kind === 'gate') {
            // 1個の玉は1回だけ数える (ゲートの中で跳ねて出入りしても)
            if (entered && b.vy > 0 && !b.gated) {
                b.gated = true;
                world.events.push({ type: 'gate', id: inside.id });
            }
        } else if (inside.kind === 'warp') {
            const w = board.config.warp;
            if (!entered || b.vx < w.minVx) return;
            b.x = w.exitX;
            b.y = w.exitY;
            b.vx = w.exitVx * (0.8 + world.rng() * 0.4);
            b.vy = 0;
            b.sensor = null;
            world.events.push({ type: 'warp' });
        } else if (inside.kind === 'spill') {
            // ステージの穴: ゆっくり転がってきた玉だけ手前にこぼれる
            if (Math.hypot(b.vx, b.vy) > 25) return;
            b.y += 9;
            b.vx = (world.rng() - 0.5) * 50;
            b.vy = 20;
            b.sensor = null;
            world.events.push({ type: 'spill' });
        }
    }

    function checkLimits(b, world, config, h) {
        const board = world.board;
        if (!b.alive) return;
        // 発射の通り道を戻ってきた → ファール
        const innerX = board.rails.inner[0][0];
        if (b.x < innerX && b.y > config.launch.foulY && b.vy > 0) {
            b.alive = false;
            world.events.push({ type: 'foul' });
            return;
        }
        if (b.y > board.config.bottomY) {
            b.alive = false;
            world.events.push({ type: 'out' });
            return;
        }
        // ほとんど止まった玉は軽くゆらす (実機では玉の勢いと台の振動で止まらない)。
        // それでも動かない玉 (どこかに引っかかった) はアウトにする
        b.still = Math.hypot(b.vx, b.vy) < config.ball.stall.speed ? b.still + h : 0;
        if (b.still > config.ball.stall.after && b.still - h <= config.ball.stall.after) {
            b.vx += (world.rng() - 0.5) * config.ball.stall.kick;
            b.vy += config.ball.stall.kick * 0.3;
        }
        if (b.still > 3) {
            b.alive = false;
            world.events.push({ type: 'out', stuck: true, x: b.x, y: b.y });
        }
    }

    // 発射: 強さ strength (0〜100) の初速で、発射位置から上へ打ち出す
    function launch(world, strength, config) {
        const l = config.launch;
        const base = l.speedMin + (l.speedMax - l.speedMin) * strength / 100;
        const speed = base * (1 + (world.rng() * 2 - 1) * l.noise);
        const ball = createBall(l.x, l.y, 0, -speed, config);
        world.balls.push(ball);
        return ball;
    }

    return { step, launch, createBall };
})();
