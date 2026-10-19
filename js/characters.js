// =====================================================================
// 敵キャラクターのドット絵
// ---------------------------------------------------------------------
// 1ドット単位の矩形 r(x, y, w, h, 色) を重ねて描く。
// 各キャラは w x h ドットの枠に描き、描画時に scale 倍する。frame (0/1) で待機アニメーション。
// ひびきまくり・ゴールド金面犬は my-project 直下の画像をもとにしている。
// Mr.SASAKI はユーザー指定のデザイン (黒人のイケイケな社員)。
// =====================================================================

const Characters = (() => {
    const SKIN = '#f0c8a0';

    const ENEMIES = {
        // おかがっぱ: 頭に皿のある河童
        okagappa: {
            w: 32, h: 40,
            draw(r, frame) {
                const up = frame ? -1 : 0;
                r(11, 1, 10, 1, '#e8f8ff');
                r(10, 2, 12, 3, '#bfe6f5');
                r(8, 4, 16, 3, '#2f6a2f');
                r(7, 5, 2, 3, '#2f6a2f');
                r(23, 5, 2, 3, '#2f6a2f');
                r(8, 7, 16, 12, '#5ab84a');
                r(8, 17, 16, 2, '#469a3a');
                r(11, 10, 3, 3, '#ffffff');
                r(18, 10, 3, 3, '#ffffff');
                r(12, 11, 2, 2, '#111111');
                r(19, 11, 2, 2, '#111111');
                r(13, 14, 6, 3, '#f0c040');
                r(14, 17, 4, 1, '#c89a20');
                r(7, 20, 3, 11, '#8a6a3a');
                r(22, 20, 3, 11, '#8a6a3a');
                r(9, 19, 14, 13, '#5ab84a');
                r(12, 21, 8, 10, '#e8e0a0');
                r(5, 22 + up, 3, 7, '#5ab84a');
                r(24, 22 + up, 3, 7, '#5ab84a');
                r(4, 28 + up, 4, 3, '#469a3a');
                r(24, 28 + up, 4, 3, '#469a3a');
                r(10, 32, 5, 6, '#469a3a');
                r(17, 32, 5, 6, '#469a3a');
                r(9, 37, 7, 2, '#3a8a3a');
                r(16, 37, 7, 2, '#3a8a3a');
            }
        },

        // ひびきまくり: 黒髪センター分け・黄色い顔・とがった口・白Tシャツで両腕を広げたTポーズ
        hibikimakuri: {
            w: 40, h: 46,
            draw(r, frame) {
                const up = frame ? -1 : 0;
                const face = '#f2d43a';
                r(13, 2, 14, 7, '#151515');
                r(20, 2, 1, 4, face);
                r(14, 7, 12, 14, face);
                r(13, 7, 2, 5, '#151515');
                r(25, 7, 2, 5, '#151515');
                r(16, 10, 3, 3, '#ffffff');
                r(21, 10, 3, 3, '#ffffff');
                r(17, 11, 1, 1, '#000000');
                r(22, 11, 1, 1, '#000000');
                r(19, 13, 2, 3, '#d8b830');
                r(19, 17, 2, 2, '#7a3a10');
                r(18, 21, 4, 2, face);
                r(14, 23, 12, 11, '#f4f4f4');
                r(14, 32, 12, 2, '#d8d8d8');
                r(6, 23 + up, 8, 4, '#f4f4f4');
                r(26, 23 + up, 8, 4, '#f4f4f4');
                r(1, 23 + up, 5, 3, face);
                r(34, 23 + up, 5, 3, face);
                r(0, 22 + up, 2, 4, face);
                r(38, 22 + up, 2, 4, face);
                r(14, 34, 12, 4, '#8a8a8a');
                r(19, 36, 2, 2, '#6a6a6a');
                r(15, 38, 3, 5, face);
                r(22, 38, 3, 5, face);
                r(14, 43, 5, 2, '#6a3a1a');
                r(21, 43, 5, 2, '#6a3a1a');
            }
        },

        // シバター: 金髪リーゼント・サングラス・赤ジャケット (オリジナルデザイン)
        shibata: {
            w: 32, h: 40,
            draw(r, frame) {
                const up = frame ? -1 : 0;
                r(9, 2, 14, 6, '#f0d050');
                r(19, 0, 7, 4, '#f0d050');
                r(9, 7, 14, 1, '#c8a030');
                r(10, 8, 12, 11, SKIN);
                r(10, 11, 12, 3, '#111111');
                r(12, 11, 2, 1, '#66aaff');
                r(18, 11, 2, 1, '#66aaff');
                r(13, 16, 6, 1, '#ffffff');
                r(13, 17, 6, 1, '#a03020');
                r(7, 19, 18, 13, '#c02828');
                r(14, 19, 4, 10, '#222222');
                r(11, 19, 3, 3, '#e04040');
                r(18, 19, 3, 3, '#e04040');
                r(4, 20 + up, 3, 10, '#c02828');
                r(25, 20 + up, 3, 10, '#c02828');
                r(4, 30 + up, 3, 3, SKIN);
                r(25, 30 + up, 3, 3, SKIN);
                r(10, 32, 5, 6, '#2a2a5a');
                r(17, 32, 5, 6, '#2a2a5a');
                r(9, 37, 7, 2, '#ffffff');
                r(16, 37, 7, 2, '#ffffff');
            }
        },

        // Mr.SASAKI: イケイケな社員 (ハイトップフェード・ロイヤルブルーのスーツ・社員証・指さしポーズ)
        sasaki: {
            w: 32, h: 40,
            draw(r, frame) {
                const up = frame ? -1 : 0;
                const skin = '#6b4026', skinLight = '#85502f';
                const suit = '#2a4ad0', suitDark = '#1e36a0';
                r(10, 1, 12, 6, '#151515');
                r(10, 6, 1, 3, '#2a2a2a');
                r(21, 6, 1, 3, '#2a2a2a');
                r(10, 6, 12, 12, skin);
                r(11, 7, 3, 2, skinLight);
                r(12, 9, 3, 1, '#151515');
                r(17, 9, 3, 1, '#151515');
                r(12, 11, 2, 2, '#ffffff');
                r(18, 11, 2, 2, '#ffffff');
                r(13, 11, 1, 2, '#111111');
                r(19, 11, 1, 2, '#111111');
                r(15, 13, 2, 2, '#5a3420');
                r(13, 15, 6, 2, '#ffffff');
                r(13, 17, 6, 1, '#3a1a10');
                r(15, 18, 2, 1, '#151515');
                r(14, 18, 4, 2, skin);
                // スーツ・シャツ・ゆるめたネクタイ
                r(8, 20, 16, 12, suit);
                r(12, 20, 2, 6, suitDark);
                r(18, 20, 2, 6, suitDark);
                r(14, 20, 4, 7, '#ffffff');
                r(15, 20, 2, 1, '#a01020');
                r(15, 21, 2, 6, '#d02030');
                // 社員証
                r(13, 20, 1, 8, '#20a060');
                r(18, 20, 1, 8, '#20a060');
                r(13, 27, 6, 4, '#ffffff');
                r(14, 28, 2, 2, skin);
                r(17, 28, 1, 1, '#333333');
                r(17, 30, 1, 1, '#333333');
                // 左腕 (金の腕時計)
                r(5, 21, 3, 10, suit);
                r(5, 30, 3, 1, '#ffd700');
                r(5, 31, 3, 2, skin);
                // 右腕は上に突き上げて指さす
                r(24, 15 + up, 3, 7, suit);
                r(24, 20, 3, 2, suit);
                r(24, 11 + up, 3, 4, skin);
                r(25, 8 + up, 1, 3, skin);
                r(10, 32, 5, 6, '#1e2a6a');
                r(17, 32, 5, 6, '#1e2a6a');
                r(9, 37, 7, 2, '#7a3a10');
                r(16, 37, 7, 2, '#7a3a10');
                r(10, 37, 2, 1, '#c87a40');
                r(17, 37, 2, 1, '#c87a40');
            }
        },

        // おにおに: 赤鬼 (角・牙・虎柄の腰巻・金棒)
        onioni: {
            w: 42, h: 46,
            draw(r, frame) {
                const up = frame ? -1 : 0;
                const red = '#d83a2a', dark = '#b02a1a';
                r(12, 0, 3, 5, '#f0e0a0');
                r(25, 0, 3, 5, '#f0e0a0');
                r(9, 3, 22, 6, '#1a1a1a');
                r(7, 5, 3, 4, '#1a1a1a');
                r(30, 5, 3, 4, '#1a1a1a');
                r(11, 7, 18, 14, red);
                r(13, 10, 5, 1, '#000000');
                r(22, 10, 5, 1, '#000000');
                r(14, 11, 3, 2, '#ffe040');
                r(23, 11, 3, 2, '#ffe040');
                r(15, 11, 1, 2, '#000000');
                r(24, 11, 1, 2, '#000000');
                r(19, 13, 2, 2, dark);
                r(14, 17, 12, 2, '#5a0a0a');
                r(15, 16, 2, 2, '#ffffff');
                r(23, 16, 2, 2, '#ffffff');
                r(10, 21, 20, 12, red);
                r(12, 23, 6, 3, dark);
                r(22, 23, 6, 3, dark);
                r(5, 22 + up, 5, 10, red);
                r(30, 22 + up, 5, 10, red);
                r(4, 31 + up, 6, 4, dark);
                r(30, 31 + up, 6, 4, dark);
                // 金棒
                r(35, 4 + up, 6, 28, '#4a3a2a');
                for (let y = 6; y < 30; y += 4) {
                    r(34, y + up, 1, 1, '#d0d0d0');
                    r(41, y + 2 + up, 1, 1, '#d0d0d0');
                    r(37, y + 1 + up, 2, 1, '#9a9a9a');
                }
                r(11, 33, 18, 6, '#f0b020');
                r(13, 33, 2, 6, '#222222');
                r(18, 33, 2, 6, '#222222');
                r(23, 33, 2, 6, '#222222');
                r(13, 39, 5, 5, red);
                r(22, 39, 5, 5, red);
                r(12, 43, 7, 2, dark);
                r(21, 43, 7, 2, dark);
            }
        }
    };

    // ゴールド金面犬: 全身金色の犬。険しい人間風の顔・ルビーとダイヤの王冠・金の鎖・金のローファー
    ENEMIES.goldDog = {
        w: 46, h: 40,
        draw(r, frame) {
            const up = frame ? -1 : 0;
            const light = '#ffe680', gold = '#f0c030', mid = '#e0b020', dark = '#b88a10', line = '#6a4a00';
            // 王冠
            r(6, up, 2, 3, '#ffd700');
            r(12, up, 2, 3, '#ffd700');
            r(18, up, 2, 3, '#ffd700');
            r(8, 1 + up, 4, 3, '#c0204a');
            r(14, 1 + up, 4, 3, '#c0204a');
            r(12, 3 + up, 2, 2, '#e8f8ff');
            r(6, 4 + up, 14, 3, '#ffd700');
            r(9, 5 + up, 1, 1, '#c0204a');
            r(16, 5 + up, 1, 1, '#c0204a');
            // 耳・頭
            r(2, 7, 4, 3, gold);
            r(20, 7, 5, 3, gold);
            r(6, 7, 14, 12, gold);
            r(7, 8, 4, 2, light);
            r(8, 10, 4, 1, line);
            r(14, 10, 4, 1, line);
            r(9, 11, 2, 1, '#3a2a00');
            r(15, 11, 2, 1, '#3a2a00');
            r(11, 12, 4, 5, mid);
            r(12, 16, 2, 1, line);
            r(10, 18, 6, 1, line);
            // 体・しっぽ
            r(14, 17, 28, 13, gold);
            r(18, 17, 20, 2, light);
            r(16, 28, 24, 2, dark);
            r(42, 15 + up, 3, 2, gold);
            r(44, 13 + up, 2, 3, gold);
            // 金の鎖
            r(6, 19, 15, 2, '#fff2a0');
            r(7, 21, 13, 2, '#d4a017');
            [8, 12, 16, 19].forEach(x => r(x, 19, 1, 1, '#ffffff'));
            // 足と金のローファー
            [15, 21, 32, 38].forEach(x => r(x, 30, 4, 6, mid));
            [14, 20, 31, 37].forEach(x => {
                r(x, 36, 6, 3, '#b8860b');
                r(x, 36, 6, 1, '#ffd700');
            });
        }
    };

    // シーシャ・ナイテイ・ナイナイ (内定の時ゾーン): 赤い長髪・センター分け・赤ひげの戦士。
    // 毛皮のマント・茶色の長いマント・革の胴着・腕組み (左腕に革の小手)・ベルト
    // my-project 直下の画像 (グラフィックス2.png) をもとにしている
    ENEMIES.naitei = {
        w: 36, h: 48,
        draw(r, frame) {
            const sway = frame ? 1 : 0;
            const hair = '#b8582c', hairDark = '#7a3418', hairLight = '#e07c40';
            const skin = '#ecb898', skinShade = '#c88a6a';
            const fur = '#e2dccc', furShade = '#b0a48e', furDark = '#7a705e';
            const leather = '#5a2a1e', leatherDark = '#3a1812', bracer = '#7a4426';
            const cloak = '#4a2420', cloakDark = '#2e1412';
            // 後ろの長いマント
            r(6, 18, 24, 28, cloakDark);
            r(5 - sway, 26, 2, 20, cloak);
            r(29 + sway, 26, 2, 20, cloak);
            // 髪 (センター分けの長髪。肩の下まで垂れる)
            r(12, 1, 12, 3, hair);
            r(17, 1, 2, 3, hairDark);
            r(10, 3, 16, 5, hair);
            r(13, 2, 3, 1, hairLight);
            r(10, 6, 4, 6, hair);
            r(22, 6, 4, 6, hair);
            // 顔
            r(14, 5, 8, 8, skin);
            r(14, 5, 8, 1, hair);
            r(15, 7, 2, 1, hairDark);
            r(19, 7, 2, 1, hairDark);
            r(15, 8, 2, 1, '#2a1a10');
            r(19, 8, 2, 1, '#2a1a10');
            r(17, 9, 2, 2, skinShade);
            // ひげ (口ひげ + 胸まで伸びるあごひげ)
            r(14, 11, 8, 3, hair);
            r(15, 11, 6, 1, hairDark);
            r(17, 12, 2, 1, '#5a2010');
            r(14, 14, 8, 4, hair);
            r(15, 18, 6, 2, hair);
            r(16, 20, 4, 2, hairDark);
            r(16, 14, 1, 5, hairLight);
            r(19, 15, 1, 4, hairDark);
            // 毛皮のマント (肩と首まわり。右側は長く垂れる)
            r(7, 17, 7, 6, fur);
            r(22, 17, 7, 6, fur);
            r(12, 16, 3, 3, fur);
            r(21, 16, 3, 3, fur);
            r(8, 19, 2, 2, furShade);
            r(25, 18, 2, 2, furShade);
            r(6, 21, 4, 10, fur);
            r(6, 27, 3, 4, furShade);
            r(26, 21, 4, 15 + sway, fur);
            r(27, 24, 2, 10, furShade);
            r(28, 33, 2, 3 + sway, furDark);
            r(13, 18, 2, 2, '#f4f0e4');
            // 毛皮の上に垂れる長い髪
            r(10, 10, 4, 13, hair);
            r(22, 10, 4, 13, hair);
            r(10, 13, 1, 10, hairDark);
            r(25, 13, 1, 10, hairDark);
            r(11, 10, 1, 11, hairLight);
            r(24, 10, 1, 11, hairLight);
            r(13, 13, 1, 9, '#5a2410');
            r(22, 13, 1, 9, '#5a2410');
            // 革の胴着 (ひし形のキルティング)
            r(11, 22, 14, 13, leather);
            for (let y = 23; y < 34; y += 3) {
                for (let x = 12 + ((y - 23) / 3 % 2) * 2; x < 24; x += 4) r(x, y, 1, 1, leatherDark);
            }
            // 腕組み: 上腕 → 小手を巻いた左腕 → その上に右腕
            r(8, 22, 3, 7, leather);
            r(25, 22, 3, 7, leather);
            r(10, 24, 12, 4, bracer);
            r(11, 25, 1, 2, leatherDark);
            r(14, 24, 1, 4, '#a07050');
            r(17, 24, 1, 4, '#a07050');
            r(15, 27, 9, 3, skin);
            r(15, 29, 9, 1, skinShade);
            r(24, 24, 3, 3, skin);
            r(9, 27, 3, 3, skin);
            // ベルト・垂れた革ひも
            r(11, 34, 14, 2, '#3a2010');
            r(17, 34, 3, 2, '#b0a090');
            r(18, 35, 1, 1, '#3a2010');
            r(18, 36, 2, 8, '#3a2010');
            // 胴着の裾 (縁どり) と脚・ブーツ
            r(11, 36, 14, 5, leather);
            r(11, 40, 14, 1, '#9a6a44');
            r(13, 41, 4, 4, '#3a2a24');
            r(19, 41, 4, 4, '#3a2a24');
            r(12, 45, 6, 3, '#24160e');
            r(18, 45, 6, 3, '#24160e');
        }
    };

    // シーシャ・ナイテイ・アルアル (ナイナイの兄。ユーザー指定): 見た目は瓜二つで、王冠をかぶっている
    // ナイナイの絵を 7 ドット下げて描き、上に宝石つきの金の王冠を足す
    ENEMIES.aruaru = {
        w: 36, h: 55,
        draw(r, frame) {
            const gold = '#ffd700', goldLight = '#fff2a0', goldDark = '#b8860b';
            ENEMIES.naitei.draw((x, y, w, h, color) => r(x, y + 7, w, h, color), frame);
            // 王冠 (5つのとがり・宝石)
            r(11, 4, 14, 5, gold);
            r(11, 8, 14, 1, goldDark);
            [11, 14, 17, 20, 23].forEach((x, i) => r(x, i % 2 ? 2 : 0, 2, i % 2 ? 2 : 4, gold));
            [11, 17, 23].forEach(x => r(x, 0, 2, 1, goldLight));
            r(12, 5, 12, 1, goldLight);
            r(13, 6, 2, 2, '#e02040');
            r(17, 6, 2, 2, '#2060e0');
            r(21, 6, 2, 2, '#20c060');
        }
    };

    // ----- 仲間 (16x24 ドット、オリジナルデザイン) -----
    const COMPANIONS = {
        // やすさん: 眼鏡・青いパーカー
        yasu: {
            w: 16, h: 24,
            draw(r, frame) {
                const up = frame ? -1 : 0;
                r(4, 1, 8, 4, '#2a2a2a');
                r(4, 4, 8, 7, SKIN);
                r(4, 6, 3, 2, '#333333');
                r(9, 6, 3, 2, '#333333');
                r(5, 6, 1, 1, '#bbddee');
                r(10, 6, 1, 1, '#bbddee');
                r(7, 6, 2, 1, '#333333');
                r(7, 9, 2, 1, '#a04030');
                r(3, 11, 10, 7, '#3a6ad0');
                r(7, 11, 1, 3, '#ffffff');
                r(8, 11, 1, 3, '#ffffff');
                r(1, 12 + up, 2, 5, '#3a6ad0');
                r(13, 12 + up, 2, 5, '#3a6ad0');
                r(1, 17 + up, 2, 1, SKIN);
                r(13, 17 + up, 2, 1, SKIN);
                r(4, 18, 3, 4, '#2a3a6a');
                r(9, 18, 3, 4, '#2a3a6a');
                r(3, 22, 4, 2, '#ffffff');
                r(9, 22, 4, 2, '#ffffff');
            }
        },
        // たむさん: 赤い帽子・緑のジャケット
        tamu: {
            w: 16, h: 24,
            draw(r, frame) {
                const up = frame ? -1 : 0;
                r(3, 1, 10, 3, '#d02020');
                r(9, 3, 5, 1, '#a01010');
                r(4, 4, 8, 7, SKIN);
                r(4, 4, 1, 2, '#5a3a1a');
                r(11, 4, 1, 2, '#5a3a1a');
                r(6, 6, 1, 2, '#111111');
                r(9, 6, 1, 2, '#111111');
                r(6, 9, 4, 1, '#a04030');
                r(3, 11, 10, 7, '#2e8a4a');
                r(8, 11, 1, 7, '#dddddd');
                r(1, 12 + up, 2, 5, '#2e8a4a');
                r(13, 12 + up, 2, 5, '#2e8a4a');
                r(1, 17 + up, 2, 1, SKIN);
                r(13, 17 + up, 2, 1, SKIN);
                r(4, 18, 3, 4, '#5a4a3a');
                r(9, 18, 3, 4, '#5a4a3a');
                r(3, 22, 4, 2, '#2a2a2a');
                r(9, 22, 4, 2, '#2a2a2a');
            }
        },
        // だけさん: ハチマキ・たくましい体・オレンジのタンクトップ
        dake: {
            w: 16, h: 24,
            draw(r, frame) {
                const up = frame ? -1 : 0;
                const tan = '#d89a6a';
                r(4, 1, 8, 3, '#151515');
                r(4, 3, 8, 1, '#ff3030');
                r(12, 3, 3, 1, '#ff3030');
                r(13, 4, 2, 1, '#ff3030');
                r(4, 4, 8, 7, tan);
                r(5, 5, 2, 1, '#151515');
                r(9, 5, 2, 1, '#151515');
                r(5, 6, 2, 1, '#111111');
                r(9, 6, 2, 1, '#111111');
                r(6, 9, 4, 1, '#7a2a1a');
                r(2, 11, 12, 7, '#ff8a20');
                r(1, 11, 2, 4, tan);
                r(13, 11, 2, 4, tan);
                r(0, 13 + up, 2, 5, tan);
                r(14, 13 + up, 2, 5, tan);
                r(3, 18, 4, 4, '#2a2a2a');
                r(9, 18, 4, 4, '#2a2a2a');
                r(3, 22, 4, 2, '#7a5a3a');
                r(9, 22, 4, 2, '#7a5a3a');
            }
        }
    };

    // 仲間を描く。(x, groundY) は足元の中央。silhouette で黒い影、alpha で透明度
    function drawCompanion(ctx, id, x, groundY, { scale = 2, frame = 0, silhouette = false, alpha = 1 } = {}) {
        const c = COMPANIONS[id];
        if (!c) return;
        const left = Math.round(x - (c.w * scale) / 2);
        const top = Math.round(groundY - c.h * scale);
        ctx.globalAlpha = alpha;
        c.draw((rx, ry, rw, rh, color) => {
            const x0 = Math.round(left + rx * scale), x1 = Math.round(left + (rx + rw) * scale);
            const y0 = Math.round(top + ry * scale), y1 = Math.round(top + (ry + rh) * scale);
            ctx.fillStyle = silhouette ? '#101018' : color;
            ctx.fillRect(x0, y0, x1 - x0, y1 - y0);
        }, frame);
        ctx.globalAlpha = 1;
    }

    // 敵を描く。(x, groundY) は足元の中央。hurt で白く光る、silhouette で黒い影、alpha で透明度
    // flip: 左右反転 (右を向く。こおりくんの味方として出すとき)
    function drawEnemy(ctx, id, x, groundY, { scale = 2, frame = 0, hurt = false, silhouette = false, alpha = 1, flip = false } = {}) {
        const enemy = ENEMIES[id];
        if (!enemy) return;
        const left = Math.round(x - (enemy.w * scale) / 2);
        const top = Math.round(groundY - enemy.h * scale);
        ctx.globalAlpha = alpha;
        enemy.draw((rx, ry, rw, rh, color) => {
            const fx = flip ? enemy.w - rx - rw : rx;
            const x0 = Math.round(left + fx * scale), x1 = Math.round(left + (fx + rw) * scale);
            const y0 = Math.round(top + ry * scale), y1 = Math.round(top + (ry + rh) * scale);
            ctx.fillStyle = silhouette ? '#101018' : hurt ? '#ffffff' : color;
            ctx.fillRect(x0, y0, x1 - x0, y1 - y0);
        }, frame);
        ctx.globalAlpha = 1;
    }

    function size(id) {
        const c = ENEMIES[id] || COMPANIONS[id];
        return c ? { w: c.w, h: c.h } : { w: 0, h: 0 };
    }

    return { drawEnemy, drawCompanion, size, has: id => Boolean(ENEMIES[id]), isCompanion: id => Boolean(COMPANIONS[id]) };
})();
