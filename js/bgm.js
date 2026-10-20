// =====================================================================
// BGM (Web Audio で鳴らすチップチューン。2026-10-19 ユーザー指定。スロット版の js/bgm.js と同じ作り)
// ---------------------------------------------------------------------
// 曲は 8分音符単位の音名の並び。'.' は休符。メロディ (矩形波) とベース (三角波) の2パート。
// 先の音を少しずつ予約して鳴らすので、画面の描画が重くてもテンポがずれにくい。
// 曲は台の状態で決める (Bgm.trackFor)。通常時・チャンスステージ (SE城前・満月)・突破チャレンジ・こおりRASH (疾走感)・おかピポRASH (DJ)・
// おにおにRASH (威圧感)・怪 (おどろおどろしい)・大当たり中。
// 「音: OFF」とカスタマイズの「BGM: OFF」で消える。窓を開いているあいだは止める。
// 曲のうち normal・seCastle・challenge・bonus はスロット版の曲 (field・castle・battle・super)。fullMoon・kooriRash・onioniRash・kai は新しく作った (2026-10-20 ユーザー指定)
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
    // SE城前 (チャンスステージ): 城を見上げる不穏な曲 (スロット版の castle)
    seCastle: {
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
    // 満月 (チャンスステージ): 月夜の神秘的な曲 (高い音でゆったり。和音を分けて鳴らすベース)
    fullMoon: {
        bpm: 96,
        melody: [
            'A5', '.', 'E5', '.', 'C6', '.', 'B5', '.',
            'A5', '.', '.', '.', 'E5', '.', '.', '.',
            'F5', '.', 'A5', '.', 'C6', '.', 'E6', '.',
            'D6', '.', 'B5', '.', 'G#5', '.', '.', '.'
        ],
        bass: [
            'A2', '.', 'E3', '.', 'A3', '.', 'E3', '.',
            'F2', '.', 'C3', '.', 'F3', '.', 'C3', '.',
            'D2', '.', 'A2', '.', 'D3', '.', 'A2', '.',
            'E2', '.', 'B2', '.', 'E3', '.', 'G#2', '.'
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
    // こおりRASH: 疾走感 (速いテンポ。駆け上がるメロディと、8分で刻み続けるベース)
    kooriRash: {
        bpm: 188,
        melody: [
            'E5', 'G5', 'B5', 'E6', 'D6', 'B5', 'G5', 'B5',
            'C6', 'B5', 'A5', 'G5', 'A5', 'B5', 'D6', '.',
            'E5', 'G5', 'B5', 'E6', 'F#6', 'E6', 'D6', 'B5',
            'C6', 'D6', 'E6', 'D6', 'B5', '.', 'B5', '.'
        ],
        bass: [
            'E2', 'E3', 'E2', 'E3', 'E2', 'E3', 'E2', 'E3',
            'C2', 'C3', 'C2', 'C3', 'D2', 'D3', 'D2', 'D3',
            'E2', 'E3', 'E2', 'E3', 'E2', 'E3', 'E2', 'E3',
            'C2', 'C3', 'D2', 'D3', 'B1', 'B2', 'B1', 'B2'
        ]
    },
    // おかピポRASH: おかピポの DJ (ユーザー指定 2026-10-20。曲は Claude が作った)。128BPM の4つ打ちのベースに、跳ねるシンセのフレーズ
    okapipoRash: {
        bpm: 128,
        melody: [
            'A5', '.', 'C6', 'A5', 'E6', '.', 'D6', 'C6',
            'A5', '.', 'C6', 'A5', 'G5', '.', 'E5', '.',
            'A5', '.', 'C6', 'A5', 'E6', '.', 'G6', 'E6',
            'D6', 'C6', 'A5', 'G5', 'A5', '.', 'A5', '.'
        ],
        bass: [
            'A2', 'A3', 'A2', 'A3', 'A2', 'A3', 'A2', 'A3',
            'F2', 'F3', 'F2', 'F3', 'G2', 'G3', 'G2', 'G3',
            'A2', 'A3', 'A2', 'A3', 'A2', 'A3', 'A2', 'A3',
            'F2', 'F3', 'G2', 'G3', 'E2', 'E3', 'E2', 'E3'
        ]
    },
    // おにおにRASH: 威圧感 (遅いテンポ・低い音。重いベースを刻み、半音でぶつける)
    onioniRash: {
        bpm: 84,
        melody: [
            'C4', '.', '.', 'C4', 'D#4', '.', '.', '.',
            'D4', '.', 'C4', '.', 'G3', '.', '.', '.',
            'C4', '.', '.', 'C4', 'F#4', '.', '.', '.',
            'F4', '.', 'D#4', '.', 'D4', '.', '.', '.'
        ],
        bass: [
            'C2', 'C2', '.', 'C2', 'C2', '.', 'C2', '.',
            'G#1', 'G#1', '.', 'G#1', 'G1', '.', 'G1', '.',
            'C2', 'C2', '.', 'C2', 'C2', '.', 'C2', '.',
            'F#1', '.', 'F#1', '.', 'G1', 'G1', 'G1', '.'
        ]
    },
    // 怪が出てきたとき (こおりRASH の怪のバトル・おにおに・怪): おどろおどろしい (とても遅く、半音でゆれるメロディと不気味な低音)
    kai: {
        bpm: 66,
        melody: [
            'B4', '.', 'C5', '.', 'B4', '.', 'A#4', '.',
            'F5', '.', '.', '.', '.', '.', '.', '.',
            'B4', '.', 'C5', '.', 'B4', '.', 'A#4', '.',
            'E5', '.', 'D#5', '.', '.', '.', '.', '.'
        ],
        bass: [
            'E2', '.', '.', '.', 'F2', '.', '.', '.',
            'E2', '.', '.', '.', 'A#1', '.', '.', '.',
            'E2', '.', '.', '.', 'F2', '.', '.', '.',
            'A#1', '.', 'A1', '.', '.', '.', '.', '.'
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
        if (m.yutime) return 'kooriRash';   // 遊タイム: 疾走感の曲 (2026-10-20)
        if (m.rush.active) return kaiNow(m) ? 'kai' : m.rashMode === 'onioni' ? 'onioniRash' : m.rashMode === 'okapipo' ? 'okapipoRash' : 'kooriRash';
        if (m.stage.hi) return m.stage.hi.id === 'fullMoon' ? 'fullMoon' : 'seCastle';   // チャンスステージは、そのステージの曲
        return 'normal';
    }

    // 怪が出ているか: こおりRASH の怪のバトル (相手が出てくる変動の始めから) / おにおにRASH の おにおに・怪 (違和感が始まってから)
    function kaiNow(m) {
        const p = m.spin && m.spin.plan;
        if (!p) return false;
        if (p.kind === 'rashBattle') return Boolean(p.kai);
        if (p.kind === 'onioni' && p.pattern === 'kai') {
            const wait = p.phases[0].name === 'wait' ? p.phases[0].t : 0;
            return m.spin.elapsed >= wait;
        }
        return false;
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
