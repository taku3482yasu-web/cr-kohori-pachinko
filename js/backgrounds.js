// =====================================================================
// マップ背景 (ドット絵)
// ---------------------------------------------------------------------
// 各マップは奥から手前への「レイヤー」の重ね合わせ。
// レイヤーは 256x144 の画像として最初に1回だけ描き (左右がつながる絵)、
// speed の速さで横スクロールさせる (奥ほど遅い = 奥行きが出る)。
// =====================================================================

const Backgrounds = (() => {
    const W = 256;
    const H = 144;
    const cache = {};

    // シード付き乱数 (毎回同じ配置になるように)
    function seeded(seed) {
        return () => {
            seed = (seed + 0x6D2B79F5) | 0;
            let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
            t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
            return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
        };
    }

    // ドットを打つための道具。左右の端をまたぐ図形は反対側にも描く (ループ用)
    function painter(g) {
        const p = {
            rect(x, y, w, h, color) {
                x = Math.round(x);
                y = Math.round(y);
                g.fillStyle = color;
                g.fillRect(x, y, w, h);
                if (x + w > W) g.fillRect(x - W, y, w, h);
                if (x < 0) g.fillRect(x + W, y, w, h);
            },
            // 横帯のグラデーション (空など)
            bands(y0, y1, colors) {
                const h = (y1 - y0) / colors.length;
                colors.forEach((c, i) => p.rect(0, y0 + Math.floor(i * h), W, Math.ceil(h) + 1, c));
            },
            // 階段状の三角形 (屋根・山)
            tri(cx, baseY, halfW, height, color) {
                for (let row = 0; row < height; row++) {
                    const w = Math.max(1, Math.round(halfW * (row + 1) / height));
                    p.rect(cx - w, baseY - height + row, w * 2, 1, color);
                }
            },
            // 雲
            cloud(x, y, s) {
                p.rect(x + 4 * s, y, 10 * s, 4 * s, '#ffffff');
                p.rect(x, y + 3 * s, 22 * s, 5 * s, '#ffffff');
                p.rect(x + 2 * s, y + 8 * s, 18 * s, 1 * s, '#d8ecf8');
            },
            // 左右がつながる稜線 (山並み)
            ridge(baseY, amp, waves, color, phase = 0) {
                for (let x = 0; x < W; x++) {
                    const t = (x / W) * Math.PI * 2;
                    const h = waves.reduce((sum, [k, a]) => sum + Math.sin(t * k + phase) * a, 0);
                    const top = Math.round(baseY - amp - h);
                    p.rect(x, top, 1, H - top, color);
                }
            }
        };
        return p;
    }

    function layer(speed, draw) {
        const canvas = document.createElement('canvas');
        canvas.width = W;
        canvas.height = H;
        draw(painter(canvas.getContext('2d')));
        return { canvas, speed };
    }

    // ----- 通学路: 朝の住宅街 -----
    function buildTsugakuro() {
        const rng = seeded(11);
        return {
            groundY: 120,
            layers: [
                layer(0, p => p.bands(0, 110, ['#5fb8f5', '#76c4f8', '#8ed0fb', '#a7dcfd', '#c0e8ff', '#d8f2ff'])),
                layer(0.08, p => {
                    p.cloud(10, 12, 1);
                    p.cloud(90, 24, 1);
                    p.cloud(170, 8, 1);
                    p.cloud(220, 30, 1);
                }),
                // 遠くのビル
                layer(0.25, p => {
                    for (let x = 0; x < W;) {
                        const w = 14 + Math.floor(rng() * 14);
                        const h = 18 + Math.floor(rng() * 30);
                        p.rect(x, 96 - h, w - 2, h, '#9db4cc');
                        for (let wy = 96 - h + 3; wy < 92; wy += 5) {
                            for (let wx = x + 2; wx < x + w - 4; wx += 4) p.rect(wx, wy, 2, 2, '#c8d8ea');
                        }
                        x += w;
                    }
                }),
                // 家・学校・電柱
                layer(0.55, p => {
                    const houses = [
                        { x: 4, wall: '#f4e2c4', roof: '#c0392b' },
                        { x: 60, wall: '#e8f0d8', roof: '#2e5e9e' },
                        { x: 206, wall: '#f8d8d8', roof: '#7a4a2a' }
                    ];
                    houses.forEach(h => {
                        p.rect(h.x, 78, 40, 26, h.wall);
                        p.tri(h.x + 20, 78, 25, 14, h.roof);
                        p.rect(h.x + 5, 84, 9, 7, '#5a7fa8');
                        p.rect(h.x + 6, 85, 3, 2, '#bfe0ff');
                        p.rect(h.x + 26, 88, 8, 16, '#8a5a3a');
                        p.rect(h.x + 32, 95, 1, 2, '#ffd700');
                    });
                    // 学校
                    p.rect(112, 58, 84, 46, '#f2f0e6');
                    p.rect(112, 56, 84, 3, '#a0a0a0');
                    p.rect(146, 46, 16, 12, '#f2f0e6');
                    p.rect(149, 48, 10, 8, '#ffffff');
                    p.rect(153, 49, 1, 4, '#333');
                    p.rect(153, 52, 3, 1, '#333');
                    for (let row = 0; row < 3; row++) {
                        for (let col = 0; col < 8; col++) p.rect(116 + col * 10, 63 + row * 12, 7, 7, '#7fb8e8');
                    }
                    p.rect(146, 94, 16, 10, '#7a6a5a');
                    // 生け垣
                    for (let x = 0; x < W; x += 6) p.rect(x, 98, 6, 6, x % 12 === 0 ? '#4f9a3f' : '#5aa848');
                    // 電柱と電線
                    [50, 104, 200].forEach(x => {
                        p.rect(x, 36, 3, 68, '#6b4a2e');
                        p.rect(x - 5, 42, 13, 2, '#5a3a20');
                    });
                    p.rect(0, 44, W, 1, '#333333');
                    p.rect(0, 48, W, 1, '#444444');
                }),
                // 歩道と道路
                layer(1, p => {
                    p.rect(0, 104, W, 20, '#d4cbb8');
                    for (let x = 0; x < W; x += 16) p.rect(x, 104, 1, 20, '#b8ad98');
                    p.rect(0, 113, W, 1, '#b8ad98');
                    p.rect(0, 124, W, 3, '#9a9a9a');
                    p.rect(0, 127, W, 17, '#55565c');
                    for (let x = 0; x < W; x += 24) p.rect(x, 135, 12, 2, '#f0f0f0');
                    for (let i = 0; i < 6; i++) p.rect(160 + i * 6, 128, 4, 16, '#e8e8e8');
                })
            ]
        };
    }

    // ----- 遠賀川: 山並みと鉄橋、土手の道 -----
    function buildOngagawa() {
        const rng = seeded(23);
        return {
            groundY: 120,
            layers: [
                layer(0, p => p.bands(0, 90, ['#4aa6ee', '#62b4f2', '#7cc2f6', '#98d0fa', '#b4defc'])),
                layer(0.08, p => {
                    p.cloud(30, 10, 1);
                    p.cloud(140, 20, 1);
                    p.cloud(200, 6, 1);
                }),
                // 山並み (奥と手前の2段)
                layer(0.15, p => {
                    p.ridge(70, 10, [[2, 6], [5, 3]], '#8aa8c0');
                    p.ridge(80, 6, [[3, 5], [7, 2]], '#5f8f6a', 1.3);
                }),
                // 川と鉄橋
                layer(0.4, p => {
                    p.rect(0, 84, W, 4, '#6aa84f');
                    p.rect(0, 88, W, 16, '#3f86c8');
                    for (let i = 0; i < 30; i++) {
                        p.rect(Math.floor(rng() * W), 90 + Math.floor(rng() * 12), 4 + Math.floor(rng() * 6), 1, '#8ccaf2');
                    }
                    // 鉄橋 (赤いトラス)
                    const bx = 40, bw = 170;
                    [bx + 10, bx + 85, bx + 160].forEach(x => p.rect(x, 74, 6, 26, '#8a8a92'));
                    p.rect(bx, 72, bw, 3, '#b03028');
                    p.rect(bx, 58, bw, 2, '#c0392b');
                    for (let x = bx; x <= bx + bw; x += 10) {
                        p.rect(x, 58, 2, 16, '#c0392b');
                        if (x + 10 > bx + bw) break;   // 右端の柱の外には斜材を描かない
                        for (let s = 0; s < 14; s++) p.rect(x + Math.floor(s * 10 / 14), 59 + s, 1, 1, '#d04a3a');
                    }
                }),
                // 土手の道と草
                layer(1, p => {
                    p.rect(0, 100, W, 10, '#79b84f');
                    for (let x = 0; x < W; x += 8) p.rect(x, 102, 4, 1, '#8ccc5e');
                    p.rect(0, 110, W, 14, '#c9b28a');
                    for (let i = 0; i < 40; i++) p.rect(Math.floor(rng() * W), 111 + Math.floor(rng() * 12), 1, 1, '#a89470');
                    p.rect(0, 124, W, 20, '#5f9a3e');
                    for (let i = 0; i < 50; i++) {
                        const x = Math.floor(rng() * W), y = 126 + Math.floor(rng() * 16);
                        p.rect(x, y, 1, 3, '#7fc75a');
                        p.rect(x + 2, y + 1, 1, 2, '#7fc75a');
                    }
                    for (let i = 0; i < 12; i++) {
                        p.rect(Math.floor(rng() * W), 128 + Math.floor(rng() * 14), 2, 2, i % 2 ? '#ffe45a' : '#ffffff');
                    }
                })
            ]
        };
    }

    // ----- 恵比寿町: 夕焼けの商店街 -----
    function buildEbisucho() {
        const rng = seeded(37);
        return {
            groundY: 120,
            layers: [
                layer(0, p => p.bands(0, 100, ['#5a3a8a', '#8a4a9a', '#c45a8a', '#ec7a6a', '#ffa060', '#ffc070'])),
                // 遠くの建物のシルエット
                layer(0.2, p => {
                    for (let x = 0; x < W;) {
                        const w = 16 + Math.floor(rng() * 16);
                        const h = 24 + Math.floor(rng() * 34);
                        p.rect(x, 90 - h, w - 1, h + 10, '#4a2e5e');
                        for (let wy = 90 - h + 4; wy < 86; wy += 6) {
                            for (let wx = x + 3; wx < x + w - 4; wx += 5) {
                                if (rng() < 0.45) p.rect(wx, wy, 2, 3, '#ffd27a');
                            }
                        }
                        x += w;
                    }
                }),
                // 商店の並びと提灯
                layer(0.55, p => {
                    const walls = ['#e8d8b8', '#d8b89a', '#c8d0d8', '#e0c0c0', '#d0c8a8'];
                    const awnings = [['#d03030', '#f8f0e8'], ['#2e8a4a', '#f8f0e8'], ['#2e5e9e', '#f8f0e8'], ['#e09a20', '#fff4d8']];
                    for (let i = 0; i < 5; i++) {
                        const x = i * 51 + 1;
                        p.rect(x, 58, 49, 46, walls[i]);
                        p.rect(x + 4, 61, 41, 10, ['#3a2a6a', '#8a1a1a', '#1a4a2a', '#5a3a10', '#2a2a2a'][i]);
                        for (let c = 0; c < 4; c++) p.rect(x + 8 + c * 9, 64, 5, 4, '#f8f0d0');
                        p.rect(x + 6, 72, 10, 6, '#7a9ab8');
                        p.rect(x + 32, 72, 10, 6, '#7a9ab8');
                        const [a, b] = awnings[i % awnings.length];
                        for (let s = 0; s < 49; s += 4) p.rect(x + s, 80, 4, 6, (s / 4) % 2 ? b : a);
                        p.rect(x + 2, 86, 45, 18, '#3a2a20');
                        p.rect(x + 4, 88, 41, 14, '#ffcf7a');
                        for (let g = 0; g < 5; g++) p.rect(x + 6 + g * 8, 96, 6, 6, ['#e04a3a', '#4aa04a', '#f0d040', '#a04ad0', '#3a8ad0'][g]);
                    }
                    p.rect(0, 50, W, 1, '#3a2a2a');
                    for (let x = 6; x < W; x += 20) {
                        p.rect(x + 2, 51, 1, 2, '#3a2a2a');
                        p.rect(x, 53, 5, 7, '#e03a2a');
                        p.rect(x + 1, 54, 1, 5, '#ff7a5a');
                        p.rect(x, 53, 5, 1, '#2a1a1a');
                        p.rect(x, 59, 5, 1, '#2a1a1a');
                    }
                }),
                // 石畳と道路
                layer(1, p => {
                    p.rect(0, 104, W, 20, '#a89a8a');
                    for (let y = 104; y < 124; y += 5) p.rect(0, y, W, 1, '#8e8070');
                    for (let y = 104, row = 0; y < 124; y += 5, row++) {
                        for (let x = (row % 2) * 6; x < W; x += 12) p.rect(x, y, 1, 5, '#8e8070');
                    }
                    p.rect(0, 124, W, 3, '#7a7070');
                    p.rect(0, 127, W, 17, '#4a4550');
                    for (let x = 8; x < W; x += 24) p.rect(x, 135, 12, 2, '#e8d070');
                })
            ]
        };
    }

    // ----- SE城前: 夜の城 (スクロールしない) -----
    function buildSeCastle() {
        const rng = seeded(53);
        // 城の家紋 "SE" (5x7 ドット)
        const LETTERS = {
            S: ['.###.', '#...#', '#....', '.###.', '....#', '#...#', '.###.'],
            E: ['#####', '#....', '#....', '####.', '#....', '#....', '#####']
        };
        return {
            groundY: 122,
            torches: [{ x: 112, y: 92 }, { x: 236, y: 92 }],
            layers: [
                layer(0, p => {
                    p.bands(0, 104, ['#120a2a', '#1a0e38', '#241446', '#2e1a54', '#3a1e5e', '#4a2468']);
                    for (let i = 0; i < 60; i++) {
                        p.rect(Math.floor(rng() * W), Math.floor(rng() * 70), 1, 1, rng() < 0.3 ? '#fff6a8' : '#ffffff');
                    }
                    // 月
                    for (let y = -11; y <= 11; y++) {
                        const w = Math.round(Math.sqrt(121 - y * y));
                        p.rect(40 - w, 28 + y, w * 2, 1, '#fff6c8');
                    }
                    p.rect(34, 22, 4, 3, '#e8dca0');
                    p.rect(44, 30, 5, 4, '#e8dca0');
                    p.ridge(92, 6, [[2, 5], [5, 3]], '#1a1030');
                }),
                layer(0, p => {
                    const cx = 178;
                    // 不気味な赤い光
                    [[60, '#3a1238'], [48, '#4a1640'], [36, '#5a1a44']].forEach(([r, c]) => {
                        for (let y = -r; y <= r; y += 2) {
                            const w = Math.round(Math.sqrt(r * r - y * y));
                            p.rect(cx - w, 60 + y, w * 2, 2, c);
                        }
                    });
                    // 石垣
                    for (let row = 0; row < 18; row++) {
                        const half = 42 + Math.round(row * 0.6);
                        p.rect(cx - half, 86 + row, half * 2, 1, row % 4 === 0 ? '#454552' : '#5a5a68');
                    }
                    for (let x = cx - 50; x < cx + 50; x += 8) p.rect(x, 86, 1, 18, '#454552');
                    p.rect(cx - 8, 92, 16, 12, '#1a1420');
                    p.tri(cx, 92, 8, 4, '#1a1420');
                    // 天守 (下から3層)
                    const tiers = [
                        { y: 70, h: 16, half: 34 },
                        { y: 54, h: 12, half: 25 },
                        { y: 40, h: 10, half: 17 }
                    ];
                    tiers.forEach((t, i) => {
                        p.rect(cx - t.half, t.y, t.half * 2, t.h, '#d8d4e0');
                        for (let wx = cx - t.half + 4; wx < cx + t.half - 4; wx += 8) p.rect(wx, t.y + 4, 4, 4, '#2a2238');
                        // 屋根 (端が反り上がる)
                        const rh = i === 0 ? 7 : 6;
                        p.rect(cx - t.half - 6, t.y - 2, (t.half + 6) * 2, 3, '#2a2a40');
                        p.tri(cx, t.y - 2, t.half + 2, rh, '#2a2a40');
                        p.rect(cx - t.half - 8, t.y - 4, 3, 2, '#2a2a40');
                        p.rect(cx + t.half + 5, t.y - 4, 3, 2, '#2a2a40');
                    });
                    // 最上部の屋根としゃちほこ
                    p.tri(cx, 36, 14, 8, '#2a2a40');
                    p.rect(cx - 12, 26, 3, 3, '#ffd700');
                    p.rect(cx + 9, 26, 3, 3, '#ffd700');
                    // 家紋 SE
                    p.rect(cx - 9, 72, 18, 11, '#8a1a2a');
                    ['S', 'E'].forEach((ch, li) => {
                        LETTERS[ch].forEach((row, ry) => {
                            for (let rx = 0; rx < 5; rx++) {
                                if (row[rx] === '#') p.rect(cx - 7 + li * 8 + rx, 74 + ry, 1, 1, '#ffd700');
                            }
                        });
                    });
                    // たいまつの柱
                    [112, 236].forEach(x => p.rect(x, 96, 3, 26, '#5a3a20'));
                }),
                layer(0, p => {
                    p.rect(0, 104, W, 40, '#34303e');
                    for (let y = 104; y < H; y += 6) p.rect(0, y, W, 1, '#26232e');
                    for (let y = 104, row = 0; y < H; y += 6, row++) {
                        for (let x = (row % 2) * 8; x < W; x += 16) p.rect(x, y, 1, 6, '#26232e');
                    }
                })
            ]
        };
    }

    // ----- RASH: 城の大広間 (SUPER は金色) -----
    function buildHall(c) {
        return () => ({
            groundY: 124,
            braziers: [{ x: 66, y: 86 }, { x: 186, y: 86 }],
            layers: [
                layer(0, p => {
                    // 石の壁
                    p.rect(0, 0, W, 112, c.wall);
                    for (let y = 0, row = 0; y < 112; y += 8, row++) {
                        p.rect(0, y, W, 1, c.wallLine);
                        for (let x = (row % 2) * 12; x < W; x += 24) p.rect(x, y, 1, 8, c.wallLine);
                    }
                    // 柱
                    [16, 120, 224].forEach(x => {
                        p.rect(x, 0, 16, 112, c.pillar);
                        p.rect(x + 2, 0, 3, 112, c.pillarLight);
                        p.rect(x - 2, 0, 20, 6, c.trim);
                        p.rect(x - 2, 104, 20, 8, c.trim);
                    });
                    // 幕
                    for (let x = 0; x < W; x += 32) {
                        for (let s = 0; s < 32; s++) {
                            const drop = 10 + Math.round(Math.sin((s / 32) * Math.PI) * 8);
                            p.rect(x + s, 0, 1, drop, s % 4 < 2 ? c.curtain : c.curtainDark);
                        }
                    }
                    p.rect(0, 0, W, 3, c.trim);
                    // 篝火の台
                    [66, 186].forEach(x => {
                        p.rect(x - 4, 92, 11, 3, c.trim);
                        p.rect(x - 1, 95, 5, 17, '#3a2a20');
                    });
                    // 床 (市松模様)
                    for (let y = 112, row = 0; y < H; y += 8, row++) {
                        for (let x = 0, col = 0; x < W; x += 16, col++) {
                            p.rect(x, y, 16, 8, (row + col) % 2 ? c.floorA : c.floorB);
                        }
                    }
                    p.rect(0, 112, W, 1, c.trim);
                })
            ]
        });
    }

    // ----- 宝物庫ゾーン: 金貨の山と宝箱 -----
    function buildTreasure() {
        const rng = seeded(71);
        return {
            groundY: 124,
            torches: [{ x: 40, y: 54 }, { x: 214, y: 54 }],
            layers: [
                layer(0, p => {
                    // 石の壁とアーチ
                    p.rect(0, 0, W, 112, '#2a1e14');
                    for (let y = 0, row = 0; y < 112; y += 8, row++) {
                        p.rect(0, y, W, 1, '#1e150e');
                        for (let x = (row % 2) * 10; x < W; x += 20) p.rect(x, y, 1, 8, '#1e150e');
                    }
                    for (let y = 0; y < 30; y++) {
                        const half = Math.round(Math.sqrt(Math.max(0, 900 - (30 - y) * (30 - y))) * 2.4);
                        p.rect(W / 2 - half, 10 + y, half * 2, 1, '#3a2a1a');
                    }
                    p.rect(0, 0, W, 4, '#c8a040');
                    // たいまつの柱
                    [40, 214].forEach(x => p.rect(x - 1, 58, 5, 40, '#5a3a20'));
                    // 奥の宝の山
                    const pile = (cx, baseY, halfW, h) => {
                        p.tri(cx, baseY, halfW, h, '#c8901a');
                        p.tri(cx, baseY - 2, halfW - 4, h - 4, '#ffd23a');
                        for (let i = 0; i < halfW; i++) {
                            const x = cx - halfW + Math.floor(rng() * halfW * 2);
                            const y = baseY - Math.floor(rng() * (h - 3)) - 1;
                            p.rect(x, y, 2, 1, rng() < 0.5 ? '#fff2a0' : '#b8860b');
                        }
                    };
                    pile(60, 112, 46, 22);
                    pile(200, 112, 52, 26);
                    pile(128, 112, 30, 14);
                    // 宝石
                    for (let i = 0; i < 18; i++) {
                        const colors = ['#ff4060', '#40c0ff', '#40e080', '#c060ff'];
                        p.rect(20 + Math.floor(rng() * 216), 92 + Math.floor(rng() * 16), 2, 2, colors[i % 4]);
                    }
                    // 床
                    p.rect(0, 112, W, 32, '#3a2a1a');
                    for (let x = 0; x < W; x += 16) p.rect(x, 112, 1, 32, '#2a1e12');
                    for (let y = 120; y < H; y += 8) p.rect(0, y, W, 1, '#2a1e12');
                    for (let i = 0; i < 30; i++) {
                        p.rect(Math.floor(rng() * W), 114 + Math.floor(rng() * 28), 3, 1, '#ffd23a');
                    }
                })
            ]
        };
    }

    // ----- ダンシングステージ: ダンス会場 (床のライト・ミラーボール・スポットライトは lcd.js で動かす) -----
    function buildDanceHall() {
        const rng = seeded(97);
        return {
            groundY: 124,
            floorY: 104,
            layers: [
                layer(0, p => {
                    // 奥の壁 (上ほど暗い紫)
                    p.bands(0, 104, ['#0c0618', '#120822', '#180a2c', '#1e0c36', '#240e40', '#2a104a']);
                    // 壁の小さな電飾
                    for (let i = 0; i < 40; i++) {
                        const colors = ['#ff4fd8', '#4fe0ff', '#ffe04f', '#7fff6a'];
                        p.rect(Math.floor(rng() * W), 8 + Math.floor(rng() * 50), 1, 1, colors[i % 4]);
                    }
                    // 天井のトラス
                    p.rect(0, 6, W, 3, '#5a5a6a');
                    for (let x = 0; x < W; x += 8) p.rect(x, 4, 1, 7, '#3a3a4a');
                    // ステージの奥の幕と台
                    p.rect(56, 40, 144, 64, '#3a0c4a');
                    for (let x = 56; x < 200; x += 6) p.rect(x, 40, 2, 64, '#4a1460');
                    p.rect(52, 36, 152, 4, '#c8a040');
                    p.rect(48, 98, 160, 6, '#5a2a6a');
                    p.rect(48, 98, 160, 1, '#c8a040');
                    // 「DANCE」のネオン看板の枠
                    p.rect(98, 46, 60, 16, '#100418');
                    p.rect(98, 46, 60, 1, '#ff4fd8');
                    p.rect(98, 61, 60, 1, '#ff4fd8');
                    p.rect(98, 46, 1, 16, '#ff4fd8');
                    p.rect(157, 46, 1, 16, '#ff4fd8');
                    // 左右のスピーカー
                    [[6, 52], [214, 52]].forEach(([x, y]) => {
                        p.rect(x, y, 36, 52, '#141418');
                        p.rect(x + 1, y + 1, 34, 50, '#24242c');
                        [[18, 14, 11], [18, 38, 8]].forEach(([cx, cy, r]) => {
                            for (let dy = -r; dy <= r; dy++) {
                                const half = Math.round(Math.sqrt(r * r - dy * dy));
                                p.rect(x + cx - half, y + cy + dy, half * 2, 1, '#0a0a0c');
                            }
                            p.rect(x + cx - 2, y + cy - 2, 4, 4, '#4a4a58');
                        });
                    });
                    // 床の下地 (光るタイルは lcd.js で上から描く)
                    p.rect(0, 104, W, 40, '#14081c');
                })
            ]
        };
    }

    const BUILDERS = {
        danceHall: buildDanceHall,
        tsugakuro: buildTsugakuro,
        ongagawa: buildOngagawa,
        ebisucho: buildEbisucho,
        seCastle: buildSeCastle,
        treasure: buildTreasure,
        castleHall: buildHall({
            wall: '#3a1a24', wallLine: '#2a1018', pillar: '#5a2028', pillarLight: '#7a3038',
            trim: '#a08040', curtain: '#8a1a1a', curtainDark: '#6a1010', floorA: '#2a1418', floorB: '#3e1e24'
        }),
        goldHall: buildHall({
            wall: '#5a4410', wallLine: '#3e2e08', pillar: '#a07a18', pillarLight: '#e0b830',
            trim: '#fff0a0', curtain: '#c8202a', curtainDark: '#901018', floorA: '#6a5010', floorB: '#8a6a18'
        })
    };

    function get(mapId) {
        if (!cache[mapId]) cache[mapId] = BUILDERS[mapId]();
        return cache[mapId];
    }

    // scroll: スクロール量 (px)。各レイヤーは speed 倍でずらして描く
    function draw(ctx, mapId, scroll) {
        get(mapId).layers.forEach(({ canvas, speed }) => {
            const offset = Math.floor((scroll * speed) % W);
            ctx.drawImage(canvas, -offset, 0);
            if (offset > 0) ctx.drawImage(canvas, W - offset, 0);
        });
    }

    return { get, draw, W, H };
})();
