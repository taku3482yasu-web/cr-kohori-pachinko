// 敵の セリフと 必殺技 (node tools/import-battle-lines.mjs が 最新の スロット koori-slot の battleLines.js から 書き出す。手で 直さない)。2026-10-23
// スロットに ない キャラ (onioni・naitei) は js/config.js の show.battleTalk を 使う
window.BATTLE_LINES = {
    "specials": {
        "koori": "大腸炎アタック",
        "okagappa": "おかピポっと光線",
        "hibikimakuri": "大音響4DX",
        "yamamou": "おちょくりボーンフィーバー",
        "sasaki": "ASAスラッシュ",
        "asahara": "DOPAPANCHI",
        "kotani": "NABIテンポ",
        "shibata": "シバタードライバー",
        "ueno": "マッスルウエノクラッシュ",
        "ikekimu": "イケキムドライブ",
        "onioni": "鬼鬼の金棒"
    },
    "lines": {
        "okagappa": {
            "intro": "ま～だまだ戦わねば！",
            "special": "おかピポ！イェア！",
            "win": "お宝はいただきだぜ　イェア！",
            "lose": "ノリが…足りなかった…イェア…"
        },
        "hibikimakuri": {
            "intro": "響きです。",
            "special": "これが４DXだ！",
            "win": "すっごいひびいたね～",
            "lose": "ひびかなかった～…"
        },
        "yamamou": {
            "intro": "牛の力を見せてやる！",
            "special": "おちょくるなー！モォー！",
            "win": "モォー！牛の勝ちだ！",
            "lose": "人をおちょくるのがうますぎる～"
        },
        "sasaki": {
            "intro": "どうも、しご出来です。",
            "special": "締め切り厳守です。",
            "win": "すごいです。",
            "lose": "やばいです。"
        },
        "asahara": {
            "intro": "CS城の主の力、見せてやろう！",
            "special": "ひれ伏せ！",
            "win": "フハハハ！ワシの勝ちだ！",
            "lose": "ぐぬぬ…覚えておれ！"
        },
        "kotani": {
            "intro": "勝率は計算済みです。",
            "special": "数字はうそをつきません。",
            "win": "計算どおりです。",
            "lose": "計算外…です…"
        },
        "shibata": {
            "intro": "ぶんぶん！",
            "special": "バーイ！",
            "win": "撮れ高いただき！んなああ～",
            "lose": "んなああ～…"
        },
        "ueno": {
            "intro": "我が筋肉の前にひれ伏すがよい！",
            "special": "妻への愛を受けてみよ！",
            "win": "筋肉は裏切らない！",
            "lose": "筋肉が…足りなかった…"
        },
        "ikekimu": {
            "intro": "チッ…邪魔だ。",
            "special": "すきだらけだ。",
            "win": "ふん、こんなものか。",
            "lose": "い～やとんとんぱんぱんふるしばた～"
        }
    }
};
