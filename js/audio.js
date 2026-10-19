// =====================================================================
// 効果音 (Web Audio で音を作る。音のファイルは使わない)
// ---------------------------------------------------------------------
// ブラウザは、画面を一度さわる・キーを押すまで音を出せないので、そのときに準備する (Sound.unlock)。
// Sound.play('button') などで鳴らす。Sound.muted で消音。
// =====================================================================

const Sound = (() => {
    let ctx = null;
    let muted = false;
    try { muted = localStorage.getItem('koori-pachinko-muted') === '1'; } catch (e) { /* 保存できない環境 */ }

    function unlock() {
        if (ctx) {
            if (ctx.state === 'suspended') ctx.resume();
            return;
        }
        const AC = window.AudioContext || window.webkitAudioContext;
        if (AC) ctx = new AC();
    }

    // 1つの音: 周波数 freq (Hz)、start 秒後から length 秒。slideTo で音の高さを変える
    function tone(freq, start, length, { type = 'square', volume = 0.08, slideTo = null } = {}) {
        const t0 = ctx.currentTime + start;
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = type;
        osc.frequency.setValueAtTime(freq, t0);
        if (slideTo) osc.frequency.exponentialRampToValueAtTime(slideTo, t0 + length);
        gain.gain.setValueAtTime(volume, t0);
        gain.gain.exponentialRampToValueAtTime(0.0001, t0 + length);
        osc.connect(gain).connect(ctx.destination);
        osc.start(t0);
        osc.stop(t0 + length + 0.02);
    }

    const SOUNDS = {
        stop: () => tone(660, 0, 0.06, { volume: 0.05 }),
        hold: () => tone(1046, 0, 0.05, { volume: 0.04, type: 'triangle' }),
        // 台のボタンの高い音 (先読み)
        button: () => { tone(2637, 0, 0.12, { volume: 0.07 }); tone(3136, 0.14, 0.18, { volume: 0.07 }); tone(3520, 0.34, 0.3, { volume: 0.07 }); },
        challenge: () => [523, 659, 784].forEach((f, i) => tone(f, i * 0.09, 0.12, { volume: 0.06 })),
        success: () => [784, 988, 1175, 1568].forEach((f, i) => tone(f, i * 0.08, 0.18, { volume: 0.07 })),
        fail: () => tone(330, 0, 0.5, { slideTo: 110, volume: 0.06, type: 'sawtooth' }),
        reach: () => { tone(880, 0, 0.15); tone(880, 0.2, 0.15); tone(1175, 0.4, 0.4); },
        attack: () => tone(220, 0, 0.15, { slideTo: 880, volume: 0.06, type: 'sawtooth' }),
        hurt: () => tone(160, 0, 0.2, { slideTo: 60, volume: 0.08, type: 'square' }),
        push: () => tone(1568, 0, 0.1, { volume: 0.06 }),
        win: () => [523, 659, 784, 1047, 784, 1047, 1319].forEach((f, i) => tone(f, i * 0.11, 0.2, { volume: 0.08 })),
        lose: () => [392, 330, 262].forEach((f, i) => tone(f, i * 0.18, 0.25, { volume: 0.06, type: 'triangle' })),
        v: () => [1047, 1319, 1568, 2093].forEach((f, i) => tone(f, i * 0.06, 0.15, { volume: 0.07 })),
        round: () => tone(988, 0, 0.12, { volume: 0.05 })
    };

    function play(name) {
        if (muted || !ctx || ctx.state !== 'running' || !SOUNDS[name]) return;
        SOUNDS[name]();
    }

    function setMuted(value) {
        muted = value;
        try { localStorage.setItem('koori-pachinko-muted', value ? '1' : '0'); } catch (e) { /* 無視 */ }
    }

    return { unlock, play, setMuted, get muted() { return muted; } };
})();
