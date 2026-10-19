// =====================================================================
// BGM (Web Audio で鳴らすチップチューン。2026-10-19 ユーザー指定。スロット版の js/bgm.js と同じ作り)
// ---------------------------------------------------------------------
// 曲は 8分音符単位の音名の並び。'.' は休符。メロディ (矩形波) とベース (三角波) の2パート。
// 先の音を少しずつ予約して鳴らすので、画面の描画が重くてもテンポがずれにくい。
// 曲は台の状態で決める (Bgm.trackFor)。通常時・高確率ステージ・突破チャレンジ・こおりRASH・おにおにRASH・大当たり中。
// 「音: OFF」とカスタマイズの「BGM: OFF」で消える。窓を開いているあいだは止める。
// 曲のうち normal・hiStage・challenge・bonus はスロット版の曲 (field・castle・battle・super)。kooriRash・onioniRash は新しく作った
// =====================================================================

const BGM_TRACKS = {
    // 通常時: 明るい行進 (スロット版の field)
    normal: {
        bpm: 140,
        melody: [
            'E5', 'G5', 'C6', 'G5', 'A5', 'G5', 'E5', '.',
            'F5', 'A5', 'D6', 'A5', 'G5', '.', '.', '.',
            'E5', 'G5', 'C6', 'G5', 'A5', 'C6', 'E6', 'D6',
            'C6', 'G5', 'E5', 'D5', 'C5', '.', '.', '.'
        ],
        bass: [
            'C3', '.', 'G3', '.', 'C3', '.', 'G3', '.',
            'F3', '.', 'C4', '.', 'G3', '.', 'D4', '.',
            'C3', '.', 'G3', '.', 'F3', '.', 'A3', '.',
            'G3', '.', 'G3', '.', 'C3', '.', 'G2', '.'
        ]
    },
    // 高確率ステージ (SE城前・満月): 不穏 (スロット版の castle)
    hiStage: {
        bpm: 120,
        melody: [
            'A4', '.', 'C5', '.', 'E5', '.', 'D#5', '.',
            'E5', '.', '.', '.', 'B4', '.', '.', '.',
            'A4', '.', 'C5', '.', 'F5', '.', 'E5', '.',
            'D5', '.', 'C5', '.', 'B4', '.', '.', '.'
        ],
        bass: [
            'A2', 'A2', 'A2', 'A2', 'A2', 'A2', 'A2', 'A2',
            'G#2', 'G#2', 'G#2', 'G#2', 'G#2', 'G#2', 'G#2', 'G#2',
            'F2', 'F2', 'F2', 'F2', 'F2', 'F2', 'F2', 'F2',
            'E2', 'E2', 'E2', 'E2', 'E2', 'E2', 'G#2', 'G#2'
        ]
    },
    // 突破チャレンジ (おにおにとのバトル): 速いバトル曲 (スロット版の battle)
    challenge: {
        bpm: 170,
        melody: [
            'E5', '.', 'E5', 'G5', 'B5', '.', 'A5', 'G5',
            'F#5', '.', 'D5', '.', 'E5', '.', '.', '.',
            'E5', '.', 'E5', 'G5', 'B5', '.', 'D6', 'C6',
            'B5', 'A5', 'F#5', 'D5', 'E5', '.', '.', '.'
        ],
        bass: [
            'E2', 'E3', 'E2', 'E3', 'E2', 'E3', 'E2', 'E3',
            'D2', 'D3', 'D2', 'D3', 'E2', 'E3', 'E2', 'E3',
            'C2', 'C3', 'C2', 'C3', 'C2', 'C3', 'C2', 'C3',
            'D2', 'D3', 'D2', 'D3', 'E2', 'E3', 'B2', 'B2'
        ]
    },
    // こおりRASH: 元気な疾走曲 (長調。オクターブで跳ねるベース)
    kooriRash: {
        bpm: 176,
        melody: [
            'G5', '.', 'A5', 'B5', 'D6', '.', 'B5', '.',
            'C6', 'B5', 'A5', 'G5', 'A5', '.', '.', '.',
            'G5', '.', 'A5', 'B5', 'D6', '.', 'G6', '.',
            'F#6', 'E6', 'D6', 'B5', 'D6', '.', '.', '.'
        ],
        bass: [
            'G2', 'G3', 'G2', 'G3', 'G2', 'G3', 'G2', 'G3',
            'C3', 'C4', 'C3', 'C4', 'D3', 'D4', 'D3', 'D4',
            'G2', 'G3', 'G2', 'G3', 'E2', 'E3', 'E2', 'E3',
            'C3', 'C4', 'D3', 'D4', 'G2', 'G3', 'D3', 'D4'
        ]
    },
    // おにおにRASH: おにおにが眠っている。ゆっくり、あやしい (短調。ベースは低く刻む)
    onioniRash: {
        bpm: 104,
        melody: [
            'D5', '.', '.', 'F5', '.', '.', 'A5', '.',
            'G#5', '.', '.', '.', 'A5', '.', '.', '.',
            'D5', '.', '.', 'F5', '.', '.', 'C6', '.',
            'A#5', '.', 'A5', '.', 'G#5', '.', '.', '.'
        ],
        bass: [
            'D2', '.', 'D2', '.', 'D2', '.', 'D2', '.',
            'C#2', '.', 'C#2', '.', 'C#2', '.', 'C#2', '.',
            'A#1', '.', 'A#1', '.', 'A#1', '.', 'A#1', '.',
            'A1', '.', 'A1', '.', 'A1', '.', 'C#2', '.'
        ]
    },
    // 大当たり中・エンディング: 勝利のファンファーレ風 (スロット版の super)
    bonus: {
        bpm: 160,
        melody: [
            'C5', 'E5', 'G5', 'C6', '.', 'G5', 'C6', '.',
            'D6', '.', 'C6', 'B5', 'C6', '.', '.', '.',
            'A5', 'C6', 'F6', '.', 'E6', '.', 'D6', 'C6',
            'B5', 'G5', 'A5', 'B5', 'C6', '.', '.', '.'
        ],
        bass: [
            'C3', 'G3', 'C3', 'G3', 'C3', 'G3', 'C3', 'G3',
            'G2', 'D3', 'G2', 'D3', 'C3', 'G3', 'C3', 'G3',
            'F2', 'C3', 'F2', 'C3', 'C3', 'G3', 'C3', 'G3',
            'G2', 'D3', 'G2', 'D3', 'C3', 'G3', 'C3', '.'
        ]
    }
};

const Bgm = (() => {
    const LOOKAHEAD = 0.15;   // 何秒先まで音を予約するか
    const NOTE_INDEX = { C: 0, 'C#': 1, D: 2, 'D#': 3, E: 4, F: 5, 'F#': 6, G: 7, 'G#': 8, A: 9, 'A#': 10, B: 11 };

    let ctx = null;
    let master = null;
    let trackName = null;
    let step = 0;
    let nextTime = 0;
    let timer = null;
    const volume = 0.5;
    let paused = true;

    // 台の状態とオープニング・エンディングから曲を決める (画面・音には触らない)
    //   m: 台 (Machine) / story: 流れている物語の名前 ('opening' / 'ending' / null)
    function trackFor(m, story) {
        if (story === 'ending') return 'bonus';
        if (story === 'opening') return 'normal';
        if (m.bonus) return 'bonus';
        if (m.rush.active && m.rush.challenge) return 'challenge';
        if (m.rush.active) return m.rashMode === 'onioni' ? 'onioniRash' : 'kooriRash';
        if (m.stage.hi) return 'hiStage';
        return 'normal';
    }

    function frequency(note) {
        const match = /^([A-G]#?)(\d)$/.exec(note);
        const midi = (Number(match[2]) + 1) * 12 + NOTE_INDEX[match[1]];
        return 440 * Math.pow(2, (midi - 69) / 12);
    }

    function applyVolume() {
        if (master) master.gain.setTargetAtTime(paused ? 0 : volume * 0.12, ctx.currentTime, 0.02);
    }

    // 音声の準備 (ユーザー操作のあとで呼ぶ。効果音と同じ AudioContext を使う)
    function init(audioContext) {
        if (ctx || !audioContext) return;
        ctx = audioContext;
        master = ctx.createGain();
        master.gain.value = 0;
        master.connect(ctx.destination);
        applyVolume();
        timer = setInterval(schedule, 25);
    }

    function note(freq, type, time, duration, level) {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = type;
        osc.frequency.setValueAtTime(freq, time);
        gain.gain.setValueAtTime(level, time);
        gain.gain.exponentialRampToValueAtTime(0.0001, time + duration);
        osc.connect(gain);
        gain.connect(master);
        osc.start(time);
        osc.stop(time + duration + 0.02);
    }

    function schedule() {
        if (!ctx || !trackName || paused || ctx.state !== 'running') return;
        const track = BGM_TRACKS[trackName];
        const stepDur = 60 / track.bpm / 2;
        if (nextTime < ctx.currentTime) nextTime = ctx.currentTime + 0.05;
        while (nextTime < ctx.currentTime + LOOKAHEAD) {
            const m = track.melody[step % track.melody.length];
            const b = track.bass[step % track.bass.length];
            if (m !== '.') note(frequency(m), 'square', nextTime, stepDur * 0.9, 0.35);
            if (b !== '.') note(frequency(b), 'triangle', nextTime, stepDur * 0.95, 0.8);
            nextTime += stepDur;
            step++;
        }
    }

    // 曲を切り替える (同じ曲なら何もしない)
    function play(name) {
        if (trackName === name) return;
        trackName = name;
        step = 0;
        if (ctx) nextTime = ctx.currentTime + 0.1;
    }

    // 止める・鳴らす (消音・BGM OFF・窓を開いているあいだ)。同じなら何もしない
    function setPaused(on) {
        if (paused === on) return;
        paused = on;
        if (!on && ctx) nextTime = ctx.currentTime + 0.1;
        applyVolume();
    }

    return { init, play, setPaused, trackFor, get track() { return trackName; } };
})();
