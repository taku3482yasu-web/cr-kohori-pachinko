// =====================================================================
// 台のボタン (こおりくんの体の形)
// ---------------------------------------------------------------------
// 先読み (ユーザー指定): ヘソに入ったとき、その保留しだいで
//   red: 赤く光る / shake: ぶるぶる震える (スマホは本体も振動) / beep: 高い音が鳴る / rainbow: 虹色 (当たり確定)
//   purple: 紫に光る (こおりRASH の怪の先バレ。入賞時の音といっしょ)
// RASH 中・突破チャレンジ中は、当たりの保留の 60% で 震える・赤・虹 (外れでは起きない。config.show.rashButton)
// 起きたら当たりの確率が約60% (config.show.button)。バトルの最後には「PUSH」で押せる。長押しで演出の早送り。
// MachineButton.init(要素, 押されたとき, 長押ししたとき), trigger(種類, now), prompt(PUSH を出すか), update(now)
// =====================================================================

const MachineButton = (() => {
    let el = null;
    let until = 0;
    let lit = null;   // いま 光って いる 種類 (筐体の PUSH も 同じ 色に する)

    // 長押し (LONG_PRESS 秒) で onLong (演出の早送り。ユーザー指定 2026-10-20)
    const LONG_PRESS = 0.6;
    let longTimer = null;
    //   onRelease: 離したとき (長押しの ため を 止める。2026-10-24)
    function init(element, onPress, onLong = null, onRelease = null) {
        el = element;
        const release = () => {
            if (el.classList.contains('pressed') && onRelease) onRelease();
            el.classList.remove('pressed');
            clearTimeout(longTimer);
            longTimer = null;
        };
        el.addEventListener('pointerdown', e => {
            e.preventDefault();
            el.classList.add('pressed');
            onPress();
            clearTimeout(longTimer);
            if (onLong) longTimer = setTimeout(() => { longTimer = null; onLong(); }, LONG_PRESS * 1000);
        });
        ['pointerup', 'pointercancel', 'pointerleave'].forEach(t => el.addEventListener(t, release));
    }

    // time: 光らせて おく 秒 (省略すると config.show.button.time)
    function trigger(kind, now, time = CONFIG.show.button.time) {
        if (Customize.get('fx') === 'quiet' && kind === 'shake') kind = 'red';   // 演出の 強さ 控えめ: 震え・振動は 出さない (2026-10-24)
        if (!el) return;
        el.classList.remove('fx-red', 'fx-shake', 'fx-beep', 'fx-rainbow', 'fx-purple');
        void el.offsetWidth;   // アニメーションを最初からやり直す
        el.classList.add('fx-' + kind);
        until = now + time;
        lit = kind;
        // 先バレ: 筐体の 右の 丸い ランプも 赤・紫・虹に 光る (2026-10-23 ユーザー指定。js/cabinet.js)
        if (typeof Cabinet !== 'undefined') Cabinet.lamp(kind, now);
        if (kind === 'beep') Sound.play('button');
        if (kind === 'shake' && navigator.vibrate && Customize.get('vibrate') === 'on') {
            try { navigator.vibrate([90, 40, 90, 40, 160]); } catch (e) { /* 振動できない環境 */ }
        }
    }

    // lever: ボタンの かわりに「レバーを引け！」(2026-10-24 ユーザー指定。筐体の レバーを 引く。レバーが 出ていない 画面では 台の ボタン)
    //   color: 引け！の 色 (blue / red / gold / rainbow。2026-10-24 ユーザー指定: 色の 段階)
    //   style: PUSH の 色と 押し方 { color, mode: tap / long / mash, charge 0〜1 } (2026-10-24。レバーの ときは null)
    let leverColor = null, pushStyle = null;
    function prompt(on, lever = false, color = 'rainbow', style = null) {
        if (!el) return;
        el.classList.toggle('push', on);
        el.classList.toggle('lever', on && lever);
        leverColor = on && lever ? color : null;
        for (const c of ['blue', 'red', 'gold', 'rainbow']) el.classList.toggle('lever-' + c, leverColor === c);
        pushStyle = on && !lever ? style : null;
        for (const c of ['blue', 'red', 'gold', 'rainbow']) el.classList.toggle('pc-' + c, Boolean(pushStyle && pushStyle.color === c));
        for (const md of ['long', 'mash']) el.classList.toggle('pm-' + md, Boolean(pushStyle && pushStyle.mode === md));
        el.style.setProperty('--charge', pushStyle ? String(pushStyle.charge || 0) : '0');
    }
    // ハンドルブル (2026-10-24): 発射の ハンドルが ぶるぶる 震える (スマホは ハンドルを 出さないので 本体の 振動)
    let handleUntil = 0;
    function handleBuru(now) {
        const h = document.getElementById('handle');
        if (h) {
            h.classList.remove('fx-buru');
            void h.offsetWidth;
            h.classList.add('fx-buru');
        }
        handleUntil = now + CONFIG.show.handleBuru.time;
        if (navigator.vibrate && Customize.get('vibrate') === 'on') {
            try { navigator.vibrate([40, 20, 40, 20, 40, 20, 40, 20, 120]); } catch (e) { /* 振動できない環境 */ }
        }
    }
    // レバブル: レバーが ぶるぶる 震える (筐体の レバー・スマホは 台の ボタン・本体の 振動)
    let buruUntil = 0;
    function buru(now) {
        if (!el) return;
        el.classList.remove('fx-buru');
        void el.offsetWidth;
        el.classList.add('fx-buru');
        buruUntil = now + CONFIG.show.leverBuru.time;
        if (navigator.vibrate && Customize.get('vibrate') === 'on') {
            try { navigator.vibrate([60, 30, 60, 30, 60, 30, 120]); } catch (e) { /* 振動できない環境 */ }
        }
    }

    // レバーを 引く (筐体の 絵が 使う): pull(0〜1) ドラッグで 引いている 量 / pulled(now) 引ききった (ばねで もどる)
    //   引いている あいだは 4 段の カチッ (音と 小さな 振動)、引ききると ガコン (2026-10-24 ユーザー指定: 引く 感覚を わかりやすく)
    let pullDrag = 0, pulledAt = null, pullShown = 0, pullNotch = 0;
    function pull(amount) {
        pullDrag = Math.max(0, Math.min(1, amount));
        const notch = Math.min(3, Math.floor(pullDrag * 4));
        if (notch > pullNotch) {
            Sound.play('leverTick');
            if (navigator.vibrate && Customize.get('vibrate') === 'on') {
                try { navigator.vibrate(12); } catch (e) { /* 振動できない環境 */ }
            }
        }
        pullNotch = notch;
    }
    function pulled(now) {
        pullDrag = 0;
        pullNotch = 0;
        pulledAt = now;
        const cab = document.getElementById('cabinet');
        if (cab) {
            cab.classList.remove('lever-thud');
            void cab.offsetWidth;
            cab.classList.add('lever-thud');
        }
        if (navigator.vibrate && Customize.get('vibrate') === 'on') {
            try { navigator.vibrate([50, 30, 120]); } catch (e) { /* 振動できない環境 */ }
        }
    }

    let lastNow = 0;
    function update(now) {
        lastNow = now;
        if (handleUntil && now >= handleUntil) {
            const h = document.getElementById('handle');
            if (h) h.classList.remove('fx-buru');
            handleUntil = 0;
        }
        pullShown = pullDrag;
        if (!pullDrag && pulledAt !== null) {
            // 引ききって 一瞬 止まり、ばねで びよんと もどる (少し 上へ はねかえる)
            const d = now - pulledAt;
            pullShown = d < 0.15 ? 1 : Math.exp(-(d - 0.15) * 6) * Math.cos((d - 0.15) * 14);
            if (d >= 0.9) { pulledAt = null; pullShown = 0; }
        }
        if (el && buruUntil && now >= buruUntil) {
            el.classList.remove('fx-buru');
            buruUntil = 0;
        }
        if (el && until && now >= until) {
            el.classList.remove('fx-red', 'fx-shake', 'fx-beep', 'fx-rainbow', 'fx-purple');
            until = 0;
            lit = null;
        }
    }
    // いまの 光り方 (筐体の PUSH が 使う)
    const state = () => ({ kind: lit, lit: Boolean(lit), push: Boolean(el && el.classList.contains('push')), pressed: Boolean(el && el.classList.contains('pressed')),
        lever: Boolean(el && el.classList.contains('lever')), buru: Boolean(buruUntil), pull: pullShown, grabbing: pullDrag > 0, pulledAge: pulledAt === null ? null : lastNow - pulledAt, leverColor, pushStyle });

    return { init, trigger, prompt, buru, handleBuru, pull, pulled, update, state, LONG_PRESS };
})();
