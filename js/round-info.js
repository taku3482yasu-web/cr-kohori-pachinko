// =====================================================================
// ラウンド中の紹介 (ユーザー指定 2026-10-19)
// ---------------------------------------------------------------------
// 大当たりのラウンドを消化しているあいだ、液晶の真ん中に紹介のカードを順に出す (js/lcd.js の drawBonus)。
//   kind: 'キャラ紹介' / 'ゲームの説明' / '舞台設定' / 'ストーリー'
//   who: 絵 (キャラクターの id。SPRITES・Characters の id、companions は3人並べる) / title / lines (1行 20文字くらいまで)
// キャラ紹介の文章はスロット版の図鑑 (koori/js/profiles.js) を短くしたもの。ゲームの説明の数値は config.js から作る。
// RoundInfo.cards(config, specId) で並びを返す。表示する秒は RoundInfo.SECONDS。
// =====================================================================

const RoundInfo = (() => {
    const SECONDS = 5;

    const CHARACTERS = [
        { who: 'koori', title: 'こおりくん', lines: ['ぼくこおり！ 大腸炎とはおともだち！', '石の川の石が冷えて生まれた。', '内定はまだない。'] },
        { who: 'tomoishi', title: 'ともいし', lines: ['こおりくんのお母さん。', 'こおりくんをとても愛している。', '内定とお金のことには厳しい。'] },
        { who: 'furukawa', title: 'ふるカワ', lines: ['みんなを見守る妖精の類。', '戦闘力は貧弱。', '実家が太いといううわさ。'] },
        { who: 'companions', title: 'やすさん・たむさん・だけさん', lines: ['冒険についてきた一般人たち。', 'じゃんけん・音ゲー・ディベートで', 'こおりくんと出会った。'] },
        { who: 'onioni', title: 'おにおに', lines: ['SE城の主。遠賀川近辺を支配する鬼。', '睡眠時間は1日17時間。', '貸した3万6千円を返してほしい。'] },
        { who: 'okagappa', title: 'おかがっぱ', lines: ['丘に上がったカッパ。', 'DJ「山グッチのおかピポ」。', 'ノリと勢いで生きている。'] },
        { who: 'hibikimakuri', title: 'ひびきまくり', lines: ['響きを伝える古典妖怪。', '広い部屋で声が響くのはこいつのせい。', '最近は4DXにはまっている。'] },
        { who: 'shibata', title: 'シバター', lines: ['ユーチューバー兼プロレスラー。', 'SE城に招待されていた。', 'たまに「んな～」と鳴く。'] },
        { who: 'sasaki', title: 'Mr.SASAKI', lines: ['イケてるSE城の管理人。', 'おにおにの補佐もするシゴでき。', '疲れると語彙が死ぬ。すごいです。'] },
        { who: 'goldDog', title: 'ゴールド金面犬', lines: ['SE城の金庫の番犬。', '触れたものは黄金になる。', '3食昼寝付きの生活を謳歌中。'] },
        { who: 'naitei', title: 'シーシャ・ナイテイ・ナイナイ', lines: ['内定を統べる内定の神。', '内定を持たぬものに悲劇を。', '双子の兄がいる。'] },
        { who: 'aruaru', title: 'シーシャ・ナイテイ・アルアル', lines: ['内定の化身。ナイナイの兄。', 'この世界すべての内定を管理する。', 'こおりRASH に出たら勝ち確定！'] }
    ];

    const STAGES = [
        { title: '通学路', lines: ['こおりくんの旅が始まった道。', '内定が無いことに、', 'こおりくんは困っていた。'] },
        { title: '遠賀川', lines: ['こおりくんが歩いた川のほとり。', 'おかがっぱのバトルの舞台。'] },
        { title: '石の川', lines: ['こおりくんが生まれた場所。', '石が急に冷えて、こおりくんになった。'] },
        { title: 'ゲームセンター', lines: ['たむさんと音ゲー勝負をした場所。', 'こおりくんは泣いた。'] },
        { title: 'SE城', lines: ['おにおにが住む城。', 'Mr.SASAKI がほぼ一人で管理している。', '金庫にはゴールド金面犬がいる。'] }
    ];

    const STORY = [
        { title: 'ストーリー 1', lines: ['こおりくんは困っていた。', '内定が無いことに！'] },
        { title: 'ストーリー 2', lines: ['内定を得るため、', 'こおりくんは旅に出る！'] },
        { title: 'ストーリー 3', lines: ['目指すは SE城。', '待ち受けるは おにおに…！'] },
        { title: 'ストーリー 4', lines: ['10社目の面接の結果は…？', 'RASH を続けて見届けよう！'] }
    ];

    // ゲームの説明 (数値は config から)
    function guide(config, specId) {
        const s = config.show;
        const spec = config.specs[specId] || Object.values(config.specs)[0];
        const pct = p => `${Math.round(p * 100)}%`;
        return [
            { title: 'RASH の流れ', lines: [`大当たりのたびに時短 ${spec.jitan.spins}回。`, '電チューで小当たりを引いて、', 'V に入れば大当たり！'] },
            { title: '継続率', lines: [`RASH の継続率は 約${pct(spec.target.continuation)}。`, '時短が終わっても、', '残り保留で当たれば続く！'] },
            { title: 'こおりRASH', lines: ['バトルで勝てば当たり。', '目が赤く光る「怪」は勝つチャンス。', 'ボタンが紫に光ったら怪の先バレ！'] },
            { title: '復活', lines: ['バトルに負けても、暗転したら…', '「それでも」が虹色になれば', 'こおりくんが立ち上がる！'] },
            { title: 'おにおにRASH', lines: ['おにおにが開眼すれば当たり。', '違和感があったら当たり確定！', `あと${s.rashLeft.fake}回…？ 図柄の 8・9…？`] },
            { title: 'ボタンで切り替え', lines: ['RASH の2回目からの大当たり中は、', 'ボタンを押すたびに', 'こおりRASH ⇔ おにおにRASH'] },
            { title: '〇G連確定', lines: ['大当たりの1ラウンド目に、', '残り保留の当たりの数だけ', '連チャン確定を教えてくれる！'] },
            { title: '設定示唆', lines: ['RASH のあとのトロフィーの色は', '「設定○以上」。虹は設定6確定！', '「データ」で設定推測もできる。'] }
        ];
    }

    // 種類ごとに1枚ずつ順番に混ぜる (キャラ → 説明 → 舞台 → ストーリー → キャラ …)
    function cards(config, specId) {
        const lists = [
            CHARACTERS.map(c => ({ kind: 'キャラ紹介', ...c })),
            guide(config, specId).map(c => ({ kind: 'ゲームの説明', who: 'koori', ...c })),
            STAGES.map(c => ({ kind: '舞台設定', who: null, ...c })),
            STORY.map(c => ({ kind: 'ストーリー', who: 'koori', ...c }))
        ];
        const longest = Math.max(...lists.map(l => l.length));
        const out = [];
        for (let i = 0; i < longest; i++) lists.forEach(l => out.push(l[i % l.length]));
        return out;
    }

    return { cards, SECONDS };
})();
