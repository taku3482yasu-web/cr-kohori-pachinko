// =====================================================================
// 液晶: オープニングとエンディング (段階6。ユーザー指定 2026-10-19)
// ---------------------------------------------------------------------
// オープニング: 台選びで「この台で遊ぶ」を押したときに流す (液晶・台のボタン・Space で飛ばせる)
//   こおりくんは困っていた。→ 内定が無いことに！→ 内定を得るため、こおりくんは旅に出る！→ 内定を得る旅に！
//   → タイトル「Pこおりくん ～内定ツラヌキ物語～」
// エンディング: RASH が config.show.story.endingAt 回目の大当たりになったら、そのラウンド中に流す (RASH 1回につき1回)
//   こおりくん 10社目の面接…！→ 結果は……!! → 内定！→ 大喜びのこおりくんをみんなが祝福
// 場面 (scenes) は { t: 秒, draw(local, now) } の並び。Story.play(name, now) で始め、Lcd が毎フレーム Story.draw を呼ぶ。
// =====================================================================

const Story = (() => {
    let kit;
    let playing = null;   // { name, start, scenes, total }

    function init(k) {
        kit = k;
    }

    // ----- 描く道具 -----
    function caption(str, y = 124, size = 13, color = '#ffffff') {
        kit.band(y - 12, 24, 0.6);
        kit.text(str, kit.W / 2, y, size, color, 'center', performance.now() / 1000);
    }

    // 文字を1文字ずつ出す (local 秒のあいだに)
    function typed(str, local, speed = 12) {
        return str.slice(0, Math.min(str.length, Math.floor(local * speed) + 1));
    }

    function sweat(x, y, now) {
        const { ctx } = kit;
        const k = (now * 1.5) % 1;
        ctx.fillStyle = `rgba(127, 211, 247, ${1 - k})`;
        ctx.fillRect(x, y + k * 10, 3, 4);
        ctx.fillRect(x + 1, y - 1 + k * 10, 1, 1);
    }

    function confetti(now, count = 40) {
        const { ctx, W, H } = kit;
        for (let i = 0; i < count; i++) {
            const x = (i * 53 + now * (20 + (i % 5) * 8)) % W;
            const y = (i * 37 + now * (40 + (i % 7) * 10)) % H;
            ctx.fillStyle = `hsl(${(i * 47) % 360}, 90%, 60%)`;
            ctx.fillRect(Math.floor(x), Math.floor(y), 3, 2);
        }
    }

    function walk(now) {
        return Math.floor(now * 5) % 2 ? 'walk1' : 'walk2';
    }

    // ----- オープニング -----
    const OPENING = [
        { t: 4, draw(local, now) {
            Backgrounds.draw(kit.ctx, 'tsugakuro', 0);
            drawSprite(kit.ctx, SPRITES.koori, 'walk1', 104, 70, 3);
            sweat(150, 66, now);
            sweat(100, 70, now + 0.4);
            kit.text('？', 160 + Math.sin(now * 3) * 2, 56, 18, '#ffffff');
            caption(typed('こおりくんは困っていた。', local));
        } },
        { t: 3.5, draw(local, now) {
            const shake = local < 0.6 ? Math.sin(local * 80) * 3 : 0;
            Backgrounds.draw(kit.ctx, 'tsugakuro', 0);
            kit.ctx.fillStyle = 'rgba(0, 0, 0, 0.45)';
            kit.ctx.fillRect(0, 0, kit.W, kit.H);
            drawSprite(kit.ctx, SPRITES.koori, 'down', 104 + shake, 70, 3);
            kit.text('！！', 160, 56, 20, '#ff3a3a');
            kit.band(18, 34, 0.6);
            kit.text('内定が無いことに！', kit.W / 2 + shake, 35, 20, '#ff3a3a');
        } },
        { t: 4, draw(local, now) {
            Backgrounds.draw(kit.ctx, 'ongagawa', now * 30);
            drawSprite(kit.ctx, SPRITES.koori, walk(now), 70 + Math.sin(now * 10), 78, 3);
            // 背中の荷物
            kit.ctx.fillStyle = '#8a5a2a';
            kit.ctx.fillRect(66, 88, 10, 14);
            caption(typed('内定を得るため、こおりくんは旅に出る！', local, 14), 124, 12);
        } },
        { t: 2.8, draw(local, now) {
            Backgrounds.draw(kit.ctx, 'seCastle', now * 10);
            drawSprite(kit.ctx, SPRITES.koori, walk(now), 40 + local * 30, 90, 2);
            kit.band(54, 36, 0.55);
            kit.text('内定を得る旅に！', kit.W / 2, 72, 20, '#ffe066');
        } },
        { t: 4.2, draw(local, now) {
            const { ctx, W, H } = kit;
            ctx.fillStyle = '#05070d';
            ctx.fillRect(0, 0, W, H);
            confetti(now, 24);
            const pop = Math.min(1, local / 0.5);
            kit.text('Pこおりくん', W / 2, 54, Math.round(14 + 18 * pop), 'rainbow', 'center', now);
            if (local > 0.7) kit.text('～内定ツラヌキ物語～', W / 2, 88, 14, '#ffe066');
            drawSprite(ctx, SPRITES.koori, walk(now), W / 2 - 16, 100, 2);
            if (local < 0.25) {
                ctx.fillStyle = `rgba(255, 255, 255, ${1 - local * 4})`;
                ctx.fillRect(0, 0, W, H);
            }
        } }
    ];

    // ----- エンディング -----
    // 面接の部屋 (机と窓)
    function office() {
        const { ctx, W, H } = kit;
        ctx.fillStyle = '#d8d0c0';
        ctx.fillRect(0, 0, W, H);
        ctx.fillStyle = '#b8b0a0';
        ctx.fillRect(0, 100, W, H - 100);
        ctx.fillStyle = '#9ad0f0';
        ctx.fillRect(20, 16, 60, 40);
        ctx.fillRect(176, 16, 60, 40);
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(49, 16, 2, 40);
        ctx.fillRect(205, 16, 2, 40);
        // 机
        ctx.fillStyle = '#6a4a2a';
        ctx.fillRect(150, 92, 90, 10);
        ctx.fillRect(156, 102, 6, 24);
        ctx.fillRect(228, 102, 6, 24);
    }

    const ENDING = [
        { t: 4, draw(local, now) {
            office();
            Characters.drawEnemy(kit.ctx, 'sasaki', 196, 100, { scale: 1.4, frame: Math.floor(now * 2) % 2 });
            drawSprite(kit.ctx, SPRITES.koori, 'walk1', 60, 84, 2.4);
            sweat(100, 82, now);
            caption(typed('こおりくん 10社目の面接…！', local), 124, 13);
        } },
        { t: 3, draw(local, now) {
            const { ctx, W, H } = kit;
            office();
            ctx.fillStyle = 'rgba(0, 0, 0, 0.7)';
            ctx.fillRect(0, 0, W, H);
            // スポットライト
            ctx.fillStyle = 'rgba(255, 255, 220, 0.25)';
            ctx.beginPath();
            ctx.arc(W / 2, 80, 40, 0, Math.PI * 2);
            ctx.fill();
            drawSprite(ctx, SPRITES.koori, 'walk1', W / 2 - 19, 60, 2.4);
            sweat(W / 2 + 22, 60, now);
            const dots = '……!!'.slice(0, Math.min(5, Math.floor(local * 3) + 1));
            kit.text('結果は' + dots, W / 2, 26, 18, '#ffffff');
            if (Math.floor(now * 10) % 3 === 0) Sound.play('stop');
        } },
        { t: 2.6, draw(local, now) {
            const { ctx, W, H } = kit;
            ctx.fillStyle = `hsl(${(now * 300) % 360}, 80%, 30%)`;
            ctx.fillRect(0, 0, W, H);
            confetti(now, 30);
            const pop = Math.min(1, local / 0.35);
            kit.text('内定！', W / 2, 70, Math.round(20 + 32 * pop), 'rainbow', 'center', now);
            if (local < 0.3) {
                ctx.fillStyle = `rgba(255, 255, 255, ${1 - local * 3})`;
                ctx.fillRect(0, 0, W, H);
            }
        } },
        { t: 7, draw(local, now) {
            const { ctx, W } = kit;
            Backgrounds.draw(ctx, 'goldHall', now * 8);
            confetti(now, 50);
            // みんな: 左右から祝福
            const hop = i => Math.abs(Math.sin(now * 6 + i)) * 4;
            Characters.drawCompanion(ctx, 'yasu', 26, 128 - hop(0), { scale: 1.6, frame: Math.floor(now * 4) % 2 });
            Characters.drawCompanion(ctx, 'tamu', 52, 128 - hop(1), { scale: 1.6, frame: Math.floor(now * 4 + 1) % 2 });
            Characters.drawCompanion(ctx, 'dake', 78, 128 - hop(2), { scale: 1.6, frame: Math.floor(now * 4) % 2 });
            drawSprite(ctx, SPRITES.tomoishi, Math.floor(now * 3) % 2 ? 'idle' : 'shout', 170, 128 - 36 - hop(3), 2);
            drawSprite(ctx, SPRITES.furukawa, Math.floor(now * 6) % 2 ? 'talk' : 'idle', 206, 128 - 46 - hop(4), 1.6);
            Characters.drawEnemy(ctx, 'okagappa', 238, 128 - hop(5), { scale: 0.9, frame: Math.floor(now * 4) % 2 });
            // こおりくん: 大喜びで跳ねる
            const jump = Math.abs(Math.sin(now * 5)) * 18;
            drawSprite(ctx, SPRITES.koori, walk(now), W / 2 - 24, 80 - jump, 3);
            kit.text('♪', W / 2 + 30, 60 - jump, 14, '#ffe066');
            if (local < 4) caption('おめでとう！ こおりくん！', 18, 14, '#ffe066');
            else caption('～内定ツラヌキ物語～  THANK YOU FOR PLAYING', 18, 10, 'rainbow');
        } }
    ];

    const STORIES = { opening: OPENING, ending: ENDING };

    function play(name, now) {
        const scenes = STORIES[name];
        playing = { name, start: now, scenes, total: scenes.reduce((a, s) => a + s.t, 0) };
        if (name === 'ending') Sound.play('win');
    }

    function skip() {
        playing = null;
    }

    function active() {
        return Boolean(playing);
    }

    // いまの場面を描く。終わったら false
    function draw(now) {
        if (!playing) return false;
        let t = now - playing.start;
        if (t >= playing.total) {
            playing = null;
            return false;
        }
        for (const scene of playing.scenes) {
            if (t < scene.t) {
                kit.ctx.save();
                scene.draw(t, now);
                kit.ctx.restore();
                break;
            }
            t -= scene.t;
        }
        return true;
    }

    return { init, play, skip, active, draw, get name() { return playing ? playing.name : null; } };
})();
