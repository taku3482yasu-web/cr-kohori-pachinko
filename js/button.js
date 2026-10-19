// =====================================================================
// 台のボタン (こおりくんの体の形)
// ---------------------------------------------------------------------
// 先読み (ユーザー指定): ヘソに入ったとき、その保留しだいで
//   red: 赤く光る / shake: ぶるぶる震える (スマホは本体も振動) / beep: 高い音が鳴る
// 起きたら当たりの確率が約60% (config.show.button)。バトルの最後には「PUSH」で押せる。
// MachineButton.init(要素, 押されたとき), trigger(種類, now), prompt(PUSH を出すか), update(now)
// =====================================================================

const MachineButton = (() => {
    let el = null;
    let until = 0;

    function init(element, onPress) {
        el = element;
        el.addEventListener('pointerdown', e => {
            e.preventDefault();
            el.classList.add('pressed');
            onPress();
        });
        ['pointerup', 'pointercancel', 'pointerleave'].forEach(t => el.addEventListener(t, () => el.classList.remove('pressed')));
    }

    function trigger(kind, now) {
        if (!el) return;
        el.classList.remove('fx-red', 'fx-shake', 'fx-beep');
        void el.offsetWidth;   // アニメーションを最初からやり直す
        el.classList.add('fx-' + kind);
        until = now + CONFIG.show.button.time;
        if (kind === 'beep') Sound.play('button');
        if (kind === 'shake' && navigator.vibrate) {
            try { navigator.vibrate([90, 40, 90, 40, 160]); } catch (e) { /* 振動できない環境 */ }
        }
    }

    function prompt(on) {
        if (el) el.classList.toggle('push', on);
    }

    function update(now) {
        if (el && until && now >= until) {
            el.classList.remove('fx-red', 'fx-shake', 'fx-beep');
            until = 0;
        }
    }

    return { init, trigger, prompt, update };
})();
