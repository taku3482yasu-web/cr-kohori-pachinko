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
    function init(element, onPress, onLong = null) {
        el = element;
        const release = () => {
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

    function trigger(kind, now) {
        if (!el) return;
        el.classList.remove('fx-red', 'fx-shake', 'fx-beep', 'fx-rainbow', 'fx-purple');
        void el.offsetWidth;   // アニメーションを最初からやり直す
        el.classList.add('fx-' + kind);
        until = now + CONFIG.show.button.time;
        lit = kind;
        // 先バレ: 筐体の 右の 丸い ランプも 赤・紫・虹に 光る (2026-10-23 ユーザー指定。js/cabinet.js)
        if (typeof Cabinet !== 'undefined') Cabinet.lamp(kind, now);
        if (kind === 'beep') Sound.play('button');
        if (kind === 'shake' && navigator.vibrate && Customize.get('vibrate') === 'on') {
            try { navigator.vibrate([90, 40, 90, 40, 160]); } catch (e) { /* 振動できない環境 */ }
        }
    }

    function prompt(on) {
        if (el) el.classList.toggle('push', on);
    }

    function update(now) {
        if (el && until && now >= until) {
            el.classList.remove('fx-red', 'fx-shake', 'fx-beep', 'fx-rainbow', 'fx-purple');
            until = 0;
            lit = null;
        }
    }
    // いまの 光り方 (筐体の PUSH が 使う)
    const state = () => ({ kind: lit, lit: Boolean(lit), push: Boolean(el && el.classList.contains('push')), pressed: Boolean(el && el.classList.contains('pressed')) });

    return { init, trigger, prompt, update, state, LONG_PRESS };
})();
